#!/usr/bin/env python3
"""
处理外部纯白背景的 UI 单体图：
- 只移除与画布边缘连通的接近纯白像素（背景）
- 保留内部的米黄纸面/卷面（不连通边缘，不会被误伤）
- 边缘做 1~2px 去白边
- 透明像素 RGB 清零，四角 alpha 强制为 0
"""
from pathlib import Path
import numpy as np
from PIL import Image
import scipy.ndimage as ndimage

ROOT = Path("D:/WorkBuddy Stido/2026-08-12-12-58-18/prototype/assets/v3/ui")
WHITE_THRESH = 240
FRINGE_PX = 2


def remove_white_bg(src_path: Path, out_path: Path, expected_size=None):
    img = Image.open(src_path).convert("RGBA")
    arr = np.array(img)
    rgb = arr[..., :3]
    alpha = arr[..., 3].astype(np.float32)

    # 1) 接近纯白（背景）的掩码
    near_white = (rgb[..., 0] >= WHITE_THRESH) & (rgb[..., 1] >= WHITE_THRESH) & (rgb[..., 2] >= WHITE_THRESH)

    # 2) 只移除与画布边缘连通的背景
    labeled, _ = ndimage.label(near_white)
    h, w = labeled.shape
    edge_labels = set(np.unique(labeled[0, :]))
    edge_labels.update(np.unique(labeled[-1, :]))
    edge_labels.update(np.unique(labeled[:, 0]))
    edge_labels.update(np.unique(labeled[:, -1]))
    edge_labels.discard(0)
    white_mask = np.isin(labeled, list(edge_labels))
    alpha[white_mask] = 0

    # 3) 去白边：透明边缘扩张后，把接近白色的像素也透明化
    if FRINGE_PX > 0:
        transparent = alpha == 0
        struct = ndimage.generate_binary_structure(2, 2)
        fringe = ndimage.binary_dilation(transparent, structure=struct, iterations=FRINGE_PX)
        # 比纯白稍宽一点的白边也去掉
        whiteish = (rgb[..., 0] >= 200) & (rgb[..., 1] >= 200) & (rgb[..., 2] >= 200)
        alpha[fringe & whiteish & (~white_mask)] = 0

    # 4) 清零透明像素 RGB
    arr[..., 3] = alpha.astype(np.uint8)
    arr[alpha == 0, :3] = 0

    # 5) 强制四角透明
    arr[0, 0, 3] = 0
    arr[0, -1, 3] = 0
    arr[-1, 0, 3] = 0
    arr[-1, -1, 3] = 0

    out = Image.fromarray(arr, mode="RGBA")
    if expected_size:
        out = out.resize(expected_size, Image.LANCZOS)
    out.save(out_path, format="PNG")

    # 验收
    a = np.array(out)
    print(f"Saved: {out_path}")
    print(f"  size: {out.size}")
    print(f"  corners alpha: {a[0,0,3]}, {a[0,-1,3]}, {a[-1,0,3]}, {a[-1,-1,3]}")
    white_left = ((a[..., 3] > 0) & (a[..., 0] >= WHITE_THRESH) & (a[..., 1] >= WHITE_THRESH) & (a[..., 2] >= WHITE_THRESH)).sum()
    print(f"  opaque near-white pixels left: {int(white_left)}")
    return out


if __name__ == "__main__":
    remove_white_bg(
        ROOT / "sources" / "ui_codex_book.jpg",
        ROOT / "special" / "ui_codex_book.png",
    )
    remove_white_bg(
        ROOT / "sources" / "ui_lab_scroll_new.jpg",
        ROOT / "special" / "ui_lab_scroll.png",
    )
