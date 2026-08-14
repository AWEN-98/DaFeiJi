import sys
from PIL import Image
import numpy as np
import os

SRC = r'C:\Users\10430\.workbuddy\clipboard-images\clipboard-2026-08-13T12-56-53-332Z-8c74a56d.jpg'
OUT = r'D:\WorkBuddy Stido\2026-08-12-12-58-18\prototype\assets\v3\player\xuanwu_boost_sheet.png'

def process(src_path, out_path):
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

    out_w, out_h = 1024, 512
    frame_out_w, frame_out_h = out_w // cols, out_h // rows

    def key(frame):
        data = np.array(frame)
        mask = data[:, :, 3] > 0
        ys, xs = np.where(mask)
        if len(xs) == 0: return (0, 0, 0)
        return (len(xs), xs.max()-xs.min(), ys.max()-ys.min())

    sorted_frames = sorted(enumerate(frames), key=lambda p: key(p[1]), reverse=True)
    reference = sorted_frames[0][1]

    def content_bounds(f):
        data = np.array(f)
        mask = (data[:, :, 3] > 0)
        ys, xs = np.where(mask)
        if len(xs) == 0:
            return (0, 0, f.width, f.height)
        return (xs.min(), ys.min(), xs.max()+1, ys.max()+1)

    ref_bounds = content_bounds(reference)
    ref_cx = (ref_bounds[0] + ref_bounds[2]) // 2
    ref_cy = (ref_bounds[1] + ref_bounds[3]) // 2
    target_size = int(min(frame_out_w, frame_out_h) * 0.82)

    processed = []
    for i, fr in enumerate(frames):
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
        content.thumbnail((target_size, target_size), Image.Resampling.LANCZOS)
        canvas = Image.new('RGBA', (frame_out_w, frame_out_h), (0, 0, 0, 0))
        cx, cy = content.size
        # align center using reference offset ratio to reduce jitter
        if i == sorted_frames[0][0]:
            off_x = frame_out_w // 2 - cx // 2
            off_y = frame_out_h // 2 - cy // 2
        else:
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
    process(SRC, OUT)
