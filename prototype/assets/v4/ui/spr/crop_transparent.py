#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Auto-crop transparent margins from sliced UI PNGs so each file tightly
fits its visible artwork. Run from the `spr/` directory."""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))

for category in ['tabs', 'buttons', 'slots', 'rarity', 'icons', 'panels']:
    cat_dir = os.path.join(ROOT, category)
    if not os.path.isdir(cat_dir):
        continue
    for name in os.listdir(cat_dir):
        if not name.lower().endswith('.png'):
            continue
        path = os.path.join(cat_dir, name)
        img = Image.open(path)
        if img.mode != 'RGBA':
            # Convert with full opacity if no alpha channel
            img = img.convert('RGBA')
        alpha = img.split()[-1]
        bbox = alpha.getbbox()
        if bbox is None:
            print(f'[skip] {category}/{name}: fully transparent')
            continue
        cropped = img.crop(bbox)
        cropped.save(path)
        print(f'[crop] {category}/{name}: {img.size} -> {cropped.size}')

print('Done.')
