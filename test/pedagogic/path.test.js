// Pedagogic mode: right-click movement paths.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findPath, walkLine } from '../../src/path.js';
import { makeGrid, at } from '../helpers.js';

const length = (from, pts) => pts.reduce((sum, p, i) => sum + Math.hypot(p.x - (i ? pts[i - 1] : from).x, p.z - (i ? pts[i - 1] : from).z), 0);

// Every leg of the path can be walked in a straight line.
function walkable(grid, side, from, pts) {
  return pts.every((p, i) => walkLine(grid, side, i ? pts[i - 1] : from, p));
}

test('a clear straight line is a single leg ending on the target', () => {
  const grid = makeGrid(['..........']);
  const from = at(0, 0), to = at(9, 0);
  assert.deepEqual(findPath(grid, 'blue', from, to), [to]);
});

test('the path goes around a wall and every leg is walkable', () => {
  const grid = makeGrid([
    '.........',
    '....#....',
    '....#....',
    '....#....',
    '.........',
  ]);
  const from = at(1, 2), to = at(7, 2);
  const path = findPath(grid, 'blue', from, to);
  assert.ok(path.length >= 2, 'turns at least once');
  assert.deepEqual(path.at(-1), to);
  assert.ok(walkable(grid, 'blue', from, path));
  assert.ok(length(from, path) > Math.hypot(to.x - from.x, to.z - from.z));
});

test('no path into a wall or to an unreachable area', () => {
  const grid = makeGrid([
    '...#...',
    '...#...',
    '...#...',
  ]);
  assert.equal(findPath(grid, 'blue', at(0, 1), at(3, 1)), null, 'target is a wall');
  assert.equal(findPath(grid, 'blue', at(0, 1), at(6, 1)), null, 'walled off');
  assert.equal(findPath(grid, 'blue', at(0, 1), { x: -100, z: 0 }), null, 'off the map');
});

test('paths do not cut wall corners diagonally', () => {
  const grid = makeGrid([
    '.#',
    '#.',
  ]);
  assert.equal(findPath(grid, 'blue', at(0, 0), at(1, 1)), null);
});

test('red cannot path through Blue-only ground, Blue can', () => {
  const grid = makeGrid([
    '...B...',
    '...B...',
    '...B...',
  ]);
  assert.equal(findPath(grid, 'red', at(0, 1), at(6, 1)), null);
  assert.ok(findPath(grid, 'blue', at(0, 1), at(6, 1)));
});

test('a champion snapped onto an unwalkable edge can still walk off it', () => {
  const grid = makeGrid(['.#...']);
  const path = findPath(grid, 'blue', at(1, 0), at(4, 0));
  assert.deepEqual(path.at(-1), at(4, 0));
});

test('same cell: walks straight to the exact point', () => {
  const grid = makeGrid(['..']);
  assert.deepEqual(findPath(grid, 'blue', { x: 5, z: 5 }, { x: 40, z: 30 }), [{ x: 40, z: 30 }]);
});
