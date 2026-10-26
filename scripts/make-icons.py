"""Draws the app icons into public/ (the start screen's record mark).

Run once after changing the design: python scripts/make-icons.py
Needs Pillow. Drawn at 4x and downsampled for smooth edges.
"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / 'public'
# Walnut behind the maskable icon; grooves pre-blended (outlines ignore alpha).
BG, RECORD, GROOVE, LABEL = (47, 32, 22), (18, 16, 18), (44, 41, 44), (214, 161, 92)


def record(size: int, scale: float, background: bool) -> Image.Image:
    """`scale` is the record's diameter as a fraction of the icon."""
    big = size * 4
    img = Image.new('RGBA', (big, big), BG + (255,) if background else (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c, r = big / 2, big * scale / 2

    def disc(radius: float, fill=None, outline=None, width=0):
        d.ellipse((c - radius, c - radius, c + radius, c + radius), fill=fill, outline=outline, width=width)

    disc(r, fill=RECORD)
    for f in (0.8, 0.72, 0.63, 0.55):
        disc(r * f, outline=GROOVE, width=max(1, big // 160))
    disc(r * 0.37, fill=LABEL)
    disc(r * 0.06, fill=RECORD)
    return img.resize((size, size), Image.LANCZOS)


record(192, 0.94, False).save(OUT / 'icon-192.png')
record(512, 0.94, False).save(OUT / 'icon-512.png')
# Maskable: the OS may crop to a circle or squircle, so keep the record
# inside the central 80% safe zone and fill the rest.
record(512, 0.78, True).save(OUT / 'icon-maskable-512.png')
record(48, 0.94, False).save(OUT / 'favicon.png')
print('icons written to', OUT)
