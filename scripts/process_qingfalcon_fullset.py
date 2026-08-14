import os
from PIL import Image
import numpy as np

CLIPBOARD_DIR = r'C:\Users\10430\.workbuddy\clipboard-images'
OUT_DIR = r'D:\WorkBuddy Stido\2026-08-12-12-58-18\prototype\assets'

JOBS = [
    ('clipboard-2026-08-13T13-50-25-824Z-cbf398d2.jpg', 'v3/player/qingfalcon_idle_sheet.png'),
    ('clipboard-2026-08-13T13-50-25-831Z-07d0d87b.jpg', 'v3/player/qingfalcon_move_sheet.png'),
    ('clipboard-2026-08-13T13-50-25-836Z-52f8dc13.jpg', 'v3/player/qingfalcon_dash_sheet.png'),
    ('clipboard-2026-08-13T13-50-25-841Z-647b6c7c.jpg', 'v3/player/qingfalcon_attack_sheet.png'),
    ('clipboard-2026-08-13T13-50-25-844Z-7d4bf7ad.jpg', 'v3/vfx/vfx_muzzle_flash_sheet.png'),
    ('clipboard-2026-08-13T13-50-25-847Z-09a0742d.jpg', 'v3/vfx/bul_player_sheet.png'),
    ('clipboard-2026-08-13T13-50-25-850Z-a2c0d0c1.jpg', 'v3/vfx/vfx_hit_star_sheet.png'),
]


def dilate(mask, iterations=1):
    m = mask.astype(np.uint8)
    for _ in range(iterations):
        m = (
            m |
            np.roll(m, 1, axis=0) | np.roll(m, -1, axis=0) |
            np.roll(m, 1, axis=1) | np.roll(m, -1, axis=1)
        )
    return m.astype(bool)


def distance_transform(mask):
    """Compute Manhattan distance from True pixels to nearest False pixel.
    mask=True means background (green); we want distance for foreground."""
    dist = np.zeros_like(mask, dtype=np.float32)
    work = ~mask  # foreground
    step = 1
    while True:
        eroded = (
            work &
            np.roll(work, 1, axis=0) & np.roll(work, -1, axis=0) &
            np.roll(work, 1, axis=1) & np.roll(work, -1, axis=1)
        )
        new_layer = work & ~eroded
        if not new_layer.any():
            break
        dist[new_layer] = step
        work = eroded
        step += 1
    return dist


def remove_green(img):
    """Remove pure green screen while preserving cyan/gold/white energy effects."""
    data = np.array(img.convert('RGBA'), dtype=np.float32)
    r, g, b, a = data[:, :, 0], data[:, :, 1], data[:, :, 2], data[:, :, 3]

    # Pure green background: green dominates and red/blue are both low
    green = (g > 180) & (r < 90) & (b < 90) & (g > r * 2.2) & (g > b * 2.2)
    # Slightly darker green edges
    green2 = (g > 140) & (r < 70) & (b < 70) & (g > r * 2.0) & (g > b * 2.0)
    mask = green | green2

    # Dilate mask to eat anti-aliased green fringes on object edges
    mask = dilate(mask, iterations=2)

    # Feather alpha: foreground pixels near green boundary get lower alpha
    dist = distance_transform(mask)
    feather = np.clip(dist / 3.0, 0, 1)
    a = a * feather

    data[:, :, 3] = a
    return Image.fromarray(np.clip(data, 0, 255).astype(np.uint8), 'RGBA')


def process(src, dst):
    img = Image.open(src).convert('RGBA')
    W, H = img.size
    cols, rows = 4, 2
    cw = (W // cols) * cols
    ch = (H // rows) * rows
    if cw != W or ch != H:
        img = img.crop((0, 0, cw, ch))
        W, H = cw, ch
    fw, fh = W // cols, H // rows

    cells = []
    for y in range(rows):
        for x in range(cols):
            cell = img.crop((x * fw, y * fh, (x + 1) * fw, (y + 1) * fh))
            cell = remove_green(cell)
            bbox = cell.getbbox()
            if bbox:
                cell = cell.crop(bbox)
            cells.append(cell)

    target_w, target_h = 1024, 512
    cell_out = target_w // cols

    out = Image.new('RGBA', (target_w, target_h), (0, 0, 0, 0))
    for i, cell in enumerate(cells):
        cw, ch = cell.size
        scale = min((cell_out - 8) / cw, (cell_out - 8) / ch) if cw > 0 and ch > 0 else 1
        new_w, new_h = max(1, int(cw * scale)), max(1, int(ch * scale))
        cell = cell.resize((new_w, new_h), Image.LANCZOS)
        px = (i % cols) * cell_out + (cell_out - new_w) // 2
        py = (i // cols) * cell_out + (cell_out - new_h) // 2
        out.paste(cell, (px, py), cell)

    os.makedirs(os.path.dirname(dst), exist_ok=True)
    out.save(dst)
    print(f'Saved {dst} ({out.size})')


def main():
    for src_name, rel_dst in JOBS:
        src = os.path.join(CLIPBOARD_DIR, src_name)
        dst = os.path.join(OUT_DIR, rel_dst)
        if not os.path.exists(src):
            print(f'Missing source: {src}')
            continue
        process(src, dst)


if __name__ == '__main__':
    main()
