from PIL import Image
import numpy as np
import os

OUT_DIR = r"D:\WorkBuddy Stido\2026-08-12-12-58-18\prototype\assets\v3\player"
os.makedirs(OUT_DIR, exist_ok=True)

SPECS = [
    {
        "src": r"C:\Users\10430\.workbuddy\clipboard-images\clipboard-2026-08-13T09-11-36-409Z-e4cc71b8.jpg",
        "out": os.path.join(OUT_DIR, "xuanwu_idle_sheet.png"),
        "h_bands": [(11, 399), (469, 850)],
        "v_bands": [(32, 409), (474, 851), (911, 1295), (1350, 1739)],
        "label": "xuanwu (aircraft b)"
    },
    {
        "src": r"C:\Users\10430\.workbuddy\clipboard-images\clipboard-2026-08-13T09-11-36-413Z-687e0e75.jpg",
        "out": os.path.join(OUT_DIR, "fan_dancer_idle_sheet.png"),
        "h_bands": [(9, 431), (457, 864)],
        "v_bands": [(43, 398), (484, 845), (918, 1296), (1360, 1742)],
        "label": "fan dancer (aircraft c)"
    }
]

def process(spec):
    im = Image.open(spec["src"]).convert("RGBA")
    arr = np.array(im)

    # chroma key: bright green -> transparent
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    green = (g > 190) & (r < 130) & (b < 130)
    arr[green] = [0, 0, 0, 0]

    hb = spec["h_bands"]
    vb = spec["v_bands"]
    fw = max(x1 - x0 + 1 for x0, x1 in vb)
    fh = max(y1 - y0 + 1 for y0, y1 in hb)

    cols, rows = 4, 2
    sheet = Image.new("RGBA", (cols * fw, rows * fh), (0, 0, 0, 0))

    for row_idx, (y0, y1) in enumerate(hb):
        for col_idx, (x0, x1) in enumerate(vb):
            frame = Image.fromarray(arr[y0:y1 + 1, x0:x1 + 1])
            cx = (fw - frame.width) // 2
            cy = (fh - frame.height) // 2
            sheet.paste(frame, (col_idx * fw + cx, row_idx * fh + cy), frame)

    sheet.save(spec["out"])
    print(f"saved {spec['label']} -> {spec['out']}: {sheet.size}")

for spec in SPECS:
    process(spec)
