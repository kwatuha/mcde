#!/usr/bin/env python3
"""Generate Android launcher icons from the Machakos county coat of arms."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent / 'api' / 'assets' / 'gpris.png'
RES = ROOT / 'android' / 'app' / 'src' / 'main' / 'res'
ASSETS_LOGO = ROOT / 'assets' / 'logo.png'

SIZES = {
    'mipmap-mdpi': 48,
    'mipmap-hdpi': 72,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192,
}

BACKGROUND = (255, 255, 255, 255)
LOGO_SCALE = 0.82


def fit_logo(source: Image.Image, size: int) -> Image.Image:
    canvas = Image.new('RGBA', (size, size), BACKGROUND)
    logo_max = int(size * LOGO_SCALE)
    logo = source.copy()
    logo.thumbnail((logo_max, logo_max), Image.Resampling.LANCZOS)
    x = (size - logo.width) // 2
    y = (size - logo.height) // 2
    canvas.paste(logo, (x, y), logo)
    return canvas


def round_icon(square: Image.Image) -> Image.Image:
    size = square.size[0]
    mask = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((0, 0, size - 1, size - 1), fill=255)
    rounded = Image.new('RGBA', (size, size), BACKGROUND)
    rounded.paste(square, (0, 0), mask)
    return rounded


def main() -> None:
    if not SOURCE.is_file():
        raise SystemExit(f'Source logo not found: {SOURCE}')

    source = Image.open(SOURCE).convert('RGBA')
    ASSETS_LOGO.parent.mkdir(parents=True, exist_ok=True)
    source.save(ASSETS_LOGO)

    for folder, size in SIZES.items():
        out_dir = RES / folder
        out_dir.mkdir(parents=True, exist_ok=True)
        square = fit_logo(source, size)
        square.save(out_dir / 'ic_launcher.png')
        round_icon(square).save(out_dir / 'ic_launcher_round.png')
        print(f'Wrote {folder} ({size}px)')


if __name__ == '__main__':
    main()
