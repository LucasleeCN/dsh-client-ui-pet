#!/usr/bin/env python3
"""Turn a folder of pet JPG/PNG images into dsh-client-ui-pet raster assets.

Usage:
  python scripts/make-raster-pet.py assets/<pet-id> --name "宠物名" [options]

Options:
  --name TEXT        Pet display name (required).
  --author TEXT      Author field (default "developer").
  --max-size INT     Longest edge of the processed image (default 256).
  --remove-bg        Remove solid-ish background via border flood fill (default on).
  --keep-background  Keep the original background (round-card display).
  --tolerance INT    Background color distance tolerance (default 42).
  --quality INT      WebP quality 1-100 (default 88).
  --embed            Inline the WebP files as data:image/webp;base64 URIs so the
                     definition can be pasted into client.js built-ins and works
                     without the host asset route (no harness restart needed).
  --out FILE         Write the generated definition JSON to FILE
                     (default: assets/<pet-id>/<pet-id>.definition.json).

State files: idle.jpg, typing.jpg, thinking.jpg, working.jpg, done.jpg,
error.jpg, happy.jpg, eat.jpg, play.jpg, sleep.jpg. Missing states fall back
to idle.jpg.
"""

import argparse
import base64
import json
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:
    sys.exit("Pillow is required: python -m pip install pillow")

STATES = [
    "idle", "typing", "thinking", "working", "done",
    "error", "happy", "eat", "play", "sleep",
]
ASSET_PREFIX = "/plugins/dsh-client-ui-pet/assets"


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("folder")
    parser.add_argument("--name", required=True)
    parser.add_argument("--author", default="developer")
    parser.add_argument("--max-size", type=int, default=256)
    parser.add_argument("--remove-bg", action="store_true", default=True)
    parser.add_argument("--keep-background", action="store_true")
    parser.add_argument("--tolerance", type=int, default=42)
    parser.add_argument("--quality", type=int, default=88)
    parser.add_argument("--embed", action="store_true")
    parser.add_argument("--out")
    return parser.parse_args()


def median_border_color(image):
    """Median color sampled from the image border."""
    width, height = image.size
    pixels = []
    for x in range(width):
        pixels.append(image.getpixel((x, 0)))
        pixels.append(image.getpixel((x, height - 1)))
    for y in range(1, height - 1):
        pixels.append(image.getpixel((0, y)))
        pixels.append(image.getpixel((width - 1, y)))
    pixels.sort()
    return pixels[len(pixels) // 2]


def color_distance(a, b):
    return sum((int(a[i]) - int(b[i])) ** 2 for i in range(3)) ** 0.5


def remove_background(image, tolerance):
    """Flood-fill from the border and make the connected background transparent."""
    rgba = image.convert("RGBA")
    width, height = rgba.size
    pixels = rgba.load()
    bg = median_border_color(rgba)
    queue = []

    def matches(color):
        return color[3] > 0 and color_distance(color[:3], bg[:3]) <= tolerance

    def seed(x, y):
        if 0 <= x < width and 0 <= y < height and matches(pixels[x, y]):
            pixels[x, y] = (0, 0, 0, 0)
            queue.append((x, y))

    for x in range(width):
        seed(x, 0)
        seed(x, height - 1)
    for y in range(1, height - 1):
        seed(0, y)
        seed(width - 1, y)

    while queue:
        x, y = queue.pop()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < width and 0 <= ny < height and pixels[nx, ny][3] > 0:
                if matches(pixels[nx, ny]):
                    pixels[nx, ny] = (0, 0, 0, 0)
                    queue.append((nx, ny))

    # Soft alpha edge: pixels adjacent to transparency get a small feather.
    feathered = rgba.copy()
    fp = feathered.load()
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            near = any(
                pixels[nx, ny][3] == 0
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1))
                if 0 <= nx < width and 0 <= ny < height
            )
            if near:
                fp[x, y] = (r, g, b, max(0, a - 110))
    return feathered


def trim_and_fit(image, max_size):
    """Trim fully transparent borders and contain the result in a square canvas."""
    bbox = image.getbbox()
    if bbox is None:
        bbox = (0, 0, image.width, image.height)
    cropped = image.crop(bbox)
    side = max(cropped.width, cropped.height)
    scale = min(1.0, max_size / side)
    target = (max(1, round(cropped.width * scale)), max(1, round(cropped.height * scale)))
    resized = cropped.resize(target, Image.LANCZOS)
    canvas = Image.new("RGBA", (max_size, max_size), (0, 0, 0, 0))
    canvas.paste(resized, ((max_size - target[0]) // 2, (max_size - target[1]) // 2), resized)
    return canvas


def find_state_file(folder, state):
    for ext in (".png", ".webp", ".jpg", ".jpeg", ".gif"):
        candidate = folder / f"{state}{ext}"
        if candidate.exists():
            return candidate
    return None


def find_named_main_file(folder, pet_id):
    """Allow <pet-id>.png as the implicit idle image."""
    for ext in (".png", ".webp", ".jpg", ".jpeg", ".gif"):
        candidate = folder / f"{pet_id}{ext}"
        if candidate.exists():
            return candidate
    return None


def process_image(src, dst, args):
    image = Image.open(src)
    image = image.convert("RGBA")
    # Very large sources (e.g. 1600x2848) are downscaled before the border
    # flood fill: the output is capped at args.max_size anyway, and this keeps
    # the fill fast without losing meaningful edge detail.
    largest = max(image.size)
    pre_scale = max(args.max_size * 2, 256)
    if largest > pre_scale:
        ratio = pre_scale / largest
        image = image.resize(
            (max(1, round(image.width * ratio)), max(1, round(image.height * ratio))),
            Image.LANCZOS,
        )
    if args.remove_bg and not args.keep_background:
        image = remove_background(image, args.tolerance)
    image = trim_and_fit(image, args.max_size)
    dst.parent.mkdir(parents=True, exist_ok=True)
    image.save(dst, "WEBP", quality=args.quality, method=6)
    print(f"  {src.name} -> {dst.name} ({dst.stat().st_size} bytes)")


def main():
    args = parse_args()
    folder = Path(args.folder).resolve()
    if not folder.is_dir():
        sys.exit(f"folder not found: {folder}")

    pet_id = folder.name.lower()
    idle = find_state_file(folder, "idle") or find_named_main_file(folder, pet_id)
    if idle is None:
        sys.exit(f"idle image (idle.jpg/png/webp or {pet_id}.jpg/png) not found in {folder}")

    print(f"processing {pet_id} ({args.name}) ...")

    images = {}
    for state in STATES:
        src = find_state_file(folder, state)
        if src is None:
            continue  # missing states fall back to def.image (idle.webp)
        out_name = f"{state}.webp"
        out_file = folder / out_name
        process_image(src, out_file, args)
        if args.embed:
            encoded = base64.b64encode(out_file.read_bytes()).decode("ascii")
            images[state] = f"data:image/webp;base64,{encoded}"
        else:
            images[state] = f"{ASSET_PREFIX}/{pet_id}/{out_name}"

    definition = {
        "schemaVersion": 1,
        "id": pet_id,
        "name": args.name,
        "version": "1.0.0",
        "author": args.author,
        "description": f"{args.name}（JPG 主图宠物，由 assets/{pet_id} 生成）",
        "mode": "raster",
        "size": {"min": 96, "max": 320, "default": 200},
        "image": images.get("idle"),
        "images": images,
        "states": {
            state: {"label": label, "hold": state in ("idle", "sleep", "typing", "thinking", "working")}
            for state, label in [
                ("idle", "空闲"), ("typing", "注视"), ("thinking", "思考"), ("working", "忙碌"),
                ("done", "完成"), ("error", "担心"), ("happy", "开心"), ("eat", "吃饭"),
                ("play", "玩耍"), ("sleep", "睡觉"),
            ]
        },
        "behaviors": [
            {"trigger": "activity:typing", "state": "typing", "hold": True, "cooldownMs": 4000},
            {"trigger": "activity:thinking", "state": "thinking", "hold": True, "cooldownMs": 20000},
            {"trigger": "activity:working", "state": "working", "hold": True, "cooldownMs": 20000},
            {"trigger": "activity:done", "state": "done", "effect": "sparkles", "mood": 2, "affinity": 1},
            {"trigger": "activity:error", "state": "error", "effect": "drop", "mood": -3},
            {"trigger": "sleep", "state": "sleep", "hold": True, "effect": "zzz"},
            {"trigger": "wake", "state": "idle", "hold": True, "bubbles": ["睡醒啦！"]},
            {"trigger": "birth", "state": "happy", "effect": "hearts", "bubbles": ["你好呀，我叫{name}！"]}
        ],
        "interactions": {
            "pet": {"state": "happy", "effect": "hearts", "mood": 5, "affinity": 1, "cooldownMs": 1500},
            "feed": {"state": "eat", "effect": "food", "mood": 12, "affinity": 2, "cooldownMs": 4000},
            "play": {"state": "play", "effect": "sparkles", "mood": 8, "affinity": 2, "cooldownMs": 3000}
        },
        "bubbles": {
            "idle": ["我在哦～"],
            "sleep": ["Zzz…"],
            "happy": ["开心！"],
            "working": ["忙起来啦～"],
            "done": ["完成啦！"],
            "error": ["哎呀，出错了"]
        }
    }

    out = Path(args.out) if args.out else folder / f"{pet_id}.definition.json"
    out.write_text(json.dumps(definition, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"definition written to {out}")
    if args.embed:
        print("embed mode: 把该 JSON 的字段合并进 client.js 的 BUILTIN_DEFINITIONS 即可无需重启生效")
    else:
        print("import: 打开宠物面板 → 工作室 → 粘贴 JSON → 验证并导入")


if __name__ == "__main__":
    main()
