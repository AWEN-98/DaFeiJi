#!/usr/bin/env python3
"""Generate armor/core/ammo slot icons in 鎏金暗色 style (v2, more contrast/glow)."""
import os, math
from PIL import Image, ImageDraw, ImageFilter

OUT_DIR = "assets/v4/icons"
os.makedirs(OUT_DIR, exist_ok=True)

SIZE = 512
BASE = (14, 11, 8)
DARK = (32, 27, 23)
DARK_M = (45, 38, 32)
GOLD = (201, 162, 75)
GOLD_L = (232, 211, 164)
TEAL = (143, 216, 192)


def new_canvas():
    im = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    return im, ImageDraw.Draw(im)


def radial_gradient(draw, cx, cy, r, stops):
    for i in range(r, 0, -1):
        t = i / r
        for j in range(len(stops) - 1):
            s0, c0 = stops[j]
            s1, c1 = stops[j + 1]
            if s0 <= t <= s1:
                tt = (t - s0) / (s1 - s0)
                col = tuple(int(c0[k] + (c1[k] - c0[k]) * tt) for k in range(4))
                break
        else:
            col = stops[-1][1]
        draw.ellipse([cx - i, cy - i, cx + i, cy + i], fill=col)


def metallic_polygon(draw, pts, fill_dark, fill_light, outline):
    """draw a polygon with a vertical metallic gradient."""
    # simple vertical gradient approximation via multiple thin polygons
    miny = min(p[1] for p in pts)
    maxy = max(p[1] for p in pts)
    for y in range(int(miny), int(maxy) + 1, 2):
        t = (y - miny) / max(1, maxy - miny)
        c = tuple(int(fill_dark[k] + (fill_light[k] - fill_dark[k]) * (0.4 + 0.6 * math.sin(t * math.pi))) for k in range(3))
        # clip horizontal line to polygon at y
        xs = []
        n = len(pts)
        for i in range(n):
            x1, y1 = pts[i]
            x2, y2 = pts[(i + 1) % n]
            if (y1 <= y < y2) or (y2 <= y < y1):
                xs.append(x1 + (x2 - x1) * (y - y1) / (y2 - y1))
        if len(xs) >= 2:
            draw.line([(min(xs), y), (max(xs), y)], fill=c + (255,), width=2)
    draw.polygon(pts, outline=outline + (255,), width=6)


def draw_armor():
    im, d = new_canvas()
    cx, cy = SIZE // 2, SIZE // 2
    # outer glow
    radial_gradient(d, cx, cy, 250, [(0, GOLD + (45,)), (0.35, GOLD + (18,)), (1, (0, 0, 0, 0))])
    # shield shape
    pts = [(cx, cy - 190), (cx + 155, cy - 95), (cx + 130, cy + 70), (cx, cy + 215), (cx - 130, cy + 70), (cx - 155, cy - 95)]
    metallic_polygon(d, pts, DARK, DARK_M, GOLD)
    # inner panel
    inner = [(cx + p[0] * 0.62, cy + p[1] * 0.62) for p in [(0, -130), (100, -75), (85, 45), (0, 155), (-85, 45), (-100, -75)]]
    d.polygon(inner, fill=BASE + (255,), outline=GOLD + (200,), width=4)
    # central gem with glow
    radial_gradient(d, cx, cy, 55, [(0, TEAL + (255,)), (0.5, GOLD + (220,)), (1, GOLD + (0,))])
    d.ellipse([cx - 42, cy - 42, cx + 42, cy + 42], outline=GOLD_L + (255,), width=4)
    # decorative gold V
    d.polygon([(cx, cy + 20), (cx + 22, cy + 70), (cx, cy + 55), (cx - 22, cy + 70)], fill=GOLD + (200,))
    # rivets
    for x, y in [(cx - 115, cy - 55), (cx + 115, cy - 55), (cx - 95, cy + 55), (cx + 95, cy + 55)]:
        d.ellipse([x - 9, y - 9, x + 9, y + 9], fill=GOLD + (255,), outline=GOLD_L + (200,), width=2)
    return im


def draw_core():
    im, d = new_canvas()
    cx, cy = SIZE // 2, SIZE // 2
    # outer glow (teal-gold)
    radial_gradient(d, cx, cy, 260, [(0, TEAL + (50,)), (0.4, GOLD + (22,)), (1, (0, 0, 0, 0))])
    # hex frame
    def hex(r, off=(0, 0)):
        return [(cx + off[0] + r * math.cos(math.radians(90 + 60 * i)),
                 cy + off[1] + r * math.sin(math.radians(90 + 60 * i))) for i in range(6)]
    metallic_polygon(d, hex(175), DARK, DARK_M, GOLD)
    d.polygon(hex(120), fill=BASE + (255,), outline=GOLD + (180,), width=4)
    # inner orb glow
    radial_gradient(d, cx, cy, 95, [(0, TEAL + (255,)), (0.45, GOLD + (210,)), (1, GOLD + (0,))])
    # one bold ring
    d.ellipse([cx - 70, cy - 70, cx + 70, cy + 70], outline=GOLD_L + (240,), width=5)
    # center diamond
    dp = [(cx, cy - 40), (cx + 34, cy), (cx, cy + 40), (cx - 34, cy)]
    d.polygon(dp, fill=GOLD_L + (255,), outline=BASE + (255,), width=3)
    # corner sparks
    for angle in [30, 90, 150, 210, 270, 330]:
        rad = math.radians(angle)
        x1 = cx + 135 * math.cos(rad)
        y1 = cy + 135 * math.sin(rad)
        x2 = cx + 165 * math.cos(rad)
        y2 = cy + 165 * math.sin(rad)
        d.line([(x1, y1), (x2, y2)], fill=GOLD_L + (220,), width=4)
    return im


def draw_ammo():
    im, d = new_canvas()
    cx, cy = SIZE // 2, SIZE // 2
    # outer glow
    radial_gradient(d, cx, cy, 240, [(0, GOLD + (40,)), (0.4, GOLD + (16,)), (1, (0, 0, 0, 0))])
    # magazine body
    mw, mh = 130, 245
    x0, y0 = cx - mw // 2, cy - mh // 2
    d.rounded_rectangle([x0, y0, x0 + mw, y0 + mh], radius=22, fill=DARK + (255,), outline=GOLD + (255,), width=8)
    # inner groove
    d.rounded_rectangle([x0 + 16, y0 + 16, x0 + mw - 16, y0 + mh - 16], radius=14, fill=BASE + (255,), outline=GOLD + (160,), width=3)
    # rounds
    for yy in [cy - 68, cy, cy + 68]:
        # casing
        d.rounded_rectangle([cx - 40, yy - 30, cx + 40, yy + 30], radius=10, fill=DARK_M + (255,), outline=GOLD + (200,), width=3)
        # gold tip
        d.polygon([(cx - 40, yy - 30), (cx + 40, yy - 30), (cx + 32, yy - 12), (cx - 32, yy - 12)], fill=GOLD + (255,))
        d.line([(cx - 40, yy - 30), (cx + 40, yy - 30)], fill=GOLD_L + (255,), width=2)
        # tip glow line
        d.line([(cx - 40, yy - 30), (cx + 40, yy - 30)], fill=GOLD_L + (180,), width=2)
    # motion streaks
    for sx, sy in [(cx - 105, cy - 45), (cx + 105, cy - 45), (cx - 105, cy + 35), (cx + 105, cy + 35)]:
        sign = 1 if sx > cx else -1
        d.polygon([
            (sx, sy - 10), (sx + sign * 42, sy + 2), (sx + sign * 34, sy + 8), (sx - sign * 8, sy - 4)
        ], fill=GOLD + (180,))
    return im


if __name__ == "__main__":
    draw_armor().save(os.path.join(OUT_DIR, "slot_armor.png"))
    draw_core().save(os.path.join(OUT_DIR, "slot_core.png"))
    draw_ammo().save(os.path.join(OUT_DIR, "slot_ammo.png"))
    print("generated", OUT_DIR, "slot_armor.png slot_core.png slot_ammo.png")
