# -*- coding: utf-8 -*-
"""生成鎏金暗色风格「法阵」资产（透明底 PNG），金/青两色变体。
鎏金暗色调色板：金 #C9A24B (201,162,75) / 青撤离 #8FD8C0 (143,216,192)。
纯程序化矢量绘制，输出 1024x1024，供游戏内封印宝箱与撤离点复用。"""
import math
from PIL import Image, ImageDraw

S = 1024
C = S // 2  # 中心


def poly_points(cx, cy, radius, n, rot=-math.pi/2, ratio=1.0):
    pts = []
    for i in range(n):
        a = rot + i * (2 * math.pi / n)
        r = radius * (ratio if i % 2 == 0 else 1.0) if ratio != 1.0 else radius
        pts.append((cx + math.cos(a) * radius, cy + math.sin(a) * radius))
    return pts


def draw_seal(draw, color, alpha=235):
    g = color  # (r,g,b)
    # 1) 外双环
    draw.ellipse([C-472, C-472, C+472, C+472], outline=g + (235,), width=5)
    draw.ellipse([C-456, C-456, C+456, C+456], outline=g + (170,), width=2)
    # 2) 刻度环（72 格，长短交替）
    for i in range(72):
        a = i * (2 * math.pi / 72)
        long = (i % 2 == 0)
        r1, r2 = 456, (424 if long else 440)
        x1, y1 = C + math.cos(a) * r1, C + math.sin(a) * r1
        x2, y2 = C + math.cos(a) * r2, C + math.sin(a) * r2
        draw.line([(x1, y1), (x2, y2)], fill=g + (200 if long else 130,), width=3)
    # 3) 细圈
    draw.ellipse([C-410, C-410, C+410, C+410], outline=g + (180,), width=2)
    # 4) 中环
    draw.ellipse([C-360, C-360, C+360, C+360], outline=g + (235,), width=4)
    # 5) 内接菱形（旋转 45° 方框）
    diamond = [(C, C-360), (C+360, C), (C, C+360), (C-360, C)]
    for k in range(len(diamond)):
        a, b = diamond[k], diamond[(k+1) % len(diamond)]
        draw.line([a, b], fill=g + (220,), width=5)
    # 6) 八芒星（16 顶点交替外/内）
    star = []
    N = 8
    for i in range(2 * N):
        a = -math.pi/2 + i * (math.pi / N)
        r = 255 if i % 2 == 0 else 120
        star.append((C + math.cos(a) * r, C + math.sin(a) * r))
    for k in range(len(star)):
        draw.line([star[k], star[(k+1) % len(star)]], fill=g + (200,), width=4)
    # 7) 内同心圈
    draw.ellipse([C-255, C-255, C+255, C+255], outline=g + (170,), width=2)
    # 8) 内虚线圈（分段绘制）
    seg = 48
    for i in range(seg):
        if i % 2:
            continue
        a0 = i * (2 * math.pi / seg)
        a1 = (i+1) * (2 * math.pi / seg)
        draw.arc([C-150, C-150, C+150, C+150], math.degrees(a0), math.degrees(a1),
                 fill=g + (180,), width=3)
    # 9) 12 根放射辐条（r=90 → r=255）
    for i in range(12):
        a = i * (2 * math.pi / 12)
        draw.line([(C + math.cos(a)*90, C + math.sin(a)*90),
                   (C + math.cos(a)*255, C + math.sin(a)*255)], fill=g + (120,), width=2)
    # 10) 四方位符印（上下左右）
    for i in range(4):
        a = -math.pi/2 + i * (math.pi / 2)
        sx, sy = C + math.cos(a) * 300, C + math.sin(a) * 300
        draw.ellipse([sx-30, sy-30, sx+30, sy+30], outline=g + (230,), width=4)
        draw.ellipse([sx-30, sy-30, sx+30, sy+30], outline=g + (0,), width=0)
        draw.ellipse([sx-8, sy-8, sx+8, sy+8], fill=g + (220,), outline=g + (220,))
    # 11) 中心环 + 核心
    draw.ellipse([C-70, C-70, C+70, C+70], outline=g + (235,), width=4)
    draw.ellipse([C-44, C-44, C+44, C+44], outline=g + (170,), width=3)
    draw.ellipse([C-16, C-16, C+16, C+16], fill=g + (235,), outline=g + (235,))


def make(color, path):
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw_seal(draw, color)
    img.save(path)
    print('wrote', path, img.size)


GOLD = (201, 162, 75)
TEAL = (143, 216, 192)
make(GOLD, 'assets/v4/vfx/seal_circle_gold.png')
make(TEAL, 'assets/v4/vfx/seal_circle_teal.png')
