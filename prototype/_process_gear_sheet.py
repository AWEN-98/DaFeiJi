from PIL import Image
from pathlib import Path

src = Path("assets/v4/gear/gear_sheet_raw.jpg")
out_dir = Path("assets/v4/gear")
out_dir.mkdir(parents=True, exist_ok=True)

img = Image.open(src).convert("RGBA")
w, h = img.size
rows, cols = 5, 3
cell_w = w / cols
cell_h = h / rows

def green_key(im):
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            diff = g - max(r, b)
            if diff > 55:
                px[x, y] = (0, 0, 0, 0)
            elif diff < 5:
                pass
            else:
                t = (diff - 5) / 50
                px[x, y] = (r, g, b, int((1 - t) * a))
    return im

def solid_bbox(im, thresh=80):
    alpha = im.getchannel('A')
    bbox = alpha.getbbox()
    if not bbox:
        return None
    left, top, right, bottom = bbox
    # shrink to solid core
    for y in range(top, bottom):
        solid = False
        for x in range(left, right):
            if alpha.getpixel((x, y)) >= thresh:
                solid = True; break
        if solid:
            top = y; break
    for y in range(bottom - 1, top - 1, -1):
        solid = False
        for x in range(left, right):
            if alpha.getpixel((x, y)) >= thresh:
                solid = True; break
        if solid:
            bottom = y + 1; break
    for x in range(left, right):
        solid = False
        for y in range(top, bottom):
            if alpha.getpixel((x, y)) >= thresh:
                solid = True; break
        if solid:
            left = x; break
    for x in range(right - 1, left - 1, -1):
        solid = False
        for y in range(top, bottom):
            if alpha.getpixel((x, y)) >= thresh:
                solid = True; break
        if solid:
            right = x + 1; break
    return (left, top, right, bottom)

def largest_component_bbox(im, thresh=80):
    alpha = im.getchannel('A')
    w, h = im.size
    visited = bytearray(w * h)
    best = None
    best_area = 0
    for y in range(h):
        for x in range(w):
            idx = y * w + x
            if visited[idx] or alpha.getpixel((x, y)) < thresh:
                continue
            # BFS
            stack = [(x, y)]
            visited[idx] = 1
            minx, miny, maxx, maxy = x, y, x, y
            count = 0
            while stack:
                cx, cy = stack.pop()
                count += 1
                minx = min(minx, cx); maxx = max(maxx, cx)
                miny = min(miny, cy); maxy = max(maxy, cy)
                for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
                    nx, ny = cx + dx, cy + dy
                    if 0 <= nx < w and 0 <= ny < h:
                        nidx = ny * w + nx
                        if not visited[nidx] and alpha.getpixel((nx, ny)) >= thresh:
                            visited[nidx] = 1
                            stack.append((nx, ny))
            area = (maxx - minx) * (maxy - miny)
            if area > best_area:
                best_area = area
                best = (minx, miny, maxx + 1, maxy + 1)
    return best

names = ['armor', 'core', 'ammo']
rarity = ['common', 'uncommon', 'rare', 'epic', 'legendary']

for r in range(rows):
    for c in range(cols):
        x0 = int(round(c * cell_w))
        y0 = int(round(r * cell_h))
        x1 = int(round((c + 1) * cell_w))
        y1 = int(round((r + 1) * cell_h))
        cell = img.crop((x0, y0, x1, y1))
        cell = green_key(cell)
        # Use largest component + small inset to avoid neighbor bleed
        bbox = largest_component_bbox(cell, thresh=80)
        if bbox:
            left, top, right, bottom = bbox
            # extra bottom inset: gear has hanging tassels/glow that may cross row boundary
            bottom = max(top + 10, bottom - 12)
            # slight all-side inset
            left = min(right - 10, left + 2)
            right = max(left + 10, right - 2)
            top = min(bottom - 10, top + 2)
            crop = cell.crop((left, top, right, bottom))
        else:
            crop = cell
        # force low-alpha edge pixels transparent
        px = crop.load()
        for y in range(crop.height):
            for x in range(crop.width):
                if px[x, y][3] < 40:
                    px[x, y] = (0, 0, 0, 0)
        out_path = out_dir / f"gear_{names[c]}_{rarity[r]}.png"
        crop.save(out_path)
        print(out_path.name, crop.size)

print("done")
