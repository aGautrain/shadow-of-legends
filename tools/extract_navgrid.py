#!/usr/bin/env python3
"""Extract the Summoner's Rift vision/pathing layer into data/navgrid.json.

Usage:
  python3 tools/extract_navgrid.py BASE.aimesh_ngrid [NAME=OVERLAY.ngrid_overlay ...] -o data/navgrid.json

BASE is the map's AIPath .aimesh_ngrid (unpacked from Map11.wad.client).
Each NAME=PATH overlay is a terrain variant (dragon soul terrain, Baron pit)
that the sim can switch on. Only the per-cell vision/pathing flags are kept.
"""
import argparse, base64, json, struct

CELL_RECORD_V7 = 48  # bytes per cell record in a version 7 navgrid


def read_base(path):
    b = open(path, "rb").read()
    major = b[0]
    if major != 7:
        raise SystemExit(f"unsupported navgrid version {major} (only 7 is handled)")
    off = 3  # major byte + minor short
    min_x, min_y, min_z = struct.unpack_from("<3f", b, off); off += 12
    max_x, max_y, max_z = struct.unpack_from("<3f", b, off); off += 12
    cell_size, w, h = struct.unpack_from("<fii", b, off); off += 12
    off += w * h * CELL_RECORD_V7
    flags = list(struct.unpack_from(f"<{w*h}H", b, off))
    return dict(minX=min_x, minZ=min_z, maxX=max_x, maxZ=max_z,
                cellSize=cell_size, width=w, height=h), flags


def read_overlay(path):
    """Overlay layout: version byte (1), box count byte, then per box
    x, z, width, height (int32) and width*height uint16 flags."""
    b = open(path, "rb").read()
    version, count = b[0], b[1]
    if version != 1:
        raise SystemExit(f"{path}: unsupported overlay version {version}")
    boxes, off = [], 2
    for _ in range(count):
        x0, z0, cw, ch = struct.unpack_from("<4i", b, off); off += 16
        cells = list(struct.unpack_from(f"<{cw*ch}H", b, off)); off += 2 * cw * ch
        boxes.append(dict(x=x0, z=z0, w=cw, h=ch, flags=pack(cells)))
    return boxes


def pack(values):
    return base64.b64encode(struct.pack(f"<{len(values)}H", *values)).decode()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("base")
    ap.add_argument("overlays", nargs="*", help="NAME=path.ngrid_overlay")
    ap.add_argument("-o", "--out", required=True)
    ap.add_argument("--source", default="", help="free text describing the patch the files came from")
    a = ap.parse_args()

    meta, flags = read_base(a.base)
    out = dict(meta, source=a.source, flags=pack(flags), overlays={})
    for spec in a.overlays:
        name, path = spec.split("=", 1)
        out["overlays"][name] = read_overlay(path)
    with open(a.out, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"{meta['width']}x{meta['height']} cells, {len(out['overlays'])} overlays -> {a.out}")


if __name__ == "__main__":
    main()
