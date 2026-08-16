#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
《空域基地》UI 绿幕资产处理管线 v2

处理流程：
1. 移除 #00FF00 绿幕（默认移除全部纯绿，包括内部）。
2. 输出带真实 Alpha 通道的 RGBA PNG。
3. 保留透明整图到 atlas/。
4. 按真实图案分割原图，再把每个独立图案居中放入规范大小的画布，输出到 sliced/。
5. 输出 assets_manifest.json。

关键改进：
- 不再按等分网格硬切（原图图案有出血/重叠，硬切会混入相邻内容）。
- 改为用 alpha 连通区域识别每个独立图案，按中心点聚类回 R×C 语义，
  最后居中到规范 cell_w×cell_h 画布。
"""

import os
import json
from pathlib import Path
from dataclasses import dataclass, field
from typing import List, Tuple

import numpy as np
from PIL import Image
from scipy import ndimage


ROOT = Path(__file__).parent.resolve()
SRC_DIR = ROOT / "sources"
ATLAS_DIR = ROOT / "atlas"
SLICED_DIR = ROOT / "sliced"
SPECIAL_DIR = ROOT / "special"
MANIFEST_PATH = ROOT / "assets_manifest.json"

# 调试开关：保存中间步骤供质检
SAVE_DEBUG = False
DEBUG_DIR = ROOT / "_debug"

# 是否保留图标内部的绿色（连边之外的纯绿）。
# False = 移除全部纯 #00FF00 绿幕（含内部孔洞/装饰）；True = 仅移除连边绿幕。
KEEP_INTERNAL_GREEN = False


@dataclass
class AtlasConfig:
    filename: str                       # 源文件名
    target_size: Tuple[int, int]        # 补齐目标尺寸 (w, h)
    cols: int
    rows: int
    cell_w: int
    cell_h: int
    names: List[List[str]]              # names[row][col]
    pad_align: str = "topleft"          # 补齐对齐
    fringe_px: int = 2                  # 去绿边像素宽度
    slice_mode: str = "adaptive"         # adaptive: 真实图案分割; uniform: 等分网格
    min_region_area: int = 50           # 自适应分割时过滤小噪声的阈值


# -----------------------------------------------------------------------------
# 命名配置
# -----------------------------------------------------------------------------
TABS = AtlasConfig(
    filename="atlas_tabs_green_v1.png",
    target_size=(1690, 932),
    cols=5, rows=4,
    cell_w=338, cell_h=233,
    names=[
        ["tab_hangar_normal",    "tab_arsenal_normal",    "tab_forge_normal",    "tab_lab_normal",    "tab_codex_normal"],
        ["tab_hangar_hover",     "tab_arsenal_hover",     "tab_forge_hover",     "tab_lab_hover",     "tab_codex_hover"],
        ["tab_hangar_selected",  "tab_arsenal_selected",  "tab_forge_selected",  "tab_lab_selected",  "tab_codex_selected"],
        ["tab_hangar_disabled",  "tab_arsenal_disabled",  "tab_forge_disabled",  "tab_lab_disabled",  "tab_codex_disabled"],
    ],
)

ICONS = AtlasConfig(
    filename="atlas_icons_green_v1.png",
    target_size=(1256, 1256),
    cols=4, rows=4,
    cell_w=314, cell_h=314,
    names=[
        ["icon_00", "icon_01", "icon_02", "icon_03"],
        ["icon_10", "icon_11", "icon_12", "icon_13"],
        ["icon_20", "icon_21", "icon_22", "icon_23"],
        ["icon_30", "icon_31", "icon_32", "icon_33"],
    ],
)

SLOTS = AtlasConfig(
    filename="atlas_slots_green_v1.png",
    target_size=(1256, 1254),
    cols=4, rows=3,
    cell_w=314, cell_h=418,
    names=[
        ["slot_weapon_normal", "slot_armor_normal", "slot_core_normal", "slot_ammo_normal"],
        ["slot_weapon_hover",  "slot_armor_hover",  "slot_core_hover",  "slot_ammo_hover"],
        ["slot_weapon_selected", "slot_armor_selected", "slot_core_selected", "slot_ammo_selected"],
    ],
)

RARITY = AtlasConfig(
    filename="atlas_rarity_green_v1.png",
    target_size=(1255, 1254),
    cols=5, rows=3,
    cell_w=251, cell_h=418,
    names=[
        ["rarity_common_ring",    "rarity_uncommon_ring",    "rarity_rare_ring",    "rarity_epic_ring",    "rarity_legendary_ring"],
        ["rarity_common_corner",  "rarity_uncommon_corner",  "rarity_rare_corner",  "rarity_epic_corner",  "rarity_legendary_corner"],
        ["rarity_common_emblem",  "rarity_uncommon_emblem",  "rarity_rare_emblem",  "rarity_epic_emblem",  "rarity_legendary_emblem"],
    ],
)

BUTTONS = AtlasConfig(
    filename="atlas_buttons_green_v1.png",
    target_size=(1536, 1026),
    cols=4, rows=3,
    cell_w=384, cell_h=342,
    names=[
        ["btn_primary_normal",   "btn_primary_hover",   "btn_primary_pressed",   "btn_primary_disabled"],
        ["btn_secondary_normal", "btn_secondary_hover", "btn_secondary_pressed", "btn_secondary_disabled"],
        ["btn_utility_normal",   "btn_utility_hover",   "btn_utility_pressed",   "btn_utility_disabled"],
    ],
)

CARDS = AtlasConfig(
    filename="atlas_cards_green_v1.png",
    target_size=(1536, 1026),
    cols=4, rows=3,
    cell_w=384, cell_h=342,
    names=[
        ["card_tier_normal",    "card_aircraft_normal",    "card_shop_normal",    "card_item_normal"],
        ["card_tier_selected",  "card_aircraft_selected",  "card_shop_selected",  "card_item_selected"],
        ["card_tier_locked",    "card_aircraft_locked",    "card_shop_locked",    "card_item_locked"],
    ],
)

ATLASES = [TABS, ICONS, SLOTS, RARITY, BUTTONS, CARDS]


# -----------------------------------------------------------------------------
# 核心处理函数
# -----------------------------------------------------------------------------
def ensure_dirs():
    for d in (SRC_DIR, ATLAS_DIR, SLICED_DIR, SPECIAL_DIR):
        d.mkdir(parents=True, exist_ok=True)
    if SAVE_DEBUG:
        DEBUG_DIR.mkdir(parents=True, exist_ok=True)


def is_pure_green_mask(rgb: np.ndarray, tolerance: int = 18) -> np.ndarray:
    r = rgb[..., 0].astype(np.int16)
    g = rgb[..., 1].astype(np.int16)
    b = rgb[..., 2].astype(np.int16)
    return (g >= 255 - tolerance) & (r <= tolerance) & (b <= tolerance)


def is_greenish_mask(rgb: np.ndarray) -> np.ndarray:
    r = rgb[..., 0].astype(np.int16)
    g = rgb[..., 1].astype(np.int16)
    b = rgb[..., 2].astype(np.int16)
    return (g > 120) & (g > r + 30) & (g > b + 30) & ((r < 100) | (b < 100))


def remove_green(img: Image.Image, fringe_px: int = 2, keep_internal_green: bool = False) -> Image.Image:
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    else:
        img = img.copy()

    arr = np.array(img)
    rgb = arr[..., :3]
    alpha = arr[..., 3].astype(np.float32)

    pure_green = is_pure_green_mask(rgb, tolerance=20)

    if keep_internal_green:
        labeled, _ = ndimage.label(pure_green)
        edge_labels = set()
        h, w = labeled.shape
        edge_labels.update(np.unique(labeled[0, :]))
        edge_labels.update(np.unique(labeled[-1, :]))
        edge_labels.update(np.unique(labeled[:, 0]))
        edge_labels.update(np.unique(labeled[:, -1]))
        edge_labels.discard(0)
        edge_mask = np.isin(labeled, list(edge_labels))
        alpha[edge_mask] = 0
        removed = edge_mask
    else:
        alpha[pure_green] = 0
        removed = pure_green

    if SAVE_DEBUG:
        debug = Image.fromarray((removed * 255).astype(np.uint8), mode="L")
        debug.save(DEBUG_DIR / "_debug_removed_mask.png")

    if fringe_px > 0:
        transparent = (alpha == 0)
        struct = ndimage.generate_binary_structure(2, 2)
        fringe_mask = ndimage.binary_dilation(transparent, structure=struct, iterations=fringe_px)
        greenish = is_greenish_mask(rgb)
        remove_mask = fringe_mask & greenish & (~removed)
        alpha[remove_mask] = 0

        if SAVE_DEBUG:
            debug2 = Image.fromarray((remove_mask * 255).astype(np.uint8), mode="L")
            debug2.save(DEBUG_DIR / "_debug_fringe_mask.png")

    arr[..., 3] = alpha.astype(np.uint8)
    arr[arr[..., 3] == 0, :3] = 0
    return Image.fromarray(arr, mode="RGBA")


def pad_to_size(img: Image.Image, size: Tuple[int, int], align: str = "topleft") -> Image.Image:
    tw, th = size
    iw, ih = img.size
    if iw == tw and ih == th:
        return img
    if iw > tw or ih > th:
        raise ValueError(f"源图 {img.size} 大于目标尺寸 {size}，无法补齐")

    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    if align == "center":
        x = (tw - iw) // 2
        y = (th - ih) // 2
    else:
        x, y = 0, 0
    canvas.paste(img, (x, y), img)
    return canvas


def place_patch_on_canvas(patch_img: Image.Image, canvas_w: int, canvas_h: int,
                          scale_if_needed: bool = True) -> Image.Image:
    """把已提取的图案居中放到规范画布上。若图案超出画布且 scale_if_needed=True 则等比缩放。"""
    canvas = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    pw, ph = patch_img.size

    if pw > canvas_w or ph > canvas_h:
        if scale_if_needed:
            scale = min(canvas_w / pw, canvas_h / ph)
            new_w = max(1, int(pw * scale))
            new_h = max(1, int(ph * scale))
            patch_img = patch_img.resize((new_w, new_h), Image.LANCZOS)
        else:
            # 不缩放则居中裁切（保留中心区域）
            left = (pw - canvas_w) // 2
            top = (ph - canvas_h) // 2
            patch_img = patch_img.crop((left, top, left + canvas_w, top + canvas_h))

    ox = (canvas_w - patch_img.width) // 2
    oy = (canvas_h - patch_img.height) // 2
    canvas.paste(patch_img, (ox, oy), patch_img)
    return canvas


def adaptive_slice(clean: Image.Image, cfg: AtlasConfig) -> List[Tuple[str, Image.Image]]:
    """
    真实图案分割：
    1) 对 alpha 做形态学闭合，避免同一图案被内部透明孔洞拆散；
    2) 连通区域标记，过滤噪声；
    3) 按中心点 y 坐标分 R 行，每行内按 x 坐标分 C 列；
    4) 每个图案放到 cfg.cell_w × cfg.cell_h 画布居中。
    """
    arr = np.array(clean)
    alpha = arr[..., 3]

    binary = (alpha > 0).astype(np.uint8)
    struct = ndimage.generate_binary_structure(2, 2)
    # 轻微闭合，合并同一图案的邻近碎片；iterations=2 对大多数 UI 足够
    closed = ndimage.binary_closing(binary, structure=struct, iterations=2)

    labeled, num = ndimage.label(closed)
    regions = []
    for i in range(1, num + 1):
        ys, xs = np.where(labeled == i)
        area = len(xs)
        if area < cfg.min_region_area:
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

    expected = cfg.rows * cfg.cols
    if len(regions) > expected:
        print(f"  [INFO] 检测到 {len(regions)} 个连通区域，按面积取前 {expected} 个")
        regions = sorted(regions, key=lambda r: r["area"], reverse=True)[:expected]
    elif len(regions) < expected:
        # 对图标/稀有度等细碎图案，放宽闭合力度再试一次
        print(f"  [INFO] 仅检测到 {len(regions)} 个区域，尝试更强闭合")
        closed2 = ndimage.binary_closing(binary, structure=ndimage.generate_binary_structure(2, 2), iterations=5)
        labeled2, num2 = ndimage.label(closed2)
        regions2 = []
        for i in range(1, num2 + 1):
            ys, xs = np.where(labeled2 == i)
            area = len(xs)
            if area < cfg.min_region_area:
                continue
            regions2.append({
                "cy": ys.mean(), "cx": xs.mean(),
                "y1": ys.min(), "y2": ys.max(),
                "x1": xs.min(), "x2": xs.max(),
                "area": area,
            })
        if len(regions2) >= expected:
            regions = sorted(regions2, key=lambda r: r["area"], reverse=True)[:expected]
        else:
            print(f"  [WARN] 仍只有 {len(regions2)} 个区域，将按均匀网格 fallback")
            return uniform_slice(clean, cfg)

    # 按 cy 排序分 R 行
    regions.sort(key=lambda r: r["cy"])
    row_groups = [regions[i * cfg.cols:(i + 1) * cfg.cols] for i in range(cfg.rows)]

    result = []
    for r_idx, group in enumerate(row_groups):
        if len(group) < cfg.cols:
            print(f"  [WARN] 第 {r_idx} 行只有 {len(group)} 个区域，fallback 整行")
            return uniform_slice(clean, cfg)
        group.sort(key=lambda r: r["cx"])
        for c_idx, region in enumerate(group):
            name = cfg.names[r_idx][c_idx]
            y1, y2 = region["y1"], region["y2"] + 1
            x1, x2 = region["x1"], region["x2"] + 1
            patch = arr[y1:y2, x1:x2]
            patch_img = Image.fromarray(patch, mode="RGBA")
            canvas = place_patch_on_canvas(patch_img, cfg.cell_w, cfg.cell_h, scale_if_needed=True)
            result.append((name, canvas))

    return result


def uniform_slice(clean: Image.Image, cfg: AtlasConfig) -> List[Tuple[str, Image.Image]]:
    """原始等分网格切法，作为 fallback。"""
    result = []
    for row in range(cfg.rows):
        for col in range(cfg.cols):
            name = cfg.names[row][col]
            x = col * cfg.cell_w
            y = row * cfg.cell_h
            cell = clean.crop((x, y, x + cfg.cell_w, y + cfg.cell_h))
            result.append((name, cell))
    return result


def verify_corners(img: Image.Image) -> bool:
    w, h = img.size
    px = img.load()
    corners = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    return all(px[x, y][3] == 0 for x, y in corners)


def process_atlas(cfg: AtlasConfig) -> dict:
    src_path = SRC_DIR / cfg.filename
    if not src_path.exists():
        print(f"[SKIP] 源文件不存在: {src_path}")
        return {}

    print(f"[PROCESS] {cfg.filename} -> {cfg.target_size} {cfg.cols}x{cfg.rows}")
    img = Image.open(src_path)
    if img.mode != "RGBA":
        img = img.convert("RGBA")

    img = pad_to_size(img, cfg.target_size, align=cfg.pad_align)
    clean = remove_green(img, fringe_px=cfg.fringe_px, keep_internal_green=KEEP_INTERNAL_GREEN)

    if not verify_corners(clean):
        print(f"[WARN] {cfg.filename} 四角仍有不透明像素，请检查")

    atlas_name = cfg.filename.replace("_green", "")
    atlas_path = ATLAS_DIR / atlas_name
    clean.save(atlas_path, format="PNG")
    print(f"  -> {atlas_path}")

    manifest = {
        "source": str(src_path),
        "atlas": str(atlas_path),
        "size": cfg.target_size,
        "grid": {"cols": cfg.cols, "rows": cfg.rows, "cell_w": cfg.cell_w, "cell_h": cfg.cell_h},
        "slices": [],
    }

    if cfg.slice_mode == "adaptive":
        slices = adaptive_slice(clean, cfg)
    else:
        slices = uniform_slice(clean, cfg)

    for name, cell in slices:
        if not verify_corners(cell):
            print(f"  [WARN] 单格四角不透明: {name}.png")
        out_path = SLICED_DIR / f"{name}.png"
        cell.save(out_path, format="PNG")
        # 反查 grid 位置
        for r_idx, row_names in enumerate(cfg.names):
            if name in row_names:
                c_idx = row_names.index(name)
                break
        else:
            r_idx, c_idx = -1, -1
        manifest["slices"].append({
            "file": f"{name}.png",
            "type": cfg.filename.split("_")[1],
            "name": name,
            "size": [cfg.cell_w, cfg.cell_h],
            "grid": [c_idx, r_idx],
            "source_atlas": atlas_name,
        })

    print(f"  -> {len(slices)} sliced PNGs")
    return manifest


def process_forge_table() -> dict:
    src_path = SRC_DIR / "ui_forge_table_green.png"
    if not src_path.exists():
        print(f"[SKIP] 熔炼台源文件不存在: {src_path}")
        return {}

    print("[PROCESS] ui_forge_table_green.png -> ui_forge_table.png")
    img = Image.open(src_path)
    if img.mode != "RGBA":
        img = img.convert("RGBA")

    if img.size != (800, 520):
        print(f"[WARN] 熔炼台尺寸 {img.size} 不是 800x520")

    clean = remove_green(img, fringe_px=2, keep_internal_green=KEEP_INTERNAL_GREEN)
    if not verify_corners(clean):
        print("[WARN] 熔炼台四角仍有不透明像素")

    out_path = SPECIAL_DIR / "ui_forge_table.png"
    clean.save(out_path, format="PNG")
    print(f"  -> {out_path}")

    return {
        "source": str(src_path),
        "file": "ui_forge_table.png",
        "size": [800, 520],
        "path": str(out_path),
    }


def main():
    ensure_dirs()
    manifest = {"atlases": [], "special": []}

    for cfg in ATLASES:
        entry = process_atlas(cfg)
        if entry:
            manifest["atlases"].append(entry)

    forge_entry = process_forge_table()
    if forge_entry:
        manifest["special"].append(forge_entry)

    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print(f"\n[MANIFEST] {MANIFEST_PATH}")


if __name__ == "__main__":
    main()
