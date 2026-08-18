from PIL import Image
from collections import deque
import os

SRC = 'D:/WorkBuddy Stido/2026-08-12-12-58-18/prototype/assets/v4/monsters/monster_sheet_green.jpg'
OUT_DIR = 'D:/WorkBuddy Stido/2026-08-12-12-58-18/prototype/assets/v4/monsters'
PAD_PCT = 0.04

def key_green(im):
    w, h = im.size
    px = im.load()
    out = Image.new('RGBA', (w, h))
    opx = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y][:3]
            # 绿幕强度：绿色超过红/蓝多少
            greenness = g - max(r, b)
            if greenness > 55:
                a = 0
            elif greenness < 5:
                a = 255
            else:
                a = int(255 * (1.0 - (greenness - 5) / 50.0))
                if a < 0: a = 0
                if a > 255: a = 255
            opx[x, y] = (r, g, b, a)
    return out

def connected_components(alpha, w, h, threshold=15):
    visited = bytearray(w * h)
    components = []
    for y in range(h):
        base = y * w
        for x in range(w):
            idx = base + x
            if alpha[idx] <= threshold or visited[idx]:
                continue
            q = deque([(x, y)])
            visited[idx] = 1
            minx, maxx, miny, maxy = x, x, y, y
            while q:
                cx, cy = q.popleft()
                if cx < minx: minx = cx
                if cx > maxx: maxx = cx
                if cy < miny: miny = cy
                if cy > maxy: maxy = cy
                b = cy * w
                ni = b + cx + 1
                if cx + 1 < w and alpha[ni] > threshold and not visited[ni]:
                    visited[ni] = 1; q.append((cx + 1, cy))
                ni = b + cx - 1
                if cx - 1 >= 0 and alpha[ni] > threshold and not visited[ni]:
                    visited[ni] = 1; q.append((cx - 1, cy))
                ni = b + cx + w
                if cy + 1 < h and alpha[ni] > threshold and not visited[ni]:
                    visited[ni] = 1; q.append((cx, cy + 1))
                ni = b + cx - w
                if cy - 1 >= 0 and alpha[ni] > threshold and not visited[ni]:
                    visited[ni] = 1; q.append((cx, cy - 1))
            area = (maxx - minx + 1) * (maxy - miny + 1)
            components.append((minx, miny, maxx, maxy, area))
    return components

def main():
    im = Image.open(SRC).convert('RGB')
    keyed = key_green(im)
    keyed.save(os.path.join(OUT_DIR, 'monster_sheet.png'))
    print('saved monster_sheet.png')

    w, h = keyed.size
    px = keyed.load()
    alpha = bytearray(w * h)
    for y in range(h):
        for x in range(w):
            alpha[y*w + x] = px[x, y][3]

    components = connected_components(alpha, w, h)
    if len(components) < 8:
        print(f'WARNING: only {len(components)} components found, expected 8')
        return

    components.sort(key=lambda c: -c[4])
    top8 = components[:8]

    # Group into 2 rows by y-center, then sort each row by x
    by_y = sorted(top8, key=lambda c: (c[1] + c[3]) / 2)
    GAP_THRESH = h // 4
    rows = []
    current = []
    last_y = None
    for c in by_y:
        cy = (c[1] + c[3]) / 2
        if last_y is None or cy - last_y < GAP_THRESH:
            current.append(c)
        else:
            rows.append(current)
            current = [c]
        last_y = cy
    if current:
        rows.append(current)

    if len(rows) != 2:
        print(f'WARNING: expected 2 rows, got {len(rows)}; falling back to equal grid')
        by_y = sorted(top8, key=lambda c: (c[1] + c[3]) / 2)
        rows = [by_y[:4], by_y[4:]]

    pad = max(4, int(min(w, h) * PAD_PCT))
    for row_idx, row in enumerate(rows):
        row.sort(key=lambda c: (c[0] + c[2]) / 2)
        for col_idx, (minx, miny, maxx, maxy, area) in enumerate(row):
            x1 = max(0, minx - pad)
            y1 = max(0, miny - pad)
            x2 = min(w, maxx + pad + 1)
            y2 = min(h, maxy + pad + 1)
            cropped = keyed.crop((x1, y1, x2, y2))
            out_path = os.path.join(OUT_DIR, f'monster_r{row_idx}_c{col_idx}.png')
            cropped.save(out_path)
            print(f'saved {out_path}  bbox=({minx},{miny},{maxx},{maxy})  size={cropped.size}')

if __name__ == '__main__':
    main()
