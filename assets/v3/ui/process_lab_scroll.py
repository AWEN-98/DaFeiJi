from PIL import Image
import numpy as np
from pathlib import Path
import scipy.ndimage as ndimage

KEEP_INTERNAL_GREEN = False
FRINGE_PX = 2

src = Path('D:/WorkBuddy Stido/2026-08-12-12-58-18/prototype/assets/v3/ui/sources/ui_lab_scroll_green.png')
out = Path('D:/WorkBuddy Stido/2026-08-12-12-58-18/prototype/assets/v3/ui/special/ui_lab_scroll.png')

img = Image.open(src).convert('RGBA')
arr = np.array(img)
rgb = arr[..., :3]
alpha = arr[..., 3].astype(np.float32)

pure_green = (rgb[..., 0] < 20) & (rgb[..., 1] > 240) & (rgb[..., 2] < 20)

if KEEP_INTERNAL_GREEN:
    labeled, _ = ndimage.label(pure_green)
    h, w = labeled.shape
    edge_labels = set(np.unique(labeled[0, :]))
    edge_labels.update(np.unique(labeled[-1, :]))
    edge_labels.update(np.unique(labeled[:, 0]))
    edge_labels.update(np.unique(labeled[:, -1]))
    edge_labels.discard(0)
    green_mask = np.isin(labeled, list(edge_labels))
else:
    green_mask = pure_green

alpha[green_mask] = 0

if FRINGE_PX > 0:
    transparent = alpha == 0
    struct = ndimage.generate_binary_structure(2, 2)
    fringe = ndimage.binary_dilation(transparent, structure=struct, iterations=FRINGE_PX)
    greenish = (rgb[..., 1] > 140) & (rgb[..., 1] > rgb[..., 0] + 30) & (rgb[..., 1] > rgb[..., 2] + 30)
    alpha[fringe & greenish & (~green_mask)] = 0

arr[..., 3] = alpha.astype(np.uint8)
arr[alpha == 0, :3] = 0

arr[0, 0, 3] = 0
arr[0, -1, 3] = 0
arr[-1, 0, 3] = 0
arr[-1, -1, 3] = 0

out_img = Image.fromarray(arr, mode='RGBA')
out_img.save(out, format='PNG')

a = np.array(out_img)
print('size', out_img.size, 'mode', out_img.mode)
print('corner alpha:', a[0,0,3], a[0,-1,3], a[-1,0,3], a[-1,-1,3])
og = ((a[...,3] > 0) & (a[...,0] < 20) & (a[...,1] > 240) & (a[...,2] < 20)).sum()
ag = ((a[...,0] < 20) & (a[...,1] > 240) & (a[...,2] < 20)).sum()
print('opaque_green', int(og), 'any_green', int(ag))
