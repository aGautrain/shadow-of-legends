// Line-of-sight vision on the navgrid.
//
// A source sees a cell when the cell center is within its sight radius and
// the straight line between the two cell centers crosses no blocker:
// - a wall (see-through walls do not block),
// - a brush cell of a patch the source is not standing in,
// - a base gate strip, unless the source stands in one.
// Brush cells of other patches are never visible themselves.

export class Vision {
  constructor(grid) {
    this.grid = grid;
    this.words = Math.ceil((grid.w * grid.h) / 32);
    this.cache = new Map();
  }

  reset() { this.cache.clear(); }

  // Bitset of the cells seen by a source standing at (x, z).
  source(x, z, radius) {
    const i = this.grid.index(x, z);
    if (i < 0) return new Uint32Array(this.words);
    const key = i * 8192 + radius;
    let bits = this.cache.get(key);
    if (!bits) {
      bits = this.compute(i, radius);
      if (this.cache.size > 3000) this.cache.delete(this.cache.keys().next().value);
      this.cache.set(key, bits);
    }
    return bits;
  }

  compute(origin, radius) {
    const { w, h, solid, brush, gate } = this.grid;
    const bits = new Uint32Array(this.words);
    const cx = origin % w, cz = (origin / w) | 0;
    const ownBrush = brush[origin];
    const inGate = gate[origin];
    const R = radius / this.grid.cell;
    const R2 = R * R;
    const r = Math.ceil(R);
    const blocks = (j) => solid[j] || (brush[j] && brush[j] !== ownBrush) || (gate[j] && !inGate);

    for (let tz = Math.max(0, cz - r); tz <= Math.min(h - 1, cz + r); tz++) {
      for (let tx = Math.max(0, cx - r); tx <= Math.min(w - 1, cx + r); tx++) {
        const dx = tx - cx, dz = tz - cz;
        if (dx * dx + dz * dz > R2) continue;
        const t = tz * w + tx;
        if (brush[t] && brush[t] !== ownBrush) continue;
        if (t !== origin && !this.clear(cx, cz, tx, tz, blocks)) continue;
        bits[t >> 5] |= 1 << (t & 31);
      }
    }
    return bits;
  }

  // Walks the cells between two cell centers (exclusive at both ends).
  clear(x, z, tx, tz, blocks) {
    const w = this.grid.w;
    const dx = tx - x, dz = tz - z;
    const sx = Math.sign(dx), sz = Math.sign(dz);
    const adx = Math.abs(dx), adz = Math.abs(dz);
    const ddx = adx ? 1 / adx : Infinity, ddz = adz ? 1 / adz : Infinity;
    let mx = adx ? 0.5 / adx : Infinity, mz = adz ? 0.5 / adz : Infinity;
    const eps = 1e-9;
    for (let n = adx + adz; n > 0; n--) {
      if (mx < mz - eps) { x += sx; mx += ddx; }
      else if (mz < mx - eps) { z += sz; mz += ddz; }
      else { x += sx; z += sz; mx += ddx; mz += ddz; } // passes exactly through a corner
      if (x === tx && z === tz) return true;
      if (blocks(z * w + x)) return false;
    }
    return true;
  }

  // Union of several sources' bitsets.
  merge(list) {
    const out = new Uint32Array(this.words);
    for (const bits of list) for (let k = 0; k < out.length; k++) out[k] |= bits[k];
    return out;
  }
}

export const has = (bits, i) => i >= 0 && (bits[i >> 5] >>> (i & 31)) & 1;
