from PIL import Image
import numpy as np
import os

OUT_DIR = r"D:\WorkBuddy Stido\2026-08-12-12-58-18\prototype\assets\v3\player"
os.makedirs(OUT_DIR, exist_ok=True)

SPECS = [
    {
        "src": r"C:\Users\10430\.workbuddy\clipboard-images\clipboard-2026-08-13T09-47-16-993Z-fccdf7cf.jpg",
        "out": os.path.join(OUT_DIR, "qingfalcon_boost_sheet.png"),
        "label": "qingfalcon boost (aircraft a)"
    },
    {
        "src": r"C:\Users\10430\.workbuddy\clipboard-images\clipboard-2026-08-13T09-47-16-997Z-36a03d6d.jpg",
        "out": os.path.join(OUT_DIR, "xuanwu_boost_sheet.png"),
        "label": "xuanwu boost (aircraft b)"
    },
    {
        "src": r"C:\Users\10430\.workbuddy\clipboard-images\clipboard-2026-08-13T09-47-17-000Z-aab7ed69.jpg",
        "out": os.path.join(OUT_DIR, "fan_dancer_boost_sheet.png"),
        "label": "fan dancer boost (aircraft c)"
    },
]

def is_green(r, g, b):
    return (g > 170) & (r < 160) & (b < 160)

def process(spec):
    im = Image.open(spec["src"]).convert("RGBA")
    arr = np.array(im)

    # Remove green screen
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    green = is_green(r, g, b)
    arr[green] = [0, 0, 0, 0]

    h, w = arr.shape[:2]
    rows, cols = 2, 4
    cell_h = h // rows
    cell_w = w // cols

    # First pass: find max content bounding box across all cells
    frames = []
    max_fw, max_fh = 0, 0
    for row in range(rows):
        for col in range(cols):
            y0 = row * cell_h
            x0 = col * cell_w
            cell = arr[y0:y0 + cell_h, x0:x0 + cell_w]
            alpha = cell[:, :, 3]
            ys, xs = np.where(alpha > 0)
            if len(xs) == 0:
                frames.append(None)
                continue
            # Add small padding
            pad = 4
            bx0, bx1 = max(0, xs.min() - pad), min(cell_w - 1, xs.max() + pad)
            by0, by1 = max(0, ys.min() - pad), min(cell_h - 1, ys.max() + pad)
            frame = cell[by0:by1 + 1, bx0:bx1 + 1]
            frames.append(frame)
            max_fw = max(max_fw, frame.shape[1])
            max_fh = max(max_fh, frame.shape[0])

    # Second pass: assemble centered sheet
    sheet = Image.new("RGBA", (cols * max_fw, rows * max_fh), (0, 0, 0, 0))
    for idx, frame in enumerate(frames):
        if frame is None:
            continue
        row = idx // cols
        col = idx % cols
        fim = Image.fromarray(frame)
        cx = (max_fw - fim.width) // 2
        cy = (max_fh - fim.height) // 2
        sheet.paste(fim, (col * max_fw + cx, row * max_fh + cy), fim)

    sheet.save(spec["out"])
    print(f"saved {spec['label']} -> {spec['out']}: {sheet.size}")

if __name__ == "__main__":
    for spec in SPECS:
        process(spec)
