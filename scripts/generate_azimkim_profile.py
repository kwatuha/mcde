#!/usr/bin/env python3
"""Generate AZIMKIM INVESTMENTS LIMITED company profile PDF (A4)."""

from __future__ import annotations

from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.colors import HexColor, white
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    Image as RLImage,
    PageBreak,
    Flowable,
    KeepTogether,
)
from reportlab.pdfgen import canvas
from pypdf import PdfReader, PdfWriter

ROOT = Path(__file__).resolve().parents[1]
ASSET = ROOT / "docs" / "azimkim" / "assets"
OUT_PDF = ROOT / "docs" / "azimkim" / "AZIMKIM_INVESTMENTS_LIMITED_PROFILE_2026.pdf"
OUT_INIT = ROOT / "init.sql" / "azimkim" / "AZIMKIM_INVESTMENTS_LIMITED_PROFILE_2026.pdf"

# Brand — forest green from official seal logo + warm gold accent
TEAL = HexColor("#487838")          # primary green (sampled from logo)
TEAL_DEEP = HexColor("#345628")
TEAL_MID = HexColor("#5A8F48")
AMBER = HexColor("#C4A035")         # soft gold accent for rules/highlights
AMBER_LIGHT = HexColor("#D4B84A")
SLATE = HexColor("#334155")
LIGHT = HexColor("#F3F7F0")
MUTED = HexColor("#64748B")
INK = HexColor("#0F172A")
GREEN_RGB = (72, 120, 56)

PAGE_W, PAGE_H = A4

pdfmetrics.registerFont(TTFont("Ub", "/usr/share/fonts/truetype/ubuntu/Ubuntu-R.ttf"))
pdfmetrics.registerFont(TTFont("UbB", "/usr/share/fonts/truetype/ubuntu/Ubuntu-B.ttf"))
pdfmetrics.registerFont(TTFont("UbM", "/usr/share/fonts/truetype/ubuntu/Ubuntu-M.ttf"))
pdfmetrics.registerFont(TTFont("UbI", "/usr/share/fonts/truetype/ubuntu/Ubuntu-RI.ttf"))


def _arc_text(base, text, cx, cy, radius, font, fill, start_ang, end_ang, *, upright=True):
    import math

    tmp = Image.new("RGBA", (10, 10))
    td = ImageDraw.Draw(tmp)
    widths = []
    for ch in text:
        bb = td.textbbox((0, 0), ch, font=font)
        widths.append(bb[2] - bb[0] + 2)
    total = sum(widths)
    mid = (start_ang + end_ang) / 2
    half = (total / 2) / radius * 180 / math.pi
    direction = 1 if end_ang > start_ang else -1
    ang = mid - half if direction > 0 else mid + half
    if direction <= 0:
        direction = -1
    for ch, w in zip(text, widths):
        char_arc = (w / 2) / radius * 180 / math.pi
        ang_c = ang + direction * char_arc
        rad = math.radians(ang_c)
        x = cx + radius * math.cos(rad)
        y = cy - radius * math.sin(rad)
        rot = ang_c - 90 if upright else ang_c - 90 + 180
        bb = td.textbbox((0, 0), ch, font=font)
        cw, chh = bb[2] - bb[0] + 8, bb[3] - bb[1] + 8
        glyph = Image.new("RGBA", (cw, chh), (0, 0, 0, 0))
        ImageDraw.Draw(glyph).text((4 - bb[0], 4 - bb[1]), ch, font=font, fill=fill)
        glyph = glyph.rotate(rot, resample=Image.Resampling.BICUBIC, expand=True)
        gw, gh = glyph.size
        base.alpha_composite(glyph, (int(x - gw / 2), int(y - gh / 2)))
        ang = ang + direction * (w / radius * 180 / math.pi)


def make_logo(path: Path, size: int = 1600) -> Path:
    """High-res redraw of the official Azimkim seal (forest green, devices, arched type)."""
    import math

    g = GREEN_RGB
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = cy = size // 2
    outer_r, outer_w, gap = int(size * 0.475), int(size * 0.032), 10
    inner_r = int(size * 0.431)

    # White seal disc
    fill_r = inner_r - 4
    d.ellipse([cx - fill_r, cy - fill_r, cx + fill_r, cy + fill_r], fill=(255, 255, 255, 255))

    # Outer ring with cardinal gaps
    order = [0, 90, 180, 270]
    bbox = [cx - outer_r, cy - outer_r, cx + outer_r, cy + outer_r]
    for i, start_c in enumerate(order):
        end_c = order[(i + 1) % 4]
        a0, a1 = start_c + gap / 2, end_c - gap / 2
        if a1 < a0:
            a1 += 360
        pil_start, pil_end = -a1, -a0
        while pil_end < pil_start:
            pil_end += 360
        d.arc(bbox, start=pil_start, end=pil_end, fill=g + (255,), width=outer_w)

    d.arc([cx - inner_r, cy - inner_r, cx + inner_r, cy + inner_r], 0, 360, fill=g + (255,), width=max(4, size // 250))

    try:
        font_name = ImageFont.truetype("/usr/share/fonts/truetype/ubuntu/Ubuntu-B.ttf", max(28, size // 22))
        font_tag = ImageFont.truetype("/usr/share/fonts/truetype/ubuntu/Ubuntu-M.ttf", max(20, size // 33))
    except Exception:
        font_name = ImageFont.load_default()
        font_tag = font_name

    text_r = int(size * 0.362)
    _arc_text(img, "AZIMKIM INVESTMENTS LIMITED", cx, cy, text_r, font_name, g + (255,), 155, 25, upright=True)
    _arc_text(
        img,
        "Connecting Ideas, Powering Futures.",
        cx,
        cy,
        text_r,
        font_tag,
        g + (255,),
        205,
        335,
        upright=False,
    )

    for ang in (180, 0):
        rad = math.radians(ang)
        x = cx + text_r * math.cos(rad)
        y = cy - text_r * math.sin(rad)
        r = max(6, size // 110)
        d.ellipse([x - r, y - r, x + r, y + r], fill=g + (255,))

    # Enhanced monitor + phone
    mx0, my0 = cx - int(size * 0.138), cy - int(size * 0.056)
    mw, mh = int(size * 0.188), int(size * 0.125)
    lw = max(4, size // 160)
    d.rounded_rectangle([mx0, my0, mx0 + mw, my0 + mh], radius=12, outline=g, width=lw)
    pad = max(10, size // 80)
    d.rounded_rectangle([mx0 + pad, my0 + pad, mx0 + mw - pad, my0 + mh - pad], radius=6, outline=g, width=max(2, lw // 2))
    sx0, sy0 = mx0 + pad + 8, my0 + pad + 8
    sx1, sy1 = mx0 + mw - pad - 8, my0 + mh - pad - 8
    d.rounded_rectangle([sx0, sy0, sx1, sy0 + max(10, size // 70)], radius=4, fill=g)
    d.rounded_rectangle([sx0, sy0 + max(16, size // 55), sx0 + max(20, size // 40), sy1], radius=4, outline=g, width=2)
    d.rounded_rectangle([sx0 + max(28, size // 35), sy0 + max(16, size // 55), sx0 + max(70, size // 18), sy0 + max(40, size // 28)], radius=4, outline=g, width=2)
    d.rounded_rectangle([sx0 + max(78, size // 16), sy0 + max(16, size // 55), sx1, sy0 + max(40, size // 28)], radius=4, outline=g, width=2)
    d.rounded_rectangle([sx0 + max(28, size // 35), sy0 + max(48, size // 24), sx1, sy1], radius=4, outline=g, width=2)
    stand_top = my0 + mh + 2
    d.rectangle([cx - int(size * 0.034), stand_top, cx - int(size * 0.01), stand_top + int(size * 0.022)], fill=g)
    d.rounded_rectangle(
        [cx - int(size * 0.07), stand_top + int(size * 0.022), cx + int(size * 0.025), stand_top + int(size * 0.032)],
        radius=4,
        fill=g,
    )

    px0, py0 = cx + int(size * 0.044), cy - int(size * 0.075)
    pw, ph = int(size * 0.081), int(size * 0.15)
    d.rounded_rectangle([px0, py0, px0 + pw, py0 + ph], radius=14, outline=g, width=lw)
    d.rounded_rectangle([px0 + 8, py0 + 16, px0 + pw - 8, py0 + ph - 16], radius=6, outline=g, width=max(2, lw // 2))
    d.rounded_rectangle([px0 + 22, py0 + 6, px0 + pw - 22, py0 + 12], radius=2, fill=g)
    ax0, ay0 = px0 + 14, py0 + 26
    ax1 = px0 + pw - 14
    d.rounded_rectangle([ax0, ay0, ax1, ay0 + max(14, size // 55)], radius=4, fill=g)
    for i in range(3):
        y = ay0 + max(24, size // 40) + i * max(18, size // 45)
        d.rounded_rectangle([ax0, y, ax1, y + max(12, size // 60)], radius=4, outline=g, width=2)
    d.rounded_rectangle([px0 + 20, py0 + ph - 12, px0 + pw - 20, py0 + ph - 6], radius=2, fill=g)

    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path)
    # White-bg companion for solid backgrounds
    opaque = Image.new("RGB", (size, size), (255, 255, 255))
    opaque.paste(img, mask=img.split()[-1])
    opaque.save(path.with_name("logo-white.png"), quality=95)
    return path


def make_icon(path: Path, kind: str, size: int = 256) -> Path:
    img = Image.new("RGB", (size, size), (240, 247, 247))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([8, 8, size - 8, size - 8], radius=28, fill=(72, 120, 56))
    d.rounded_rectangle([20, 20, size - 20, size - 20], radius=22, fill=(52, 92, 40))
    cx = cy = size // 2
    g = (72, 120, 56)

    if kind == "consult":
        d.rounded_rectangle([cx - 55, cy - 70, cx + 45, cy + 65], radius=8, outline=g, width=4)
        for i in range(4):
            y = cy - 45 + i * 22
            d.line([(cx - 35, y), (cx + 25, y)], fill=g, width=3)
    elif kind == "software":
        d.rounded_rectangle([cx - 70, cy - 50, cx + 70, cy + 30], radius=8, outline=g, width=4)
        d.rectangle([cx - 20, cy + 30, cx + 20, cy + 45], fill=g)
        d.rectangle([cx - 50, cy + 45, cx + 50, cy + 55], fill=g)
        d.line([(cx - 40, cy - 20), (cx - 10, cy + 5), (cx - 40, cy + 15)], fill=g, width=4)
        d.line([(cx + 10, cy - 20), (cx + 40, cy + 5), (cx + 10, cy + 15)], fill=g, width=4)
    elif kind == "me":
        # chart bars + target
        for i, h in enumerate((40, 70, 55, 90)):
            x0 = cx - 70 + i * 28
            d.rectangle([x0, cy + 40 - h, x0 + 18, cy + 40], fill=g)
        d.ellipse([cx + 25, cy - 70, cx + 85, cy - 10], outline=g, width=4)
        d.ellipse([cx + 42, cy - 53, cx + 68, cy - 27], fill=g)
    elif kind == "recruit":
        for dx in (-40, 40):
            d.ellipse([cx + dx - 22, cy - 55, cx + dx + 22, cy - 10], outline=g, width=3)
            d.arc([cx + dx - 35, cy - 5, cx + dx + 35, cy + 50], 200, 340, fill=g, width=3)
        d.ellipse([cx - 18, cy - 75, cx + 18, cy - 40], outline=g, width=3)
    elif kind == "elearn":
        d.polygon(
            [(cx - 70, cy - 10), (cx, cy - 55), (cx + 70, cy - 10), (cx, cy + 20)],
            outline=g,
        )
        d.line([(cx - 70, cy - 10), (cx - 70, cy + 40), (cx, cy + 70), (cx, cy + 20)], fill=g, width=4)
        d.line([(cx + 70, cy - 10), (cx + 70, cy + 40), (cx, cy + 70)], fill=g, width=4)
    elif kind == "gov":
        # building
        d.rectangle([cx - 60, cy - 20, cx + 60, cy + 65], outline=g, width=4)
        d.polygon([(cx - 75, cy - 20), (cx, cy - 70), (cx + 75, cy - 20)], outline=g)
        for r in range(2):
            for c in range(3):
                x0 = cx - 40 + c * 28
                y0 = cy - 5 + r * 30
                d.rectangle([x0, y0, x0 + 16, y0 + 18], outline=g, width=2)
    else:  # integrate
        for dx, dy in [(-50, -25), (50, -25), (0, 45)]:
            d.ellipse([cx + dx - 16, cy + dy - 16, cx + dx + 16, cy + dy + 16], fill=g)
        d.line([(cx - 50, cy - 25), (cx + 50, cy - 25)], fill=g, width=3)
        d.line([(cx - 50, cy - 25), (cx, cy + 45)], fill=g, width=3)
        d.line([(cx + 50, cy - 25), (cx, cy + 45)], fill=g, width=3)

    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path)
    return path


def make_hero(path: Path, w: int = 1400, h: int = 720) -> Path:
    img = Image.new("RGB", (w, h), (52, 92, 40))
    d = ImageDraw.Draw(img)
    # soft panels
    d.ellipse([-200, -200, 600, 600], fill=(72, 120, 56))
    d.ellipse([900, 200, 1600, 900], fill=(90, 140, 78))
    for rad in (180, 280, 380):
        d.arc([w // 2 - rad, h // 2 - rad, w // 2 + rad, h // 2 + rad], 200, 340, fill=(72, 120, 56), width=3)

    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/ubuntu/Ubuntu-B.ttf", 30)
        font_s = ImageFont.truetype("/usr/share/fonts/truetype/ubuntu/Ubuntu-R.ttf", 16)
    except Exception:
        font = ImageFont.load_default()
        font_s = font

    cards = [
        (70, 80, 420, 260, "CONSULTANCY"),
        (480, 50, 920, 260, "SOFTWARE"),
        (980, 90, 1330, 300, "M&E SYSTEMS"),
        (120, 380, 560, 620, "RECRUITMENT"),
        (620, 400, 980, 640, "E-LEARNING"),
        (1040, 380, 1330, 640, "INTEGRATION"),
    ]
    for x1, y1, x2, y2, label in cards:
        d.rounded_rectangle([x1, y1, x2, y2], radius=16, fill=(255, 255, 255))
        d.rounded_rectangle([x1, y1, x2, y1 + 8], radius=4, fill=(72, 120, 56))
        d.text((x1 + 22, y1 + 40), label, fill=(52, 92, 40), font=font)
        d.text((x1 + 22, y1 + 90), "Design · Build · Enable", fill=(100, 116, 139), font=font_s)

    logo = Image.open(ASSET / "logo.png").convert("RGBA").resize((160, 160), Image.Resampling.LANCZOS)
    img.paste(logo, (w // 2 - 80, h // 2 - 90), logo)
    img.save(path, quality=92)
    return path


def make_banner(path: Path, color=(72, 120, 56), w=1600, h=420, label="") -> Path:
    img = Image.new("RGB", (w, h), color)
    d = ImageDraw.Draw(img)
    d.rectangle([0, h - 14, w, h], fill=(72, 120, 56))
    d.ellipse([-100, -80, 500, 400], fill=(52, 92, 40))
    d.ellipse([1100, 50, 1750, 550], fill=(90, 140, 78))
    if label:
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/ubuntu/Ubuntu-B.ttf", 48)
        except Exception:
            font = ImageFont.load_default()
        bbox = d.textbbox((0, 0), label, font=font)
        tw = bbox[2] - bbox[0]
        d.text(((w - tw) // 2, h // 2 - 30), label, fill=(255, 255, 255), font=font)
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, quality=90)
    return path


class SectionRule(Flowable):
    def __init__(self, width, color=AMBER):
        super().__init__()
        self._w = width
        self.color = color

    def wrap(self, aw, ah):
        return self._w, 8

    def draw(self):
        self.canv.setStrokeColor(self.color)
        self.canv.setLineWidth(2.5)
        self.canv.line(0, 4, 60, 4)
        self.canv.setStrokeColor(TEAL)
        self.canv.setLineWidth(1)
        self.canv.line(68, 4, self._w, 4)


def styles():
    s = getSampleStyleSheet()
    specs = [
        ("CoverTitle", "UbB", 26, 32, TEAL, TA_CENTER, 4),
        ("CoverSub", "UbB", 14, 18, AMBER, TA_CENTER, 8),
        ("Tagline", "UbI", 11, 15, MUTED, TA_CENTER, 10),
        ("H1", "UbB", 17, 21, TEAL, TA_LEFT, 8),
        ("H2", "UbB", 12, 16, TEAL, TA_LEFT, 4),
        ("Body", "Ub", 10, 14, SLATE, TA_JUSTIFY, 8),
        ("BodyCenter", "Ub", 10, 14, SLATE, TA_CENTER, 6),
        ("BulletItem", "Ub", 10, 13.5, SLATE, TA_LEFT, 3),
        ("Small", "Ub", 8.5, 11, MUTED, TA_CENTER, 2),
        ("CardTitle", "UbB", 10.5, 13, TEAL, TA_CENTER, 3),
        ("CardBody", "Ub", 8.5, 11.5, SLATE, TA_CENTER, 2),
        ("StatNum", "UbB", 20, 24, AMBER_LIGHT, TA_CENTER, 0),
        ("StatLabel", "Ub", 8, 10, white, TA_CENTER, 0),
        ("WhiteBody", "Ub", 10, 14, white, TA_CENTER, 0),
        ("WhiteLeft", "Ub", 9.5, 13, white, TA_LEFT, 0),
    ]
    for name, font, size, leading, color, align, after in specs:
        s.add(
            ParagraphStyle(
                name=name,
                fontName=font,
                fontSize=size,
                leading=leading,
                textColor=color,
                alignment=align,
                spaceAfter=after,
                spaceBefore=2 if name.startswith("H") else 0,
                leftIndent=8 if name == "BulletItem" else 0,
            )
        )
    return s


def p(text, style):
    return Paragraph(text, style)


def header_footer(canv: canvas.Canvas, doc):
    canv.saveState()
    page = doc.page + 1
    canv.setFillColor(TEAL)
    canv.rect(0, PAGE_H - 14 * mm, PAGE_W, 14 * mm, fill=1, stroke=0)
    canv.setFillColor(AMBER)
    canv.rect(0, PAGE_H - 15.2 * mm, PAGE_W, 1.2 * mm, fill=1, stroke=0)
    canv.setFillColor(white)
    canv.setFont("UbB", 8)
    canv.drawString(18 * mm, PAGE_H - 9 * mm, "AZIMKIM INVESTMENTS LIMITED")
    canv.setFont("Ub", 8)
    canv.drawRightString(PAGE_W - 18 * mm, PAGE_H - 9 * mm, "Company Profile 2026")

    canv.setFillColor(TEAL)
    canv.rect(0, 0, PAGE_W, 12 * mm, fill=1, stroke=0)
    canv.setFillColor(AMBER)
    canv.rect(0, 12 * mm, PAGE_W, 1 * mm, fill=1, stroke=0)
    canv.setFillColor(white)
    canv.setFont("Ub", 7)
    canv.drawString(18 * mm, 5 * mm, "azimkiminvestments@gmail.com")
    canv.drawCentredString(PAGE_W / 2, 5 * mm, "P.O. Box 8866 — 40100 Kisumu · Kenya")
    canv.drawRightString(PAGE_W - 18 * mm, 5 * mm, f"Page {page}")
    canv.restoreState()


def cover_page(canv: canvas.Canvas, doc):
    canv.saveState()
    canv.setFillColor(TEAL)
    canv.rect(0, PAGE_H - 28 * mm, PAGE_W, 28 * mm, fill=1, stroke=0)
    canv.setFillColor(AMBER)
    canv.rect(PAGE_W - 30 * mm, PAGE_H - 40 * mm, 30 * mm, 40 * mm, fill=1, stroke=0)
    canv.setFillColor(TEAL_MID)
    canv.rect(0, PAGE_H - 88 * mm, 12 * mm, 48 * mm, fill=1, stroke=0)

    logo = str(ASSET / "logo.png")
    canv.drawImage(logo, PAGE_W / 2 - 30 * mm, PAGE_H - 82 * mm, 60 * mm, 60 * mm, mask="auto")

    canv.setFillColor(TEAL)
    canv.setFont("UbB", 22)
    canv.drawCentredString(PAGE_W / 2, PAGE_H - 96 * mm, "AZIMKIM INVESTMENTS")
    canv.setFillColor(AMBER)
    canv.setFont("UbB", 16)
    canv.drawCentredString(PAGE_W / 2, PAGE_H - 106 * mm, "LIMITED")
    canv.setFillColor(MUTED)
    canv.setFont("UbI", 11)
    canv.drawCentredString(PAGE_W / 2, PAGE_H - 116 * mm, "Connecting Ideas, Powering Futures.")

    hero = str(ASSET / "hero.png")
    canv.drawImage(hero, 16 * mm, 52 * mm, PAGE_W - 32 * mm, 88 * mm, preserveAspectRatio=True, anchor="c")

    canv.setStrokeColor(AMBER)
    canv.setLineWidth(1.5)
    canv.line(36 * mm, 46 * mm, PAGE_W - 36 * mm, 46 * mm)

    canv.setFillColor(TEAL)
    canv.rect(0, 0, PAGE_W, 38 * mm, fill=1, stroke=0)
    canv.setFillColor(AMBER)
    canv.setFont("UbB", 18)
    canv.drawCentredString(PAGE_W / 2, 18 * mm, "COMPANY PROFILE 2026")
    canv.setFillColor(white)
    canv.setFont("Ub", 8)
    canv.drawCentredString(
        PAGE_W / 2,
        8 * mm,
        "Consultancy · Software Development · M&E Systems · Recruitment · E-Learning",
    )
    canv.restoreState()


def service_card(icon_path, title, body, st, width):
    icon = RLImage(str(icon_path), width=26 * mm, height=26 * mm)
    data = [[icon], [p(title, st["CardTitle"])], [p(body, st["CardBody"])]]
    t = Table(data, colWidths=[width])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), LIGHT),
                ("BOX", (0, 0), (-1, -1), 0.5, AMBER),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    return t


def make_company_stamp(path: Path, w: int = 1400, h: int = 620) -> Path:
    """Clean digital recreation of the official rectangular office stamp (transparent PNG)."""
    # Stamp ink blue (official rubber-stamp look)
    ink = (28, 55, 120, 255)
    ink_soft = (28, 55, 120, 230)
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    margin = 18
    # Outer border (double-ish for stamp authenticity)
    d.rectangle([margin, margin, w - margin, h - margin], outline=ink, width=10)
    d.rectangle([margin + 16, margin + 16, w - margin - 16, h - margin - 16], outline=ink_soft, width=3)

    try:
        f_name = ImageFont.truetype("/usr/share/fonts/truetype/ubuntu/Ubuntu-B.ttf", 64)
        f_addr = ImageFont.truetype("/usr/share/fonts/truetype/ubuntu/Ubuntu-B.ttf", 48)
        f_date = ImageFont.truetype("/usr/share/fonts/truetype/ubuntu/Ubuntu-B.ttf", 42)
    except Exception:
        f_name = f_addr = f_date = ImageFont.load_default()

    def center_line(text, y, font):
        bb = d.textbbox((0, 0), text, font=font)
        tw = bb[2] - bb[0]
        d.text(((w - tw) / 2, y), text, font=font, fill=ink)

    center_line("AZIMKIM INVESTMENTS LTD.", 70, f_name)
    center_line("P. O. Box 8866 - 40100,", 175, f_addr)
    center_line("KISUMU", 255, f_addr)

    # Date line
    date_label = "Date:"
    bb = d.textbbox((0, 0), date_label, font=f_date)
    lx = 90
    ly = 400
    d.text((lx, ly), date_label, font=f_date, fill=ink)
    # dotted underline
    x0 = lx + (bb[2] - bb[0]) + 18
    x1 = w - 90
    y_dot = ly + (bb[3] - bb[1]) - 4
    x = x0
    while x < x1:
        d.ellipse([x, y_dot, x + 6, y_dot + 6], fill=ink)
        x += 14

    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path)
    # Also a slightly rotated "applied" variant for overlays
    rotated = img.rotate(8, resample=Image.Resampling.BICUBIC, expand=True)
    # trim excess transparency
    bbox = rotated.getbbox()
    if bbox:
        rotated = rotated.crop(bbox)
    rotated.save(path.with_name("stamp-applied.png"))
    return path


def draw_stamp(canv: canvas.Canvas, *, x, y, width_mm=52, angle=8, opacity=0.92):
    """Vector office stamp (no PNG opacity issues) — matches cleaned company stamp."""
    from reportlab.lib.colors import Color

    w = width_mm * mm
    h = w * (620 / 1400)
    ink = Color(28 / 255, 55 / 255, 120 / 255, alpha=opacity)

    canv.saveState()
    canv.translate(x, y)
    canv.rotate(angle)
    canv.setStrokeColor(ink)
    canv.setFillColor(ink)
    canv.setLineWidth(1.6)
    canv.rect(0, 0, w, h, stroke=1, fill=0)
    canv.setLineWidth(0.7)
    canv.rect(2.2, 2.2, w - 4.4, h - 4.4, stroke=1, fill=0)

    canv.setFont("UbB", max(7.5, width_mm * 0.17))
    canv.drawCentredString(w / 2, h * 0.72, "AZIMKIM INVESTMENTS LTD.")
    canv.setFont("UbB", max(6.5, width_mm * 0.13))
    canv.drawCentredString(w / 2, h * 0.52, "P. O. Box 8866 - 40100,")
    canv.drawCentredString(w / 2, h * 0.38, "KISUMU")

    canv.setFont("UbB", max(6, width_mm * 0.12))
    date_x = w * 0.08
    date_y = h * 0.14
    canv.drawString(date_x, date_y, "Date:")
    # dotted date line
    line_x0 = date_x + 18
    line_x1 = w * 0.92
    y_dot = date_y + 1
    x_pos = line_x0
    canv.setLineWidth(1.0)
    while x_pos < line_x1:
        canv.circle(x_pos, y_dot, 0.55, stroke=0, fill=1)
        x_pos += 2.2
    canv.restoreState()


def stamp_pdf_pages(src: Path, dest: Path, page_specs: list[dict]) -> None:
    """
    Overlay stamps on selected 0-based page indices.
    page_specs: [{page, x_mm, y_mm, width_mm, angle}, ...]
    """
    reader = PdfReader(str(src))
    writer = PdfWriter()
    for i, page in enumerate(reader.pages):
        specs = [s for s in page_specs if s["page"] == i]
        if specs:
            packet = BytesIO()
            c = canvas.Canvas(packet, pagesize=A4)
            for s in specs:
                draw_stamp(
                    c,
                    x=s.get("x_mm", 128) * mm,
                    y=s.get("y_mm", 22) * mm,
                    width_mm=s.get("width_mm", 52),
                    angle=s.get("angle", 8),
                    opacity=s.get("opacity", 0.9),
                )
            c.save()
            packet.seek(0)
            overlay = PdfReader(packet).pages[0]
            page.merge_page(overlay)
        writer.add_page(page)
    with dest.open("wb") as f:
        writer.write(f)


def build_assets():
    ASSET.mkdir(parents=True, exist_ok=True)
    preferred = ASSET / "logo-enhanced.png"
    if preferred.exists():
        from shutil import copy2
        copy2(preferred, ASSET / "logo.png")
        if (ASSET / "logo-enhanced-white.png").exists():
            copy2(ASSET / "logo-enhanced-white.png", ASSET / "logo-white.png")
    else:
        make_logo(ASSET / "logo.png")
    make_company_stamp(ASSET / "stamp-clean.png")
    for kind in ("consult", "software", "me", "recruit", "elearn", "gov", "integrate"):
        make_icon(ASSET / f"icon_{kind}.png", kind)
    make_hero(ASSET / "hero.png")
    make_banner(ASSET / "banner_digital.jpg", (72, 120, 56), label="Digital Governance Solutions")
    make_banner(ASSET / "banner_systems.jpg", (52, 92, 40), label="Systems that Measure What Matters")
    make_banner(ASSET / "banner_people.jpg", (90, 140, 78), h=380, label="People · Process · Technology")


def build():
    build_assets()
    st = styles()
    OUT_PDF.parent.mkdir(parents=True, exist_ok=True)
    OUT_INIT.parent.mkdir(parents=True, exist_ok=True)

    cover_buf = BytesIO()
    c = canvas.Canvas(cover_buf, pagesize=A4)
    cover_page(c, None)
    c.showPage()
    c.save()

    body_buf = BytesIO()
    doc = SimpleDocTemplate(
        body_buf,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=22 * mm,
        bottomMargin=18 * mm,
        title="Azimkim Investments Limited — Company Profile 2026",
        author="Azimkim Investments Limited",
    )

    story = []
    content_w = PAGE_W - 36 * mm

    # ---- Identity / contact ----
    logo_row = Table(
        [[RLImage(str(ASSET / "logo.png"), width=36 * mm, height=36 * mm)]],
        colWidths=[content_w],
    )
    logo_row.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER")]))
    story.append(logo_row)
    story.append(Spacer(1, 3 * mm))
    story.append(p("AZIMKIM INVESTMENTS LIMITED", st["CoverTitle"]))
    story.append(p("Connecting Ideas, Powering Futures.", st["Tagline"]))
    story.append(SectionRule(content_w))
    story.append(Spacer(1, 4 * mm))

    contact_html = """
    <b>Azimkim Investments Limited</b><br/><br/>
    <b>Legal form</b><br/>Private limited company incorporated in the Republic of Kenya<br/><br/>
    <b>Postal address</b><br/>P.O. Box 8866 — 40100 Kisumu, Kenya<br/><br/>
    <b>Email</b><br/><font color="#487838"><u>azimkiminvestments@gmail.com</u></font><br/><br/>
    <b>KRA PIN</b><br/>P052278870S<br/><br/>
    <b>Bankers</b><br/>Equity Bank — Eldoret Branch<br/>
    Account name: Azimkim Investments Ltd<br/><br/>
    <b>Business focus</b><br/>
    General consultancy · Software development · Monitoring &amp; evaluation systems<br/>
    Recruitment systems · E-learning platforms · Systems integration &amp; support
    """
    story.append(p(contact_html, st["BodyCenter"]))
    story.append(Spacer(1, 5 * mm))

    focus = Table(
        [[p("<b>FOR: DIGITAL CONSULTANCY  ·  PUBLIC SYSTEMS  ·  INSTITUTIONAL ICT</b>", st["BodyCenter"])]],
        colWidths=[content_w - 4 * mm],
    )
    focus.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 1.5, TEAL),
                ("BACKGROUND", (0, 0), (-1, -1), LIGHT),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    story.append(focus)
    story.append(Spacer(1, 6 * mm))
    story.append(RLImage(str(ASSET / "banner_digital.jpg"), width=content_w, height=38 * mm))
    story.append(p("Technology, advisory, and delivery for county and institutional clients", st["Small"]))
    story.append(PageBreak())

    # ---- Overview ----
    story.append(p("COMPANY <font color='#D4A017'>OVERVIEW</font>", st["H1"]))
    story.append(SectionRule(content_w))
    story.append(
        p(
            "Azimkim Investments Limited is a Kenyan private limited company that designs, develops, "
            "and implements digital solutions that improve governance, transparency, and data-driven "
            "decision-making. We combine general consultancy with hands-on software engineering so "
            "public institutions and development programmes receive strategies that are actually built, "
            "deployed, and adopted.",
            st["Body"],
        )
    )
    story.append(
        p(
            "Our team brings together project managers, software engineers, database specialists, "
            "network/integration experts, and M&amp;E practitioners with direct experience delivering "
            "county-level digital transformation — including enhancement of County Integrated Monitoring "
            "and Evaluation Systems (CIMES) aligned to Kenya Devolution Support Programme (KDSP) "
            "requirements.",
            st["Body"],
        )
    )
    story.append(
        p(
            "Based in Kisumu, we serve county governments, boards, departments, and "
            "partner programmes across Kenya. Our tagline — <i>Connecting Ideas, Powering Futures.</i> — "
            "captures how we turn institutional needs into working platforms, trained users, and "
            "measurable results.",
            st["Body"],
        )
    )

    row = []
    for num, label in [
        ("CIMES", "County M&amp;E systems design &amp; enhancement"),
        ("Full-stack", "Web, mobile &amp; API delivery capability"),
        ("Agile", "Collaborative county implementation method"),
        ("KDSP", "Aligned to devolution results frameworks"),
    ]:
        inner = Table(
            [[p(num, st["StatNum"])], [p(label, st["StatLabel"])]],
            colWidths=[40 * mm],
        )
        inner.setStyle(
            TableStyle(
                [
                    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ]
            )
        )
        row.append(inner)
    stats_t = Table([row], colWidths=[43 * mm] * 4)
    stats_t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), TEAL),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, AMBER),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    story.append(Spacer(1, 2 * mm))
    story.append(stats_t)
    story.append(Spacer(1, 5 * mm))
    story.append(p("What Sets Us Apart", st["H2"]))
    story.append(
        p(
            "Many firms advise or supply code in isolation. Azimkim stays through the full continuum: "
            "diagnose the institutional gap, design the solution, develop and integrate the system, "
            "train users, and support go-live — so counties and boards own a working product, not a "
            "shelf document.",
            st["Body"],
        )
    )
    story.append(RLImage(str(ASSET / "banner_systems.jpg"), width=content_w, height=36 * mm))
    story.append(PageBreak())

    # ---- Mission vision values ----
    story.append(p("MISSION, VISION &amp; <font color='#D4A017'>VALUES</font>", st["H1"]))
    story.append(SectionRule(content_w))
    mv = Table(
        [
            [p("<b>OUR MISSION</b>", st["H2"])],
            [
                p(
                    "To design and deliver secure, user-centred digital platforms and consultancy that "
                    "strengthen public accountability, improve service delivery, and enable evidence-based "
                    "planning — with integrity, professionalism, and lasting knowledge transfer.",
                    st["Body"],
                )
            ],
            [p("<b>OUR VISION</b>", st["H2"])],
            [
                p(
                    "To be Kenya’s trusted partner for county and institutional digital transformation — "
                    "recognised for CIMES and results systems, people-centred recruitment and learning "
                    "platforms, and consultancy that connects strategy to working technology.",
                    st["Body"],
                )
            ],
        ],
        colWidths=[content_w],
    )
    mv.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), LIGHT),
                ("BACKGROUND", (0, 2), (-1, 2), LIGHT),
                ("BOX", (0, 0), (-1, -1), 0.8, AMBER),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(mv)
    story.append(Spacer(1, 5 * mm))
    story.append(p("OUR CORE VALUES", st["H2"]))
    values = [
        ("Integrity", "Transparent scopes, honest timelines, and trustworthy handling of public data and systems."),
        ("Accountability", "We own delivery commitments — from design workshops to production go-live."),
        ("Excellence", "Clean architecture, usable interfaces, tested releases, and documentation clients can run."),
        ("Collaboration", "Agile partnership with client ICT, Planning, M&amp;E, HR, and leadership teams."),
        ("Innovation", "Practical use of modern web, mobile, analytics, and AI-assisted tooling where it adds value."),
        ("Stewardship", "Security, role-based access, and solutions that remain sustainable after handover."),
    ]
    val_rows = [
        [
            p(f"<b><font color='#E8C547'>{t}</font></b>", st["WhiteLeft"]),
            p(f"<font color='white'>{d}</font>", st["WhiteLeft"]),
        ]
        for t, d in values
    ]
    vt = Table(val_rows, colWidths=[32 * mm, content_w - 32 * mm])
    vt.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), TEAL),
                ("ROWBACKGROUNDS", (0, 0), (-1, -1), [TEAL, TEAL_DEEP]),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("BOX", (0, 0), (-1, -1), 1.2, AMBER),
            ]
        )
    )
    story.append(vt)
    story.append(PageBreak())

    # ---- Core services ----
    story.append(p("OUR CORE <font color='#D4A017'>SERVICES</font>", st["H1"]))
    story.append(SectionRule(content_w))
    story.append(
        p(
            "We organise delivery into complementary practice lines so a single engagement can "
            "cover advisory, product build, integration, training, and post-go-live support.",
            st["Body"],
        )
    )
    w3 = (content_w - 4 * mm) / 3
    cards = Table(
        [
            [
                service_card(
                    ASSET / "icon_consult.png",
                    "General Consultancy",
                    "Requirements, process redesign, digital strategy, change support, and institutional advisory.",
                    st,
                    w3 - 2 * mm,
                ),
                service_card(
                    ASSET / "icon_software.png",
                    "Software Development",
                    "Custom web platforms, APIs, databases, dashboards, and secure role-based applications.",
                    st,
                    w3 - 2 * mm,
                ),
                service_card(
                    ASSET / "icon_me.png",
                    "M&amp;E Systems",
                    "CIMES enhancement, indicators, scorecards, field tools, and results reporting frameworks.",
                    st,
                    w3 - 2 * mm,
                ),
            ],
            [
                service_card(
                    ASSET / "icon_recruit.png",
                    "Recruitment Systems",
                    "End-to-end hiring portals, applicant tracking, and Public Service Board digital workflows.",
                    st,
                    w3 - 2 * mm,
                ),
                service_card(
                    ASSET / "icon_elearn.png",
                    "E-Learning Systems",
                    "Learning platforms, course delivery, assessments, and staff capacity-building portals.",
                    st,
                    w3 - 2 * mm,
                ),
                service_card(
                    ASSET / "icon_integrate.png",
                    "Integration &amp; Support",
                    "System integration, hosting support, training, UAT, and post-implementation care.",
                    st,
                    w3 - 2 * mm,
                ),
            ],
        ],
        colWidths=[w3] * 3,
    )
    cards.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 2),
                ("RIGHTPADDING", (0, 0), (-1, -1), 2),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    story.append(cards)
    story.append(Spacer(1, 5 * mm))
    story.append(RLImage(str(ASSET / "banner_people.jpg"), width=content_w, height=34 * mm))
    story.append(PageBreak())

    # ---- Practice deep dive 1 ----
    story.append(p("CONSULTANCY &amp; <font color='#D4A017'>SOFTWARE PRACTICE</font>", st["H1"]))
    story.append(SectionRule(content_w))
    story.append(
        p(
            "Our consultancy practice clarifies institutional problems and translates them into "
            "buildable specifications. Our software practice then delivers secure, maintainable "
            "systems with clear handover packages.",
            st["Body"],
        )
    )
    story.append(p("Consultancy service lines", st["H2"]))
    for item in [
        "<b>Digital transformation advisory</b> — readiness assessments, prioritisation, architecture options, and roadmaps.",
        "<b>Business analysis &amp; process redesign</b> — as-is/to-be mapping, SOPs, and workflow simplification for county operations.",
        "<b>Programme &amp; project consultancy</b> — inception, diagnostics, implementation planning, and quality gates.",
        "<b>Change management &amp; training design</b> — role-based curricula, train-the-trainer, and adoption support.",
        "<b>Compliance-oriented design</b> — alignment to KDSP II templates, public procurement documentation, and audit trails.",
    ]:
        story.append(p(f"•  {item}", st["BulletItem"]))

    story.append(p("Software development capabilities", st["H2"]))
    for item in [
        "<b>Web applications</b> — responsive admin portals, public dashboards, and service desks.",
        "<b>APIs &amp; integration</b> — REST interfaces to county/national systems; SMS/email notifications.",
        "<b>Data platforms</b> — relational design, migration, reporting views, and analytics dashboards.",
        "<b>Mobile-ready workflows</b> — field capture patterns, offline-friendly designs, and executive briefing views.",
        "<b>Security &amp; access control</b> — role-based privileges, authentication hardening, and audit logging.",
    ]:
        story.append(p(f"•  {item}", st["BulletItem"]))

    story.append(Spacer(1, 3 * mm))
    story.append(p("How We Engage", st["H2"]))
    steps = [
        ("01", "Inception", "Scope, stakeholders, success metrics, and diagnostic workshops."),
        ("02", "Design", "UX, data model, integrations, and technical design sign-off."),
        ("03", "Build &amp; Test", "Agile sprints, demos, UAT scripts, and security checks."),
        ("04", "Deploy &amp; Enable", "Go-live, training, documentation, and hypercare support."),
    ]
    step_cells = [
        [
            p(f"<font color='#D4A017'><b>{n}</b></font>", st["CardTitle"]),
            p(f"<b>{t}</b>", st["CardTitle"]),
            p(d, st["CardBody"]),
        ]
        for n, t, d in steps
    ]
    step_t = Table(
        [[c[0] for c in step_cells], [c[1] for c in step_cells], [c[2] for c in step_cells]],
        colWidths=[content_w / 4] * 4,
    )
    step_t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), LIGHT),
                ("BOX", (0, 0), (-1, -1), 0.6, AMBER),
                ("INNERGRID", (0, 0), (-1, -1), 0.4, HexColor("#D1E5E5")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(step_t)
    story.append(PageBreak())

    # ---- M&E / Recruitment / E-learning ----
    story.append(p("SPECIALISED <font color='#D4A017'>PLATFORM LINES</font>", st["H1"]))
    story.append(SectionRule(content_w))

    story.append(p("Monitoring &amp; Evaluation Systems (CIMES &amp; Results Platforms)", st["H2"]))
    story.append(
        p(
            "We enhance and customise County Integrated Monitoring and Evaluation Systems so "
            "Planning, M&amp;E, finance, and implementing departments share one source of truth "
            "for projects, indicators, and results — including KDSP-aligned templates and "
            "citizen-facing transparency modules where required.",
            st["Body"],
        )
    )
    for item in [
        "Project registry, lifecycle stages, and departmental workflows",
        "CIDP/ADP-linked indicator and outcome scorecarding",
        "Field monitoring tools and mobile stock-taking patterns",
        "Dashboards for executives, technical officers, and public views",
        "Training, documentation, and post-go-live support for county teams",
    ]:
        story.append(p(f"•  {item}", st["BulletItem"]))

    story.append(p("Recruitment &amp; Human Capital Systems", st["H2"]))
    story.append(
        p(
            "We design and deploy end-to-end recruitment management systems and public job "
            "portals for County Public Service Boards and institutional HR units — covering "
            "vacancy publishing, applications, shortlisting workflows, and audit-ready records.",
            st["Body"],
        )
    )
    for item in [
        "Public career portals and applicant self-service",
        "Role-based board/HR review and shortlisting workspaces",
        "Notifications, document handling, and status tracking",
        "Reports for compliance, equity, and recruitment analytics",
    ]:
        story.append(p(f"•  {item}", st["BulletItem"]))

    story.append(p("E-Learning &amp; Capacity Platforms", st["H2"]))
    story.append(
        p(
            "We build and integrate e-learning systems that turn training programmes into "
            "repeatable digital courses — useful for induction, continuous professional "
            "development, and county-wide capacity campaigns.",
            st["Body"],
        )
    )
    for item in [
        "Course catalogues, enrolments, and progress tracking",
        "Assessments, certificates, and completion reports",
        "Integration with staff directories or HR systems where needed",
        "Facilitator tools and offline-friendly content packaging options",
    ]:
        story.append(p(f"•  {item}", st["BulletItem"]))
    story.append(PageBreak())

    # ---- Track record ----
    story.append(p("EXPERIENCE &amp; <font color='#D4A017'>TRACK RECORD</font>", st["H1"]))
    story.append(SectionRule(content_w))
    story.append(
        p(
            "Azimkim Investments Limited has delivered consultancy and systems work for county "
            "government clients, with documented engagements in monitoring &amp; evaluation "
            "enhancement and related digital public-service platforms.",
            st["Body"],
        )
    )

    engagements = [
        (
            "County Government of Kisumu — CIMES enhancement",
            "Consultancy services for enhancement, customisation, and deployment of the County "
            "Integrated Monitoring and Evaluation System (CIMES), including second-phase support "
            "for Public Service, County Administration and Participatory Development "
            "(illustrative contract value ~KES 2.99M; LPO/LSO referenced in client payment records).",
        ),
        (
            "KDSP II–aligned CIMES capability design",
            "Technical proposals and solution design covering project concept/pre-feasibility/"
            "feasibility templates, hazard and climate screening, ESOHSG checklists, grievance "
            "modules, and mobile-enabled project tools consistent with devolution programme needs.",
        ),
        (
            "Digital recruitment &amp; public job portals",
            "Capability to deliver end-to-end county recruitment management systems and public "
            "job portals for Public Service Boards — vacancy-to-appointment workflows with "
            "audit trails and citizen-facing application channels.",
        ),
        (
            "Institutional ICT &amp; integration assignments",
            "Web portals, database engineering, network/system integration, and user training "
            "for public-sector digital platforms, including API-minded architectures for future "
            "county/national linkages.",
        ),
    ]
    for title, body in engagements:
        block = KeepTogether(
            [
                p(f"<b><font color='#487838'>{title}</font></b>", st["BulletItem"]),
                p(body, st["Body"]),
            ]
        )
        story.append(block)

    story.append(Spacer(1, 3 * mm))
    story.append(p("Illustrative clients &amp; sectors", st["H2"]))
    story.append(
        p(
            "County governments · Public Service Boards · Planning / M&amp;E departments · "
            "Administration &amp; public service units · Development-programme digital components",
            st["Body"],
        )
    )
    story.append(PageBreak())

    # ---- Team ----
    story.append(p("OUR <font color='#D4A017'>TEAM</font>", st["H1"]))
    story.append(SectionRule(content_w))
    story.append(
        p(
            "Engagements are staffed with a multi-disciplinary core. Typical roles on county "
            "systems projects include:",
            st["Body"],
        )
    )
    team = [
        ("Bernard Ondara", "Team Leader / Lead Consultant", "Project leadership, client liaison, M&amp;E &amp; digital programme delivery."),
        ("Allan Kimaina", "Senior Designer &amp; System Engineer", "Solution design, UX, architecture, and build oversight."),
        ("Alfayo Kwatuha", "Senior Software Developer", "Application development, integrations, and release engineering."),
        ("Victor Vincent Mbembe", "Database Developer", "Data modelling, migration, SQL/reporting, and integrity controls."),
        ("Mundah K. Denis", "Network &amp; Systems Integration", "Infrastructure, integration, and deployment readiness."),
        ("Nicholas Ingosi", "Web Systems Developer", "Portal development, front-end delivery, and feature implementation."),
    ]
    rows = [[p("<b>Name</b>", st["CardTitle"]), p("<b>Role</b>", st["CardTitle"]), p("<b>Focus</b>", st["CardTitle"])]]
    for name, role, focus in team:
        rows.append([p(name, st["BulletItem"]), p(role, st["BulletItem"]), p(focus, st["BulletItem"])])
    tt = Table(rows, colWidths=[42 * mm, 55 * mm, content_w - 97 * mm])
    tt.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), TEAL),
                ("TEXTCOLOR", (0, 0), (-1, 0), white),
                ("BACKGROUND", (0, 1), (-1, -1), LIGHT),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [LIGHT, white]),
                ("BOX", (0, 0), (-1, -1), 0.7, AMBER),
                ("INNERGRID", (0, 0), (-1, -1), 0.4, HexColor("#D1E5E5")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story.append(tt)
    story.append(Spacer(1, 4 * mm))
    story.append(
        p(
            "Teams are scaled to assignment size. Academic and professional certificates, CVs, "
            "and statutory company documents (registration, CR12, KRA PIN, tax compliance, "
            "business permit) are available on request for procurement files.",
            st["Body"],
        )
    )
    story.append(PageBreak())

    # ---- Why us / quality ----
    story.append(p("WHY PARTNER WITH <font color='#D4A017'>AZIMKIM</font>", st["H1"]))
    story.append(SectionRule(content_w))
    why = [
        ("Public-sector fluency", "We understand county structures, CIDP/ADP planning cycles, board processes, and audit expectations."),
        ("Build-and-enable model", "Code ships with training, documentation, and hypercare — not a black-box handoff."),
        ("Agile with governance", "Sprint demos plus formal design sign-offs, UAT, and milestone certificates."),
        ("Security-minded delivery", "Role-based access, controlled environments, and confidentiality for citizen and staff data."),
        ("Measurable outcomes", "Success defined as adopted workflows, reliable data, and decision-ready dashboards."),
        ("One accountable partner", "Consultancy, development, integration, and capacity building under one contract roof."),
    ]
    for title, desc in why:
        story.append(p(f"•  <b>{title}</b> — {desc}", st["BulletItem"]))

    story.append(Spacer(1, 4 * mm))
    story.append(p("Quality &amp; assurance approach", st["H2"]))
    for item in [
        "Unit, integration, security, and user-acceptance testing before go-live",
        "Environment separation for development, test, and production where applicable",
        "Train-the-trainer plus role-based user sessions for executives, officers, and administrators",
        "Post-go-live support window to stabilise adoption and resolve early issues",
    ]:
        story.append(p(f"•  {item}", st["BulletItem"]))

    quote = Table(
        [
            [
                p(
                    "<b>Connecting Ideas, Powering Futures.</b><br/><br/>"
                    "We turn institutional priorities into working digital platforms — "
                    "secure, usable, and owned by the client teams who run them.",
                    st["WhiteBody"],
                )
            ]
        ],
        colWidths=[content_w - 4 * mm],
    )
    quote.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), TEAL),
                ("BOX", (0, 0), (-1, -1), 2, AMBER),
                ("TOPPADDING", (0, 0), (-1, -1), 14),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 14),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
            ]
        )
    )
    story.append(Spacer(1, 6 * mm))
    story.append(quote)
    story.append(PageBreak())

    # ---- Contact close ----
    story.append(p("CONTACT &amp; <font color='#D4A017'>NEXT STEPS</font>", st["H1"]))
    story.append(SectionRule(content_w))
    story.append(
        p(
            "We welcome invitations to tender, requests for quotation, and direct consultancy "
            "engagements for county and institutional digital programmes.",
            st["Body"],
        )
    )
    close = Table(
        [
            [p("<b>AZIMKIM INVESTMENTS LIMITED</b>", st["CardTitle"])],
            [p("Email: <font color='#487838'><u>azimkiminvestments@gmail.com</u></font>", st["BodyCenter"])],
            [p("Postal: P.O. Box 8866 — 40100 Kisumu, Kenya", st["BodyCenter"])],
            [p("KRA PIN: P052278870S", st["BodyCenter"])],
            [p("Bank: Equity Bank, Eldoret Branch", st["BodyCenter"])],
            [Spacer(1, 2 * mm)],
            [RLImage(str(ASSET / "logo.png"), width=32 * mm, height=32 * mm)],
            [p("Company Profile 2026", st["Small"])],
            [
                p(
                    "Statutory documents · technical proposals · CVs · and client references "
                    "available to authorised procurement officers on request.",
                    st["Small"],
                )
            ],
        ],
        colWidths=[content_w],
    )
    close.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), LIGHT),
                ("BOX", (0, 0), (-1, -1), 1.2, TEAL),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    story.append(close)
    story.append(Spacer(1, 8 * mm))
    story.append(RLImage(str(ASSET / "banner_digital.jpg"), width=content_w, height=32 * mm))
    story.append(p("Azimkim Investments Limited — Consultancy · Systems · Capacity", st["Small"]))

    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)

    merged = BytesIO()
    writer = PdfWriter()
    for page in PdfReader(cover_buf).pages:
        writer.add_page(page)
    for page in PdfReader(body_buf).pages:
        writer.add_page(page)
    writer.write(merged)
    merged.seek(0)

    # Temporary unstamped merge, then official stamp overlays
    tmp_unstamped = OUT_PDF.with_suffix(".unstamped.pdf")
    with tmp_unstamped.open("wb") as f:
        f.write(merged.getvalue())

    # Pages (0-based): 0 cover, 1 identity, 7 track record, 10 contact/closing
    # Cover: white band between title and hero (above green footer)
    stamp_specs = [
        {"page": 0, "x_mm": 130, "y_mm": 145, "width_mm": 48, "angle": 7, "opacity": 0.9},
        {"page": 1, "x_mm": 128, "y_mm": 22, "width_mm": 48, "angle": 6, "opacity": 0.9},
        {"page": 7, "x_mm": 125, "y_mm": 20, "width_mm": 48, "angle": 8, "opacity": 0.9},
        {"page": 10, "x_mm": 118, "y_mm": 20, "width_mm": 52, "angle": 7, "opacity": 0.92},
    ]
    stamp_pdf_pages(tmp_unstamped, OUT_PDF, stamp_specs)
    stamp_pdf_pages(tmp_unstamped, OUT_INIT, stamp_specs)
    tmp_unstamped.unlink(missing_ok=True)

    for dest in (OUT_PDF, OUT_INIT):
        print(f"Wrote {dest} ({dest.stat().st_size // 1024} KB)")
    print(f"Stamp asset: {ASSET / 'stamp-clean.png'}")


if __name__ == "__main__":
    build()
