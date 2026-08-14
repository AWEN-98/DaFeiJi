"""Process 7 Chilan (赤鸾) green-screen sprite sheets -> transparent PNG sprite sheets."""
import os
from PIL import Image
import numpy as np

# 7 sprite sheets: 4 player anims + 3 VFX
# All are 8-frame, 4 cols x 2 rows
ASSETS = [
    # Player animations -> assets/v3/player/
    {"src": r"C:\Users\10430\.workbuddy\clipboard-images\clipboard-2026-08-13T14-19-57-843Z-b0a5e519.jpg",
     "name": "chilan_idle_sheet.png", "cols": 4, "rows": 2, "cell": 256,
     "out_dir": r"D:\WorkBuddy Stido\2026-08-12-12-58-18\prototype\assets\v3\player"},
    {"src": r"C:\Users\10430\.workbuddy\clipboard-images\clipboard-2026-08-13T14-19-57-847Z-146ef971.jpg",
     "name": "chilan_move_sheet.png", "cols": 4, "rows": 2, "cell": 256,
     "out_dir": r"D:\WorkBuddy Stido\2026-08-12-12-58-18\prototype\assets\v3\player"},
    {"src": r"C:\Users\10430\.workbuddy\clipboard-images\clipboard-2026-08-13T14-19-57-851Z-c7910e5f.jpg",
     "name": "chilan_dash_sheet.png", "cols": 4, "rows": 2, "cell": 256,
     "out_dir": r"D:\WorkBuddy Stido\2026-08-12-12-58-18\prototype\assets\v3\player"},
    {"src": r"C:\Users\10430\.workbuddy\clipboard-images\clipboard-2026-08-13T14-19-57-854Z-e6d7d7d7.jpg",
     "name": "chilan_attack_sheet.png", "cols": 4, "rows": 2, "cell": 256,
     "out_dir": r"D:\WorkBuddy Stido\2026-08-12-12-58-18\prototype\assets\v3\player"},
    # VFX -> assets/v3/vfx/
    {"src": r"C:\Users\10430\.workbuddy\clipboard-images\clipboard-2026-08-13T14-19-57-856Z-c923814c.jpg",
     "name": "vfx_chilan_muzzle_sheet.png", "cols": 4, "rows": 2, "cell": 256,
     "out_dir": r"D:\WorkBuddy Stido\2026-08-12-12-58-18\prototype\assets\v3\vfx"},
    {"src": r"C:\Users\10430\.workbuddy\clipboard-images\clipboard-2026-08-13T14-19-57-859Z-4a0711d8.jpg",
     "name": "bul_chilan_sheet.png", "cols": 4, "rows": 2, "cell": 256,
     "out_dir": r"D:\WorkBuddy Stido\2026-08-12-12-58-18\prototype\assets\v3\vfx"},
    {"src": r"C:\Users\10430\.workbuddy\clipboard-images\clipboard-2026-08-13T14-19-57-861Z-4c575a98.jpg",
     "name": "vfx_chilan_hit_sheet.png", "cols": 4, "rows": 2, "cell": 256,
     "out_dir": r"D:\WorkBuddy Stido\2026-08-12-12-58-18\prototype\assets\v3\vfx"},
]


def remove_green_screen(src_path):
    im = Image.open(src_path).convert("RGBA")
    arr = np.array(im, dtype=np.float32)
    r, g, b, a = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2], arr[:, :, 3]

    # Explicit bright green mask
    bright_green = (g > 180) & (r < 130) & (b < 130) & (g > r + 30) & (g > b + 30)
    # Catch turquoise / cyan-green blends near pure green background
    dist_to_green = np.sqrt(r * r + (g - 255.0) * (g - 255.0) + b * b)
    near_green = (dist_to_green < 150) & (g > r + 10) & (g > 120)
    alpha = np.where(bright_green | near_green, 0.0, a)

    # Soft green spill suppression
    green_excess = np.minimum(g - r, g - b)
    alpha = np.minimum(alpha, np.clip(1.0 - (green_excess - 20) / 60, 0.0, 1.0) * 255)
    dark_green = (g > r + 25) & (g > b + 25) & (g < 160)
    alpha[dark_green] *= 0.15

    # Desaturate green spill on semi-transparent edges
    green_spill = (g > r + 10) & (g > b + 10) & (alpha < 255.0) & (alpha > 0.0)
    arr[green_spill, 1] = np.minimum(
        arr[green_spill, 1],
        (arr[green_spill, 0] + arr[green_spill, 2]) * 0.55 + 10,
    )

    rgba = np.dstack([arr[:, :, :3], alpha])
    rgba = np.clip(rgba, 0, 255).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def divide_grid(im, cols, rows):
    w, h = im.size
    fw = w // cols
    fh = h // rows
    im = im.crop((0, 0, fw * cols, fh * rows))
    w, h = im.size
    cells = []
    for y in range(rows):
        for x in range(cols):
            left = x * fw
            top = y * fh
            right = (x + 1) * fw
            bottom = (y + 1) * fh
            cells.append(im.crop((left, top, right, bottom)))
    return cells


def fit_in_square(im, target, padding=0.92):
    """Scale content to fit inside target square with a little padding, keep centered."""
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    w, h = im.size
    size = max(w, h)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ox = (size - w) // 2
    oy = (size - h) // 2
    canvas.paste(im, (ox, oy), im)
    fit = int(round(target * padding))
    scaled = canvas.resize((fit, fit), Image.LANCZOS)
    final = Image.new("RGBA", (target, target), (0, 0, 0, 0))
    off = (target - fit) // 2
    final.paste(scaled, (off, off), scaled)
    return final


def process(asset):
    print(f"\nProcessing {asset['name']}...")
    im = remove_green_screen(asset["src"])
    print(f"  Source size: {im.size}")
    cells = divide_grid(im, asset["cols"], asset["rows"])
    sheet = Image.new(
        "RGBA",
        (asset["cols"] * asset["cell"], asset["rows"] * asset["cell"]),
        (0, 0, 0, 0),
    )
    for i, cell in enumerate(cells):
        sq = fit_in_square(cell, asset["cell"])
        cx = (i % asset["cols"]) * asset["cell"]
        cy = (i // asset["cols"]) * asset["cell"]
        sheet.paste(sq, (cx, cy), sq)
        print(f"  Frame {i+1}: {cell.size} -> {asset['cell']}x{asset['cell']}")
    os.makedirs(asset["out_dir"], exist_ok=True)
    out_path = os.path.join(asset["out_dir"], asset["name"])
    sheet.save(out_path, "PNG")
    print(f"  Saved: {out_path} ({sheet.size})")


def main():
    for asset in ASSETS:
        process(asset)
    print("\nAll 7 Chilan sprite sheets processed!")


if __name__ == "__main__":
    main()
