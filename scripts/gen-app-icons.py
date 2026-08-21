#!/usr/bin/env python3
"""Draw size-aware app icons (rounded blue plate + device/prompt) and pack Windows ICO.

应用图标输出 32x32 / 128x128 / 128x128@2x / icon.png / icon-512.png 与 icon.ico
（ICO layers 16, 24, 32(first), 48, 64, 256）。
Small sizes drop the speaker / cursor so the mark still reads in the taskbar.
"""

from __future__ import annotations

import io
import struct
from pathlib import Path

from PIL import Image, ImageDraw

BRAND = (0x0A, 0x59, 0xF7, 255)
WHITE = (255, 255, 255, 255)
CLEAR = (0, 0, 0, 0)
PLATE_RADIUS = 0.22
SCALE = 8  # draw oversized then downsample


def _r(size: int, v: float) -> int:
    return int(round(v * size * SCALE))


def _circle(draw: ImageDraw.ImageDraw, x: float, y: float, rad: float, fill) -> None:
    draw.ellipse((x - rad, y - rad, x + rad, y + rad), fill=fill)


def _round_line(draw: ImageDraw.ImageDraw, a, b, width: int, fill) -> None:
    draw.line([a, b], fill=fill, width=width)
    rad = width / 2
    _circle(draw, a[0], a[1], rad, fill)
    _circle(draw, b[0], b[1], rad, fill)


def draw_icon(size: int) -> Image.Image:
    """Draw one square RGBA icon at `size` pixels, with a size-aware glyph."""
    s = size * SCALE
    img = Image.new("RGBA", (s, s), CLEAR)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((0, 0, s - 1, s - 1), radius=int(s * PLATE_RADIUS), fill=BRAND)

    def u(v: float) -> int:
        return _r(size, v / 1024.0)

    cx = s / 2
    # 16–24: chevron only. 32–48: phone + chevron. 64+: phone + speaker + chevron + cursor.
    if size <= 24:
        w = u(120)
        top = (cx + u(-160), s / 2 + u(-220))
        tip = (cx + u(180), s / 2)
        bot = (cx + u(-160), s / 2 + u(220))
        _round_line(d, top, tip, w, WHITE)
        _round_line(d, bot, tip, w, WHITE)
    else:
        pad_x, pad_y = u(292), u(196)
        phone = (pad_x, pad_y, s - pad_x - 1, s - pad_y - 1)
        d.rounded_rectangle(phone, radius=u(100), fill=WHITE)
        pl, pt, pr, pb = phone
        pcx = (pl + pr) / 2
        pcy = (pt + pb) / 2 + u(36)

        if size >= 64:
            sp_w, sp_h = u(112), u(24)
            sp_t = pt + u(64)
            d.rounded_rectangle(
                (pcx - sp_w / 2, sp_t, pcx + sp_w / 2, sp_t + sp_h),
                radius=u(12),
                fill=BRAND,
            )

        w = u(56)
        top = (pcx + u(-78), pcy + u(-108))
        tip = (pcx + u(62), pcy)
        bot = (pcx + u(-78), pcy + u(108))
        _round_line(d, top, tip, w, BRAND)
        _round_line(d, bot, tip, w, BRAND)

        if size >= 48:
            bar_w, bar_h = u(26), u(120)
            bar_x = pcx + u(118)
            d.rounded_rectangle(
                (bar_x, pcy - bar_h / 2, bar_x + bar_w, pcy + bar_h / 2),
                radius=u(13),
                fill=BRAND,
            )

    return img.resize((size, size), Image.Resampling.LANCZOS)


def save_ico(path: Path, layers: list[tuple[int, Image.Image]]) -> None:
    """PNG-in-ICO (Vista+). `layers` order is the ICO directory order; 32px first."""
    blobs: list[bytes] = []
    for _size, im in layers:
        buf = io.BytesIO()
        im.save(buf, format="PNG")
        blobs.append(buf.getvalue())
    offset = 6 + 16 * len(layers)
    with path.open("wb") as f:
        f.write(struct.pack("<HHH", 0, 1, len(layers)))
        for (size, _im), data in zip(layers, blobs):
            w = 0 if size >= 256 else size
            f.write(struct.pack("<BBBBHHII", w, w, 0, 0, 1, 32, len(data), offset))
            offset += len(data)
        for data in blobs:
            f.write(data)


def main() -> None:
    repo = Path(__file__).resolve().parents[1]
    icons = repo / "app" / "yohu-app" / "icons"
    icons.mkdir(parents=True, exist_ok=True)

    png_sizes = {
        32: "32x32.png",
        128: "128x128.png",
        256: "128x128@2x.png",
        512: "icon-512.png",
        1024: "icon.png",
    }
    rendered: dict[int, Image.Image] = {}
    for size, name in png_sizes.items():
        im = draw_icon(size)
        rendered[size] = im
        dest = icons / name
        im.save(dest, format="PNG")
        print(f"png {size:>4} {dest.name} {dest.stat().st_size}")

    ico_order = [32, 16, 24, 48, 64, 256]
    layers = [(sz, rendered.get(sz) or draw_icon(sz)) for sz in ico_order]
    ico_path = icons / "icon.ico"
    save_ico(ico_path, layers)
    print(f"ico      {ico_path.name} {ico_path.stat().st_size} layers={ico_order}")


if __name__ == "__main__":
    main()
