#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""重新裁切装备 5x3 等级精灵表：保留金属外框，Flood Fill + 颜色距离去除绿幕背景。"""
import os
import math
from collections import deque
from PIL import Image

SRC = r"D:\WorkBuddy Stido\2026-08-12-12-58-18\prototype\assets\v4\gear\gear_sheet_raw.jpg"
OUT_DIR = r"D:\WorkBuddy Stido\2026-08-12-12-58-18\prototype\assets\v4\gear"
ROWS, COLS = 5, 3
SLOTS = ['armor', 'core', 'ammo']
RARS = ['white', 'green', 'blue', 'purple', 'orange']


def green_dist(r, g, b):
    """到纯绿 (0,255,0) 的欧氏距离。"""
    return math.sqrt(r * r + (g - 255) * (g - 255) + b * b)


def is_green_bg(r, g, b):
    """判断是否为绿幕背景：颜色接近纯绿且亮度足够。"""
    if g < 100:
        return False
    return green_dist(r, g, b) < 95 or (g - max(r, b) >= 35)


def is_greenish(r, g, b):
    """判断像素是否偏绿（用于找出主体绿色发光 vs 绿幕残留）。"""
    return g > max(r, b) + 6


def remove_green_bg(img):
    """Flood Fill 去除连通的绿幕背景。"""
    w, h = img.size
    px = img.load()
    visited = [[False] * w for _ in range(h)]
    q = deque()

    for x in range(w):
        for y in [0, h - 1]:
            r, g, b = px[x, y][:3]
            if is_green_bg(r, g, b) and not visited[y][x]:
                visited[y][x] = True
                q.append((x, y))
    for y in range(h):
        for x in [0, w - 1]:
            r, g, b = px[x, y][:3]
            if is_green_bg(r, g, b) and not visited[y][x]:
                visited[y][x] = True
                q.append((x, y))

    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not visited[ny][nx]:
                r, g, b = px[nx, ny][:3]
                if is_green_bg(r, g, b):
                    visited[ny][nx] = True
                    q.append((nx, ny))

    for y in range(h):
        for x in range(w):
            if visited[y][x]:
                px[x, y] = (0, 0, 0, 0)
            else:
                r, g, b = px[x, y][:3]
                px[x, y] = (r, g, b, 255)
    return img


def refine_cell_green(cell_img):
    """对单个单元格：只保留面积最大的绿色连通域，其余绿色碎屑清除。"""
    w, h = cell_img.size
    px = cell_img.load()
    green_mask = [[is_greenish(*px[x, y][:3]) and px[x, y][3] > 0 for x in range(w)] for y in range(h)]
    visited = [[False] * w for _ in range(h)]
    components = []

    for y in range(h):
        for x in range(w):
            if green_mask[y][x] and not visited[y][x]:
                comp = []
                q = deque([(x, y)])
                visited[y][x] = True
                while q:
                    cx, cy = q.popleft()
                    comp.append((cx, cy))
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < w and 0 <= ny < h and green_mask[ny][nx] and not visited[ny][nx]:
                            visited[ny][nx] = True
                            q.append((nx, ny))
                components.append(comp)

    if len(components) <= 1:
        return cell_img

    # 只保留最大绿色连通域，其余绿色像素按距离纯绿做羽化/清除
    largest = max(components, key=len)
    keep = set(largest)
    for comp in components:
        if comp is largest:
            continue
        for x, y in comp:
            r, g, b, a = px[x, y]
            d = green_dist(r, g, b)
            if d < 90:
                px[x, y] = (0, 0, 0, 0)
            elif d < 140:
                alpha = int(a * max(0, (d - 90) / 50))
                px[x, y] = (r, g, b, alpha)
    return cell_img


def remove_near_green_fringes(cell_img):
    """对非绿色像素中混入的零星绿色边缘像素做去绿（替换为附近非绿颜色）。"""
    w, h = cell_img.size
    px = cell_img.load()
    # 复制一份用于读取原值
    orig = [[px[x, y] for x in range(w)] for y in range(h)]
    for y in range(h):
        for x in range(w):
            r, g, b, a = orig[y][x]
            if a == 0:
                continue
            # 边缘绿色像素：g 明显高于 r,b，但不算主体大绿色
            if g > max(r, b) + 25 and green_dist(r, g, b) < 130:
                # 找 3x3 邻域内非绿且非透明的颜色加权平均
                sr, sg, sb, sw = 0, 0, 0, 0
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < w and 0 <= ny < h:
                            rr, gg, bb, aa = orig[ny][nx]
                            if aa > 0 and not (gg > max(rr, bb) + 15):
                                weight = aa
                                sr += rr * weight
                                sg += gg * weight
                                sb += bb * weight
                                sw += weight
                if sw > 0:
                    px[x, y] = (int(sr / sw), int(sg / sw), int(sb / sw), a)
                else:
                    # 没有邻居时降低 alpha
                    px[x, y] = (r, g, b, max(0, a - 120))
    return cell_img


def project(mask, axis):
    if axis == 0:
        return [sum(row[i] for row in mask) for i in range(len(mask[0]))]
    return [sum(row) for row in mask]


def find_seps(proj, n):
    total = len(proj)
    avg = total // n
    seps = []
    for i in range(1, n):
        start = max(0, i * avg - avg // 2)
        end = min(total, i * avg + avg // 2)
        local_min = start + min(range(end - start), key=lambda k: proj[start + k])
        seps.append(local_min)
    return seps


def main():
    img = Image.open(SRC).convert('RGBA')
    cleaned = remove_green_bg(img)
    w, h = cleaned.size
    px = cleaned.load()

    mask = [[1 if px[x, y][3] > 30 else 0 for x in range(w)] for y in range(h)]
    col_seps = find_seps(project(mask, axis=0), COLS)
    row_seps = find_seps(project(mask, axis=1), ROWS)

    x_bounds = [0] + col_seps + [w]
    y_bounds = [0] + row_seps + [h]

    print(f"Image size: {w}x{h}")
    print(f"Col seps: {col_seps}")
    print(f"Row seps: {row_seps}")

    for ri in range(ROWS):
        for ci in range(COLS):
            x1, x2 = x_bounds[ci], x_bounds[ci + 1]
            y1, y2 = y_bounds[ri], y_bounds[ri + 1]
            cell = cleaned.crop((x1, y1, x2, y2)).copy()
            cell = refine_cell_green(cell)
            cell = remove_near_green_fringes(cell)
            cpx = cell.load()
            cw, ch = cell.size
            minx, maxx = cw, 0
            miny, maxy = ch, 0
            has = False
            for y in range(ch):
                for x in range(cw):
                    if cpx[x, y][3] > 30:
                        has = True
                        if x < minx: minx = x
                        if x > maxx: maxx = x
                        if y < miny: miny = y
                        if y > maxy: maxy = y
            if not has:
                print(f"Empty cell {ri},{ci}")
                continue
            maxx += 1
            maxy += 1
            # 内缩一点，裁掉可能跨单元格的半透明边界
            inset_x = 3
            inset_y = 5
            bx1 = max(0, minx - 2 + inset_x)
            by1 = max(0, miny - 2 + inset_y)
            bx2 = min(cw, maxx + 2 - inset_x)
            by2 = min(ch, maxy + 2 - inset_y)
            if bx2 <= bx1 or by2 <= by1:
                bx1, bx2 = max(0, minx - 2), min(cw, maxx + 2)
                by1, by2 = max(0, miny - 2), min(ch, maxy + 2)
            final = cell.crop((bx1, by1, bx2, by2))
            name = f"gear_{SLOTS[ci]}_{RARS[ri]}.png"
            out_path = os.path.join(OUT_DIR, name)
            final.save(out_path)
            print(f"Saved {name} ({final.size})")


if __name__ == '__main__':
    main()
