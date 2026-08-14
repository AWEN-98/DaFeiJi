import os
from PIL import Image
import numpy as np

SRCS = {
    'attack': (r'C:\Users\10430\.workbuddy\clipboard-images\clipboard-2026-08-13T13-08-46-467Z-a6434f64.jpg',
               r'D:\WorkBuddy Stido\2026-08-12-12-58-18\prototype\assets\v3\player\xuanwu_attack_sheet.png', 1600, 800, 0.85),
    'muzzle': (r'C:\Users\10430\.workbuddy\clipboard-images\clipboard-2026-08-13T13-08-46-472Z-c25b23b6.jpg',
               r'D:\WorkBuddy Stido\2026-08-12-12-58-18\prototype\assets\v3\vfx\vfx_xuanwu_muzzle_sheet.png', 1024, 512, 0.9),
    'bullet': (r'C:\Users\10430\.workbuddy\clipboard-images\clipboard-2026-08-13T13-08-46-474Z-a5baa7e3.jpg',
               r'D:\WorkBuddy Stido\2026-08-12-12-58-18\prototype\assets\v3\vfx\bul_xuanwu_heavy_sheet.png', 1024, 512, 0.78),
    'hit': (r'C:\Users\10430\.workbuddy\clipboard-images\clipboard-2026-08-13T13-08-46-477Z-40447de1.jpg',
            r'D:\WorkBuddy Stido\2026-08-12-12-58-18\prototype\assets\v3\vfx\vfx_xuanwu_hit_shock_sheet.png', 1024, 512, 0.88),
}

def content_bounds(f):
    data = np.array(f)
    mask = data[:, :, 3] > 0
    ys, xs = np.where(mask)
    if len(xs) == 0:
        return (0, 0, f.width, f.height)
    return (int(xs.min()), int(ys.min()), int(xs.max()+1), int(ys.max()+1))

def process_one(src_path, out_path, out_w, out_h, scale):
    img = Image.open(src_path).convert('RGBA')
    W, H = img.size
    cols, rows = 4, 2
    cw, ch = W // cols, H // rows
    img = img.crop((0, 0, cw * cols, ch * rows))
    W, H = img.size
    frames = []
    for y in range(rows):
        for x in range(cols):
            frame = img.crop((x*cw, y*ch, (x+1)*cw, (y+1)*ch)).convert('RGBA')
            frames.append(frame)

    frame_out_w, frame_out_h = out_w // cols, out_h // rows

    processed = []
    for fr in frames:
        data = np.array(fr)
        r, g, b, a = data[:, :, 0], data[:, :, 1], data[:, :, 2], data[:, :, 3]
        green = (g > 180) & (r < 120) & (b < 120) & (g > r + 30) & (g > b + 30)
        a = np.where(green, 0, a).astype(np.uint8)
        data[:, :, 3] = a
        # spill suppression
        mask = a > 0
        nr = np.where(mask, r, 0)
        ng = np.where(mask, g, 0)
        nb = np.where(mask, b, 0)
        for _ in range(2):
            for ax in [0, 1]:
                shift = np.roll(ng, 1, axis=ax)
                smask = np.roll(mask, 1, axis=ax)
                nr = np.where(~mask & smask & (ng > 30), (nr + shift) // 2, nr)
                nb = np.where(~mask & smask & (ng > 30), (nb + shift) // 2, nb)
        data[:, :, 0] = nr.astype(np.uint8)
        data[:, :, 2] = nb.astype(np.uint8)
        fr = Image.fromarray(data, 'RGBA')
        bounds = content_bounds(fr)
        content = fr.crop(bounds)
        target_size = int(min(frame_out_w, frame_out_h) * scale)
        content.thumbnail((target_size, target_size), Image.Resampling.LANCZOS)
        canvas = Image.new('RGBA', (frame_out_w, frame_out_h), (0, 0, 0, 0))
        cx, cy = content.size
        off_x = frame_out_w // 2 - cx // 2
        off_y = frame_out_h // 2 - cy // 2
        canvas.paste(content, (off_x, off_y), content)
        processed.append(canvas)

    sheet = Image.new('RGBA', (out_w, out_h), (0, 0, 0, 0))
    for idx, p in enumerate(processed):
        x = (idx % cols) * frame_out_w
        y = (idx // cols) * frame_out_h
        sheet.paste(p, (x, y), p)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    sheet.save(out_path)
    print('saved', out_path, sheet.size)

if __name__ == '__main__':
    for key, (src, out, ow, oh, sc) in SRCS.items():
        process_one(src, out, ow, oh, sc)
