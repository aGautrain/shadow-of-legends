// Pedagogic mode: what a unit can see (sight radius, walls, brush, base gates).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vision, has } from '../../src/vision.js';
import { makeGrid, openGrid, at, CELL } from '../helpers.js';

// Does a source at cell (sx, sz) with this radius see cell (tx, tz)?
function sees(grid, [sx, sz], [tx, tz], radius = 1000) {
  const v = new Vision(grid);
  const s = at(sx, sz);
  return Boolean(has(v.source(s.x, s.z, radius), tz * grid.w + tx));
}

test('sees open cells within the sight radius and none beyond', () => {
  const grid = openGrid(41);
  const r = 10 * CELL; // 10 cells
  assert.ok(sees(grid, [20, 20], [20, 20], r), 'own cell');
  assert.ok(sees(grid, [20, 20], [30, 20], r), 'exactly at the radius');
  assert.ok(!sees(grid, [20, 20], [31, 20], r), 'one cell past the radius');
  assert.ok(sees(grid, [20, 20], [27, 27], r), 'diagonal inside (9.9 cells)');
  assert.ok(!sees(grid, [20, 20], [28, 28], r), 'diagonal outside (11.3 cells)');
});

test('the visible area is a disc of about pi r^2 cells', () => {
  const grid = openGrid(81);
  const v = new Vision(grid);
  const s = at(40, 40);
  const bits = v.source(s.x, s.z, 1350);
  let n = 0;
  for (let i = 0; i < grid.w * grid.h; i++) if (has(bits, i)) n++;
  const expected = Math.PI * (1350 / CELL) ** 2;
  assert.ok(Math.abs(n - expected) / expected < 0.03, `${n} cells, expected about ${Math.round(expected)}`);
});

test('a wall blocks the cells behind it but not the wall-free sides', () => {
  const grid = makeGrid([
    '...........',
    '...........',
    '.....#.....',
    '...........',
    '...........',
  ]);
  assert.ok(!sees(grid, [2, 2], [8, 2]), 'straight behind the wall');
  assert.ok(sees(grid, [2, 2], [5, 2]), 'the wall cell itself is seen');
  assert.ok(sees(grid, [2, 2], [8, 0]), 'past the wall, off its line');
  assert.ok(sees(grid, [2, 2], [8, 4]), 'past the wall, other side');
});

test('a see-through wall blocks walking but not sight', () => {
  const grid = makeGrid([
    '.........',
    '....~....',
    '.........',
  ]);
  assert.ok(sees(grid, [1, 1], [7, 1]));
  assert.ok(!grid.walkable(1 * grid.w + 4, 'blue'));
});

test('a line through a wall corner is blocked when it passes the wall cell', () => {
  const grid = makeGrid([
    '.....',
    '.#...',
    '.....',
    '.....',
  ]);
  // From (0,0) to (2,2) the line passes through the center of (1,1), the wall.
  assert.ok(!sees(grid, [0, 0], [2, 2]));
  // From (0,0) to (3,0) along the row: the wall is not on the line.
  assert.ok(sees(grid, [0, 0], [3, 0]));
});

const BRUSH = [
  '..............',
  '..............',
  '...bbb...bb...',
  '...bbb...bb...',
  '..............',
  '..............',
];

test('brush cells are hidden from a unit outside the brush', () => {
  const grid = makeGrid(BRUSH);
  assert.ok(!sees(grid, [4, 5], [4, 3]), 'outside looking in');
  assert.ok(!sees(grid, [0, 2], [4, 2]), 'brush edge cell too');
});

test('brush blocks sight through it for a unit outside', () => {
  const grid = makeGrid(BRUSH);
  // Looking along row 2 from the left: the brush at x 3..5 hides x 7 behind it.
  assert.ok(!sees(grid, [1, 2], [7, 2]));
  assert.ok(sees(grid, [1, 0], [7, 0]), 'the row above the brush is clear');
});

test('a unit in a brush sees its whole patch and out of it', () => {
  const grid = makeGrid(BRUSH);
  for (const cell of [[3, 2], [5, 2], [3, 3], [5, 3]]) assert.ok(sees(grid, [4, 2], cell), `patch cell ${cell}`);
  assert.ok(sees(grid, [4, 3], [4, 5]), 'out of the brush');
  assert.ok(sees(grid, [5, 2], [7, 2]), 'out the far side');
});

test('a unit in one brush does not see into another brush patch', () => {
  const grid = makeGrid(BRUSH);
  assert.notEqual(grid.brush[2 * grid.w + 4], grid.brush[2 * grid.w + 9], 'two separate patches');
  assert.ok(!sees(grid, [5, 2], [9, 2]));
  assert.ok(!sees(grid, [5, 2], [11, 2]), 'nor through it');
});

test('diagonally touching brush cells are one patch', () => {
  const grid = makeGrid([
    'b...',
    '.b..',
    '..b.',
  ]);
  assert.equal(grid.brushCount, 1);
  assert.ok(sees(grid, [0, 0], [2, 2]));
});

test('a cell flagged both brush and wall is see-through wall, not brush', () => {
  const grid = makeGrid([
    '......',
    '..w...',
    '......',
  ]);
  const i = 1 * grid.w + 2;
  assert.equal(grid.brushCount, 0);
  assert.equal(grid.solid[i], 0);
  assert.ok(!grid.walkable(i, 'blue'));
  assert.ok(sees(grid, [0, 1], [5, 1]), 'sight passes over it');
});

const GATE = [
  '..........',
  '...g......',
  '...g......',
  '...g......',
  '..........',
];

test('a base gate can be seen into but not through', () => {
  const grid = makeGrid(GATE);
  assert.ok(sees(grid, [0, 2], [3, 2]), 'the gate cell itself');
  assert.ok(!sees(grid, [0, 2], [6, 2]), 'the cells behind the gate');
  assert.ok(sees(grid, [0, 0], [6, 0]), 'around the gate');
});

test('a unit standing in a gate sees out on both sides', () => {
  const grid = makeGrid(GATE);
  assert.ok(sees(grid, [3, 2], [0, 2]));
  assert.ok(sees(grid, [3, 2], [7, 2]));
});

test('merge is the union of several sources', () => {
  const grid = openGrid(60);
  const v = new Vision(grid);
  const a = at(5, 5), b = at(50, 50);
  const both = v.merge([v.source(a.x, a.z, 500), v.source(b.x, b.z, 500)]);
  assert.ok(has(both, 5 * grid.w + 5));
  assert.ok(has(both, 50 * grid.w + 50));
  assert.ok(!has(both, 28 * grid.w + 28));
  assert.ok(!has(v.merge([]), 5 * grid.w + 5), 'no sources, nothing seen');
});

test('a source off the map sees nothing, and has() is false off the map', () => {
  const grid = openGrid(10);
  const v = new Vision(grid);
  const bits = v.source(-500, -500, 1350);
  assert.ok(bits.every((w) => w === 0));
  assert.ok(!has(v.source(...Object.values(at(1, 1)), 1350), -1));
});

test('results are cached per cell and radius, and reset clears them', () => {
  const grid = openGrid(20);
  const v = new Vision(grid);
  const p = at(3, 3);
  const first = v.source(p.x, p.z, 400);
  assert.equal(v.source(p.x + 10, p.z + 10, 400), first, 'same cell, same bitset');
  assert.notEqual(v.source(p.x, p.z, 450), first, 'other radius, new bitset');
  v.reset();
  assert.notEqual(v.source(p.x, p.z, 400), first);
});
