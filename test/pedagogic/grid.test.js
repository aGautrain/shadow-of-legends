// Pedagogic mode: the navgrid (who can walk where, terrain overlays) and the
// real Summoner's Rift data it is built from.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FLAG } from '../../src/grid.js';
import { Vision, has } from '../../src/vision.js';
import { TERRAINS, ART_ONLY_TERRAINS, SIGHT } from '../../src/config.js';
import { makeGrid, loadRealGrid, at, CELL } from '../helpers.js';

test('walls and see-through walls are not walkable, floor and brush are', () => {
  const grid = makeGrid(['.#~b']);
  assert.deepEqual([0, 1, 2, 3].map((i) => grid.walkable(i, 'blue')), [true, false, false, true]);
  assert.ok(!grid.walkable(-1, 'blue'), 'off the map');
});

test('team-only cells and base gates are walkable by their owner only', () => {
  const grid = makeGrid(['BRg']);
  assert.ok(grid.walkable(0, 'blue'));
  assert.ok(!grid.walkable(0, 'red'));
  assert.ok(grid.walkable(1, 'red'));
  assert.ok(!grid.walkable(1, 'blue'));
  assert.ok(grid.walkable(2, 'blue'), 'blue gate, blue walks it');
  assert.ok(!grid.walkable(2, 'red'));
});

test('world to cell conversion', () => {
  const grid = makeGrid(['....', '....']);
  assert.equal(grid.index(0, 0), 0);
  assert.equal(grid.index(CELL * 3 + 1, CELL + 1), grid.w + 3);
  assert.equal(grid.index(-1, 0), -1);
  assert.equal(grid.index(CELL * 4, 0), -1);
  assert.equal(grid.index(0, CELL * 2), -1);
  assert.deepEqual([grid.centerX(2), grid.centerZ(1)], [2.5 * CELL, 1.5 * CELL]);
});

test('nearestWalkable keeps a walkable point and snaps others to the closest floor', () => {
  const grid = makeGrid([
    '.....',
    '.###.',
    '.###.',
    '.###.',
    '.....',
  ]);
  assert.deepEqual(grid.nearestWalkable(10, 10, 'blue'), { x: 10, z: 10 });
  const snapped = grid.nearestWalkable(at(1, 2).x, at(1, 2).z, 'blue'); // left edge of the block
  assert.deepEqual(snapped, at(0, 2));
});

test('nearestWalkable respects the team and gives up on an all-wall map', () => {
  const grid = makeGrid(['RRR.']);
  assert.deepEqual(grid.nearestWalkable(at(0, 0).x, at(0, 0).z, 'blue'), at(3, 0));
  assert.equal(makeGrid(['###']).nearestWalkable(0, 0, 'blue'), null);
});

test('a terrain overlay changes walls and brush and can be removed', () => {
  const grid = makeGrid(['.....', '.....'], { soul: [{ x: 1, z: 0, rows: ['#b'] }] });
  grid.setTerrain(['soul']);
  assert.ok(!grid.walkable(1, 'blue'));
  assert.ok(grid.brush[2] > 0);
  grid.setTerrain([]);
  assert.ok(grid.walkable(1, 'blue'));
  assert.equal(grid.brush[2], 0);
});

test('a terrain overlay never replaces structure cells', () => {
  const grid = makeGrid(['.S.'], { soul: [{ x: 0, z: 0, rows: ['b.b'] }] });
  grid.setTerrain(['soul']);
  assert.ok(grid.flags[1] & FLAG.STRUCTURE);
  assert.equal(grid.brushCount, 2);
});

test('an unknown terrain name is ignored', () => {
  const grid = makeGrid(['..']);
  grid.setTerrain(['nope']);
  assert.ok(grid.walkable(0, 'blue'));
});

// ---------------------------------------------------------------- real map

test('Summoner\'s Rift has 11 turrets per side in the right lanes', () => {
  const turrets = loadRealGrid().findTurrets();
  for (const side of ['blue', 'red']) {
    const lanes = {};
    for (const t of turrets.filter((t) => t.side === side)) lanes[t.lane] = (lanes[t.lane] || 0) + 1;
    assert.deepEqual(lanes, { top: 3, mid: 3, bot: 3, nexus: 2 }, side);
  }
});

test('both fountains are walkable, and each base has gates only its team can walk', () => {
  const grid = loadRealGrid();
  assert.ok(grid.walkable(grid.index(560, 560), 'blue'));
  assert.ok(grid.walkable(grid.index(14200, 14200), 'red'));
  for (const [flag, owner, other] of [[FLAG.BLUE_ONLY, 'blue', 'red'], [FLAG.RED_ONLY, 'red', 'blue']]) {
    const gates = [];
    grid.flags.forEach((f, i) => { if ((f & flag) && (f & FLAG.GATE_VISION)) gates.push(i); });
    assert.ok(gates.length > 0, `${owner} gate cells`);
    assert.ok(gates.every((i) => grid.walkable(i, owner) && !grid.walkable(i, other)), owner);
  }
});

test('every terrain with map changes has an overlay in the data', () => {
  const grid = loadRealGrid();
  const names = Object.values(TERRAINS).flat().map(([k]) => k).filter((k) => k && !ART_ONLY_TERRAINS.includes(k));
  for (const name of names) assert.ok(grid.overlays[name]?.length, name);
  for (const name of ART_ONLY_TERRAINS) assert.equal(grid.overlays[name], undefined, name);
});

test('a champion standing in a river brush sees the brush, a champion outside does not', () => {
  const grid = loadRealGrid();
  const v = new Vision(grid);
  // Find a brush patch and a walkable cell outside of it, in sight range.
  const cell = grid.brush.findIndex((id) => id > 0);
  const id = grid.brush[cell];
  const cx = cell % grid.w, cz = (cell / grid.w) | 0;
  const inside = { x: grid.centerX(cx), z: grid.centerZ(cz) };
  let outside = null;
  for (let r = 1; r < 10 && !outside; r++) {
    for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
      const j = (cz + dz) * grid.w + cx + dx;
      if (!grid.brush[j] && grid.walkable(j, 'blue')) { outside = { x: grid.centerX(cx + dx), z: grid.centerZ(cz + dz) }; break; }
    }
  }
  assert.ok(outside, 'a floor cell next to the brush');
  assert.ok(has(v.source(inside.x, inside.z, SIGHT.champion), cell));
  assert.ok(!has(v.source(outside.x, outside.z, SIGHT.champion), cell));
  assert.ok(id > 0);
});
