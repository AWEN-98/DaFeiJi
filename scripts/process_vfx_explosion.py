import os
from PIL import Image
import numpy as np

SRC = r"C:\Users\10430\.workbuddy\clipboard-images\clipboard-2026-08-13T11-37-33-246Z-1502b89f.jpg"
OUT_DIR = r"D:\WorkBuddy Stido\2026-08-12-12-58-18\prototype\assets\v3\vfx"
OUT_NAME = "vfx_explosion_sheet.png"
COLS, ROWS = 4, 2
OUT_CELL = 256

def remove_green_screen(src_path):
    im = Image.open(src_path).convert("RGB")
    arr = np.array(im, dtype=np.float32)
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    
    # Green dominance: how much green exceeds red and blue
    green_excess = np.minimum(g - r, g - b)
    
    # Base alpha: 1.0 where no green dominance, 0.0 where strong green dominance
    # Strong green screen: green_excess > 80 => fully transparent
    # Moderate fringe: green_excess 20-80 => fade out
    alpha = np.clip(1.0 - (green_excess - 20) / 60, 0.0, 1.0)
    
    # Also catch very bright saturated green
    bright_green = (g > 200) & (g > r + 40) & (g > b + 40)
    alpha[bright_green] = 0.0
    
    # Dark green fringe (spill into shadows)
    dark_green = (g > r + 25) & (g > b + 25) & (g < 160)
    alpha[dark_green] *= 0.15
    
    # Suppress green channel spill in semi-transparent areas
    green_spill = (g > r + 10) & (g > b + 10) & (alpha < 1.0) & (alpha > 0.0)
    arr[green_spill, 1] = np.minimum(arr[green_spill, 1], 
                                     (arr[green_spill, 0] + arr[green_spill, 2]) * 0.55 + 10)
    
    # Build RGBA
    rgba = np.dstack([arr, alpha * 255])
    rgba = np.clip(rgba, 0, 255).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")

def divide_grid(im, cols, rows):
    w, h = im.size
    fw = w / cols
    fh = h / rows
    cells = []
    for y in range(rows):
        for x in range(cols):
            left = int(round(x * fw))
            top = int(round(y * fh))
            right = int(round((x + 1) * fw))
            bottom = int(round((y + 1) * fh))
            cells.append(im.crop((left, top, right, bottom)))
    return cells

def center_crop_to_square(im, target):
    w, h = im.size
    size = max(w, h)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ox = (size - w) // 2
    oy = (size - h) // 2
    canvas.paste(im, (ox, oy), im)
    return canvas.resize((target, target), Image.LANCZOS)

def main():
    print("Removing green screen with spill suppression...")
    im = remove_green_screen(SRC)
    
    print(f"Dividing into {COLS}x{ROWS} grid...")
    cells = divide_grid(im, COLS, ROWS)
    
    print("Building sprite sheet...")
    sheet = Image.new("RGBA", (COLS * OUT_CELL, ROWS * OUT_CELL), (0, 0, 0, 0))
    for i, cell in enumerate(cells):
        sq = center_crop_to_square(cell, OUT_CELL)
        cx = (i % COLS) * OUT_CELL
        cy = (i // COLS) * OUT_CELL
        sheet.paste(sq, (cx, cy), sq)
        print(f"  Frame {i+1}: {cell.size} -> {OUT_CELL}x{OUT_CELL}")
    
    out_path = os.path.join(OUT_DIR, OUT_NAME)
    sheet.save(out_path, "PNG")
    print(f"Saved: {out_path} ({sheet.size})")

if __name__ == "__main__":
    main()
