#!/usr/bin/env python3
"""Rasterize logo-icon.svg into the icon assets under branding/."""

import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

_ROOT_DIR = Path(__file__).resolve().parent.parent
_SOURCE = _ROOT_DIR / 'logo-icon.svg'
_THEME = _ROOT_DIR / 'branding/chrome/app/theme/chromium'

# Every frame Windows picks from, plus the PNG sizes chrome/app/theme ships.
_ICO_SIZES = (16, 24, 32, 48, 64, 96, 128, 256)
_PNG_SIZES = (16, 24, 48, 64, 128, 256)

_CHROME_CANDIDATES = (
    Path(r'C:\Program Files\Google\Chrome\Application\chrome.exe'),
    Path(r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe'),
)


def _find_chrome():
    for candidate in _CHROME_CANDIDATES:
        if candidate.is_file():
            return candidate
    found = shutil.which('chrome') or shutil.which('google-chrome')
    if found:
        return Path(found)
    raise RuntimeError('No Chrome binary found; pass --chrome')


def _render_sheet(chrome, work_dir):
    """Lay every size out side by side and rasterize them in one pass.

    Each frame has to be rasterized at its final size. Rendering once large and
    downscaling stacks a second antialiasing pass on top of the first, which
    turns the white outline into a grey smear at 16-32px.
    """
    tags, x = [], 0
    for size in _ICO_SIZES:
        tags.append('<img src="{}" width="{}" height="{}" '
                    'style="position:absolute;left:{}px;top:0">'.format(_SOURCE.as_uri(), size, size, x))
        x += size + 8
    sheet_html = work_dir / 'sheet.html'
    sheet_html.write_text(
        '<!doctype html><meta charset="utf-8">'
        '<style>body{margin:0;background:transparent}img{display:block}</style>' + ''.join(tags),
        encoding='utf-8')

    sheet_png = work_dir / 'sheet.png'
    subprocess.run([
        str(chrome), '--headless', '--disable-gpu',
        '--screenshot={}'.format(sheet_png),
        '--window-size={},{}'.format(x + 64, max(_ICO_SIZES) + 32),
        '--default-background-color=00000000',
        '--force-device-scale-factor=1',
        sheet_html.as_uri(),
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    sheet = Image.open(sheet_png).convert('RGBA')
    frames, x = {}, 0
    for size in _ICO_SIZES:
        frames[size] = sheet.crop((x, 0, x + size, size))
        x += size + 8
    return frames


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--chrome', type=Path, help='Chrome binary used as the rasterizer')
    args = parser.parse_args()

    chrome = args.chrome or _find_chrome()
    with tempfile.TemporaryDirectory() as tmp:
        frames = _render_sheet(chrome, Path(tmp))

        if frames[max(_ICO_SIZES)].getbbox() is None:
            raise RuntimeError('Rasterized frames are empty; check {}'.format(_SOURCE))

        (_THEME / 'win').mkdir(parents=True, exist_ok=True)
        for size in _PNG_SIZES:
            frames[size].save(_THEME / 'product_logo_{}.png'.format(size))
        frames[256].save(_THEME / 'win/chromium.ico',
                         append_images=[frames[s] for s in _ICO_SIZES if s != 256],
                         format='ICO',
                         sizes=[(s, s) for s in _ICO_SIZES])

    print('Wrote {} PNGs and chromium.ico under {}'.format(len(_PNG_SIZES), _THEME))
    return 0


if __name__ == '__main__':
    sys.exit(main())
