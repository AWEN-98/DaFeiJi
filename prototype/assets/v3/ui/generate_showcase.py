# -*- coding: utf-8 -*-
"""生成看图板 showcase.html：把切好的小图和整图按类别摆出来，方便肉眼验收。"""
import os, glob
from pathlib import Path

BASE = Path(r"D:\WorkBuddy Stido\2026-08-12-12-58-18\prototype\assets\v3\ui")
SLICED = BASE / "sliced"
ATLAS = BASE / "atlas"

GROUPS = [
    ("tab", "标签页", "机库/军械库/熔炼台/研究院/图鉴，每种有 正常/悬停/选中/禁用 四态"),
    ("slot", "装备格", "武器/护甲/核心/弹药，每种有 正常/悬停/选中 三态"),
    ("rarity", "稀有度框", "普通/优秀/稀有/史诗/传说，每种有 边框/角饰/徽记 三种"),
    ("btn", "按钮", "主/次/工具，每种有 正常/悬停/按下/禁用 四态"),
    ("card", "卡片", "难度/机体/商店/道具，每种有 正常/选中/锁定 三态"),
    ("icon", "小图标", "按格子编号 00~33，共 16 个"),
]

def collect(prefix):
    files = sorted(glob.glob(str(SLICED / f"{prefix}_*.png")))
    return [os.path.basename(f) for f in files]

atlas_files = sorted(glob.glob(str(ATLAS / "*.png")))

html = []
html.append("""<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>空域基地 UI 资产看图板</title>
<style>
  body{background:#0b0e14;color:#e8dcc4;font-family:"Microsoft YaHei",sans-serif;margin:0;padding:24px;}
  h1{font-size:22px;color:#ffc24b;border-bottom:1px solid #2bd4c4;padding-bottom:10px;}
  .intro{color:#9fb3c8;font-size:14px;line-height:1.7;margin:14px 0 26px;max-width:880px;}
  .intro b{color:#ffc24b;}
  h2{font-size:17px;color:#2bd4c4;margin:30px 0 6px;}
  .note{color:#9fb3c8;font-size:13px;margin:0 0 14px;}
  .grid{display:flex;flex-wrap:wrap;gap:12px;}
  figure{margin:0;background:#11161f;border:1px solid #25303f;border-radius:8px;padding:8px;text-align:center;width:130px;}
  figure img{background:#070b11;border-radius:4px;max-width:114px;max-height:114px;image-rendering:auto;}
  figcaption{font-size:11px;color:#c9b48a;margin-top:6px;word-break:break-all;line-height:1.3;}
  .atlas-img{background:#070b11;border:1px solid #25303f;border-radius:8px;padding:8px;max-width:100%;margin-bottom:14px;}
  .sec{background:#0e131c;border:1px solid #1c2530;border-radius:12px;padding:18px;margin-bottom:18px;}
</style></head><body>
<h1>空域基地 UI 资产看图板</h1>
<div class="intro">
这是把你之前那几张<b>大图</b>按格子切出来的<b>小图</b>集合，共 <b>87 张</b>，外加 6 张大图。<br>
每种零件都有几种"状态"（比如按钮的 正常 / 鼠标悬停 / 按下 / 禁用），方便以后做界面时直接换图，不会出现跳动。<br>
请你<b>点开看看</b>：每张图是不是你想要的图案？名字对不对？哪里不对告诉我，我来改。
</div>
""")

for prefix, label, desc in GROUPS:
    items = collect(prefix)
    html.append(f'<div class="sec"><h2>{label}（{len(items)} 张）</h2>')
    html.append(f'<p class="note">{desc}</p>')
    html.append('<div class="grid">')
    for name in items:
        html.append(f'<figure><img src="sliced/{name}" alt="{name}"><figcaption>{name}</figcaption></figure>')
    html.append('</div></div>')

html.append('<div class="sec"><h2>特殊单体图（SPECIAL）</h2>')
html.append('<p class="note">不需要切片的大尺寸特殊 UI：熔炼台主体、研究院科技卷轴等。</p>')
html.append('<div class="grid">')
special_files = sorted(glob.glob(str(BASE / "special" / "*.png")))
for f in special_files:
    name = os.path.basename(f)
    html.append(f'<figure style="width:220px;"><img style="max-width:200px;max-height:200px;background:#070b11;" src="special/{name}" alt="{name}"><figcaption>{name}</figcaption></figure>')
html.append('</div></div>')

html.append('<div class="sec"><h2>整张大图（ATLAS，6 张）</h2>')
html.append('<p class="note">这是切图之前的原始大图，留底用。透明背景在网页里显示为深色。</p>')
for f in atlas_files:
    name = os.path.basename(f)
    html.append(f'<div><img class="atlas-img" src="atlas/{name}" alt="{name}"><div class="note">{name}</div></div>')
html.append('</div>')

html.append("</body></html>")

out = BASE / "showcase.html"
out.write_text("\n".join(html), encoding="utf-8")
print("written", out, "sections:", len(GROUPS), "atlas:", len(atlas_files))
