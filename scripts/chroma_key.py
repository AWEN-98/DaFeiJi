"""
绿幕色度键抠图脚本
- 角点采样绿色背景
- 绿色优势度判定（g - max(r,b)）
- 边缘羽化 + 去溢出（despill）
"""
import sys, os
import numpy as np
from PIL import Image

def chroma_key(input_path, output_path, tolerance=35, feather=20):
    img = Image.open(input_path).convert('RGB')
    arr = np.array(img, dtype=np.float64)
    h, w = arr.shape[:2]

    # 1) 角点采样：取四角各 15x15 区域的平均色
    cs = 15
    corners = [
        arr[:cs, :cs],
        arr[:cs, -cs:],
        arr[-cs:, :cs],
        arr[-cs:, -cs:],
    ]
    green_rgb = np.mean([c.mean(axis=(0, 1)) for c in corners], axis=0)
    print(f"  {os.path.basename(input_path)}: sampled green = ({green_rgb[0]:.0f}, {green_rgb[1]:.0f}, {green_rgb[2]:.0f})")

    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]

    # 2) 绿色优势度：g 比 max(r,b) 高多少
    greenness = g - np.maximum(r, b)

    # 3) Alpha 通道
    #    greenness > tolerance → 完全透明
    #    tolerance - feather < greenness <= tolerance → 渐变透明
    alpha = np.full((h, w), 255.0, dtype=np.float64)
    alpha[greenness > tolerance] = 0.0

    feather_mask = (greenness > (tolerance - feather)) & (greenness <= tolerance)
    if feather_mask.any():
        t = (greenness[feather_mask] - (tolerance - feather)) / feather
        alpha[feather_mask] = 255.0 * (1.0 - t)

    # 4) 去溢出（despill）：边缘残留绿色压制
    #    对非完全透明像素，如果绿色通道明显高于红蓝，压到 max(r,b) 水平
    spill_thresh = 8
    spill_mask = (alpha > 0) & (greenness > spill_thresh)
    if spill_mask.any():
        arr[spill_mask, 1] = np.maximum(arr[spill_mask, 0], arr[spill_mask, 2])

    # 5) 组装 RGBA
    rgba = np.dstack([arr, alpha]).astype(np.uint8)
    result = Image.fromarray(rgba, 'RGBA')
    result.save(output_path, 'PNG')

    transparent_pct = 100.0 * np.sum(alpha == 0) / (h * w)
    print(f"    -> {os.path.basename(output_path)}: {result.size}, transparent={transparent_pct:.1f}%")
    return result


if __name__ == '__main__':
    base = 'D:/WorkBuddy Stido/2026-08-12-12-58-18/prototype/assets/v4/ui/'

    sheets = [
        ('tabs/base_tab_sheet.png',    'tabs/base_tab_sheet.png'),
        ('icons/base_icons_sheet.png', 'icons/base_icons_sheet.png'),
        ('slots/equip_slots_sheet.png','slots/equip_slots_sheet.png'),
        ('rarity/rarity_trim_sheet.png','rarity/rarity_trim_sheet.png'),
        ('buttons/btn_sheet.png',      'buttons/btn_sheet.png'),
        ('panels/panel_sheet.png',     'panels/panel_sheet.png'),
    ]

    for src, dst in sheets:
        src_path = base + src
        dst_path = base + dst
        print(f"Processing: {src}")
        chroma_key(src_path, dst_path)

    print("\nAll done.")
