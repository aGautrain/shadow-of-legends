#!/usr/bin/env python3
"""Cut terrain variant art into patches that sit on top of the base map image.

Usage:
  python3 tools/make_terrain_art.py RENDERS_DIR -o assets/terrain

RENDERS_DIR holds full-map renders named like LoL-NGRID-converter's SR_2024/renders
(Base.png, DragonOcean.png, BaronCup.png, ...). For each variant, the pixels that
differ from Base are kept (with a feathered edge) and cropped to their bounding box.
Writes one .webp per variant plus terrain.json with each patch's rectangle, in
pixels of the 4096 x 4096 base image (assets/summoners-rift.jpg).
"""
import argparse, json, os
import numpy as np
from PIL import Image, ImageFilter

Image.MAX_IMAGE_PIXELS = None
SIZE = 4096
VARIANTS = {
    'infernal': 'DragonInfernal', 'ocean': 'DragonOcean', 'mountain': 'DragonMountain',
    'chemtech': 'DragonChemtech', 'hextech': 'DragonHextech', 'cloud': 'DragonCloud',
    'baronCup': 'BaronCup', 'baronTunnel': 'BaronTunnel',
}


def load(d, name):
    return Image.open(os.path.join(d, name + '.png')).convert('RGB').resize((SIZE, SIZE), Image.LANCZOS)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('renders')
    ap.add_argument('-o', '--out', required=True)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    base = np.asarray(load(a.renders, 'Base')).astype(np.int16)
    meta = {}
    for key, name in VARIANTS.items():
        img = load(a.renders, name)
        diff = np.abs(np.asarray(img).astype(np.int16) - base).sum(2)
        mask = Image.fromarray(((diff > 24) * 255).astype(np.uint8))
        # Grow the changed area a little, then feather it so seams blend in.
        mask = mask.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(3))
        box = mask.getbbox()
        if not box:
            continue
        patch = img.copy()
        patch.putalpha(mask)
        patch = patch.crop(box)
        path = os.path.join(a.out, key + '.webp')
        patch.save(path, quality=82, method=6)
        meta[key] = dict(src=path.replace(os.sep, '/'), x=box[0], y=box[1], w=box[2] - box[0], h=box[3] - box[1])
        print(key, box, os.path.getsize(path) // 1024, 'KB')
    with open(os.path.join(a.out, 'terrain.json'), 'w') as f:
        json.dump(meta, f, indent=1)


if __name__ == '__main__':
    main()
