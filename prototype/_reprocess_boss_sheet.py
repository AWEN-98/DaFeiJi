from PIL import Image
import os
from collections import deque

ROOT = "D:/WorkBuddy Stido/2026-08-12-12-58-18/prototype"
SRC = os.path.join(ROOT, "assets/v4/bosses/boss_sheet_raw.jpg")
OUT_DIR = os.path.join(ROOT, "assets/v4/bosses")
NAMES = [
    ["boss_qiongqi", "boss_taowu"],
    ["boss_taotie", "boss_hundun"],
]

def rgb_to_hsv(r, g, b):
    r, g, b = r/255.0, g/255.0, b/255.0
    mx = max(r, g, b)
    mn = min(r, g, b)
    df = mx-mn
    if mx == mn:
        h = 0
    elif mx == r:
        h = (60 * ((g-b)/df) + 360) % 360
    elif mx == g:
        h = (60 * ((b-r)/df) + 120) % 360
    else:
        h = (60 * ((r-g)/df) + 240) % 360
    s = 0 if mx == 0 else df/mx
    v = mx
    return h, s, v

def key_green(img):
    """Diff-based green-screen key. Strong on screen green, leaves subject intact."""
    rgba = img.convert("RGBA")
    w, h = rgba.size
    px = rgba.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
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

def restore_interior_holes(keyed, original, radius=4, min_opaque_neighbors=0.55):
    """Restore transparent pixels that are clearly inside the silhouette.
    This fixes emerald gems/eyes that aggressive keying punched out."""
    w, h = keyed.size
    kpx = keyed.load()
    orig_rgba = original.convert("RGBA")
    opx = orig_rgba.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = kpx[x, y]
            if a > 30:
                continue
            count = 0
            total = 0
            for dy in range(-radius, radius + 1):
                for dx in range(-radius, radius + 1):
                    if dx == 0 and dy == 0:
                        continue
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h:
                        total += 1
                        if kpx[nx, ny][3] > 80:
                            count += 1
            if total > 0 and count / total >= min_opaque_neighbors:
                ro, go, bo, _ = opx[x, y]
                hsv = rgb_to_hsv(ro, go, bo)
                hue, sat, val = hsv
                is_screen = (60 <= hue <= 150) and (sat > 0.40) and (val > 0.25)
                if not is_screen:
                    kpx[x, y] = (ro, go, bo, 255)
    return keyed

def edge_despill(img, search_radius=8, mix=0.92):
    """Replace greenish residual fringe color with nearest opaque pixel color.
    Processes semi-transparent pixels and opaque pixels that sit right next to transparent areas."""
    w, h = img.size
    px = img.load()
    # edge mask: opaque-ish pixels adjacent to transparent
    edge = [[False] * h for _ in range(w)]
    for y in range(h):
        for x in range(w):
            if px[x, y][3] < 20:
                continue
            near = False
            for dy in range(-2, 3):
                for dx in range(-2, 3):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] < 20:
                        near = True
                        break
                if near:
                    break
            edge[x][y] = near
    out = img.copy()
    opx = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            diff = g - max(r, b)
            if diff < 8:
                continue
            # Only process semi-transparent or silhouette-edge pixels
            if a == 255 and not edge[x][y]:
                continue
            best = None
            for d in range(1, search_radius + 1):
                found = []
                for dy in range(-d, d + 1):
                    for dx in range(-d, d + 1):
                        if abs(dx) != d and abs(dy) != d:
                            continue
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < w and 0 <= ny < h:
                            nr, ng, nb, na = px[nx, ny]
                            if na >= 230:
                                found.append((nr, ng, nb))
                if found:
                    sr = sum(c[0] for c in found)
                    sg = sum(c[1] for c in found)
                    sb = sum(c[2] for c in found)
                    n = len(found)
                    best = (sr // n, sg // n, sb // n)
                    break
            if best:
                br, bg, bb = best
                nr = int(r * (1 - mix) + br * mix)
                ng = int(g * (1 - mix) + bg * mix)
                nb = int(b * (1 - mix) + bb * mix)
                # Final clamp: don't let replacement stay green-dominant
                if ng > max(nr, nb):
                    ng = int((max(nr, nb) + ng) / 2)
                opx[x, y] = (nr, ng, nb, a)
    return out

def remove_fringe_green(img, threshold=18):
    """Post-pass: remove obvious residual green screen fringe while keeping solid greens."""
    w, h = img.size
    px = img.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            diff = g - max(r, b)
            if diff > threshold and a < 252:
                mx = max(r, g, b) / 255.0
                mn = min(r, g, b) / 255.0
                sat = 0 if mx == 0 else (mx - mn) / mx
                if sat > 0.40:
                    px[x, y] = (r, g, b, 0)
    return img

def boundary_spill_suppress(img, radius=3, min_diff=10):
    """Distance-based edge cleanup: reduce green channel on pixels close to transparent boundary.
    This catches the last faint green halo without touching interior intentional gems."""
    w, h = img.size
    px = img.load()
    # Distance transform to nearest transparent pixel
    dist = [[9999] * h for _ in range(w)]
    q = deque()
    for y in range(h):
        for x in range(w):
            if px[x, y][3] < 15:
                dist[x][y] = 0
                q.append((x, y))
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h:
                if dist[nx][ny] > dist[x][y] + 1:
                    dist[nx][ny] = dist[x][y] + 1
                    q.append((nx, ny))
    out = img.copy()
    opx = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 20:
                continue
            if dist[x][y] > radius:
                continue
            diff = g - max(r, b)
            if diff <= min_diff:
                continue
            # Stronger suppression for brighter green spill
            strength = 0.70 + 0.25 * min(diff, 60) / 60
            target = max(r, b)
            ng = int(g * (1 - strength) + target * strength)
            opx[x, y] = (r, min(ng, g), b, a)
    return out

def suppress_foreground_spill(img):
    """Final pass: neutralize green-dominant pixels that survived keying.
    Protects dark/intentional gems (e.g. taowu emeralds)."""
    w, h = img.size
    px = img.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 30:
                continue
            mx = max(r, b)
            if g <= mx:
                continue
            diff = g - mx
            hsv = rgb_to_hsv(r, g, b)
            hue, sat, val = hsv
            # Protect only dark, saturated emerald/teal gems (taowu emeralds).
            # Loose brown/greenish spill on chains/smoke will be neutralized.
            is_gem = (70 <= hue <= 150) and (sat > 0.30) and (val < 0.38) and (diff > 12)
            if is_gem:
                continue
            # Fully neutralize green dominance: green cannot exceed max of r/b
            px[x, y] = (r, mx, b, a)
    return img

def fill_interior_holes(img, original):
    """Fill small transparent holes inside the silhouette (e.g. taowu chest dark core)."""
    w, h = img.size
    px = img.load()
    opx = original.convert("RGBA").load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 30:
                continue
            # 8-neighbor opaque count
            count = 0
            total = 0
            for dy in range(-1, 2):
                for dx in range(-1, 2):
                    if dx == 0 and dy == 0:
                        continue
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h:
                        total += 1
                        if px[nx, ny][3] > 80:
                            count += 1
            if total > 0 and count / total >= 0.75:
                ro, go, bo, _ = opx[x, y]
                hsv = rgb_to_hsv(ro, go, bo)
                hue, sat, val = hsv
                is_screen = (60 <= hue <= 150) and (sat > 0.40) and (val > 0.25)
                if not is_screen:
                    px[x, y] = (ro, go, bo, 255)
    return img

def all_foreground_bbox(img, threshold=8, padding=0):
    """Include all non-transparent pixels (even faint wisps), with optional padding."""
    w, h = img.size
    minx, miny, maxx, maxy = w, h, -1, -1
    has_any = False
    for y in range(h):
        for x in range(w):
            a = img.getpixel((x, y))[3]
            if a > threshold:
                has_any = True
                minx = min(minx, x)
                miny = min(miny, y)
                maxx = max(maxx, x)
                maxy = max(maxy, y)
    if not has_any:
        return (0, 0, w, h)
    minx = max(0, minx - padding)
    miny = max(0, miny - padding)
    maxx = min(w - 1, maxx + padding)
    maxy = min(h - 1, maxy + padding)
    return (minx, miny, maxx + 1, maxy + 1)

def detect_grid(img, rows=2, cols=2, margin=20):
    """Find clean horizontal/vertical split lines by minimizing alpha mass near the center."""
    w, h = img.size
    px = img.load()
    col_sum = [0] * w
    row_sum = [0] * h
    for y in range(h):
        for x in range(w):
            a = px[x, y][3]
            col_sum[x] += a
            row_sum[y] += a
    x_splits = [0]
    step_x = w // cols
    for c in range(1, cols):
        search_start = max(margin, c * step_x - step_x // 4)
        search_end = min(w - margin, c * step_x + step_x // 4)
        best_x = search_start
        best_val = float('inf')
        for x in range(search_start, search_end):
            if col_sum[x] < best_val:
                best_val = col_sum[x]
                best_x = x
        x_splits.append(best_x)
    x_splits.append(w)
    y_splits = [0]
    step_y = h // rows
    for r in range(1, rows):
        search_start = max(margin, r * step_y - step_y // 4)
        search_end = min(h - margin, r * step_y + step_y // 4)
        best_y = search_start
        best_val = float('inf')
        for y in range(search_start, search_end):
            if row_sum[y] < best_val:
                best_val = row_sum[y]
                best_y = y
        y_splits.append(best_y)
    y_splits.append(h)
    return x_splits, y_splits

def process():
    raw = Image.open(SRC)
    keyed_full = key_green(raw)
    x_splits, y_splits = detect_grid(keyed_full)
    for row in range(2):
        for col in range(2):
            left = x_splits[col]
            upper = y_splits[row]
            right = x_splits[col + 1]
            lower = y_splits[row + 1]
            orig_cell = raw.crop((left, upper, right, lower))
            keyed_cell = keyed_full.crop((left, upper, right, lower))
            restored = restore_interior_holes(keyed_cell, orig_cell)
            despilled = edge_despill(restored)
            cleaned = remove_fringe_green(despilled)
            suppressed = boundary_spill_suppress(cleaned)
            filled = fill_interior_holes(suppressed, orig_cell)
            despilled2 = edge_despill(filled)
            final = suppress_foreground_spill(despilled2)
            bbox = all_foreground_bbox(final, threshold=8, padding=0)
            cropped = final.crop(bbox)
            name = NAMES[row][col]
            out_path = os.path.join(OUT_DIR, f"{name}.png")
            cropped.save(out_path)
            print(f"Saved {out_path} size={cropped.size}")

if __name__ == "__main__":
    process()
