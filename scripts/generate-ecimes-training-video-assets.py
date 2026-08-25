#!/usr/bin/env python3
"""
Generate CapCut/DaVinci-ready stills for E-CIMES training videos.

Outputs under docs/training-voiceover/assets/:
  lifecycle/          — 9-step build + title/full hold frames
  me-chain/           — Village → … → Public approval chain
  certificate-chain/  — RE → CE → CFO → QR verify
  cards/              — series, parts, chapter titles, end card
  lower-thirds/       — transparent path captions
  README.md + timing CSVs

Usage:
  python3 scripts/generate-ecimes-training-video-assets.py
"""
from __future__ import annotations

import csv
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "training-voiceover" / "assets"
# Same Machakos county crest as the login page (countyConfig branding.logo → assets/gpris.png).
# Do NOT use frontend/public/gfalogo.png (GPRIS wordmark + Kenya national arms).
LOGO_CANDIDATES = (
    ROOT / "api" / "assets" / "gpris.png",
    ROOT / "frontend" / "src" / "assets" / "gpris.png",
)
LOGO = next((p for p in LOGO_CANDIDATES if p.is_file()), LOGO_CANDIDATES[0])
VOICE_CH01 = ROOT / "docs" / "training-voiceover" / "ch01-introduction.mp3"

W, H = 1920, 1080
NAVY = (13, 71, 161)
BLUE = (21, 101, 192)
SLATE = (84, 110, 122)
DARK = (33, 33, 33)
WHITE = (255, 255, 255)
SOFT = (247, 250, 252)
SOFT2 = (232, 238, 245)
DIM = (176, 190, 197)
GREEN = (46, 125, 50)
AMBER = (245, 124, 0)

FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

LIFECYCLE_STEPS = [
    "Planning",
    "Registration",
    "Procurement",
    "Implementation",
    "Monitoring",
    "Impact\nevaluation",
    "Finance",
    "Reporting",
    "Public\ntransparency",
]

ME_STEPS = [
    ("Village", "Draft & submit"),
    ("Ward", "Review & forward"),
    ("Sub-county", "Review & forward"),
    ("Chief", "Approve"),
    ("Public", "Citizen dashboard"),
]

CERT_STEPS = [
    ("Resident\nEngineer", "Step 1"),
    ("Chief\nEngineer", "Step 2"),
    ("Chief Finance\nOfficer", "Step 3"),
    ("QR Verify", "Anyone can check"),
]

CHAPTERS = [
    (1, "Introduction", "Welcome to E-CIMES"),
    (2, "Logging In", "Access your account"),
    (3, "Your Role Workspace", "Landing depends on your role"),
    (4, "Role Workspaces in Detail", "M&E, engineering, finance, contractor"),
    (5, "Full Ribbon Navigation", "Menus, notifications, help"),
    (6, "Dashboards", "Status, jobs, regional views"),
    (7, "AI Assistant & Help", "Ask, navigate, generate reports"),
    (8, "Projects Module", "Registry, details, documents"),
    (9, "Planning Module", "Indicators, CIDP, ADP"),
    (10, "Measuring Impact", "Evaluation & programme scorecards"),
    (11, "Financial Tracking", "Certificates & verification"),
    (12, "Monitoring & Field Data", "Visits, checklists, mobile"),
    (13, "Procurement & Data", "Budget intake & imports"),
    (14, "Reports", "Search, filter, export"),
    (15, "Public Portal", "Transparency for citizens"),
    (16, "Roles, Scope & Help", "Permissions and support"),
    (17, "Conclusion", "Next steps"),
]

PARTS = [
    (1, "Getting Started", "Login, role workspaces, and ribbon navigation", "Chapters 1–5 · ~10–12 min"),
    (2, "Core Work", "Dashboards, AI, projects, planning, impact, finance, monitoring", "Chapters 6–12 · ~12–15 min"),
    (3, "Support & Wrap-Up", "Procurement, reports, public portal, roles, and help", "Chapters 13–17 · ~8–10 min"),
]

LOWER_THIRDS = [
    ("lt-ward-review", "Ward M&E  →  Ward review queue"),
    ("lt-cidp-progress", "Planning  →  CIDP Programme Progress"),
    ("lt-adp-progress", "Planning  →  ADP Programme Progress"),
    ("lt-project-eval", "Projects  →  Project Evaluation"),
    ("lt-verify-cert", "Finance  →  Verify Certificate"),
    ("lt-reports-hub", "Reports  →  Reports Hub"),
    ("lt-ai-sparkle", "AI Assistant  →  sparkle button"),
    ("lt-mobile-app", "Dashboard  →  Mobile App Download"),
    ("lt-village-drafts", "Village M&E  →  My drafts"),
    ("lt-co-finance", "Co-Finance  →  Payment certificates"),
]


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REG, size)


def gradient_bg() -> Image.Image:
    img = Image.new("RGB", (W, H), SOFT)
    draw = ImageDraw.Draw(img)
    for y in range(H):
        t = y / (H - 1)
        r = int(SOFT[0] + (SOFT2[0] - SOFT[0]) * t)
        g = int(SOFT[1] + (SOFT2[1] - SOFT[1]) * t)
        b = int(SOFT[2] + (SOFT2[2] - SOFT[2]) * t)
        draw.line([(0, y), (W, y)], fill=(r, g, b))
    # Soft corner wash
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.ellipse([1100, -200, 2100, 700], fill=(*BLUE, 18))
    od.ellipse([-300, 700, 700, 1300], fill=(*NAVY, 14))
    img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")
    return img


def paste_logo(
    img: Image.Image,
    xy: tuple[int, int],
    height: int = 72,
    *,
    center_x: bool = False,
) -> None:
    """Paste Machakos county crest (login-page logo). xy is top-left, or center-x if center_x."""
    if not LOGO.exists():
        print(f"  WARNING: county logo missing at {LOGO}")
        return
    logo = Image.open(LOGO).convert("RGBA")
    ratio = height / logo.height
    logo = logo.resize((max(1, int(logo.width * ratio)), height), Image.Resampling.LANCZOS)
    x, y = xy
    if center_x:
        x = x - logo.width // 2
    img.paste(logo, (x, y), logo)


def rounded_rect(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    radius: int,
    fill,
    outline=None,
    width: int = 3,
) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def text_size(draw: ImageDraw.ImageDraw, text: str, fnt) -> tuple[int, int]:
    bbox = draw.textbbox((0, 0), text, font=fnt)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


def center_text(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    text: str,
    fnt,
    fill,
    line_gap: int = 8,
) -> None:
    lines = text.split("\n")
    heights = []
    widths = []
    for line in lines:
        w, h = text_size(draw, line, fnt)
        widths.append(w)
        heights.append(h)
    total_h = sum(heights) + line_gap * (len(lines) - 1)
    y = xy[1] - total_h // 2
    for i, line in enumerate(lines):
        tw = widths[i]
        draw.text((xy[0] - tw // 2, y), line, font=fnt, fill=fill)
        y += heights[i] + line_gap


def draw_step_box(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    n: int,
    label: str,
    *,
    active: bool,
    done: bool,
) -> None:
    x0, y0, x1, y1 = box
    if active:
        fill, stroke, label_c, badge = WHITE, NAVY, NAVY, NAVY
        width = 5
    elif done:
        fill, stroke, label_c, badge = (232, 245, 233), GREEN, GREEN, GREEN
        width = 3
    else:
        fill, stroke, label_c, badge = (245, 248, 250), DIM, SLATE, DIM
        width = 2

    rounded_rect(draw, box, 18, fill=fill, outline=stroke, width=width)
    cx, cy = x0 + 34, y0 + 34
    draw.ellipse([cx - 18, cy - 18, cx + 18, cy + 18], fill=badge)
    nf = font(18, bold=True)
    nw, nh = text_size(draw, str(n), nf)
    draw.text((cx - nw // 2, cy - nh // 2 - 1), str(n), font=nf, fill=WHITE)
    center_text(draw, ((x0 + x1) // 2, (y0 + y1) // 2 + 8), label, font(22, bold=True), label_c)


def arrow(draw: ImageDraw.ImageDraw, x0: int, y: int, x1: int, color=BLUE) -> None:
    draw.line([(x0, y), (x1 - 12, y)], fill=color, width=4)
    draw.polygon([(x1, y), (x1 - 16, y - 9), (x1 - 16, y + 9)], fill=color)


def lifecycle_layout() -> list[tuple[int, int, int, int]]:
    """Return 9 boxes matching the 5 + 4 layout."""
    boxes = []
    top_y, bot_y = 290, 560
    top_w, gap = 250, 28
    # Row 1: 5 boxes centered
    total_top = 5 * top_w + 4 * gap
    x = (W - total_top) // 2
    for _ in range(5):
        boxes.append((x, top_y, x + top_w, top_y + 120))
        x += top_w + gap
    # Row 2: 4 boxes centered
    bot_w = 250
    total_bot = 4 * bot_w + 3 * gap
    x = (W - total_bot) // 2
    for _ in range(4):
        boxes.append((x, bot_y, x + bot_w, bot_y + 120))
        x += bot_w + gap
    return boxes


def render_lifecycle_frame(active: int | None, *, mode: str = "build") -> Image.Image:
    """
    active: 1..9 highlight that step; None = none highlighted.
    mode: build | full | title | hold
    """
    img = gradient_bg()
    draw = ImageDraw.Draw(img)
    paste_logo(img, (48, 36), 64)

    title = "E-CIMES Project Lifecycle"
    subtitle = "County Government of Machakos — one integrated platform"
    draw.text((W // 2 - text_size(draw, title, font(44, True))[0] // 2, 48), title, font=font(44, True), fill=NAVY)
    draw.text(
        (W // 2 - text_size(draw, subtitle, font(22))[0] // 2, 112),
        subtitle,
        font=font(22),
        fill=SLATE,
    )

    boxes = lifecycle_layout()
    # Arrows row 1
    for i in range(4):
        x0 = boxes[i][2] + 4
        x1 = boxes[i + 1][0] - 4
        y = (boxes[i][1] + boxes[i][3]) // 2
        arrow(draw, x0, y, x1, BLUE if (active is None or i < (active or 0)) else DIM)
    # Down connector
    mid_x = W // 2
    draw.line([(mid_x, boxes[4][3] + 8), (mid_x, boxes[5][1] - 16)], fill=BLUE, width=4)
    draw.polygon([(mid_x, boxes[5][1] - 4), (mid_x - 9, boxes[5][1] - 20), (mid_x + 9, boxes[5][1] - 20)], fill=BLUE)
    draw.text((mid_x + 14, (boxes[4][3] + boxes[5][1]) // 2 - 8), "continues", font=font(16), fill=SLATE)
    # Arrows row 2
    for i in range(5, 8):
        x0 = boxes[i][2] + 4
        x1 = boxes[i + 1][0] - 4
        y = (boxes[i][1] + boxes[i][3]) // 2
        arrow(draw, x0, y, x1, BLUE if (active is None or i < (active or 0)) else DIM)

    for i, box in enumerate(boxes, start=1):
        if mode == "title":
            done = False
            is_active = False
        elif mode == "full" or mode == "hold":
            done = True
            is_active = False
        else:
            done = active is not None and i < active
            is_active = active == i
        draw_step_box(draw, box, i, LIFECYCLE_STEPS[i - 1], active=is_active, done=done)

    footer = "All in one platform — Electronic County Integrated Monitoring & Evaluation System"
    if mode == "hold":
        footer = "All in one platform — planning through public transparency"
    fw, _ = text_size(draw, footer, font(20))
    draw.text(((W - fw) // 2, 920), footer, font=font(20), fill=NAVY)

    if active:
        badge = f"Step {active} of 9"
        bw, bh = text_size(draw, badge, font(18, True))
        bx0, by0 = W - bw - 80, 48
        rounded_rect(draw, (bx0 - 16, by0 - 8, bx0 + bw + 16, by0 + bh + 8), 12, fill=NAVY)
        draw.text((bx0, by0), badge, font=font(18, True), fill=WHITE)

    return img


def render_chain_frame(
    title: str,
    subtitle: str,
    steps: list[tuple[str, str]],
    active: int | None,
    *,
    accent=NAVY,
) -> Image.Image:
    img = gradient_bg()
    draw = ImageDraw.Draw(img)
    paste_logo(img, (48, 36), 64)
    draw.text((W // 2 - text_size(draw, title, font(40, True))[0] // 2, 56), title, font=font(40, True), fill=NAVY)
    draw.text(
        (W // 2 - text_size(draw, subtitle, font(22))[0] // 2, 118),
        subtitle,
        font=font(22),
        fill=SLATE,
    )

    n = len(steps)
    box_w, box_h, gap = 280, 180, 40
    total = n * box_w + (n - 1) * gap
    x = (W - total) // 2
    y = 420
    for i, (label, sub) in enumerate(steps, start=1):
        done = active is not None and i < active
        is_active = active == i or (active is None)
        if active is None:
            # full view: all done-style
            fill, stroke, lc = (232, 245, 233), GREEN, GREEN
            width = 3
        elif is_active:
            fill, stroke, lc = WHITE, accent, accent
            width = 5
        elif done:
            fill, stroke, lc = (232, 245, 233), GREEN, GREEN
            width = 3
        else:
            fill, stroke, lc = (245, 248, 250), DIM, SLATE
            width = 2
        rounded_rect(draw, (x, y, x + box_w, y + box_h), 20, fill=fill, outline=stroke, width=width)
        # number
        draw.ellipse([x + 20, y + 20, x + 56, y + 56], fill=stroke if not (active is None) else GREEN)
        nf = font(18, True)
        ns = str(i)
        nw, nh = text_size(draw, ns, nf)
        draw.text((x + 38 - nw // 2, y + 38 - nh // 2 - 1), ns, font=nf, fill=WHITE)
        center_text(draw, (x + box_w // 2, y + 95), label, font(24, True), lc)
        sw, _ = text_size(draw, sub, font(16))
        draw.text((x + (box_w - sw) // 2, y + box_h - 42), sub, font=font(16), fill=SLATE)
        if i < n:
            arrow(draw, x + box_w + 6, y + box_h // 2, x + box_w + gap - 6, accent if (active is None or i < active) else DIM)
        x += box_w + gap

    if active:
        badge = f"{active} of {n}"
        bw, bh = text_size(draw, badge, font(18, True))
        rounded_rect(draw, (W - bw - 96, 48, W - 48, 48 + bh + 16), 12, fill=accent)
        draw.text((W - bw - 80, 56), badge, font=font(18, True), fill=WHITE)
    return img


def render_title_card(
    eyebrow: str,
    title: str,
    subtitle: str,
    *,
    footer: str = "E-CIMES · County Government of Machakos",
) -> Image.Image:
    img = gradient_bg()
    draw = ImageDraw.Draw(img)
    paste_logo(img, (W // 2, 140), 120, center_x=True)

    ew, _ = text_size(draw, eyebrow.upper(), font(20, True))
    rounded_rect(
        draw,
        (W // 2 - ew // 2 - 20, 290, W // 2 + ew // 2 + 20, 330),
        8,
        fill=NAVY,
    )
    draw.text((W // 2 - ew // 2, 298), eyebrow.upper(), font=font(20, True), fill=WHITE)

    tw, _ = text_size(draw, title, font(56, True))
    # wrap long titles
    if tw > W - 160:
        # split on space near middle
        words = title.split()
        mid = len(words) // 2
        title = " ".join(words[:mid]) + "\n" + " ".join(words[mid:])
    center_text(draw, (W // 2, 470), title, font(56, True), NAVY, line_gap=12)

    sw, _ = text_size(draw, subtitle, font(26))
    if sw > W - 200:
        words = subtitle.split()
        mid = max(1, len(words) // 2)
        subtitle = " ".join(words[:mid]) + "\n" + " ".join(words[mid:])
    center_text(draw, (W // 2, 620), subtitle, font(26), SLATE, line_gap=10)

    fw, _ = text_size(draw, footer, font(18))
    draw.text(((W - fw) // 2, 980), footer, font=font(18), fill=SLATE)
    # Accent bar
    draw.rectangle([W // 2 - 80, 700, W // 2 + 80, 706], fill=BLUE)
    return img


def render_lower_third(label: str) -> Image.Image:
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    fnt = font(28, True)
    tw, th = text_size(draw, label, fnt)
    pad_x, pad_y = 28, 18
    box_w = tw + pad_x * 2
    box_h = th + pad_y * 2
    x0 = 72
    y0 = H - 160
    # navy bar + white text
    rounded_rect(draw, (x0, y0, x0 + box_w, y0 + box_h), 10, fill=(*NAVY, 230))
    draw.rectangle([x0, y0, x0 + 8, y0 + box_h], fill=(*AMBER, 255))
    draw.text((x0 + pad_x, y0 + pad_y - 2), label, font=fnt, fill=WHITE)
    return img


def ch01_duration() -> float:
    try:
        import mutagen

        return float(mutagen.File(str(VOICE_CH01)).info.length)
    except Exception:
        return 58.0


def write_lifecycle_timing(path: Path, duration: float) -> None:
    """Map Ch1 voiceover (~58s) to lifecycle frames."""
    # Rough cue points aligned to spoken lifecycle list + intro/outro buffer
    # 0–6s branding/title, 6–48s steps (~4.6s each), 48–58s full hold + montage handoff
    title_s = 5.5
    hold_s = max(4.0, duration - title_s - 9 * 4.5)
    step_s = (duration - title_s - hold_s) / 9

    rows = []
    t = 0.0
    rows.append(("00-title.png", round(t, 2), round(title_s, 2), "Series title / lifecycle title"))
    t += title_s
    for i in range(1, 10):
        rows.append((f"{i:02d}-step-{LIFECYCLE_STEPS[i-1].split(chr(10))[0].lower().replace(' ', '-')}.png", round(t, 2), round(step_s, 2), f"Highlight step {i}"))
        t += step_s
    rows.append(("10-full.png", round(t, 2), round(hold_s * 0.55, 2), "All steps complete"))
    t2 = t + hold_s * 0.55
    rows.append(("11-hold.png", round(t2, 2), round(hold_s * 0.45, 2), "Hold before cut to login montage"))

    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["file", "start_sec", "duration_sec", "note"])
        w.writerows(rows)


def save(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG", optimize=True)
    print(f"  {path.relative_to(OUT)}")


def write_readme(duration: float) -> None:
    readme = OUT / "README.md"
    readme.write_text(
        f"""# E-CIMES training video assets

Generated by `scripts/generate-ecimes-training-video-assets.py` (1920×1080 PNG).

Import these into **Kdenlive**, CapCut, or DaVinci as still sequences over the matching MP3 voiceovers in `docs/training-voiceover/`.

## Folders

| Folder | Use |
|--------|-----|
| `lifecycle/` | Chapter 1 intro — step-by-step build (replaces static diagram) |
| `me-chain/` | Chapter 4.1 M&E approval chain |
| `certificate-chain/` | Chapter 4.2 / 11 certificate steps + QR |
| `cards/` | Part openers, chapter title cards, series open, end card |
| `lower-thirds/` | Transparent path captions over screen recordings |

## Kdenlive — lifecycle slideshow (Chapter 1)

Beginner-friendly way to match frames to the voiceover:

1. New project → **1920×1080**, **25 or 30 fps**.
2. Project Bin → import `ch01-introduction.mp3` and all files in `lifecycle/` (sorted by name).
3. Drop the MP3 on **Audio 1** (do not stretch the audio).
4. Open `lifecycle-timing.csv` (regenerated with Ch1 word timings). Each row has `start_sec` and `duration_sec`.
5. For each PNG in order (`00-title` → `11-hold`):
   - Drag the still onto **Video 1**.
   - Right-click clip → **Set duration** (or resize on the timeline) to the `duration_sec` from the CSV.
   - Tip: Kdenlive shows time as `hh:mm:ss:ff` — e.g. **4.5s** at 25 fps ≈ **4 seconds + 12 frames**.
6. Optional: select all stills → add a short **Dissolve** / fade (~6–8 frames) between them.
7. After `11-hold.png`, cut to your **workspace screenshots** using `workspace-timing.csv` (see below).

**Cue words in the audio:** you will hear *First: planning… Next: registration…* through *public transparency* — change the still when you hear each step name.

### Kdenlive — workspace screenshot montage (Chapter 1, after lifecycle)

After the lifecycle stills, the voiceover paces **M&E workspaces**, then the **payment certificate** path. Drop your screen captures using `workspace-timing.csv`:

| Suggested clip name | Cue in audio |
|---------------------|--------------|
| `01-village-me` | *First: Village M&E…* |
| `02-ward-me` | *Next: Ward M&E…* |
| `03-subcounty-me` | *Next: Sub-County M&E…* |
| `04-department-chief` | *Next: Department Chief Officer…* |
| `05-sector-me-champions` | *Next: Sector M&E Champions…* |
| `06-contractor` | *First: Contractor…* (initiates payment request) |
| `07-resident-engineer` | *Next: Resident Engineer…* (creates certificate) |
| `08-chief-engineer` | *Next: Chief Engineer…* (approve / return / forward) |
| `09-co-finance` | *Finally: Chief Finance Officer…* |
| `10-training-outro-hold` | closing “In this training…” lines |

Tip: capture each workspace at 1920×1080 while logged in as that role, then set each clip’s duration from the CSV.

If matching still feels rushed, regenerate slower audio only:

```bash
python3 scripts/generate-ecimes-training-voiceover.py --rate "-20%" --chapters 1
```

Suggested order:

```
lifecycle 00…11 → M&E workspaces 01…05 → payment path 06…09 → outro hold
```

## CapCut — lifecycle (Chapter 1)

1. New project 1920×1080, 30 fps.
2. Drop `ch01-introduction.mp3` on the timeline (≈ **{duration:.1f}s**).
3. Import all `lifecycle/*.png` (sorted by filename).
4. Place frames in order using `lifecycle-timing.csv` durations.
5. Optional: add **Fade** between frames (6–8 frames).
6. After `11-hold.png`, place workspace screenshots using `workspace-timing.csv`.

## CapCut — chain animations

- **M&E:** drop `me-chain/01`…`05` then `06-full` under Ch4.1 voiceover (~3–4s each).
- **Certificates:** drop `certificate-chain/01`…`04` then `05-full` under Ch4.2 / Ch11 (~3–4s each).

## CapCut — chapter cards

Place the matching `cards/chNN-….png` for **1.5–2.5s** at the start of each chapter clip (or as a transition).

Use `part1|2|3-….png` at the start of each published part.
Use `00-series-open.png` before Part 1 and `99-end-card.png` after Chapter 17.

## Lower-thirds

Overlay PNGs from `lower-thirds/` above screen recordings. They are transparent full-frame images — position is already bottom-left. Show for 3–5s when entering a new menu path.

## Regenerate

```bash
python3 scripts/generate-ecimes-training-video-assets.py
python3 scripts/generate-ecimes-training-voiceover.py --chapters 1   # refreshes lifecycle- + workspace-timing.csv
```
""",
        encoding="utf-8",
    )
    print(f"  {readme.relative_to(OUT)}")


def main() -> None:
    print(f"Writing assets to {OUT}")
    OUT.mkdir(parents=True, exist_ok=True)
    duration = ch01_duration()

    # --- Lifecycle ---
    life = OUT / "lifecycle"
    save(render_lifecycle_frame(None, mode="title"), life / "00-title.png")
    for i, label in enumerate(LIFECYCLE_STEPS, start=1):
        slug = label.split("\n")[0].lower().replace(" ", "-")
        save(render_lifecycle_frame(i, mode="build"), life / f"{i:02d}-step-{slug}.png")
    save(render_lifecycle_frame(None, mode="full"), life / "10-full.png")
    save(render_lifecycle_frame(None, mode="hold"), life / "11-hold.png")
    meta = OUT / "ch01-word-boundaries.jsonl"
    timing_csv = OUT / "lifecycle-timing.csv"
    if meta.exists():
        # Prefer word-aligned cues from the voiceover generator (do not clobber with equal splits)
        from importlib.util import module_from_spec, spec_from_file_location

        vo_path = ROOT / "scripts" / "generate-ecimes-training-voiceover.py"
        spec = spec_from_file_location("ecimes_vo", vo_path)
        mod = module_from_spec(spec)
        assert spec.loader is not None
        spec.loader.exec_module(mod)
        mod.write_lifecycle_timing_from_meta(meta, timing_csv, duration)
        print("  lifecycle-timing.csv (from Ch1 word boundaries)")
    else:
        write_lifecycle_timing(timing_csv, duration)
        print("  lifecycle-timing.csv (equal-split fallback)")

    # --- M&E chain ---
    me = OUT / "me-chain"
    for i in range(1, len(ME_STEPS) + 1):
        save(
            render_chain_frame(
                "M&E Monitoring Chain",
                "Village draft → Ward → Sub-county → Chief approve → Public",
                ME_STEPS,
                i,
            ),
            me / f"{i:02d}-{ME_STEPS[i-1][0].lower().replace(' ', '-')}.png",
        )
    save(
        render_chain_frame(
            "M&E Monitoring Chain",
            "Village draft → Ward → Sub-county → Chief approve → Public",
            ME_STEPS,
            None,
        ),
        me / "06-full.png",
    )

    # --- Certificate chain ---
    cert = OUT / "certificate-chain"
    for i in range(1, len(CERT_STEPS) + 1):
        slug = CERT_STEPS[i - 1][0].split("\n")[0].lower().replace(" ", "-")
        save(
            render_chain_frame(
                "Payment Certificate Chain",
                "Resident Engineer → Chief Engineer → Chief Finance Officer → QR verify",
                CERT_STEPS,
                i,
                accent=BLUE,
            ),
            cert / f"{i:02d}-{slug}.png",
        )
    save(
        render_chain_frame(
            "Payment Certificate Chain",
            "Resident Engineer → Chief Engineer → Chief Finance Officer → QR verify",
            CERT_STEPS,
            None,
            accent=BLUE,
        ),
        cert / "05-full.png",
    )

    # --- Cards ---
    cards = OUT / "cards"
    save(
        render_title_card(
            "Video tutorial series",
            "E-CIMES",
            "Electronic County Integrated Monitoring\nand Evaluation System",
        ),
        cards / "00-series-open.png",
    )
    for n, title, subtitle, meta in PARTS:
        save(
            render_title_card(f"Part {n}", title, f"{subtitle}\n{meta}"),
            cards / f"part{n}-{title.lower().replace(' ', '-').replace('&', 'and')}.png",
        )
    def card_slug(text: str) -> str:
        s = text.lower().replace("&", "and")
        for ch in " ,/":
            s = s.replace(ch, "-")
        while "--" in s:
            s = s.replace("--", "-")
        return s.strip("-")

    for n, title, subtitle in CHAPTERS:
        save(
            render_title_card(f"Chapter {n}", title, subtitle),
            cards / f"ch{n:02d}-{card_slug(title)}.png",
        )
    save(
        render_title_card(
            "Thank you",
            "Get help anytime",
            "Open Help & Support from the three-dot menu\nor contact ICT for account and role questions",
            footer="E-CIMES · County Government of Machakos",
        ),
        cards / "99-end-card.png",
    )

    # Role map card (Ch3 conceptual)
    save(
        render_title_card(
            "Remember",
            "Your landing page\nmatches your role",
            "Village · Ward · Sub-county · Engineering · Co-Finance\nContractor · Leadership · Full ribbon staff",
        ),
        cards / "ch03-role-map.png",
    )

    # --- Lower thirds ---
    lt = OUT / "lower-thirds"
    for slug, label in LOWER_THIRDS:
        save(render_lower_third(label), lt / f"{slug}.png")

    write_readme(duration)
    print("Done.")


if __name__ == "__main__":
    main()
