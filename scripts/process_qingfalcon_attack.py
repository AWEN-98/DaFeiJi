from PIL import Image
import numpy as np
import os

SRC = r"C:\Users\10430\.workbuddy\clipboard-images\clipboard-2026-08-13T12-04-50-149Z-2140419d.jpg"
OUT = r"D:\WorkBuddy Stido\2026-08-12-12-58-18\prototype\assets\v3\player\qingfalcon_attack_sheet.png"

CELL_W = 256
CELL_H = 256
COLS, ROWS = 4, 2
FIT_SIZE = 232

def remove_green(arr):
    """Remove green screen and suppress green spill. Returns RGBA array."""
    r, g, b = arr[:, :, 0].astype(np.float32), arr[:, :, 1].astype(np.float32), arr[:, :, 2].astype(np.float32)

    # Green screen: green is high and dominant
    mask = (g > 130) & (g > r + 15) & (g > b + 15)
    strong = (g > 200) & (r < 160) & (b < 160)
    mask = mask | strong

    # Convert to RGBA
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
    w, h = im.size
    arr = np.array(im)
    cleaned = Image.fromarray(remove_green(arr), "RGBA")

    cell_src_w = w / COLS
    cell_src_h = h / ROWS

    cells = []
    max_dim = 0
    for row in range(ROWS):
        for col in range(COLS):
            left = int(round(col * cell_src_w))
            upper = int(round(row * cell_src_h))
            right = int(round((col + 1) * cell_src_w))
            lower = int(round((row + 1) * cell_src_h))
            cell = cleaned.crop((left, upper, right, lower))
            bbox = cell.getbbox()
            if bbox:
                cw = bbox[2] - bbox[0]
                ch = bbox[3] - bbox[1]
                max_dim = max(max_dim, max(cw, ch))
            cells.append((cell, bbox))

    scale = 1.0 if max_dim <= FIT_SIZE else FIT_SIZE / max_dim

    out = Image.new("RGBA", (CELL_W * COLS, CELL_H * ROWS), (0, 0, 0, 0))
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

    out.save(out_path)
    print(f"Saved {out_path} ({out.size}) scale={scale:.3f}")


if __name__ == "__main__":
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    process_sheet(SRC, OUT)
