from PIL import Image
import numpy as np
import os

SRC = r"C:\Users\10430\.workbuddy\clipboard-images\clipboard-2026-08-13T09-00-02-613Z-cbf398d2.jpg"
OUT_DIR = r"D:\WorkBuddy Stido\2026-08-12-12-58-18\prototype\assets\v3\player"
OUT_SHEET = os.path.join(OUT_DIR, "qingfalcon_idle_sheet.png")

im = Image.open(SRC).convert("RGBA")
arr = np.array(im)

# chroma key: bright green -> transparent
r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
green = (g > 190) & (r < 130) & (b < 130)
arr[green] = [0, 0, 0, 0]

# frame bands detected earlier
h_bands = [(38, 396), (481, 838)]
v_bands = [(21, 431), (463, 873), (904, 1315), (1347, 1758)]

# normalize frame sizes to max width/height
fw = max(b - a + 1 for a, b in v_bands)
fh = max(b - a + 1 for a, b in h_bands)

# build 4x2 sprite sheet
cols, rows = 4, 2
sheet = Image.new("RGBA", (cols * fw, rows * fh), (0, 0, 0, 0))

for row_idx, (y0, y1) in enumerate(h_bands):
    for col_idx, (x0, x1) in enumerate(v_bands):
        frame = Image.fromarray(arr[y0:y1 + 1, x0:x1 + 1])
        # center in fixed-size cell
        cx = (fw - frame.width) // 2
        cy = (fh - frame.height) // 2
        sheet.paste(frame, (col_idx * fw + cx, row_idx * fh + cy), frame)

os.makedirs(OUT_DIR, exist_ok=True)
sheet.save(OUT_SHEET)
print(f"saved {OUT_SHEET}: {sheet.size}")
