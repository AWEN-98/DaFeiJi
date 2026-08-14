import os
from PIL import Image
import numpy as np

SRC_DIR = r'C:\Users\10430\.workbuddy\clipboard-images'
OUT_DIR = r'D:\WorkBuddy Stido\2026-08-12-12-58-18\prototype\assets\v3'

FILES = [
    ('clipboard-2026-08-13T13-12-36-748Z-a6434f64.jpg', 'player/xuanwu_attack_sheet.png', (1024, 512)),
    ('clipboard-2026-08-13T13-12-36-753Z-c25b23b6.jpg', 'vfx/vfx_xuanwu_muzzle_flash_sheet.png', (1024, 512)),
    ('clipboard-2026-08-13T13-12-36-755Z-a5baa7e3.jpg', 'vfx/bul_xuanwu_sheet.png', (1024, 512)),
    ('clipboard-2026-08-13T13-12-36-758Z-40447de1.jpg', 'vfx/vfx_xuanwu_hit_shock_sheet.png', (1024, 512)),
]

def remove_green(img):
    data = np.array(img.convert('RGBA')).astype(np.float32)
    r, g, b, a = data[:, :, 0], data[:, :, 1], data[:, :, 2], data[:, :, 3]
    # explicit bright green mask
    green1 = (g > 180) & (r < 130) & (b < 130) & (g > r + 30) & (g > b + 30)
    # catch turquoise/cyan-green blends near pure green background
    dist = np.sqrt(r*r + (g - 255.0)*(g - 255.0) + b*b)
    green2 = (dist < 150) & (g > r + 10) & (g > 120)
    green = green1 | green2
    a = np.where(green, 0, a)
    data[:, :, 3] = a
    # spill suppression: reduce green tint on edges near removed background
    mask = a > 0
    for _ in range(2):
        for ax in [0, 1]:
            gshift = np.roll(g, 1, axis=ax)
            mshift = np.roll(mask, 1, axis=ax)
            edge = ~mask & mshift
            data[:, :, 1] = np.where(edge & (gshift > 30), data[:, :, 1] * 0.6 + gshift * 0.4, data[:, :, 1])
            data[:, :, 0] = np.where(edge & (gshift > 30), data[:, :, 0] * 0.7 + 30, data[:, :, 0])
            data[:, :, 2] = np.where(edge & (gshift > 30), data[:, :, 2] * 0.7 + 30, data[:, :, 2])
    data = np.clip(data, 0, 255).astype(np.uint8)
    return Image.fromarray(data, 'RGBA')

def content_bounds(f):
    data = np.array(f)
    mask = data[:, :, 3] > 0
    ys, xs = np.where(mask)
    if len(xs) == 0:
        return (0, 0, f.width, f.height)
    return (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)

def process_sprite_sheet(src_name, out_name, out_size):
    src = os.path.join(SRC_DIR, src_name)
    out = os.path.join(OUT_DIR, out_name)
    img = remove_green(Image.open(src))
    W, H = img.size
    cols, rows = 4, 2
    cw, ch = W // cols, H // rows
    img = img.crop((0, 0, cw * cols, ch * rows))
    W, H = img.size
    cw, ch = W // cols, H // rows
    out_w, out_h = out_size
    fw, fh = out_w // cols, out_h // rows
    frames = []
    for y in range(rows):
        for x in range(cols):
            frames.append(img.crop((x * cw, y * ch, (x + 1) * cw, (y + 1) * ch)))

    # find largest content frame to set target size
    def content_area(f):
        b = content_bounds(f)
        return (b[2] - b[0]) * (b[3] - b[1])
    largest = max(frames, key=content_area)
    lb = content_bounds(largest)
    target_size = int(min(fw, fh) * 0.82)
    # keep aspect of largest content, but not bigger than target_size
    lw, lh = lb[2] - lb[0], lb[3] - lb[1]
    scale = min(target_size / max(lw, 1), target_size / max(lh, 1), 1.0)
    target_w = max(1, int(lw * scale))
    target_h = max(1, int(lh * scale))

    sheet = Image.new('RGBA', (out_w, out_h), (0, 0, 0, 0))
    for idx, fr in enumerate(frames):
        bounds = content_bounds(fr)
        content = fr.crop(bounds)
        content.thumbnail((target_w, target_h), Image.Resampling.LANCZOS)
        canvas = Image.new('RGBA', (fw, fh), (0, 0, 0, 0))
        cx, cy = content.size
        off_x = fw // 2 - cx // 2
        off_y = fh // 2 - cy // 2
        canvas.paste(content, (off_x, off_y), content)
        x = (idx % cols) * fw
        y = (idx // cols) * fh
        sheet.paste(canvas, (x, y), canvas)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    sheet.save(out)
    print('saved', out, sheet.size)

if __name__ == '__main__':
    for src_name, out_name, out_size in FILES:
        process_sprite_sheet(src_name, out_name, out_size)
