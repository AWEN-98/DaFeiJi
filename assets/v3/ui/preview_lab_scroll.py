from PIL import Image
from pathlib import Path

base = Path('D:/WorkBuddy Stido/2026-08-12-12-58-18/prototype/assets')
bg_path = base / 'v2/base/base_hub_lab.jpg'
scroll_path = base / 'v3/ui/special/ui_lab_scroll.png'
out_path = base / 'v3/ui/special/ui_lab_scroll_preview.png'

# 目标预览画布
out_w, out_h = 1280, 800
bg = Image.open(bg_path).convert('RGB')
bg = bg.resize((out_w, out_h), Image.Resampling.LANCZOS)

scroll = Image.open(scroll_path).convert('RGBA')
# 缩放卷轴到画布宽度的 55% 左右，保持比例
scale = (out_w * 0.55) / scroll.width
new_w = int(scroll.width * scale)
new_h = int(scroll.height * scale)
scroll = scroll.resize((new_w, new_h), Image.Resampling.LANCZOS)

# 居中
x = (out_w - new_w) // 2
y = (out_h - new_h) // 2
bg.paste(scroll, (x, y), scroll)

bg.save(out_path, format='PNG')
print('preview saved', out_path, out_path.stat().st_size, 'bytes')
