from PIL import Image
import numpy as np
from scipy import ndimage
import os, json

SRC = "sources/vfx_all_green.jpg"
OUT = "."
NAMES = ["chain_lightning", "homing_trail", "pierce_afterimage", "burn_dot"]

def chroma_key(rgb, edge=40):
    """按"绿度"生成平滑 alpha。只把明显偏绿的部分做透明/去边，暖色（金/橙/红/青）保留。"""
    arr = np.array(rgb, dtype=np.float32)
    R, G, B = arr[:,:,0], arr[:,:,1], arr[:,:,2]
    mx = np.maximum(R, B)
    d = G - mx                                 # >0 表示偏绿
    alpha = np.clip(1 - d / edge, 0, 1)
    a = (alpha * 255).astype(np.uint8)
    rgba = np.zeros((*arr.shape[:2],4), dtype=np.uint8)
    rgba[:,:,:3] = arr.astype(np.uint8)
    rgba[:,:,3] = a
    # 去绿边：只在"绿色明显压过红蓝"的可见像素上压绿，不影响金/橙/红/青
    spill = (a > 10) & (d > 0) & (G > mx + 15)
    g2 = G.copy()
    g2[spill] = mx[spill] + (g2[spill] - mx[spill]) * 0.3
    rgba[spill,1] = g2[spill].astype(np.uint8)
    return rgba

def clean_specks(rgba, min_area=15):
    alpha = rgba[:,:,3]
    labeled, n = ndimage.label(alpha>0)
    for i in range(1,n+1):
        if np.sum(labeled==i) < min_area:
            rgba[labeled==i] = [0,0,0,0]
    return rgba

def despill_green(rgba):
    """绿幕去边：把可见像素里绿得过分的边缘（G 远超 R/B）压到接近红蓝最大，去掉绿边。"""
    r = rgba[:,:,0].astype(np.float32)
    g = rgba[:,:,1].astype(np.float32)
    b = rgba[:,:,2].astype(np.float32)
    a = rgba[:,:,3]
    vis = a > 0
    # 绿溢出的像素
    spill = vis & (g > r + 15) & (g > b + 15)
    # 把绿色压到红蓝较大值的 1.05 倍，保留金属/鎏金/橙红不受影响
    cap = np.maximum(r, b) * 1.05
    g[spill] = np.minimum(g[spill], cap[spill])
    rgba[:,:,1] = g.astype(np.uint8)
    return rgba

def detect_frames_x(rgba, min_gap=10, min_width=20):
    """按列透明度投影，把水平方向有绿幕间隙的内容分成帧。"""
    alpha = rgba[:,:,3]
    proj = alpha.sum(axis=0)
    in_frame = proj > 30
    # 找连续非绿段
    segs = []
    i, n = 0, len(in_frame)
    while i < n:
        if not in_frame[i]:
            i += 1
            continue
        s = i
        while i < n and in_frame[i]: i += 1
        e = i - 1
        if e - s + 1 >= min_width:
            segs.append((s, e))
    # 合并间隔太小的（防断裂）
    if not segs: return []
    merged = [segs[0]]
    for s,e in segs[1:]:
        ls, le = merged[-1]
        if s - le - 1 < min_gap:
            merged[-1] = (ls, e)
        else:
            merged.append((s,e))
    return merged

def process_effect(row_rgba, name, gap=10):
    frames_x = detect_frames_x(row_rgba, min_gap=gap)
    if not frames_x:
        print(f"[!] {name}: 未检测到帧"); return None
    # 每一帧的 bbox（x 由投影定，y 由该列范围内 alpha 定）
    bboxes = []
    for x1,x2 in frames_x:
        ys, _ = np.where(row_rgba[:, x1:x2+1, 3] > 0)
        if ys.size == 0: continue
        y1, y2 = int(ys.min()), int(ys.max())
        bboxes.append((x1,y1,x2,y2))
    if not bboxes:
        print(f"[!] {name}: bbox 为空"); return None
    fw = max(x2-x1+1 for x1,y1,x2,y2 in bboxes)
    fh = max(y2-y1+1 for x1,y1,x2,y2 in bboxes)
    cw = ((fw+7)//8)*8
    ch = ((fh+7)//8)*8
    sheet = Image.new("RGBA", (cw*len(bboxes), ch))
    manifest = {"name":name,"frames":[],"cell_width":cw,"cell_height":ch,"frame_count":len(bboxes)}
    for idx,(x1,y1,x2,y2) in enumerate(bboxes):
        crop = row_rgba[y1:y2+1, x1:x2+1]
        # 清零透明像素 RGB
        crop[crop[:,:,3]==0] = [0,0,0,0]
        img = Image.fromarray(crop)
        ox = (cw-img.width)//2
        oy = (ch-img.height)//2
        sheet.paste(img, (idx*cw+ox, oy), img)
        fn = f"{name}/{name}_{idx:02d}.png"
        img.save(f"{OUT}/{name}/{name}_{idx:02d}.png")
        manifest["frames"].append({
            "file": fn,
            "sheet_x": idx*cw, "sheet_y": 0,
            "width": img.width, "height": img.height,
            "center_offset_x": ox, "center_offset_y": oy
        })
    sheet_path = f"{OUT}/{name}_sheet.png"
    sheet.save(sheet_path)
    print(f"[{name}] {len(bboxes)} frames, cell={cw}x{ch}, sheet={sheet.size}")
    return manifest

im = Image.open(SRC).convert("RGB")
w,h = im.size
row_h = h // 4
manifests = []
# 每行给不同的 min_gap，因为内容疏密不同
GAPS = {"chain_lightning": 10, "homing_trail": 8, "pierce_afterimage": 8, "burn_dot": 8}
for i,name in enumerate(NAMES):
    y0 = i*row_h; y1 = (i+1)*row_h
    row = im.crop((0,y0,w,y1))
    rgba = chroma_key(row, edge=60)
    rgba = clean_specks(rgba, min_area=20)
    rgba = despill_green(rgba)
    alpha0 = rgba[:,:,3]==0
    rgba[alpha0] = [0,0,0,0]
    m = process_effect(rgba, name, gap=GAPS.get(name,10))
    if m: manifests.append(m)

json.dump(manifests, open(f"{OUT}/vfx_manifest.json","w",encoding="utf-8"), ensure_ascii=False, indent=1)
print("done. manifest:", f"{OUT}/vfx_manifest.json")
