#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试自适应分割：从原图中识别独立图案，再放到规范画布中居中。
"""

import numpy as np
from PIL import Image
from scipy import ndimage


def adaptive_slice(src_path: str, rows: int, cols: int, cell_w: int, cell_h: int, names: list, out_dir: str):
    img = Image.open(src_path).convert("RGBA")
    arr = np.array(img)
    alpha = arr[..., 3]

    # 二值化并轻微闭合，避免同一图案被内部透明孔洞拆成多个连通区域
    binary = (alpha > 0).astype(np.uint8)
    struct = ndimage.generate_binary_structure(2, 2)
    closed = ndimage.binary_closing(binary, structure=struct, iterations=2)

    labeled, num = ndimage.label(closed)
    print(f"{src_path}: {num} labeled regions")

    regions = []
    for i in range(1, num + 1):
        ys, xs = np.where(labeled == i)
        area = len(xs)
        if area < 100:  # 过滤小噪声
            continue
        regions.append({
            "cy": ys.mean(),
            "cx": xs.mean(),
            "y1": ys.min(),
            "y2": ys.max(),
            "x1": xs.min(),
            "x2": xs.max(),
            "area": area,
        })

    expected = rows * cols
    if len(regions) > expected:
        print(f"  take top {expected} by area")
        regions = sorted(regions, key=lambda r: r["area"], reverse=True)[:expected]

    if len(regions) < expected:
        print(f"  [WARN] only {len(regions)} regions found, expected {expected}")
        # 如果不够，尝试用闭合更强的结构元素重试？这里先简单处理
        return

    # 按 cy 排序，每 cols 个为一行
    regions.sort(key=lambda r: r["cy"])
    row_groups = [regions[i * cols:(i + 1) * cols] for i in range(rows)]

    import os
    os.makedirs(out_dir, exist_ok=True)

    for r_idx, group in enumerate(row_groups):
        group.sort(key=lambda r: r["cx"])
        for c_idx, region in enumerate(group):
            name = names[r_idx][c_idx]
            y1, y2 = region["y1"], region["y2"] + 1
            x1, x2 = region["x1"], region["x2"] + 1
            patch = arr[y1:y2, x1:x2]
            patch_img = Image.fromarray(patch, mode="RGBA")

            # 居中到规范画布，若超出则等比缩放
            canvas = Image.new("RGBA", (cell_w, cell_h), (0, 0, 0, 0))
            pw, ph = patch_img.size
            if pw > cell_w or ph > cell_h:
                scale = min(cell_w / pw, cell_h / ph)
                new_w, new_h = int(pw * scale), int(ph * scale)
                patch_img = patch_img.resize((new_w, new_h), Image.LANCZOS)
                print(f"  {name}: scaled {pw}x{ph} -> {new_w}x{new_h}")
            else:
                print(f"  {name}: {pw}x{ph}")

            ox = (cell_w - patch_img.width) // 2
            oy = (cell_h - patch_img.height) // 2
            canvas.paste(patch_img, (ox, oy), patch_img)
            out_path = f"{out_dir}/{name}.png"
            canvas.save(out_path)


if __name__ == "__main__":
    base = "D:/WorkBuddy Stido/2026-08-12-12-58-18/prototype/assets/v4/ui"
    out = "D:/WorkBuddy Stido/2026-08-12-12-58-18/prototype/assets/v3/ui/_debug_adaptive"

    # panel
    adaptive_slice(
        f"{base}/panels/panel_sheet.png",
        rows=3, cols=4, cell_w=384, cell_h=342,
        names=[
            ["card_tier_normal", "card_aircraft_normal", "card_shop_normal", "card_item_normal"],
            ["card_tier_selected", "card_aircraft_selected", "card_shop_selected", "card_item_selected"],
            ["card_tier_locked", "card_aircraft_locked", "card_shop_locked", "card_item_locked"],
        ],
        out_dir=f"{out}/panel"
    )

    # buttons
    adaptive_slice(
        f"{base}/buttons/btn_sheet.png",
        rows=3, cols=4, cell_w=384, cell_h=342,
        names=[
            ["btn_primary_normal", "btn_primary_hover", "btn_primary_pressed", "btn_primary_disabled"],
            ["btn_secondary_normal", "btn_secondary_hover", "btn_secondary_pressed", "btn_secondary_disabled"],
            ["btn_utility_normal", "btn_utility_hover", "btn_utility_pressed", "btn_utility_disabled"],
        ],
        out_dir=f"{out}/btn"
    )
