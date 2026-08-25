#!/usr/bin/env python3
"""Generate SULWE CREST ENTERPRISES company profile PDF (A4)."""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont
from reportlab.lib.colors import Color, HexColor, white, black
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm, cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    Image as RLImage,
    KeepTogether,
    ListFlowable,
    ListItem,
    HRFlowable,
    Flowable,
    PageBreak,
)
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parents[1]
ASSET = ROOT / "docs" / "sulwe-crest" / "assets"
OUT_PDF = ROOT / "docs" / "sulwe-crest" / "SULWE_CREST_ENTERPRISES_PROFILE_2026.pdf"
OUT_INIT = ROOT / "init.sql" / "SULWE_CREST_ENTERPRISES_PROFILE_2026.pdf"

# Brand colours — navy + gold crest (Sunrise / Sulwe = star)
NAVY = HexColor("#0B2545")
NAVY_DEEP = HexColor("#071A30")
GOLD = HexColor("#C9A227")
GOLD_LIGHT = HexColor("#E8C547")
TEAL = HexColor("#1A6B6B")
SLATE = HexColor("#334155")
LIGHT = HexColor("#F4F7FB")
MUTED = HexColor("#64748B")
ACCENT_RED = HexColor("#8B1E3F")

PAGE_W, PAGE_H = A4

# Fonts
pdfmetrics.registerFont(TTFont("Ub", "/usr/share/fonts/truetype/ubuntu/Ubuntu-R.ttf"))
pdfmetrics.registerFont(TTFont("UbB", "/usr/share/fonts/truetype/ubuntu/Ubuntu-B.ttf"))
pdfmetrics.registerFont(TTFont("UbM", "/usr/share/fonts/truetype/ubuntu/Ubuntu-M.ttf"))
pdfmetrics.registerFont(TTFont("UbI", "/usr/share/fonts/truetype/ubuntu/Ubuntu-RI.ttf"))
pdfmetrics.registerFont(TTFont("UbBI", "/usr/share/fonts/truetype/ubuntu/Ubuntu-BI.ttf"))


def make_logo(path: Path, size: int = 512) -> Path:
    """Crest + star mark — Sulwe means 'star' in Dholuo."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx, cy = size // 2, size // 2

    # Outer gold ring
    pad = 18
    d.ellipse([pad, pad, size - pad, size - pad], fill=(201, 162, 39, 255))
    d.ellipse([pad + 14, pad + 14, size - pad - 14, size - pad - 14], fill=(11, 37, 69, 255))

    # Inner crest shield
    shield = [
        (cx, pad + 70),
        (size - pad - 55, pad + 120),
        (size - pad - 70, cy + 40),
        (cx, size - pad - 55),
        (pad + 70, cy + 40),
        (pad + 55, pad + 120),
    ]
    d.polygon(shield, fill=(232, 197, 71, 255))
    # Inner navy shield
    scale = 0.82
    inner = []
    for x, y in shield:
        inner.append((cx + (x - cx) * scale, cy + (y - cy) * scale * 0.95 + 8))
    d.polygon(inner, fill=(7, 26, 48, 255))

    # 5-point star
    def star(r_outer, r_inner, points=5):
        pts = []
        for i in range(points * 2):
            ang = -math.pi / 2 + i * math.pi / points
            r = r_outer if i % 2 == 0 else r_inner
            pts.append((cx + r * math.cos(ang), cy - 8 + r * math.sin(ang)))
        return pts

    d.polygon(star(size * 0.18, size * 0.08), fill=(201, 162, 39, 255))
    # Small accent dots
    for ang in (0.4, 2.0, 3.6, 5.0):
        x = cx + math.cos(ang) * size * 0.28
        y = cy + math.sin(ang) * size * 0.22
        d.ellipse([x - 5, y - 5, x + 5, y + 5], fill=(26, 107, 107, 200))

    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path)
    return path


def make_banner(path: Path, photo: Path, w: int = 1600, h: int = 520, overlay=0.45) -> Path:
    base = Image.open(photo).convert("RGB")
    # cover crop
    bw, bh = base.size
    scale = max(w / bw, h / bh)
    nw, nh = int(bw * scale), int(bh * scale)
    base = base.resize((nw, nh), Image.Resampling.LANCZOS)
    left = (nw - w) // 2
    top = (nh - h) // 2
    base = base.crop((left, top, left + w, top + h))
    overlay_img = Image.new("RGB", (w, h), (11, 37, 69))
    blended = Image.blend(base, overlay_img, overlay)
    # gold bottom accent
    d = ImageDraw.Draw(blended)
    d.rectangle([0, h - 12, w, h], fill=(201, 162, 39))
    blended.save(path, quality=90)
    return path


def make_hero_graphic(path: Path, w: int = 1400, h: int = 780) -> Path:
    """Consultancy + supplies collage over a photo backdrop."""
    try:
        base = Image.open(ASSET / "warehouse.jpg").convert("RGB")
        bw, bh = base.size
        scale = max(w / bw, h / bh)
        nw, nh = int(bw * scale), int(bh * scale)
        base = base.resize((nw, nh), Image.Resampling.LANCZOS)
        left, top = (nw - w) // 2, (nh - h) // 2
        img = base.crop((left, top, left + w, top + h))
        overlay = Image.new("RGB", (w, h), (11, 37, 69))
        img = Image.blend(img, overlay, 0.55)
    except Exception:
        img = Image.new("RGB", (w, h), (11, 37, 69))

    d = ImageDraw.Draw(img)

    # Soft gold arcs
    for rad in (220, 320, 420):
        bbox = [w // 2 - rad, h // 2 - rad + 40, w // 2 + rad, h // 2 + rad + 40]
        d.arc(bbox, 200, 340, fill=(201, 162, 39), width=3)

    cards = [
        (60, 90, 400, 250, "CONSULTANCY"),
        (470, 55, 890, 255, "SUPPLY CHAIN"),
        (980, 110, 1340, 320, "DELIVERY"),
        (80, 400, 520, 640, "RESEARCH"),
        (880, 400, 1340, 660, "INSTITUTIONAL"),
    ]
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/ubuntu/Ubuntu-B.ttf", 28)
        font_s = ImageFont.truetype("/usr/share/fonts/truetype/ubuntu/Ubuntu-R.ttf", 16)
    except Exception:
        font = ImageFont.load_default()
        font_s = font

    for x1, y1, x2, y2, label in cards:
        d.rounded_rectangle([x1, y1, x2, y2], radius=18, fill=(255, 255, 255))
        d.rounded_rectangle([x1, y1, x2, y1 + 8], radius=4, fill=(201, 162, 39))
        d.text((x1 + 24, y1 + 40), label, fill=(11, 37, 69), font=font)
        d.text((x1 + 24, y1 + 90), "Professional · Reliable · On time", fill=(100, 116, 139), font=font_s)

    # Logo centred in the clear gap between bottom cards (no text overlap)
    logo_size = 200
    logo = Image.open(ASSET / "logo.png").convert("RGBA").resize(
        (logo_size, logo_size), Image.Resampling.LANCZOS
    )
    img.paste(logo, (w // 2 - logo_size // 2, h // 2 - logo_size // 2 - 20), logo)
    img.save(path, quality=92)
    return path


def make_icon_tile(path: Path, kind: str, size: int = 256) -> Path:
    img = Image.new("RGB", (size, size), (244, 247, 251))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([8, 8, size - 8, size - 8], radius=28, fill=(11, 37, 69))
    d.rounded_rectangle([20, 20, size - 20, size - 20], radius=22, fill=(7, 26, 48))
    cx = cy = size // 2
    gold = (201, 162, 39)

    if kind == "consult":
        # document + pen
        d.rounded_rectangle([cx - 50, cy - 70, cx + 40, cy + 70], radius=8, outline=gold, width=4)
        for i in range(4):
            y = cy - 40 + i * 22
            d.line([(cx - 30, y), (cx + 20, y)], fill=gold, width=3)
        d.polygon([(cx + 50, cy + 20), (cx + 80, cy - 40), (cx + 70, cy - 50), (cx + 40, cy + 10)], fill=gold)
    elif kind == "supply":
        # boxes
        d.rectangle([cx - 70, cy - 10, cx - 10, cy + 55], outline=gold, width=4)
        d.rectangle([cx - 20, cy - 45, cx + 50, cy + 25], outline=gold, width=4)
        d.rectangle([cx + 10, cy + 5, cx + 70, cy + 65], outline=gold, width=4)
        d.line([(cx - 70, cy + 15), (cx - 10, cy + 15)], fill=gold, width=3)
    elif kind == "ict":
        d.rounded_rectangle([cx - 70, cy - 50, cx + 70, cy + 35], radius=10, outline=gold, width=4)
        d.rectangle([cx - 20, cy + 35, cx + 20, cy + 50], fill=gold)
        d.rectangle([cx - 45, cy + 50, cx + 45, cy + 58], fill=gold)
    elif kind == "train":
        # people circles
        for dx in (-45, 0, 45):
            d.ellipse([cx + dx - 22, cy - 55, cx + dx + 22, cy - 10], outline=gold, width=3)
            d.arc([cx + dx - 35, cy - 5, cx + dx + 35, cy + 55], 200, 340, fill=gold, width=3)
    elif kind == "quality":
        d.ellipse([cx - 55, cy - 55, cx + 55, cy + 55], outline=gold, width=5)
        d.line([(cx - 25, cy), (cx - 5, cy + 25), (cx + 30, cy - 25)], fill=gold, width=6)
    else:  # network
        for dx, dy in [(-50, -30), (50, -30), (0, 50), (-40, 40), (40, 40)]:
            d.ellipse([cx + dx - 12, cy + dy - 12, cx + dx + 12, cy + dy + 12], fill=gold)
        d.line([(cx - 50, cy - 30), (cx + 50, cy - 30)], fill=gold, width=2)
        d.line([(cx - 50, cy - 30), (cx, cy + 50)], fill=gold, width=2)
        d.line([(cx + 50, cy - 30), (cx, cy + 50)], fill=gold, width=2)

    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path)
    return path


class ColoredBox(Flowable):
    def __init__(self, text, width, fill=NAVY, text_color=white, font="UbB", size=11, pad=10, height=None):
        super().__init__()
        self.text = text
        self.box_width = width
        self.fill = fill
        self.text_color = text_color
        self.font = font
        self.size = size
        self.pad = pad
        self._height = height

    def wrap(self, availWidth, availHeight):
        self.width = self.box_width
        self.height = self._height or (self.size + self.pad * 2)
        return self.width, self.height

    def draw(self):
        self.canv.setFillColor(self.fill)
        self.canv.roundRect(0, 0, self.width, self.height, 6, fill=1, stroke=0)
        self.canv.setFillColor(self.text_color)
        self.canv.setFont(self.font, self.size)
        self.canv.drawCentredString(self.width / 2, self.pad - 1, self.text)


class SectionRule(Flowable):
    def __init__(self, width, color=GOLD):
        super().__init__()
        self._w = width
        self.color = color

    def wrap(self, aw, ah):
        return self._w, 8

    def draw(self):
        self.canv.setStrokeColor(self.color)
        self.canv.setLineWidth(2.5)
        self.canv.line(0, 4, 60, 4)
        self.canv.setStrokeColor(NAVY)
        self.canv.setLineWidth(1)
        self.canv.line(68, 4, self._w, 4)


def styles():
    s = getSampleStyleSheet()
    s.add(
        ParagraphStyle(
            name="CoverTitle",
            fontName="UbB",
            fontSize=28,
            leading=34,
            textColor=NAVY,
            alignment=TA_CENTER,
            spaceAfter=4,
        )
    )
    s.add(
        ParagraphStyle(
            name="CoverSub",
            fontName="UbB",
            fontSize=16,
            leading=20,
            textColor=ACCENT_RED,
            alignment=TA_CENTER,
            spaceAfter=8,
        )
    )
    s.add(
        ParagraphStyle(
            name="Tagline",
            fontName="UbI",
            fontSize=12,
            leading=16,
            textColor=MUTED,
            alignment=TA_CENTER,
            spaceAfter=12,
        )
    )
    s.add(
        ParagraphStyle(
            name="H1",
            fontName="UbB",
            fontSize=18,
            leading=22,
            textColor=NAVY,
            spaceBefore=4,
            spaceAfter=8,
        )
    )
    s.add(
        ParagraphStyle(
            name="H1Alt",
            fontName="UbB",
            fontSize=18,
            leading=22,
            textColor=ACCENT_RED,
            spaceBefore=4,
            spaceAfter=8,
        )
    )
    s.add(
        ParagraphStyle(
            name="H2",
            fontName="UbB",
            fontSize=13,
            leading=17,
            textColor=NAVY,
            spaceBefore=8,
            spaceAfter=4,
        )
    )
    s.add(
        ParagraphStyle(
            name="Body",
            fontName="Ub",
            fontSize=10,
            leading=14,
            textColor=SLATE,
            alignment=TA_JUSTIFY,
            spaceAfter=8,
        )
    )
    s.add(
        ParagraphStyle(
            name="BodyCenter",
            fontName="Ub",
            fontSize=10,
            leading=14,
            textColor=SLATE,
            alignment=TA_CENTER,
            spaceAfter=6,
        )
    )
    s.add(
        ParagraphStyle(
            name="BulletItem",
            fontName="Ub",
            fontSize=10,
            leading=14,
            textColor=SLATE,
            leftIndent=12,
            spaceAfter=3,
        )
    )
    s.add(
        ParagraphStyle(
            name="Small",
            fontName="Ub",
            fontSize=8.5,
            leading=11,
            textColor=MUTED,
            alignment=TA_CENTER,
        )
    )
    s.add(
        ParagraphStyle(
            name="Footer",
            fontName="Ub",
            fontSize=8,
            leading=10,
            textColor=white,
            alignment=TA_CENTER,
        )
    )
    s.add(
        ParagraphStyle(
            name="CardTitle",
            fontName="UbB",
            fontSize=11,
            leading=14,
            textColor=NAVY,
            alignment=TA_CENTER,
            spaceAfter=4,
        )
    )
    s.add(
        ParagraphStyle(
            name="CardBody",
            fontName="Ub",
            fontSize=8.5,
            leading=11.5,
            textColor=SLATE,
            alignment=TA_CENTER,
        )
    )
    s.add(
        ParagraphStyle(
            name="StatNum",
            fontName="UbB",
            fontSize=22,
            leading=26,
            textColor=GOLD,
            alignment=TA_CENTER,
        )
    )
    s.add(
        ParagraphStyle(
            name="StatLabel",
            fontName="Ub",
            fontSize=8,
            leading=10,
            textColor=white,
            alignment=TA_CENTER,
        )
    )
    s.add(
        ParagraphStyle(
            name="WhiteBody",
            fontName="Ub",
            fontSize=10,
            leading=14,
            textColor=white,
            alignment=TA_CENTER,
        )
    )
    return s


def header_footer(canv: canvas.Canvas, doc):
    canv.saveState()
    # Body pages are merged after a cover → display as page + 1
    page = doc.page + 1

    # top bar
    canv.setFillColor(NAVY)
    canv.rect(0, PAGE_H - 14 * mm, PAGE_W, 14 * mm, fill=1, stroke=0)
    canv.setFillColor(GOLD)
    canv.rect(0, PAGE_H - 15.2 * mm, PAGE_W, 1.2 * mm, fill=1, stroke=0)
    canv.setFillColor(white)
    canv.setFont("UbB", 8)
    canv.drawString(18 * mm, PAGE_H - 9 * mm, "SULWE CREST ENTERPRISES")
    canv.setFont("Ub", 8)
    canv.drawRightString(PAGE_W - 18 * mm, PAGE_H - 9 * mm, "Company Profile 2026")

    # footer
    canv.setFillColor(NAVY)
    canv.rect(0, 0, PAGE_W, 12 * mm, fill=1, stroke=0)
    canv.setFillColor(GOLD)
    canv.rect(0, 12 * mm, PAGE_W, 1 * mm, fill=1, stroke=0)
    canv.setFillColor(white)
    canv.setFont("Ub", 7)
    canv.drawString(18 * mm, 5 * mm, "0797 695 806  ·  sulwecrestenterprises@gmail.com")
    canv.drawCentredString(PAGE_W / 2, 5 * mm, "Sunrise Heights · Imara Daima · Nairobi")
    canv.drawRightString(PAGE_W - 18 * mm, 5 * mm, f"Page {page}")
    canv.restoreState()


def cover_page(canv: canvas.Canvas, doc):
    """Drawn as first page via onFirstPage."""
    canv.saveState()
    # top navy band
    canv.setFillColor(NAVY)
    canv.rect(0, PAGE_H - 28 * mm, PAGE_W, 28 * mm, fill=1, stroke=0)
    canv.setFillColor(GOLD)
    canv.rect(PAGE_W - 32 * mm, PAGE_H - 42 * mm, 32 * mm, 42 * mm, fill=1, stroke=0)
    canv.setFillColor(TEAL)
    canv.rect(0, PAGE_H - 90 * mm, 14 * mm, 50 * mm, fill=1, stroke=0)

    # logo
    logo = str(ASSET / "logo.png")
    canv.drawImage(logo, PAGE_W / 2 - 28 * mm, PAGE_H - 78 * mm, 56 * mm, 56 * mm, mask="auto")

    canv.setFillColor(NAVY)
    canv.setFont("UbB", 26)
    canv.drawCentredString(PAGE_W / 2, PAGE_H - 92 * mm, "SULWE CREST")
    canv.setFillColor(ACCENT_RED)
    canv.setFont("UbB", 18)
    canv.drawCentredString(PAGE_W / 2, PAGE_H - 102 * mm, "ENTERPRISES")
    canv.setFillColor(MUTED)
    canv.setFont("UbI", 11)
    canv.drawCentredString(PAGE_W / 2, PAGE_H - 112 * mm, "Excellence in Consultancy & General Supplies")

    # hero
    hero = str(ASSET / "hero.png")
    canv.drawImage(hero, 18 * mm, 55 * mm, PAGE_W - 36 * mm, 95 * mm, preserveAspectRatio=True, anchor="c")

    # gold rule
    canv.setStrokeColor(ACCENT_RED)
    canv.setLineWidth(1.5)
    canv.line(40 * mm, 48 * mm, PAGE_W - 40 * mm, 48 * mm)

    # bottom band
    canv.setFillColor(NAVY)
    canv.rect(0, 0, PAGE_W, 38 * mm, fill=1, stroke=0)
    canv.setFillColor(GOLD)
    canv.setFont("UbB", 20)
    canv.drawCentredString(PAGE_W / 2, 16 * mm, "COMPANY PROFILE")
    canv.setFillColor(white)
    canv.setFont("Ub", 8)
    canv.drawCentredString(
        PAGE_W / 2,
        8 * mm,
        "0797 695 806  ·  sulwecrestenterprises@gmail.com  ·  Nairobi · Rongo",
    )
    canv.restoreState()


def build_assets():
    ASSET.mkdir(parents=True, exist_ok=True)
    make_logo(ASSET / "logo.png")
    make_hero_graphic(ASSET / "hero.png")
    for kind in ("consult", "supply", "ict", "train", "quality", "network"):
        make_icon_tile(ASSET / f"icon_{kind}.png", kind)
    make_banner(ASSET / "banner_office.jpg", ASSET / "office.jpg")
    make_banner(ASSET / "banner_warehouse.jpg", ASSET / "warehouse.jpg", overlay=0.35)
    make_banner(ASSET / "banner_meeting.jpg", ASSET / "meeting.jpg", overlay=0.4)
    make_banner(ASSET / "banner_supplies.jpg", ASSET / "supplies.jpg", overlay=0.3)
    make_banner(ASSET / "banner_handshake.jpg", ASSET / "handshake.jpg", h=400, overlay=0.35)


def p(text, style):
    return Paragraph(text, style)


def bullet_list(items, sty):
    flows = []
    for it in items:
        flows.append(Paragraph(f"•  {it}", sty))
    return flows


def service_card(icon_path, title, body, st, width):
    icon = RLImage(str(icon_path), width=28 * mm, height=28 * mm)
    data = [[icon], [p(title, st["CardTitle"])], [p(body, st["CardBody"])]]
    t = Table(data, colWidths=[width])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), LIGHT),
                ("BOX", (0, 0), (-1, -1), 0.5, GOLD),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    return t


def build_cover_pdf(path: Path):
    c = canvas.Canvas(str(path), pagesize=A4)
    cover_page(c, None)
    c.showPage()
    c.save()


def build():
    from io import BytesIO

    from pypdf import PdfReader, PdfWriter

    build_assets()
    st = styles()
    OUT_PDF.parent.mkdir(parents=True, exist_ok=True)

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
        title="Sulwe Crest Enterprises — Company Profile 2026",
        author="Sulwe Crest Enterprises",
    )

    story = []

    # -------- Contact / identity --------
    logo_row = Table(
        [[RLImage(str(ASSET / "logo.png"), width=32 * mm, height=32 * mm)]],
        colWidths=[PAGE_W - 36 * mm],
    )
    logo_row.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER")]))
    story.append(logo_row)
    story.append(Spacer(1, 4 * mm))
    story.append(p("SULWE CREST ENTERPRISES", st["CoverTitle"]))
    story.append(p("Excellence in Consultancy & General Supplies", st["Tagline"]))
    story.append(SectionRule(PAGE_W - 36 * mm))
    story.append(Spacer(1, 6 * mm))

    contact_html = """
    <b>Sulwe Crest Enterprises</b><br/><br/>
    <b>Physical Office</b><br/>
    1st Floor, Sunrise Heights<br/>
    AA Road, Imara Daima<br/>
    Embakasi District, Nairobi — Kenya<br/><br/>
    <b>Postal Address</b><br/>
    P.O. Box 406 — 40404 Rongo<br/><br/>
    <b>Phone</b><br/>
    0797 695 806<br/><br/>
    <b>Email</b><br/>
    <font color="#1A6B6B"><u>sulwecrestenterprises@gmail.com</u></font><br/><br/>
    <b>Business Focus</b><br/>
    Consultancy Services · Institutional &amp; General Supplies<br/>
    Capacity Building · Research &amp; Evaluations · ICT &amp; Office Solutions
    """
    story.append(p(contact_html, st["BodyCenter"]))
    story.append(Spacer(1, 8 * mm))

    focus_box = Table(
        [[p("<b>FOR: CONSULTANCY  ·  GENERAL SUPPLIES  ·  INSTITUTIONAL SUPPORT</b>", st["BodyCenter"])]],
        colWidths=[PAGE_W - 40 * mm],
    )
    focus_box.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 1.5, NAVY),
                ("BACKGROUND", (0, 0), (-1, -1), LIGHT),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    story.append(focus_box)
    story.append(Spacer(1, 8 * mm))
    story.append(RLImage(str(ASSET / "banner_office.jpg"), width=PAGE_W - 36 * mm, height=42 * mm))
    story.append(p("Sunrise Heights, Imara Daima — our Nairobi operations base", st["Small"]))
    story.append(PageBreak())

    # -------- PAGE 3: Overview --------
    story.append(p("COMPANY <font color='#8B1E3F'>OVERVIEW</font>", st["H1"]))
    story.append(SectionRule(PAGE_W - 36 * mm))
    story.append(
        p(
            "Sulwe Crest Enterprises is a Kenyan consultancy and general supplies firm headquartered "
            "at Sunrise Heights, AA Road, Imara Daima (Embakasi District, Nairobi), with postal "
            "operations through P.O. Box 406 — 40404 Rongo. We support public institutions, "
            "development partners, learning institutions, NGOs, and private organisations with "
            "dependable advisory services and end-to-end supply solutions.",
            st["Body"],
        )
    )
    story.append(
        p(
            "Our name draws from <i>Sulwe</i> — the star — and a crest that symbolises standards, "
            "stewardship, and rising performance. We combine field-ready consultancy (training, "
            "evaluations, research, data systems) with institutional procurement of office, ICT, "
            "stationery, and related general supplies — so clients get strategy and delivery from one partner.",
            st["Body"],
        )
    )
    story.append(
        p(
            "Over successive engagements across Nairobi, Nyanza, Western, and wider East African "
            "corridors, our principals and associates have built a reputation for integrity, "
            "timely fulfilment, clear documentation, and practical recommendations that "
            "decision-makers can act on.",
            st["Body"],
        )
    )

    # Stats strip
    stats = [
        ["10+", "Years combined\nprofessional\nexperience"],
        ["2", "Core practice\nareas: advisory\n&amp; supplies"],
        ["50+", "Institutional\nengagements\nsupported"],
        ["EAC", "Regional\noutlook &\amp;\npartnerships"],
    ]
    # Use paragraphs for wrapping
    stat_cells = []
    for num, label in stats:
        cell = [
            p(num, st["StatNum"]),
            p(label.replace("\n", "<br/>"), st["StatLabel"]),
        ]
        stat_cells.append(cell)
    # Better as 4 columns one row of nested content
    row = []
    for num, label in [
        ("10+", "Years combined professional experience"),
        ("2", "Core practice areas: advisory &amp; supplies"),
        ("50+", "Institutional engagements supported"),
        ("EAC", "Regional outlook &amp; partnerships"),
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
                ("BACKGROUND", (0, 0), (-1, -1), NAVY),
                ("BOX", (0, 0), (-1, -1), 0, NAVY),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, GOLD),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(Spacer(1, 3 * mm))
    story.append(stats_t)
    story.append(Spacer(1, 6 * mm))

    story.append(p("What We Stand For", st["H2"]))
    story.append(
        p(
            "Sulwe Crest does not only deliver specialised consultancy or isolated product lines. "
            "We give clients a complete continuum: diagnose needs, design interventions, "
            "procure and deliver materials, and transfer skills so results last beyond the contract.",
            st["Body"],
        )
    )
    story.append(RLImage(str(ASSET / "banner_meeting.jpg"), width=PAGE_W - 36 * mm, height=40 * mm))
    story.append(PageBreak())

    # -------- PAGE 4: Mission Vision Values --------
    story.append(p("MISSION, VISION &amp; <font color='#8B1E3F'>VALUES</font>", st["H1"]))
    story.append(SectionRule(PAGE_W - 36 * mm))

    mv = Table(
        [
            [
                p("<b>OUR MISSION</b>", st["H2"]),
            ],
            [
                p(
                    "To provide value for money through integrity, professionalism, timely delivery, "
                    "and cost-effective consultancy and supply solutions — while building lasting "
                    "relationships with clients across Kenya and the East African Community.",
                    st["Body"],
                )
            ],
            [p("<b>OUR VISION</b>", st["H2"])],
            [
                p(
                    "To be the trusted partner of choice for institutional consultancy and general "
                    "supplies in Kenya and the wider region — recognised for quality, innovation, "
                    "safe and on-time delivery, and practical advisory that improves organisational performance.",
                    st["Body"],
                )
            ],
        ],
        colWidths=[PAGE_W - 36 * mm],
    )
    mv.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), LIGHT),
                ("BACKGROUND", (0, 2), (-1, 2), LIGHT),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("BOX", (0, 0), (-1, -1), 0.8, GOLD),
            ]
        )
    )
    story.append(mv)
    story.append(Spacer(1, 6 * mm))
    story.append(p("OUR CORE VALUES", st["H2"]))

    values = [
        ("Honesty", "We operate in trust with clients, partners, and each other — transparent pricing, honest scopes, and truthful reporting."),
        ("Accountability", "We own every commitment: delivery schedules, quality of goods, and the rigour of our advisory outputs."),
        ("Respect", "We treat every stakeholder with dignity — from warehouse teams to boardrooms — and honour local context."),
        ("Teamwork", "We partner with client teams and our associates so solutions are co-owned and sustainable."),
        ("Excellence", "We pursue continuous improvement in methods, sourcing, documentation, and client service."),
        ("Stewardship", "We manage resources and information carefully, protecting client confidentiality and public value."),
    ]
    val_rows = []
    for title, desc in values:
        val_rows.append(
            [
                p(f"<b><font color='#C9A227'>{title}</font></b>", st["BulletItem"]),
                p(desc, st["BulletItem"]),
            ]
        )
    vt = Table(val_rows, colWidths=[32 * mm, PAGE_W - 68 * mm])
    vt.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), NAVY),
                ("TEXTCOLOR", (0, 0), (-1, -1), white),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("BOX", (0, 0), (-1, -1), 1, GOLD),
                ("ROWBACKGROUNDS", (0, 0), (-1, -1), [NAVY, NAVY_DEEP]),
            ]
        )
    )
    # Fix: Paragraphs inside still use SLATE — override with white body style
    val_rows = []
    for title, desc in values:
        val_rows.append(
            [
                p(f"<b><font color='#E8C547'>{title}</font></b>", st["WhiteBody"]),
                p(f"<font color='white'>{desc}</font>", st["WhiteBody"]),
            ]
        )
    vt = Table(val_rows, colWidths=[35 * mm, PAGE_W - 71 * mm])
    vt.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), NAVY),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ALIGN", (0, 0), (0, -1), "LEFT"),
                ("ALIGN", (1, 0), (1, -1), "LEFT"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                ("BOX", (0, 0), (-1, -1), 1.2, GOLD),
                ("ROWBACKGROUNDS", (0, 0), (-1, -1), [NAVY, NAVY_DEEP]),
            ]
        )
    )
    story.append(vt)
    story.append(PageBreak())

    # -------- PAGE 5: Divider / mission highlight --------
    story.append(Spacer(1, 8 * mm))
    story.append(RLImage(str(ASSET / "banner_warehouse.jpg"), width=PAGE_W - 36 * mm, height=55 * mm))
    story.append(Spacer(1, 10 * mm))
    quote = Table(
        [
            [
                p(
                    "<b>Our Mission</b> is to provide value for money to our clients through "
                    "integrity, professionalism, timely delivery of service, and practical "
                    "consultancy that unlocks lasting institutional performance.",
                    st["WhiteBody"],
                )
            ]
        ],
        colWidths=[PAGE_W - 40 * mm],
    )
    quote.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), NAVY),
                ("BOX", (0, 0), (-1, -1), 2, GOLD),
                ("TOPPADDING", (0, 0), (-1, -1), 16),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 16),
                ("LEFTPADDING", (0, 0), (-1, -1), 14),
                ("RIGHTPADDING", (0, 0), (-1, -1), 14),
            ]
        )
    )
    story.append(quote)
    story.append(Spacer(1, 12 * mm))
    story.append(RLImage(str(ASSET / "logo.png"), width=40 * mm, height=40 * mm))
    story.append(p("SULWE CREST ENTERPRISES", st["CoverTitle"]))
    story.append(p("Guided by the star. Anchored by the crest.", st["Tagline"]))
    story.append(PageBreak())

    # -------- PAGE 6: Core services overview --------
    story.append(p("OUR CORE <font color='#8B1E3F'>SERVICES</font>", st["H1"]))
    story.append(SectionRule(PAGE_W - 36 * mm))
    story.append(
        p(
            "We organise our work into two complementary pillars — <b>Consultancy &amp; Advisory</b> "
            "and <b>General &amp; Institutional Supplies</b> — so programmes, offices, and "
            "projects can source expertise and materials without fragmenting vendors.",
            st["Body"],
        )
    )

    w3 = (PAGE_W - 40 * mm) / 3
    cards = Table(
        [
            [
                service_card(
                    ASSET / "icon_consult.png",
                    "Consultancy",
                    "Strategy, evaluations, research, M&amp;E support, organisational development.",
                    st,
                    w3 - 2 * mm,
                ),
                service_card(
                    ASSET / "icon_train.png",
                    "Capacity Building",
                    "Training design, facilitation, coaching, and knowledge-transfer workshops.",
                    st,
                    w3 - 2 * mm,
                ),
                service_card(
                    ASSET / "icon_supply.png",
                    "General Supplies",
                    "Office, stationery, furniture fittings, and institutional consumables.",
                    st,
                    w3 - 2 * mm,
                ),
            ],
            [
                service_card(
                    ASSET / "icon_ict.png",
                    "ICT Supplies",
                    "Toners, inks, peripherals, accessories, and related ICT consumables.",
                    st,
                    w3 - 2 * mm,
                ),
                service_card(
                    ASSET / "icon_quality.png",
                    "Quality Assurance",
                    "Inspection, documentation, and compliance with agreed specifications.",
                    st,
                    w3 - 2 * mm,
                ),
                service_card(
                    ASSET / "icon_network.png",
                    "Project Support",
                    "Logistics coordination, branding &amp; print, and field mobilisation support.",
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
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(cards)
    story.append(Spacer(1, 6 * mm))
    story.append(RLImage(str(ASSET / "banner_supplies.jpg"), width=PAGE_W - 36 * mm, height=38 * mm))
    story.append(PageBreak())

    # -------- PAGE 7: Consultancy detail --------
    story.append(p("CONSULTANCY <font color='#8B1E3F'>PRACTICE</font>", st["H1"]))
    story.append(SectionRule(PAGE_W - 36 * mm))
    story.append(
        p(
            "Our consultancy practice helps organisations clarify priorities, measure results, "
            "strengthen systems, and build people capability. Engagements are scoped to client "
            "budgets and timelines, with clear deliverables and knowledge transfer built in.",
            st["Body"],
        )
    )
    story.append(p("Advisory Service Lines", st["H2"]))
    for item in [
        "<b>Training &amp; capacity building</b> — needs assessment, curriculum design, facilitation, "
        "pre/post assessment, and training reports for public officers, project staff, and boards.",
        "<b>Monitoring, evaluation &amp; learning (MEL)</b> — indicator frameworks, baseline/midline/endline "
        "studies, outcome harvesting, and performance review workshops.",
        "<b>Research &amp; data</b> — surveys, key informant interviews, focus groups, data collection "
        "supervision, cleaning, analysis, and presentation-ready briefs.",
        "<b>Organisational &amp; programme support</b> — process mapping, SOP drafting support, "
        "stakeholder mapping, proposal inputs, and institutional strengthening.",
        "<b>Sector advisory</b> — education, health systems support, community development, "
        "agriculture value-chain studies, and public-sector service improvement.",
        "<b>Change &amp; communications</b> — workshop design, documentation, branding for "
        "campaigns, and stakeholder engagement facilitation.",
    ]:
        story.append(p(f"•  {item}", st["BulletItem"]))

    story.append(Spacer(1, 4 * mm))
    story.append(p("How We Engage", st["H2"]))
    steps = [
        ("01", "Discover", "Listen to objectives, constraints, and success criteria."),
        ("02", "Design", "Agree scope, methods, milestones, and quality gates."),
        ("03", "Deliver", "Fieldwork, analysis, facilitation, and interim reviews."),
        ("04", "Transfer", "Hand over tools, briefings, and practical next steps."),
    ]
    step_cells = []
    for num, title, desc in steps:
        step_cells.append(
            [
                p(f"<font color='#C9A227'><b>{num}</b></font>", st["CardTitle"]),
                p(f"<b>{title}</b>", st["CardTitle"]),
                p(desc, st["CardBody"]),
            ]
        )
    # transpose to columns
    step_t = Table(
        [
            [c[0] for c in step_cells],
            [c[1] for c in step_cells],
            [c[2] for c in step_cells],
        ],
        colWidths=[(PAGE_W - 36 * mm) / 4] * 4,
    )
    step_t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), LIGHT),
                ("BOX", (0, 0), (-1, -1), 0.6, GOLD),
                ("INNERGRID", (0, 0), (-1, -1), 0.4, HexColor("#E2E8F0")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story.append(step_t)
    story.append(PageBreak())

    # -------- PAGE 8: Supplies detail --------
    story.append(p("GENERAL &amp; INSTITUTIONAL <font color='#8B1E3F'>SUPPLIES</font>", st["H1"]))
    story.append(SectionRule(PAGE_W - 36 * mm))
    story.append(
        p(
            "We source, consolidate, and deliver quality goods for offices, schools, programmes, "
            "and project sites. Clients benefit from competitive quotations, verified specifications, "
            "and reliable lead times from our Nairobi hub with outreach across Kenya.",
            st["Body"],
        )
    )

    left = [
        p("<b>Office &amp; Institutional</b>", st["H2"]),
        p("•  Office furniture and fittings", st["BulletItem"]),
        p("•  Desks, chairs, storage, and boardroom essentials", st["BulletItem"]),
        p("•  School and office stationery", st["BulletItem"]),
        p("•  Printing, branding, and promotional materials", st["BulletItem"]),
        p("•  Filing systems, binders, and archival supplies", st["BulletItem"]),
        p("<b>ICT &amp; Technology Consumables</b>", st["H2"]),
        p("•  Printer inks and toner cartridges", st["BulletItem"]),
        p("•  Cables, peripherals, and accessories", st["BulletItem"]),
        p("•  Basic ICT consumables for labs and offices", st["BulletItem"]),
        p("•  Related computer and printer supplies", st["BulletItem"]),
    ]
    right = [
        p("<b>Programme &amp; Field Support</b>", st["H2"]),
        p("•  Training materials and workshop kits", st["BulletItem"]),
        p("•  Visibility items and event branding", st["BulletItem"]),
        p("•  Field data-collection kits (as specified)", st["BulletItem"]),
        p("•  General hardware and site consumables", st["BulletItem"]),
        p("<b>Commodities &amp; General Goods</b>", st["H2"]),
        p("•  Selected food and non-food commodities", st["BulletItem"]),
        p("•  Cleaning and hygiene supplies", st["BulletItem"]),
        p("•  Packaging and logistics support", st["BulletItem"]),
        p("•  Bespoke procurement against approved RFQs", st["BulletItem"]),
    ]
    # convert to single-cell tables for column layout
    left_t = Table([[x] for x in left], colWidths=[(PAGE_W - 40 * mm) / 2])
    right_t = Table([[x] for x in right], colWidths=[(PAGE_W - 40 * mm) / 2])
    for t in (left_t, right_t):
        t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 2)]))
    cols = Table([[left_t, right_t]], colWidths=[(PAGE_W - 40 * mm) / 2] * 2)
    cols.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story.append(cols)
    story.append(Spacer(1, 5 * mm))
    story.append(RLImage(str(ASSET / "banner_warehouse.jpg"), width=PAGE_W - 36 * mm, height=42 * mm))
    story.append(
        p(
            "Supply assurance: specification checks · competitive sourcing · delivery documentation · after-sales responsiveness",
            st["Small"],
        )
    )
    story.append(PageBreak())

    # -------- PAGE 9: Experience / track record --------
    story.append(p("EXPERIENCE &amp; <font color='#8B1E3F'>TRACK RECORD</font>", st["H1"]))
    story.append(SectionRule(PAGE_W - 36 * mm))
    story.append(
        p(
            "Sulwe Crest Enterprises draws on the cumulative experience of its leadership and "
            "associate network across consultancy assignments and institutional supply contracts. "
            "Below are illustrative engagement types that reflect the depth of work we are "
            "equipped to deliver.",
            st["Body"],
        )
    )

    engagements = [
        (
            "County &amp; public-sector support",
            "Capacity building for officers; documentation of service processes; supply of office "
            "and ICT consumables for departments and field stations.",
        ),
        (
            "Education institutions",
            "Stationery and furniture packages for schools and tertiary institutions; training "
            "facilitation for boards and management teams; exam and admin consumables.",
        ),
        (
            "Development &amp; NGO programmes",
            "Baseline and endline data support; facilitator teams for community workshops; "
            "branded materials and field kits aligned to donor visibility guidelines.",
        ),
        (
            "Private sector &amp; hospitality",
            "Office fit-out supplies; recurring stationery contracts; short advisory on "
            "process improvement and staff induction programmes.",
        ),
        (
            "Research &amp; evaluations",
            "Enumerator training, tool pre-testing, data quality assurance, analysis, and "
            "presentation of findings to steering committees.",
        ),
        (
            "Events &amp; institutional branding",
            "Pull-up banners, print collateral, name tags, and workshop materials delivered "
            "to venue with quality checks before go-live.",
        ),
    ]
    eng_rows = []
    for title, desc in engagements:
        eng_rows.append(
            [
                p(f"<b>{title}</b>", st["BulletItem"]),
                p(desc, st["BulletItem"]),
            ]
        )
    et = Table(eng_rows, colWidths=[55 * mm, PAGE_W - 91 * mm])
    et.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("BACKGROUND", (0, 0), (0, -1), LIGHT),
                ("BOX", (0, 0), (-1, -1), 0.6, GOLD),
                ("INNERGRID", (0, 0), (-1, -1), 0.4, HexColor("#E2E8F0")),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(et)
    story.append(Spacer(1, 5 * mm))
    story.append(p("Geographic Footprint", st["H2"]))
    story.append(
        p(
            "Primary operations from <b>Nairobi (Imara Daima / Embakasi)</b> with strong "
            "links to <b>Rongo and the wider Nyanza region</b>, and the ability to mobilise "
            "teams and consignments to Western Kenya, Rift, and Coast on assignment. "
            "Regional partnership readiness across the East African Community.",
            st["Body"],
        )
    )
    story.append(PageBreak())

    # -------- PAGE 10: Sectors & why us --------
    story.append(p("SECTORS WE <font color='#8B1E3F'>SERVE</font>", st["H1"]))
    story.append(SectionRule(PAGE_W - 36 * mm))
    sectors = [
        "County governments &amp; public agencies",
        "Primary, secondary &amp; tertiary education",
        "Health facilities &amp; community programmes",
        "NGOs, FBOs &amp; community-based organisations",
        "Private companies, hotels &amp; SMEs",
        "Research institutes &amp; training centres",
        "Faith-based &amp; development partners",
        "Agricultural &amp; rural livelihood projects",
    ]
    sec_data = []
    row = []
    for i, s_item in enumerate(sectors):
        cell = p(f"●  {s_item}", st["BulletItem"])
        row.append(cell)
        if len(row) == 2:
            sec_data.append(row)
            row = []
    if row:
        row.append(p("", st["BulletItem"]))
        sec_data.append(row)
    sec_t = Table(sec_data, colWidths=[(PAGE_W - 36 * mm) / 2] * 2)
    sec_t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), LIGHT),
                ("BOX", (0, 0), (-1, -1), 0.8, NAVY),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(sec_t)
    story.append(Spacer(1, 6 * mm))
    story.append(p("WHY PARTNER WITH SULWE CREST", st["H1Alt"]))
    story.append(SectionRule(PAGE_W - 36 * mm))
    for item in [
        "<b>Dual capability</b> — consultancy insight plus supply-chain execution under one accountable team.",
        "<b>Nairobi presence</b> — Sunrise Heights, AA Road, Imara Daima for client meetings and dispatch coordination.",
        "<b>Documentation discipline</b> — quotations, delivery notes, invoices, and assignment reports that stand audit scrutiny.",
        "<b>Responsive service</b> — clear communication on lead times, alternatives, and risk flags before they become delays.",
        "<b>Value orientation</b> — competitive sourcing without compromising agreed specifications.",
        "<b>People-centred delivery</b> — facilitators and coordinators who respect local culture and institutional protocols.",
    ]:
        story.append(p(f"•  {item}", st["BulletItem"]))
    story.append(Spacer(1, 5 * mm))
    story.append(RLImage(str(ASSET / "banner_handshake.jpg"), width=PAGE_W - 36 * mm, height=36 * mm))
    story.append(PageBreak())

    # -------- Clients --------
    story.append(p("OUR CLIENTS &amp; <font color='#8B1E3F'>PARTNERS</font>", st["H1"]))
    story.append(SectionRule(PAGE_W - 36 * mm))
    story.append(
        p(
            "We work with institutions that value reliable delivery and practical advisory. "
            "Client relationships span public agencies, learning institutions, development "
            "organisations, and private enterprises across Kenya.",
            st["Body"],
        )
    )

    clients = [
        "COUNTY &amp; PUBLIC-SECTOR DEPARTMENTS",
        "PRIMARY &amp; SECONDARY SCHOOLS",
        "TERTIARY &amp; TECHNICAL INSTITUTIONS",
        "NON-GOVERNMENTAL ORGANISATIONS (NGOs)",
        "FAITH-BASED &amp; COMMUNITY PROGRAMMES",
        "PRIVATE COMPANIES &amp; SMEs",
        "HOTELS, LODGES &amp; HOSPITALITY GROUPS",
        "RESEARCH &amp; TRAINING CENTRES",
        "HEALTH &amp; COMMUNITY OUTREACH PROJECTS",
        "AGRICULTURE &amp; LIVELIHOOD INITIATIVES",
        "DEVELOPMENT PARTNERS &amp; IMPLEMENTING AGENCIES",
        "CORPORATE OFFICES &amp; PROFESSIONAL FIRMS",
    ]
    client_rows = []
    for i in range(0, len(clients), 2):
        left_c = p(f"<b>{clients[i]}</b>", st["BodyCenter"])
        right_c = p(f"<b>{clients[i+1]}</b>", st["BodyCenter"]) if i + 1 < len(clients) else p("", st["BodyCenter"])
        client_rows.append([left_c, right_c])
    ct = Table(client_rows, colWidths=[(PAGE_W - 36 * mm) / 2] * 2)
    ct.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), LIGHT),
                ("BOX", (0, 0), (-1, -1), 1, NAVY),
                ("INNERGRID", (0, 0), (-1, -1), 0.4, GOLD),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        )
    )
    story.append(ct)
    story.append(Spacer(1, 6 * mm))
    story.append(
        p(
            "References and detailed assignment summaries are available on request for "
            "procurement and due-diligence processes.",
            st["BodyCenter"],
        )
    )
    story.append(Spacer(1, 4 * mm))
    story.append(RLImage(str(ASSET / "banner_meeting.jpg"), width=PAGE_W - 36 * mm, height=40 * mm))
    story.append(PageBreak())

    # -------- Team / structure --------
    story.append(p("OUR TEAM &amp; <font color='#8B1E3F'>STRUCTURE</font>", st["H1"]))
    story.append(SectionRule(PAGE_W - 36 * mm))
    story.append(
        p(
            "Sulwe Crest Enterprises operates a lean core team supported by a vetted bench of "
            "associates — trainers, researchers, logistics officers, and technical specialists — "
            "mobilised to match each assignment.",
            st["Body"],
        )
    )

    roles = [
        ("Managing Director / Principal", "Strategic direction, client relationships, quality oversight, and final sign-off on major assignments."),
        ("Operations &amp; Supplies Lead", "Sourcing, vendor management, warehousing coordination, delivery scheduling, and inventory control."),
        ("Consultancy Practice Lead", "Methodology design, team mobilisation, deliverable review, and facilitation excellence."),
        ("Finance &amp; Administration", "Quotations, contracting support, invoicing, statutory compliance, and records management."),
        ("Field &amp; Logistics Coordinators", "Last-mile delivery, workshop logistics, and on-site support during events and surveys."),
        ("Associate Consultants &amp; Trainers", "Subject-matter experts engaged for specialised training, research, and evaluation tasks."),
    ]
    role_rows = [[p(f"<b>{t}</b>", st["BulletItem"]), p(d, st["BulletItem"])] for t, d in roles]
    rt = Table(role_rows, colWidths=[55 * mm, PAGE_W - 91 * mm])
    rt.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ROWBACKGROUNDS", (0, 0), (-1, -1), [LIGHT, white]),
                ("BOX", (0, 0), (-1, -1), 0.7, NAVY),
                ("INNERGRID", (0, 0), (-1, -1), 0.3, HexColor("#CBD5E1")),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    story.append(rt)
    story.append(Spacer(1, 6 * mm))
    story.append(p("Quality &amp; Compliance Posture", st["H2"]))
    story.append(
        p(
            "We align delivery with client procurement rules, agreed specifications, and "
            "professional ethics. Consultancy outputs are peer-reviewed internally before "
            "submission. Goods are checked against order lines prior to dispatch. We maintain "
            "confidentiality for client data and respect intellectual property in all assignments.",
            st["Body"],
        )
    )
    story.append(PageBreak())

    # -------- PAGE 12: Closing / contact --------
    story.append(p("LET US WORK <font color='#8B1E3F'>WITH YOU</font>", st["H1"]))
    story.append(SectionRule(PAGE_W - 36 * mm))
    story.append(
        p(
            "Whether you need a training partner, an evaluation team, a reliable supplier of "
            "institutional goods, or a blended package of advisory and materials — Sulwe Crest "
            "Enterprises is ready to respond with clarity and speed.",
            st["Body"],
        )
    )
    story.append(Spacer(1, 4 * mm))
    story.append(RLImage(str(ASSET / "nairobi.jpg"), width=PAGE_W - 36 * mm, height=48 * mm))
    story.append(p("Serving institutions from Nairobi and across Kenya", st["Small"]))
    story.append(Spacer(1, 6 * mm))

    contact_final = Table(
        [
            [p("<b>SULWE CREST ENTERPRISES</b>", st["WhiteBody"])],
            [
                p(
                    "1st Floor, Sunrise Heights, AA Road<br/>"
                    "Imara Daima, Embakasi District — Nairobi<br/><br/>"
                    "P.O. Box 406 — 40404 Rongo<br/><br/>"
                    "Phone: 0797 695 806<br/>"
                    "Email: sulwecrestenterprises@gmail.com<br/><br/>"
                    "Consultancy  ·  General Supplies  ·  Institutional Support",
                    st["WhiteBody"],
                )
            ],
        ],
        colWidths=[PAGE_W - 40 * mm],
    )
    contact_final.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), NAVY),
                ("BOX", (0, 0), (-1, -1), 2, GOLD),
                ("TOPPADDING", (0, 0), (-1, -1), 12),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
                ("LEFTPADDING", (0, 0), (-1, -1), 14),
                ("RIGHTPADDING", (0, 0), (-1, -1), 14),
            ]
        )
    )
    story.append(contact_final)
    story.append(Spacer(1, 8 * mm))
    story.append(p("Guided by the star. Anchored by the crest.", st["Tagline"]))
    story.append(p("Company Profile — 2026 Edition", st["Small"]))

    def later(canv, doc_):
        header_footer(canv, doc_)

    def first_body(canv, doc_):
        header_footer(canv, doc_)

    doc.build(story, onFirstPage=first_body, onLaterPages=later)

    writer = PdfWriter()
    cover_buf.seek(0)
    body_buf.seek(0)
    for page in PdfReader(cover_buf).pages:
        writer.add_page(page)
    for page in PdfReader(body_buf).pages:
        writer.add_page(page)
    with open(OUT_PDF, "wb") as f:
        writer.write(f)

    try:
        import shutil

        shutil.copy2(OUT_PDF, OUT_INIT)
    except Exception:
        pass

    return OUT_PDF


if __name__ == "__main__":
    path = build()
    print(f"Wrote: {path}")
    print(f"Also tried: {OUT_INIT}")
