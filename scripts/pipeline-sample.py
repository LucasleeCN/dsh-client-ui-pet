#!/usr/bin/env python3
"""Generate a synthetic two-state JPG pet for pipeline verification."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "pipeline-check"
OUT.mkdir(parents=True, exist_ok=True)


def blob(draw, x, y, rx, ry, color, eyes="open", smile=True):
    draw.ellipse((x - rx, y - ry, x + rx, y + ry), fill=color)
    if eyes == "open":
        draw.ellipse((x - rx * 0.45, y - ry * 0.3, x - rx * 0.15, y - ry * 0.05), fill="#1e293b")
        draw.ellipse((x + rx * 0.15, y - ry * 0.3, x + rx * 0.45, y - ry * 0.05), fill="#1e293b")
    else:
        draw.arc((x - rx * 0.5, y - ry * 0.4, x - rx * 0.1, y - ry * 0.1), 20, 160, fill="#1e293b", width=6)
        draw.arc((x + rx * 0.1, y - ry * 0.4, x + rx * 0.5, y - ry * 0.1), 20, 160, fill="#1e293b", width=6)
    if smile:
        draw.arc((x - rx * 0.3, y + ry * 0.05, x + rx * 0.3, y + ry * 0.45), 20, 160, fill="#1e293b", width=6)
    draw.ellipse((x - rx * 0.55, y + ry * 0.1, x - rx * 0.38, y + ry * 0.22), fill="#ffffff", outline=None)
    draw.ellipse((x + rx * 0.38, y + ry * 0.1, x + rx * 0.55, y + ry * 0.22), fill="#ffffff", outline=None)


def make(path, color):
    img = Image.new("RGB", (512, 512), "white")
    draw = ImageDraw.Draw(img)
    blob(draw, 256, 270, 160, 150, color, "open", True)
    img.save(path, "JPEG", quality=92)


make(OUT / "idle.jpg", "#5ee6a8")
make(OUT / "happy.jpg", "#f472b6")
print("wrote", OUT / "idle.jpg", OUT / "happy.jpg")
