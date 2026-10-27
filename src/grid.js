// Summoner's Rift navgrid: decoding, terrain overlays and derived layers.

export const FLAG = {
  BRUSH: 0x1,
  WALL: 0x2,
  STRUCTURE: 0x4,
  SEE_THROUGH: 0x40, // "transparent wall": blocks walking, not sight
  BLUE_ONLY: 0x400,
  RED_ONLY: 0x800,
  GATE_VISION: 0x1000, // can see into and out of, not through
};

function decodeFlags(b64) {
  const bin = atob(b64);
  const out = new Uint16Array(bin.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
  return out;
}

export class NavGrid {
  constructor(data) {
    this.data = data;
    this.w = data.width;
    this.h = data.height;
    this.cell = data.cellSize;
    this.minX = data.minX;
    this.minZ = data.minZ;
    this.baseFlags = decodeFlags(data.flags);
    this.overlays = {};
    for (const [name, boxes] of Object.entries(data.overlays || {})) {
      this.overlays[name] = boxes.map((b) => ({ ...b, flags: decodeFlags(b.flags) }));
    }
    this.setTerrain([]);
  }

  setTerrain(names) {
    const f = this.baseFlags.slice();
    for (const name of names) {
      for (const box of this.overlays[name] || []) {
        for (let j = 0; j < box.h; j++) {
          for (let i = 0; i < box.w; i++) {
            const idx = (box.z + j) * this.w + box.x + i;
            // Overlays never replace structure cells (turrets, inhibitors, nexus).
            if (f[idx] & FLAG.STRUCTURE) continue;
            f[idx] = box.flags[j * box.w + i];
          }
        }
      }
    }
    this.flags = f;
    this.derive();
  }

  derive() {
    const { w, h, flags } = this;
    const n = w * h;
    // solid: blocks sight for everyone. Brush cells touching a wall count as
    // see-through wall, like the game's own tooling treats them.
    this.solid = new Uint8Array(n);
    this.gate = new Uint8Array(n);
    this.brush = new Int16Array(n); // brush patch id, 0 = none
    for (let i = 0; i < n; i++) {
      const f = flags[i];
      if ((f & FLAG.WALL) && !(f & FLAG.SEE_THROUGH) && !(f & FLAG.BRUSH)) this.solid[i] = 1;
      if (f & FLAG.GATE_VISION) this.gate[i] = 1;
    }
    let id = 0;
    const stack = [];
    const isBrush = (i) => (flags[i] & FLAG.BRUSH) && !(flags[i] & FLAG.WALL);
    for (let i = 0; i < n; i++) {
      if (!isBrush(i) || this.brush[i]) continue;
      id++;
      this.brush[i] = id;
      stack.push(i);
      while (stack.length) {
        const c = stack.pop();
        const x = c % w, z = (c / w) | 0;
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, nz = z + dz;
            if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
            const j = nz * w + nx;
            if (isBrush(j) && !this.brush[j]) { this.brush[j] = id; stack.push(j); }
          }
        }
      }
    }
    this.brushCount = id;
  }

  walkable(i, side) {
    if (i < 0) return false;
    const f = this.flags[i];
    if (f & FLAG.WALL) return false;
    if ((f & FLAG.BLUE_ONLY) && side !== 'blue') return false;
    if ((f & FLAG.RED_ONLY) && side !== 'red') return false;
    // See-through cells without the wall bit are base gate strips: walkable for the owner.
    if ((f & FLAG.SEE_THROUGH) && !(f & (FLAG.BLUE_ONLY | FLAG.RED_ONLY))) return false;
    return true;
  }

  cellX(x) { return Math.floor((x - this.minX) / this.cell); }
  cellZ(z) { return Math.floor((z - this.minZ) / this.cell); }
  index(x, z) {
    const cx = this.cellX(x), cz = this.cellZ(z);
    if (cx < 0 || cz < 0 || cx >= this.w || cz >= this.h) return -1;
    return cz * this.w + cx;
  }
  centerX(cx) { return this.minX + (cx + 0.5) * this.cell; }
  centerZ(cz) { return this.minZ + (cz + 0.5) * this.cell; }

  nearestWalkable(x, z, side) {
    let cx = Math.min(this.w - 1, Math.max(0, this.cellX(x)));
    let cz = Math.min(this.h - 1, Math.max(0, this.cellZ(z)));
    for (let r = 0; r < 40; r++) {
      let best = -1, bestD = Infinity;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const nx = cx + dx, nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= this.w || nz >= this.h) continue;
          const i = nz * this.w + nx;
          if (!this.walkable(i, side)) continue;
          const d = dx * dx + dz * dz;
          if (d < bestD) { bestD = d; best = i; }
        }
      }
      if (best >= 0) {
        if (r === 0) return { x, z };
        return { x: this.centerX(best % this.w), z: this.centerZ((best / this.w) | 0) };
      }
    }
    return null;
  }

  // Turrets are the small structure blobs; inhibitors and nexus are larger.
  findTurrets() {
    const { w, h, baseFlags } = this;
    const seen = new Uint8Array(w * h);
    const turrets = [];
    const mapSpan = this.w * this.cell;
    for (let i = 0; i < w * h; i++) {
      if (!(baseFlags[i] & FLAG.STRUCTURE) || seen[i]) continue;
      const cells = [];
      const stack = [i];
      seen[i] = 1;
      while (stack.length) {
        const c = stack.pop();
        cells.push(c);
        const x = c % w, z = (c / w) | 0;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, nz = z + dz;
          if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
          const j = nz * w + nx;
          if ((baseFlags[j] & FLAG.STRUCTURE) && !seen[j]) { seen[j] = 1; stack.push(j); }
        }
      }
      if (cells.length < 15 || cells.length > 30) continue;
      let sx = 0, sz = 0;
      for (const c of cells) { sx += c % w; sz += (c / w) | 0; }
      const x = this.centerX(sx / cells.length);
      const z = this.centerZ(sz / cells.length);
      const side = x + z < mapSpan ? 'blue' : 'red';
      const cornerDist = side === 'blue' ? Math.hypot(x, z) : Math.hypot(x - mapSpan, z - mapSpan);
      if (cornerDist < 1000) continue; // fountain platform pieces, not turrets
      const lane = cornerDist < 3300 ? 'nexus' : Math.abs(x - z) < 2500 ? 'mid' : x < z ? 'top' : 'bot';
      turrets.push({ x, z, side, lane });
    }
    return turrets;
  }
}
