from PIL import Image
import numpy as np
import os

SRC_PATH = r"C:\Users\10430\.workbuddy\clipboard-images\clipboard-2026-08-13T12-49-53-634Z-45d693d8.jpg"
OUT_PATH = r"D:\WorkBuddy Stido\2026-08-12-12-58-18\prototype\assets\v3\player\xuanwu_idle_sheet.png"

COLS, ROWS = 4, 2
CELL_W = 400
CELL_H = 400
FIT_SIZE = 370  # leave margin so frames don't touch edges

def remove_green(arr):
    """Remove green screen and suppress green spill. Returns RGBA array."""
    r = arr[:, :, 0].astype(np.float32)
    g = arr[:, :, 1].astype(np.float32)
    b = arr[:, :, 2].astype(np.float32)

    # Green screen: green is high and dominant
    mask = (g > 130) & (g > r + 15) & (g > b + 15)
    strong = (g > 200) & (r < 160) & (b < 160)
    mask = mask | strong

    out = np.dstack([arr[:, :, 0], arr[:, :, 1], arr[:, :, 2], np.where(mask, 0, 255).astype(np.uint8)])

    # Suppress green spill on edge pixels
    removed = out[:, :, 3] == 0
    if not removed.any():
        return out
    h, w = removed.shape
    neighbor = np.zeros_like(removed)
    neighbor[1:, :] |= removed[:-1, :]
    neighbor[:-1, :] |= removed[1:, :]
    neighbor[:, 1:] |= removed[:, :-1]
    neighbor[:, :-1] |= removed[:, 1:]
    spill = neighbor & ~removed
    out[spill, 1] = (out[spill, 1] * 0.55).astype(np.uint8)
    out[spill, 0] = np.clip(out[spill, 0] * 1.05, 0, 255).astype(np.uint8)
    out[spill, 2] = np.clip(out[spill, 2] * 1.05, 0, 255).astype(np.uint8)
    return out

def process_sheet(src_path, out_path):
    im = Image.open(src_path).convert("RGB")
    # Resize to exact multiple of cell grid to avoid sub-pixel frame boundaries
    target_w = CELL_W * COLS
    target_h = CELL_H * ROWS
    im = im.resize((target_w, target_h), Image.LANCZOS)
    arr = np.array(im)
    cleaned = Image.fromarray(remove_green(arr), "RGBA")

    # Extract cells
    cells = []
    max_dim = 0
    for row in range(ROWS):
        for col in range(COLS):
            left = col * CELL_W
            upper = row * CELL_H
            right = left + CELL_W
            lower = upper + CELL_H
            cell = cleaned.crop((left, upper, right, lower))
            bbox = cell.getbbox()
            if bbox:
                cw = bbox[2] - bbox[0]
                ch = bbox[3] - bbox[1]
                max_dim = max(max_dim, max(cw, ch))
            cells.append((cell, bbox))

    # Single scale for all frames to prevent animation jitter
    scale = 1.0 if max_dim <= FIT_SIZE else FIT_SIZE / max_dim

    # Compose output
    out = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
    for idx, (cell, bbox) in enumerate(cells):
        col = idx % COLS
        row = idx // COLS
        if bbox:
            cropped = cell.crop(bbox)
            new_w = max(1, int(round(cropped.width * scale)))
            new_h = max(1, int(round(cropped.height * scale)))
            scaled = cropped.resize((new_w, new_h), Image.LANCZOS)
        else:
            scaled = Image.new("RGBA", (1, 1), (0, 0, 0, 0))

        paste_x = col * CELL_W + (CELL_W - scaled.width) // 2
        paste_y = row * CELL_H + (CELL_H - scaled.height) // 2
        out.paste(scaled, (paste_x, paste_y), scaled)

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    out.save(out_path)
    print(f"Saved {out_path} ({out.size}) scale={scale:.3f}")

if __name__ == "__main__":
    process_sheet(SRC_PATH, OUT_PATH)
