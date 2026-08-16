#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Normalize sliced UI sprites so every state of the same asset shares the same
canvas size. Cropped artwork is padded with transparency and anchored according
to the sprite type (top for tabs, bottom for buttons/slots, centre for icons/rarity).
Run from the `spr/` directory."""
import os
import re
from collections import defaultdict
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))

# Anchor policy per category: (x_anchor, y_anchor)
# x_anchor/y_anchor in {'top','bottom','center'}
ANCHOR = {
    'tabs':    ('center', 'top'),     # tab strip sits at top, selected glow extends down
    'buttons': ('center', 'bottom'),  # button bar sits at bottom
    'slots':   ('center', 'bottom'),  # badge sits at bottom
    'panels':  ('center', 'top'),     # main panel body at top, item bar included
    'rarity':  ('center', 'center'),  # rings/corners are decorative
    'icons':   ('center', 'center'),
}

def parse_base_name(category, filename):
    """Return the sprite base name used for grouping states."""
    name = os.path.splitext(filename)[0]
    # Buttons: state_prefix + '_' + type, e.g. 'active_primary' -> 'primary'
    if category == 'buttons':
        return name.rsplit('_', 1)[-1]
    # Rarity: color + '_' + style, e.g. 'white_ring' -> 'white'
    if category == 'rarity':
        return name.rsplit('_', 1)[0]
    # Default: strip trailing state suffix
    suffixes = ['normal', 'hover', 'selected', 'disabled', 'active', 'equipped']
    for suf in suffixes:
        if name.endswith('_' + suf):
            return name[:-(len(suf)+1)]
    return name

def pad_to(img, target_w, target_h, x_anchor, y_anchor):
    """Return a new RGBA image of target size with img pasted at the anchor."""
    out = Image.new('RGBA', (target_w, target_h), (0, 0, 0, 0))
    if x_anchor == 'center':
        x = (target_w - img.width) // 2
    elif x_anchor == 'right':
        x = target_w - img.width
    else:  # left / top
        x = 0
    if y_anchor == 'center':
        y = (target_h - img.height) // 2
    elif y_anchor == 'bottom':
        y = target_h - img.height
    else:  # top
        y = 0
    out.paste(img, (x, y), img)
    return out

def main():
    for category in ANCHOR:
        cat_dir = os.path.join(ROOT, category)
        if not os.path.isdir(cat_dir):
            continue

        # Group files by base name
        groups = defaultdict(list)
        for fn in os.listdir(cat_dir):
            if not fn.lower().endswith('.png'):
                continue
            base = parse_base_name(category, fn)
            groups[base].append(fn)

        for base, files in groups.items():
            images = {}
            max_w = 0
            max_h = 0
            for fn in files:
                path = os.path.join(cat_dir, fn)
                img = Image.open(path)
                if img.mode != 'RGBA':
                    img = img.convert('RGBA')
                alpha = img.split()[-1]
                bbox = alpha.getbbox()
                if bbox is None:
                    print(f'[skip] {category}/{fn}: fully transparent')
                    continue
                cropped = img.crop(bbox)
                images[fn] = cropped
                max_w = max(max_w, cropped.width)
                max_h = max(max_h, cropped.height)

            if not images:
                continue

            x_anchor, y_anchor = ANCHOR[category]
            for fn, cropped in images.items():
                normalized = pad_to(cropped, max_w, max_h, x_anchor, y_anchor)
                normalized.save(os.path.join(cat_dir, fn))
            print(f'[norm] {category}/{base}: canvas {max_w}x{max_h} ({len(images)} states)')

    print('Done.')

if __name__ == '__main__':
    main()
