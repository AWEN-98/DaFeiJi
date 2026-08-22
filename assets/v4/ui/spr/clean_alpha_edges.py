#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Clean PNG alpha edges: set RGB of fully-transparent pixels to black
so browsers/scaling never bleed stray colors into edges. Run from spr/."""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))

total_fixed = 0
for category in ['tabs', 'buttons', 'slots', 'rarity', 'icons', 'panels']:
    cat_dir = os.path.join(ROOT, category)
    if not os.path.isdir(cat_dir):
        continue
    for name in os.listdir(cat_dir):
        if not name.lower().endswith('.png'):
            continue
        path = os.path.join(cat_dir, name)
        img = Image.open(path).convert('RGBA')
        px = img.load()
        w, h = img.size
        fixed = 0
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if a == 0 and (r or g or b):
                    px[x, y] = (0, 0, 0, 0)
                    fixed += 1
        if fixed:
            img.save(path)
            total_fixed += fixed
            print(f'[clean] {category}/{name}: {fixed} stray alpha0 pixels')

print(f'Done. Total stray pixels fixed: {total_fixed}')
