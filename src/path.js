// A* on the navgrid, 8 directions without cutting wall corners, then
// string-pulled so the champion walks straight lines like in game.

class Heap {
  constructor() { this.items = []; this.keys = []; }
  get size() { return this.items.length; }
  push(item, key) {
    const a = this.items, k = this.keys;
    let i = a.length;
    a.push(item); k.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      a[i] = a[p]; k[i] = k[p]; i = p;
    }
    a[i] = item; k[i] = key;
  }
  pop() {
    const a = this.items, k = this.keys;
    const top = a[0];
    const item = a.pop(), key = k.pop();
    if (a.length) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= a.length) break;
        if (c + 1 < a.length && k[c + 1] < k[c]) c++;
        if (k[c] >= key) break;
        a[i] = a[c]; k[i] = k[c]; i = c;
      }
      a[i] = item; k[i] = key;
    }
    return top;
  }
}

export function findPath(grid, side, from, to) {
  const { w, h } = grid;
  const start = grid.index(from.x, from.z);
  const goal = grid.index(to.x, to.z);
  if (start < 0 || goal < 0 || !grid.walkable(goal, side)) return null;
  if (start === goal) return [{ x: to.x, z: to.z }];

  const n = w * h;
  const g = new Float32Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const gx = goal % w, gz = (goal / w) | 0;
  const heur = (i) => {
    const dx = Math.abs((i % w) - gx), dz = Math.abs(((i / w) | 0) - gz);
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
  };
  const open = new Heap();
  g[start] = 0;
  open.push(start, heur(start));
  // The start cell may be unwalkable if the champion was snapped onto an edge.
  const ok = (i) => i === start || grid.walkable(i, side);

  while (open.size) {
    const c = open.pop();
    if (c === goal) break;
    if (closed[c]) continue;
    closed[c] = 1;
    const x = c % w, z = (c / w) | 0;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
        const j = nz * w + nx;
        if (closed[j] || !ok(j)) continue;
        if (dx && dz && (!ok(z * w + nx) || !ok(nz * w + x))) continue;
        const cost = g[c] + (dx && dz ? Math.SQRT2 : 1);
        if (cost < g[j]) {
          g[j] = cost;
          came[j] = c;
          open.push(j, cost + heur(j));
        }
      }
    }
  }
  if (came[goal] < 0) return null;

  const cells = [];
  for (let c = goal; c !== start; c = came[c]) cells.push(c);
  cells.reverse();
  const pts = cells.map((c) => ({ x: grid.centerX(c % w), z: grid.centerZ((c / w) | 0) }));
  pts[pts.length - 1] = { x: to.x, z: to.z };
  return smooth(grid, side, from, pts);
}

// Can a point walk straight from a to b? Samples the segment every quarter cell.
export function walkLine(grid, side, a, b) {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const steps = Math.ceil(len / (grid.cell / 4));
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    const i = grid.index(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
    if (!grid.walkable(i, side)) return false;
  }
  return true;
}

function smooth(grid, side, from, pts) {
  const out = [];
  let anchor = from;
  let i = 0;
  while (i < pts.length) {
    let j = i;
    while (j + 1 < pts.length && walkLine(grid, side, anchor, pts[j + 1])) j++;
    out.push(pts[j]);
    anchor = pts[j];
    i = j + 1;
  }
  return out;
}
