// Pedagogic mode: which units see for each team, and who spots you.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { teamSources, whoSees } from '../../src/sources.js';
import { Vision } from '../../src/vision.js';
import { SIGHT } from '../../src/config.js';
import { openGrid, makeGrid, at } from '../helpers.js';

const turrets = [
  { x: 1000, z: 1000, side: 'blue', lane: 'mid' },
  { x: 2000, z: 2000, side: 'red', lane: 'top' },
  { x: 3000, z: 3000, side: 'red', lane: 'bot' },
];
const scenario = (over = {}) => ({
  side: 'blue',
  me: { x: 100, z: 200 },
  units: [
    { kind: 'champion', team: 'enemy', x: 10, z: 10 },
    { kind: 'stealth', team: 'enemy', x: 20, z: 20 },
    { kind: 'control', team: 'ally', x: 30, z: 30 },
    { kind: 'farsight', team: 'enemy', x: 40, z: 40 },
  ],
  turrets,
  deadTurrets: new Set(),
  sight: { ...SIGHT },
  ...over,
});

test('your team: you, your units and your side\'s turrets', () => {
  const list = teamSources('ally', scenario());
  assert.deepEqual(list.map((s) => s.name), ['You', 'Ally Control Ward', 'Blue mid turret']);
  assert.deepEqual(list.map((s) => s.sight), [SIGHT.champion, SIGHT.control, SIGHT.turret]);
  assert.deepEqual([list[0].x, list[0].z], [100, 200]);
});

test('enemy team: their units with each kind\'s sight, and the other side\'s turrets', () => {
  const list = teamSources('enemy', scenario());
  assert.deepEqual(list.map((s) => s.name), ['Enemy Champion', 'Enemy Stealth Ward', 'Enemy Farsight Ward', 'Red top turret', 'Red bot turret']);
  assert.deepEqual(list.map((s) => s.sight), [1350, 900, 500, 1350, 1350]);
});

test('playing Red swaps which turrets are yours', () => {
  assert.deepEqual(teamSources('ally', scenario({ side: 'red' })).filter((s) => s.turret !== undefined).map((s) => s.turret), [1, 2]);
  assert.deepEqual(teamSources('enemy', scenario({ side: 'red' })).filter((s) => s.turret !== undefined).map((s) => s.turret), [0]);
});

test('destroyed turrets give no vision', () => {
  const list = teamSources('enemy', scenario({ deadTurrets: new Set([1]) }));
  assert.deepEqual(list.filter((s) => s.turret !== undefined).map((s) => s.name), ['Red bot turret']);
});

test('edited sight radii are used', () => {
  const list = teamSources('enemy', scenario({ sight: { ...SIGHT, stealth: 1100 } }));
  assert.equal(list.find((s) => s.name === 'Enemy Stealth Ward').sight, 1100);
});

test('whoSees names every enemy source that sees you, and only those', () => {
  const grid = openGrid(100);
  const v = new Vision(grid);
  const me = at(50, 50);
  const list = [
    { name: 'Near ward', ...at(55, 50), sight: 900 },
    { name: 'Far ward', ...at(90, 50), sight: 900 },
    { name: 'Champion', ...at(50, 70), sight: 1350 },
  ];
  assert.deepEqual(whoSees(grid, v, list, me.x, me.z), ['Near ward', 'Champion']);
});

test('standing in a brush hides you from a ward outside it', () => {
  const grid = makeGrid([
    '..........',
    '....bb....',
    '....bb....',
    '..........',
  ]);
  const v = new Vision(grid);
  const outside = [{ name: 'Ward', ...at(1, 1), sight: 900 }];
  const inside = [{ name: 'Ward in brush', ...at(5, 2), sight: 900 }];
  const me = at(4, 1);
  assert.deepEqual(whoSees(grid, v, outside, me.x, me.z), []);
  assert.deepEqual(whoSees(grid, v, inside, me.x, me.z), ['Ward in brush']);
});
