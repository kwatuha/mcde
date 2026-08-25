#!/usr/bin/env python3
"""
Generate natural TTS voiceovers for the E-CIMES training video script.

Uses Microsoft Edge neural voices via edge-tts (free). Kenyan English voices:
  en-KE-AsiliaNeural  (female)  — default
  en-KE-ChilembaNeural (male)

Usage:
  pip install --user edge-tts
  python3 scripts/generate-ecimes-training-voiceover.py
  python3 scripts/generate-ecimes-training-voiceover.py --voice en-KE-ChilembaNeural
  python3 scripts/generate-ecimes-training-voiceover.py --chapters 1,2,10
  python3 scripts/generate-ecimes-training-voiceover.py --parts   # also build Part1/2/3 concat lists

Output:
  docs/training-voiceover/
    ch01-introduction.mp3
    ...
    part1-getting-started.mp3   (if --parts and ffmpeg available)
    README.md

OBS: Add Media Source → select chapter or part MP3 → mute mic → record screen while audio plays.
CapCut: Import MP3 + screen recording; align on timeline (easier than live sync).
"""
from __future__ import annotations

import argparse
import asyncio
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "docs" / "training-voiceover"
DEFAULT_VOICE = "en-KE-AsiliaNeural"
# Slower rate helps new editors match stills / on-screen clicks (Kdenlive, CapCut)
DEFAULT_RATE = "-15%"
DEFAULT_PITCH = "+0Hz"

# Spoken lifecycle step cues in Ch1 (order must match assets/lifecycle/01–09)
LIFECYCLE_STEP_CUES = [
    "planning",
    "registration",
    "procurement",
    "implementation",
    "monitoring",
    "impact",
    "finance",
    "reporting",
    "transparency",
]

# Spoken workspace montage cues in Ch1 (after lifecycle; for screenshot stills).
# Tokens must match edge-tts WordBoundary text after stripping non-letters
# (e.g. "Sub-County" → "subcounty"). "chief" appears twice: Department Chief, then Chief Engineer.
WORKSPACE_STEP_CUES = [
    "village",
    "ward",
    "subcounty",
    "chief",  # Department Chief Officer
    "sector",
    "contractor",
    "resident",
    "chief",  # Chief Engineer (second match)
    "finance",  # Chief Finance Officer
]


def load_chapters():
    """Load CHAPTERS from generate-ecimes-training-docx.py without package import issues."""
    path = ROOT / "scripts" / "generate-ecimes-training-docx.py"
    ns: dict = {"__file__": str(path), "__name__": "generate_ecimes_training_docx"}
    exec(compile(path.read_text(encoding="utf-8"), str(path), "exec"), ns)
    return ns["CHAPTERS"]


def slugify(title: str) -> str:
    # "Chapter 10 — Measuring Project & Programme Impact (~4 min)" → measuring-project-programme-impact
    t = re.sub(r"^Chapter\s+\d+\s*[—\-]+\s*", "", title, flags=re.I)
    t = re.sub(r"\([^)]*\)", "", t)
    t = t.lower()
    t = re.sub(r"[^a-z0-9]+", "-", t).strip("-")
    return t[:60] or "chapter"


def prepare_tts_text(text: str) -> str:
    """Fix known edge-tts mispronunciations before synthesis.

    - login → log-in (avoids “lag-in”)
    - E-CIMES → E-Cimas (spoken “ee-cimas”, not “see-mez”)
    - ribbon → ribb-on (avoids “riban”; sounds like “ribon”)
    """
    text = re.sub(r"\bLogin\b", "Log-in", text)
    text = re.sub(r"\blogin\b", "log-in", text)
    text = re.sub(r"\bLOGIN\b", "LOG-IN", text)
    # Acronym variants (hyphen / en-dash / spaced)
    text = re.sub(r"\bE[\u2011\u2010\-]CIMES\b", "E-Cimas", text, flags=re.I)
    text = re.sub(r"\bECIMES\b", "E-Cimas", text, flags=re.I)
    text = re.sub(r"\bRibbon\b", "Ribb-on", text)
    text = re.sub(r"\bribbon\b", "ribb-on", text)
    text = re.sub(r"\bRIBBON\b", "RIBB-ON", text)
    return text


def chapter_voice_text(ch: dict) -> str:
    parts: list[str] = []
    if ch.get("voiceover"):
        parts.append(ch["voiceover"].strip())
    for sec in ch.get("sections") or []:
        if sec.get("heading"):
            # Brief spoken section label so the audio tracks the on-screen structure
            label = re.sub(r"^\d+(\.\d+)*\s*", "", sec["heading"])
            label = re.sub(r"[—\-].*$", "", label).strip()
            if label:
                parts.append(f"Next: {label}.")
        if sec.get("voiceover"):
            parts.append(sec["voiceover"].strip())
    # Light pause markers between paragraphs for edge-tts
    return prepare_tts_text(" ".join(parts))


def _word_boundary_sec(offset_ticks: int) -> float:
    # edge-tts WordBoundary offset is in 100-nanosecond units (10_000_000 = 1s)
    return offset_ticks / 10_000_000


def _load_word_boundaries(meta_path: Path) -> list[tuple[float, str]]:
    import json

    words: list[tuple[float, str]] = []
    for line in meta_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        obj = json.loads(line)
        if obj.get("type") != "WordBoundary":
            continue
        words.append((_word_boundary_sec(int(obj["offset"])), str(obj.get("text", "")).lower()))
    return words


def _find_ordered_cues(
    words: list[tuple[float, str]],
    cues: list[str],
    *,
    start_idx: int = 0,
) -> tuple[list[float], int]:
    """Return (cue_start_times, index_after_last_match). Empty starts if any cue missed."""
    cue_starts: list[float] = []
    idx = start_idx
    for cue in cues:
        found = None
        while idx < len(words):
            t, w = words[idx]
            idx += 1
            token = re.sub(r"[^a-z]", "", w)
            if token == cue:
                found = t
                break
        if found is None:
            return [], start_idx
        cue_starts.append(found)
    return cue_starts, idx


def write_lifecycle_timing_from_meta(meta_path: Path, csv_path: Path, audio_duration: float) -> None:
    """Build Kdenlive-friendly still durations from Ch1 word boundaries."""
    import csv

    words = _load_word_boundaries(meta_path)
    cue_starts, after_lifecycle_idx = _find_ordered_cues(words, LIFECYCLE_STEP_CUES)

    title_end = cue_starts[0] if cue_starts else 5.5
    rows: list[tuple[str, float, float, str]] = [
        ("00-title.png", 0.0, round(title_end, 2), "Series title / lifecycle title"),
    ]

    step_files = [
        "01-step-planning.png",
        "02-step-registration.png",
        "03-step-procurement.png",
        "04-step-implementation.png",
        "05-step-monitoring.png",
        "06-step-impact.png",
        "07-step-finance.png",
        "08-step-reporting.png",
        "09-step-public.png",
    ]

    if cue_starts and len(cue_starts) == 9:
        # End of last step → "platform", else first "after" following the list
        post = None
        for t, w in words:
            token = re.sub(r"[^a-z]", "", w)
            if token == "platform" and t > cue_starts[-1]:
                post = t
                break
        if post is None:
            for t, w in words:
                token = re.sub(r"[^a-z]", "", w)
                if token == "after" and t > cue_starts[-1]:
                    post = t
                    break
        step_end = post if post is not None else (audio_duration * 0.55)
        boundaries = cue_starts + [step_end]
        for i, fname in enumerate(step_files):
            start = boundaries[i]
            dur = max(2.5, boundaries[i + 1] - start)
            rows.append((fname, round(start, 2), round(dur, 2), f"Highlight step {i + 1}"))
        full_start = boundaries[-1]
    else:
        step_s = 5.5
        t = title_end
        for i, fname in enumerate(step_files):
            rows.append((fname, round(t, 2), round(step_s, 2), f"Highlight step {i + 1}"))
            t += step_s
        full_start = t
        after_lifecycle_idx = 0

    # Bridge only until workspace montage ("village") — do not consume the rest of Ch1
    ws_starts, _ = _find_ordered_cues(words, WORKSPACE_STEP_CUES, start_idx=after_lifecycle_idx)
    montage_at = ws_starts[0] if ws_starts else min(audio_duration, full_start + 8.0)
    remain = max(3.0, montage_at - full_start)
    full_dur = round(min(remain * 0.55, 6.0), 2)
    hold_dur = round(max(1.5, remain - full_dur), 2)
    rows.append(("10-full.png", round(full_start, 2), full_dur, "All lifecycle steps complete"))
    rows.append(
        (
            "11-hold.png",
            round(full_start + full_dur, 2),
            hold_dur,
            "Hold before cut to workspace screenshot montage",
        )
    )

    csv_path.parent.mkdir(parents=True, exist_ok=True)
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["file", "start_sec", "duration_sec", "note"])
        w.writerows(rows)


def write_workspace_timing_from_meta(meta_path: Path, csv_path: Path, audio_duration: float) -> None:
    """Timing for Ch1 after-login workspace screenshot montage (Kdenlive)."""
    import csv

    words = _load_word_boundaries(meta_path)
    # Skip past lifecycle list so "monitoring"/"finance" there don't steal cues
    _, after_life = _find_ordered_cues(words, LIFECYCLE_STEP_CUES)
    cue_starts, _ = _find_ordered_cues(words, WORKSPACE_STEP_CUES, start_idx=after_life)

    step_meta = [
        ("01-village-me.png", "Village M&E workspace screenshot"),
        ("02-ward-me.png", "Ward M&E workspace screenshot"),
        ("03-subcounty-me.png", "Sub-County M&E workspace screenshot"),
        ("04-department-chief.png", "Department Chief Officer — review & publish for public"),
        ("05-sector-me-champions.png", "Sector M&E Champions — sector department reports"),
        ("06-contractor.png", "Contractor — initiates payment request"),
        ("07-resident-engineer.png", "Resident Engineer — creates certificate & forwards"),
        ("08-chief-engineer.png", "Chief Engineer — approve / return / forward to CFO"),
        ("09-co-finance.png", "Chief Finance Officer — receives approved certificate"),
    ]

    rows: list[tuple[str, float, float, str]] = []
    if cue_starts and len(cue_starts) == len(WORKSPACE_STEP_CUES):
        # End of paced montage → closing “In this training…”
        end = audio_duration
        for t, w in words:
            token = re.sub(r"[^a-z]", "", w)
            if token == "training" and t > cue_starts[-1]:
                end = t
                break
        boundaries = cue_starts + [end]
        for i, (fname, note) in enumerate(step_meta):
            start = boundaries[i]
            dur = max(3.0, boundaries[i + 1] - start)
            rows.append((fname, round(start, 2), round(dur, 2), note))
        if end < audio_duration - 0.5:
            rows.append(
                (
                    "10-training-outro-hold.png",
                    round(end, 2),
                    round(audio_duration - end, 2),
                    "Closing “In this training…” lines",
                )
            )
    else:
        # Equal fallback in the last third of the chapter
        t0 = audio_duration * 0.55
        step_s = (audio_duration - t0) / len(step_meta)
        t = t0
        for fname, note in step_meta:
            rows.append((fname, round(t, 2), round(step_s, 2), note))
            t += step_s

    csv_path.parent.mkdir(parents=True, exist_ok=True)
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["file", "start_sec", "duration_sec", "note"])
        w.writerows(rows)


async def synthesize(
    text: str,
    out_path: Path,
    voice: str,
    rate: str,
    pitch: str,
    *,
    meta_path: Path | None = None,
) -> None:
    import edge_tts

    out_path.parent.mkdir(parents=True, exist_ok=True)
    communicate = edge_tts.Communicate(
        text,
        voice,
        rate=rate,
        pitch=pitch,
        boundary="WordBoundary" if meta_path else "SentenceBoundary",
    )
    if meta_path:
        meta_path.parent.mkdir(parents=True, exist_ok=True)
        await communicate.save(str(out_path), str(meta_path))
    else:
        await communicate.save(str(out_path))


def concat_with_ffmpeg(inputs: list[Path], output: Path) -> bool:
    ffmpeg = subprocess.run(["which", "ffmpeg"], capture_output=True, text=True)
    if ffmpeg.returncode != 0:
        return False
    list_file = output.with_suffix(".txt")
    list_file.write_text(
        "".join(f"file '{p.resolve()}'\n" for p in inputs),
        encoding="utf-8",
    )
    cmd = [
        "ffmpeg",
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        str(list_file),
        "-c",
        "copy",
        str(output),
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    list_file.unlink(missing_ok=True)
    return r.returncode == 0


def write_readme(out_dir: Path, voice: str, files: list[Path]) -> None:
    lines = [
        "# E-CIMES training voiceovers",
        "",
        f"Generated with `edge-tts` voice **{voice}** (Kenyan English neural).",
        "",
        "Pronunciation: spoken **login** is rewritten to **log-in** for TTS (avoids “lag-in”).",
        f"Default rate: **{DEFAULT_RATE}** (slower for slideshow / click matching).",
        "",
        "## How to use in OBS (live sync)",
        "",
        "1. Mute your microphone (or remove Mic/Aux from the scene).",
        "2. Sources → **+** → **Media Source** → uncheck *Local file* loop.",
        "3. Browse to a chapter MP3 (start with `ch01-…mp3`).",
        "4. Check **Restart playback when source becomes active**.",
        "5. Click Start Recording, then make the Media Source visible / restart it so audio begins.",
        "6. Click through the **ON SCREEN** cues in the teleprompter while the voiceover plays.",
        "7. Stop at chapter end; swap the Media Source file for the next chapter.",
        "",
        "**Easier workflow (recommended):** Record screen in OBS with **no mic**, then in CapCut "
        "(or DaVinci / Kdenlive) drop the matching MP3 under the video and trim silences. You can pause the "
        "app while audio continues — better than fighting live sync.",
        "",
        "## Parts",
        "",
        "| Part | Chapters | Teleprompter |",
        "|------|----------|--------------|",
        "| 1 | 1–5 | `E-CIMES-Training-Part1-Getting-Started.docx` |",
        "| 2 | 6–12 | `E-CIMES-Training-Part2-Core-Work.docx` |",
        "| 3 | 13–17 | `E-CIMES-Training-Part3-Support-Wrap-Up.docx` |",
        "",
        "## Regenerate",
        "",
        "```bash",
        "python3 scripts/generate-ecimes-training-voiceover.py",
        "python3 scripts/generate-ecimes-training-voiceover.py --voice en-KE-ChilembaNeural",
        "python3 scripts/generate-ecimes-training-voiceover.py --rate \"-20%\" --chapters 1",
        "```",
        "",
        "## Video graphics (CapCut / DaVinci / Kdenlive)",
        "",
        "Still sequences and title cards live in [`assets/`](assets/) (1920×1080). Regenerate with:",
        "",
        "```bash",
        "python3 scripts/generate-ecimes-training-video-assets.py",
        "```",
        "",
        "| Asset | Chapter use |",
        "|-------|-------------|",
        "| `assets/lifecycle/` + `lifecycle-timing.csv` | Ch 1 — animated lifecycle (prefer over static PNG) |",
        "| `workspace-timing.csv` | Ch 1 — after-login workspace screenshot montage |",
        "| `assets/me-chain/` | Ch 4.1 — M&E approval chain |",
        "| `assets/certificate-chain/` | Ch 4.2 / 11 — certificate steps |",
        "| `assets/cards/` | Part openers, chapter titles, end card |",
        "| `assets/lower-thirds/` | Transparent path captions over screen demos |",
        "",
        "See `assets/README.md` for CapCut / **Kdenlive** placement.",
        "",
        "## Files",
        "",
    ]
    for f in files:
        lines.append(f"- `{f.name}`")
    lines.append("")
    (out_dir / "README.md").write_text("\n".join(lines), encoding="utf-8")


async def main_async(args: argparse.Namespace) -> None:
    chapters = load_chapters()
    wanted = None
    if args.chapters:
        wanted = {int(x) for x in args.chapters.split(",") if x.strip()}

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    generated: list[Path] = []
    by_num: dict[int, Path] = {}

    for ch in chapters:
        n = int(ch["n"])
        if wanted is not None and n not in wanted:
            continue
        text = chapter_voice_text(ch)
        if not text.strip():
            print(f"Skip ch{n:02d}: empty voiceover")
            continue
        fname = f"ch{n:02d}-{slugify(ch['title'])}.mp3"
        out_path = out_dir / fname
        meta_path = out_dir / "assets" / "ch01-word-boundaries.jsonl" if n == 1 else None
        print(f"Generating {fname} ({len(text)} chars)…")
        await synthesize(text, out_path, args.voice, args.rate, args.pitch, meta_path=meta_path)
        print(f"  → {out_path} ({out_path.stat().st_size // 1024} KB)")
        if n == 1 and meta_path and meta_path.exists():
            try:
                import mutagen

                dur = float(mutagen.File(str(out_path)).info.length)
            except Exception:
                dur = 70.0
            timing_csv = out_dir / "assets" / "lifecycle-timing.csv"
            write_lifecycle_timing_from_meta(meta_path, timing_csv, dur)
            print(f"  → {timing_csv.relative_to(out_dir)} (from word boundaries, {dur:.1f}s audio)")
            ws_csv = out_dir / "assets" / "workspace-timing.csv"
            write_workspace_timing_from_meta(meta_path, ws_csv, dur)
            print(f"  → {ws_csv.relative_to(out_dir)} (workspace montage cues)")
        generated.append(out_path)
        by_num[n] = out_path

    if args.parts and by_num:
        parts = [
            ("part1-getting-started.mp3", range(1, 6)),
            ("part2-core-work.mp3", range(6, 13)),
            ("part3-support-wrap-up.mp3", range(13, 18)),
        ]
        for name, rng in parts:
            inputs = [by_num[i] for i in rng if i in by_num]
            if not inputs:
                continue
            out = out_dir / name
            # Write concat list for CapCut/manual join even without ffmpeg
            list_path = out_dir / f"{out.stem}-files.txt"
            list_path.write_text("\n".join(str(p.name) for p in inputs) + "\n", encoding="utf-8")
            if concat_with_ffmpeg(inputs, out):
                print(f"Concatenated → {out.name}")
                generated.append(out)
            else:
                print(
                    f"ffmpeg not found — chapter list for {name} written to {list_path.name}. "
                    "Join in CapCut or install ffmpeg."
                )

    write_readme(out_dir, args.voice, generated)
    print(f"\nDone. Files in {out_dir}")
    print("Open docs/training-voiceover/README.md for OBS / CapCut steps.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate E-CIMES training voiceovers (edge-tts)")
    parser.add_argument("--voice", default=DEFAULT_VOICE, help="edge-tts voice id")
    parser.add_argument("--rate", default=DEFAULT_RATE, help='Speech rate, e.g. "-8%" or "+5%"')
    parser.add_argument("--pitch", default=DEFAULT_PITCH, help='Pitch, e.g. "+0Hz"')
    parser.add_argument("--chapters", default="", help="Comma list e.g. 1,2,10 (default: all)")
    parser.add_argument("--parts", action="store_true", help="Also build Part 1/2/3 playlists/files")
    parser.add_argument("--out-dir", default=str(OUT_DIR))
    args = parser.parse_args()
    asyncio.run(main_async(args))


if __name__ == "__main__":
    main()
