"""Slice all 6 sprite sheets into individual transparent PNGs."""
from PIL import Image
import os

BASE = os.path.dirname(os.path.abspath(__file__))

def slice_sheet(path, cols, rows, names, out_dir):
    """names[col][row] = 'semantic_name' or list of (col,row,name) tuples"""
    img = Image.open(os.path.join(BASE, path)).convert('RGBA')
    w, h = img.size
    cw, ch = w // cols, h // rows
    out = os.path.join(BASE, out_dir)
    os.makedirs(out, exist_ok=True)
    count = 0
    if isinstance(names, dict):
        items = []
        for col_name, col_idx in names.get('cols', {}).items():
            for row_name, row_idx in names.get('rows', {}).items():
                items.append((col_idx, row_idx, f"{col_name}_{row_name}"))
    else:
        items = names
    for col, row, name in items:
        x0 = col * cw
        y0 = row * ch
        cell = img.crop((x0, y0, x0 + cw, y0 + ch))
        fname = f"{name}.png"
        cell.save(os.path.join(out, fname))
        count += 1
    print(f"  {out_dir}: {count} files")
    return count

# --- Tabs: 5 cols x 4 rows, cell 338x233 ---
tab_names = {
    'cols': {'hangar': 0, 'arsenal': 1, 'forge': 2, 'lab': 3, 'codex': 4},
    'rows': {'normal': 0, 'hover': 1, 'selected': 2, 'disabled': 3},
}
n1 = slice_sheet('tabs/base_tab_sheet.png', 5, 4, tab_names, 'spr/tabs')

# --- Icons: 4 cols x 4 rows, cell 314x314 ---
icon_items = [
    (0, 0, 'jade'),     (1, 0, 'warehouse'), (2, 0, 'tier'),     (3, 0, 'lock'),
    (0, 1, 'equip'),    (1, 1, 'unequip'),   (2, 1, 'melt'),     (3, 1, 'merge2'),
    (0, 2, 'merge3'),   (1, 2, 'info'),      (2, 2, 'atk'),      (3, 2, 'mob'),
    (0, 3, 'def'),      (1, 3, 'rof'),       (2, 3, 'help'),     (3, 3, 'target'),
]
n2 = slice_sheet('icons/base_icons_sheet.png', 4, 4, icon_items, 'spr/icons')

# --- Slots: 4 cols x 3 rows, cell 314x418 ---
slot_names = {
    'cols': {'weapon': 0, 'armor': 1, 'core': 2, 'ammo': 3},
    'rows': {'normal': 0, 'hover': 1, 'equipped': 2},
}
n3 = slice_sheet('slots/equip_slots_sheet.png', 4, 3, slot_names, 'spr/slots')

# --- Rarity: 5 cols x 3 rows, cell 251x418 ---
rarity_names = {
    'cols': {'white': 0, 'green': 1, 'blue': 2, 'purple': 3, 'orange': 4},
    'rows': {'ring': 0, 'corner': 1, 'badge': 2},
}
n4 = slice_sheet('rarity/rarity_trim_sheet.png', 5, 3, rarity_names, 'spr/rarity')

# --- Buttons: 4 cols x 3 rows, cell 384x342 ---
# cols = states, rows = sizes
btn_names = {
    'cols': {'normal': 0, 'hover': 1, 'active': 2, 'disabled': 3},
    'rows': {'primary': 0, 'secondary': 1, 'small': 2},
}
n5 = slice_sheet('buttons/btn_sheet.png', 4, 3, btn_names, 'spr/buttons')

# --- Panels: 4 cols x 3 rows, cell 384x342 ---
panel_names = {
    'cols': {'diff': 0, 'acft': 1, 'enh': 2, 'item': 3},
    'rows': {'normal': 0, 'hover': 1, 'selected': 2},
}
n6 = slice_sheet('panels/panel_sheet.png', 4, 3, panel_names, 'spr/panels')

total = n1 + n2 + n3 + n4 + n5 + n6
print(f"\nTotal: {total} PNGs sliced")
