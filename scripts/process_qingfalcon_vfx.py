import os
from PIL import Image
import numpy as np

ASSETS = [
    {
        "src": r"C:\Users\10430\.workbuddy\clipboard-images\clipboard-2026-08-13T12-29-27-194Z-7d4bf7ad.jpg",
        "name": "vfx_muzzle_flash_sheet.png",
        "cols": 4,
        "rows": 2,
        "cell": 256,
    },
    {
        "src": r"C:\Users\10430\.workbuddy\clipboard-images\clipboard-2026-08-13T12-29-27-196Z-09a0742d.jpg",
        "name": "bul_player_sheet.png",
        "cols": 4,
        "rows": 2,
        "cell": 256,
    },
    {
        "src": r"C:\Users\10430\.workbuddy\clipboard-images\clipboard-2026-08-13T12-29-27-199Z-a2c0d0c1.jpg",
        "name": "vfx_hit_star_sheet.png",
        "cols": 4,
        "rows": 2,
        "cell": 256,
    },
]

OUT_DIR = r"D:\WorkBuddy Stido\2026-08-12-12-58-18\prototype\assets\v3\vfx"


def remove_green_screen(src_path):
    im = Image.open(src_path).convert("RGB")
    arr = np.array(im, dtype=np.float32)
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]

    green_excess = np.minimum(g - r, g - b)
    alpha = np.clip(1.0 - (green_excess - 20) / 60, 0.0, 1.0)

    bright_green = (g > 200) & (g > r + 40) & (g > b + 40)
    alpha[bright_green] = 0.0

    dark_green = (g > r + 25) & (g > b + 25) & (g < 160)
    alpha[dark_green] *= 0.15

    green_spill = (g > r + 10) & (g > b + 10) & (alpha < 1.0) & (alpha > 0.0)
    arr[green_spill, 1] = np.minimum(
        arr[green_spill, 1],
        (arr[green_spill, 0] + arr[green_spill, 2]) * 0.55 + 10,
    )

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


def fit_in_square(im, target, padding=0.92):
    """Scale content to fit inside target square with a little padding, keep centered."""
    # Trim transparent borders first
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    w, h = im.size
    size = max(w, h)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ox = (size - w) // 2
    oy = (size - h) // 2
    canvas.paste(im, (ox, oy), im)
    # Scale to target with padding
    fit = int(round(target * padding))
    scaled = canvas.resize((fit, fit), Image.LANCZOS)
    final = Image.new("RGBA", (target, target), (0, 0, 0, 0))
    off = (target - fit) // 2
    final.paste(scaled, (off, off), scaled)
    return final


def process(asset):
    print(f"\nProcessing {asset['name']}...")
    im = remove_green_screen(asset["src"])
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
    out_path = os.path.join(OUT_DIR, asset["name"])
    sheet.save(out_path, "PNG")
    print(f"Saved: {out_path} ({sheet.size})")


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for asset in ASSETS:
        process(asset)


if __name__ == "__main__":
    main()
