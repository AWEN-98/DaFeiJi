from PIL import Image
import os

ROOT = "D:/WorkBuddy Stido/2026-08-12-12-58-18/prototype"
SRC = os.path.join(ROOT, "assets/v4/bosses/boss_sheet_raw.jpg")
OUT_DIR = os.path.join(ROOT, "assets/v4/bosses")
NAMES = [
    ["boss_qiongqi", "boss_taowu"],
    ["boss_taotie", "boss_hundun"],
]

def key_green(img):
    """Green-screen key: strong green -> transparent."""
    rgba = img.convert("RGBA")
    px = rgba.load()
    w, h = rgba.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = rgba.getpixel((x, y))
            diff = g - max(r, b)
            if diff > 55:
                alpha = 0
            elif diff < 5:
                alpha = 255
            else:
                alpha = int(255 * (5 - diff) / (5 - 55))
                alpha = max(0, min(255, alpha))
            px[x, y] = (r, g, b, alpha)
    return rgba

def largest_solid_bbox(img, threshold=80):
    """Find bounding box of largest connected component above alpha threshold, with bottom inset."""
    w, h = img.size
    alpha = [img.getpixel((x, y))[3] for y in range(h) for x in range(w)]
    visited = [False] * (w * h)
    best = None
    for y in range(h):
        for x in range(w):
            idx = y * w + x
            if visited[idx] or alpha[idx] < threshold:
                continue
            # BFS
            stack = [(x, y)]
            visited[idx] = True
            minx, miny, maxx, maxy = x, y, x, y
            while stack:
                cx, cy = stack.pop()
                minx, miny = min(minx, cx), min(miny, cy)
                maxx, maxy = max(maxx, cx), max(maxy, cy)
                for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
                    nx, ny = cx + dx, cy + dy
                    if 0 <= nx < w and 0 <= ny < h:
                        nidx = ny * w + nx
                        if not visited[nidx] and alpha[nidx] >= threshold:
                            visited[nidx] = True
                            stack.append((nx, ny))
            area = (maxx - minx + 1) * (maxy - miny + 1)
            if best is None or area > best[0]:
                best = (area, minx, miny, maxx, maxy)
    if best is None:
        return (0, 0, w, h)
    _, minx, miny, maxx, maxy = best
    # extra bottom inset to kill row-bleed tails
    maxy = min(h - 1, maxy - 10)
    return (minx, miny, maxx + 1, maxy + 1)

def process():
    img = Image.open(SRC)
    W, H = img.size
    cell_w, cell_h = W // 2, H // 2
    for row in range(2):
        for col in range(2):
            left = col * cell_w
            upper = row * cell_h
            right = left + cell_w
            lower = upper + cell_h
            cell = img.crop((left, upper, right, lower))
            keyed = key_green(cell)
            bbox = largest_solid_bbox(keyed)
            cropped = keyed.crop(bbox)
            name = NAMES[row][col]
            out_path = os.path.join(OUT_DIR, f"{name}.png")
            cropped.save(out_path)
            print(f"Saved {out_path} size={cropped.size}")

if __name__ == "__main__":
    process()
