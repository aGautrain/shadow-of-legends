// Hide and seek: the Fantasy option, champion categories and their spells.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES } from '../../src/hideseek/rules.js';
import { SPELLS, categoryOf, blinkTarget, spellStats } from '../../src/hideseek/spells.js';
import { makeRoom, openGrid, at, HOST_ID } from '../helpers.js';

const HIDE = RULES.hide;

// A started room (round 1 hide phase: Blue seeks) where each player's
// champion has the given category. players: [[id, team, category]].
function fantasyRoom(players, settings = {}) {
  const room = makeRoom();
  for (const [id, team, category] of players) {
    room.join(id, id, team);
    if (category) room.server.categories.set('Champ' + id, category);
  }
  if (Object.keys(settings).length) room.send(HOST_ID, { t: 'settings', ...settings });
  room.ready(...players.map(([id]) => id));
  room.advance(3.1);
  return room;
}
const toSeek = (room) => room.advance(HIDE + 0.1);
const cast = (room, id, x, z) => room.send(id, { t: 'cast', x, z });
const snapOf = (room, id) => room.last(HOST_ID, 'snap').p.find((q) => q[0] === id);

test('the category is the first Data Dragon tag, if it is one of the six', () => {
  assert.deepEqual(Object.keys(SPELLS), ['Mage', 'Assassin', 'Fighter', 'Tank', 'Marksman', 'Support']);
  assert.equal(categoryOf(['Mage', 'Assassin']), 'Mage');
  assert.equal(categoryOf(['Assassin', 'Mage']), 'Assassin');
  assert.equal(categoryOf(['Tank']), 'Tank');
  assert.equal(categoryOf(['Jungler']), null);
  assert.equal(categoryOf([]), null);
  assert.equal(categoryOf(undefined), null);
});

test('the spells have the agreed numbers', () => {
  assert.equal(SPELLS.Mage.range, 450); assert.equal(SPELLS.Mage.cooldown, 30);
  assert.equal(SPELLS.Assassin.duration, 3); assert.equal(SPELLS.Assassin.cooldown, 45);
  assert.equal(SPELLS.Fighter.speed, 1.4); assert.equal(SPELLS.Fighter.duration, 3); assert.equal(SPELLS.Fighter.cooldown, 25);
  assert.equal(SPELLS.Tank.radius, 1000); assert.equal(SPELLS.Tank.root, 1.5); assert.equal(SPELLS.Tank.cooldown, 40);
  assert.equal(SPELLS.Marksman.range, 3000); assert.equal(SPELLS.Marksman.radius, 500); assert.equal(SPELLS.Marksman.duration, 4);
  assert.equal(SPELLS.Marksman.cooldown, 45);
  assert.equal(SPELLS.Support.radius, 900); assert.equal(SPELLS.Support.cooldown, 40);
});

test('each spell explains itself for hiders and seekers, with its numbers', () => {
  for (const sp of Object.values(SPELLS)) {
    assert.ok(sp.text && sp.hider && sp.seeker, sp.name);
    assert.deepEqual(spellStats(sp)[0], ['Cooldown', `${sp.cooldown} s`]);
  }
  assert.deepEqual(spellStats(SPELLS.Tank), [['Cooldown', '40 s'], ['Radius', '1000'], ['Root', '1.5 s']]);
  assert.deepEqual(spellStats(SPELLS.Fighter), [['Cooldown', '25 s'], ['Speed', '+40%'], ['Duration', '3 s']]);
  assert.deepEqual(spellStats(SPELLS.Marksman), [['Cooldown', '45 s'], ['Range', '3000'], ['Radius', '500'], ['Duration', '4 s']]);
});

test('the room message tells each player\'s category', () => {
  const room = makeRoom();
  room.server.categories.set('Lux', 'Mage');
  room.join(HOST_ID, 'Host', 'blue');
  room.send(HOST_ID, { t: 'set', champion: 'Lux' });
  assert.equal(room.last(HOST_ID, 'room').players[0].category, 'Mage');
  room.send(HOST_ID, { t: 'set', champion: 'Unknown' });
  assert.equal(room.last(HOST_ID, 'room').players[0].category, null, 'no category, no spell');
});

test('with Fantasy off, nobody can cast', () => {
  const room = fantasyRoom([[HOST_ID, 'blue', 'Fighter'], ['r1', 'red', 'Fighter']], { fantasy: false });
  cast(room, 'r1');
  toSeek(room);
  cast(room, HOST_ID);
  assert.equal(room.all(HOST_ID, 'spell').length, 0);
});

test('a champion without a category cannot cast', () => {
  const room = fantasyRoom([[HOST_ID, 'blue', null], ['r1', 'red', 'Fighter']]);
  toSeek(room);
  cast(room, HOST_ID);
  assert.equal(room.all('r1', 'spell').length, 0);
});

test('hiders cast from the hide phase on, seekers once released, caught hiders never', () => {
  const room = fantasyRoom([[HOST_ID, 'blue', 'Fighter'], ['r1', 'red', 'Fighter'], ['r2', 'red', 'Fighter']]);
  cast(room, HOST_ID);
  assert.equal(room.all('r1', 'spell').length, 0, 'seeker held in the fountain');
  cast(room, 'r1');
  assert.deepEqual(room.last('r1', 'spell'), { t: 'spell', id: 'r1', category: 'Fighter', team: 'red', ms: 3000 });
  room.move('r2', 5000, 5000);
  toSeek(room);
  cast(room, HOST_ID);
  assert.equal(room.last('r1', 'spell').id, HOST_ID);
  room.move(HOST_ID, 5000, 5600);
  room.advance(2.2);
  assert.equal(room.player('r2').caught, true);
  cast(room, 'r2');
  assert.notEqual(room.last('r1', 'spell').id, 'r2');
});

test('a spell has a cooldown, shown in the snapshot, and is ready again each round', () => {
  const room = fantasyRoom([[HOST_ID, 'blue', 'Fighter'], ['r1', 'red', 'Fighter']]);
  room.move('r1', 12000, 3000);
  cast(room, 'r1');
  cast(room, 'r1');
  assert.equal(room.all('r1', 'spell').length, 1, 'on cooldown');
  room.advance(1);
  assert.ok(Math.abs(snapOf(room, 'r1')[7] - 24) < 0.2, 'seconds until ready');
  room.advance(24.1);
  cast(room, 'r1');
  assert.equal(room.all('r1', 'spell').length, 2);
  // Round 2: Red seeks, the cooldown is gone.
  toSeek(room);
  room.advance(RULES.seek + RULES.roundBreak + 0.5);
  assert.equal(room.server.round, 2);
  room.move(HOST_ID, 5000, 5000);
  cast(room, HOST_ID);
  assert.equal(room.last('r1', 'spell').id, HOST_ID);
  assert.equal(snapOf(room, 'r1')[7], 0);
});

test('Mage: Blink moves the caster to a floor spot in range', () => {
  const room = fantasyRoom([[HOST_ID, 'blue', null], ['r1', 'red', 'Mage']]);
  room.move('r1', 5000, 5000);
  cast(room, 'r1', 5000 + 700, 5000);
  assert.equal(room.all('r1', 'spell').length, 0, 'too far');
  cast(room, 'r1', 'x', 5000);
  assert.equal(room.all('r1', 'spell').length, 0, 'no target');
  cast(room, 'r1', 5450, 5000);
  assert.equal(room.player('r1').x, 5450);
  assert.deepEqual(room.last(HOST_ID, 'spell'), { t: 'spell', id: 'r1', category: 'Mage', team: 'red', from: [5000, 5000], x: 5450, z: 5000 });
});

test('Mage: Blink cannot land in a wall, and a rooted Mage cannot blink', () => {
  const grid = openGrid(300, [[105, 100, '#']]);
  const room = makeRoom(grid);
  room.server.categories.set('Champr1', 'Mage');
  room.server.categories.set('Champhost', 'Tank');
  room.join(HOST_ID, 'Host', 'blue'); room.join('r1', 'r1', 'red');
  room.ready(HOST_ID, 'r1');
  room.advance(3.1);
  room.move('r1', at(100, 100).x, at(100, 100).z);
  const wall = at(105, 100);
  cast(room, 'r1', wall.x, wall.z);
  assert.equal(room.all('r1', 'spell').length, 0);
  toSeek(room);
  room.move(HOST_ID, at(100, 110).x, at(100, 110).z);
  cast(room, HOST_ID);
  cast(room, 'r1', at(104, 100).x, at(104, 100).z);
  assert.equal(room.last('r1', 'spell').category, 'Tank', 'rooted: no Blink');
});

test('Mage: the landing spot crosses a thin wall, or stops before a thick one', () => {
  // A one-cell wall at x = 104, then a wall from x = 120 to the edge.
  const edits = [];
  for (let z = 0; z < 40; z++) { edits.push([104, z, '#']); for (let x = 120; x < 140; x++) edits.push([x, z, '#']); }
  const grid = openGrid(140, edits);
  const from = at(100, 20);
  const over = blinkTarget(grid, 'blue', from, from.x + 400, from.z);
  assert.equal(over.x, from.x + 400, 'over the thin wall');
  const capped = blinkTarget(grid, 'blue', from, from.x + 5000, from.z);
  assert.equal(capped.x, from.x + 450, 'range is 450');
  const near = at(116, 20);
  const stop = blinkTarget(grid, 'blue', near, near.x + 450, near.z);
  assert.ok(stop.x < 120 * 50 && stop.x > 119 * 50, 'last floor before the thick wall');
});

test('Assassin: a shrouded hider cannot be spotted, and is flagged in the snapshot', () => {
  const room = fantasyRoom([[HOST_ID, 'blue', null], ['r1', 'red', 'Assassin']]);
  room.move('r1', 5000, 5000);
  toSeek(room);
  room.move(HOST_ID, 5000, 5600);
  room.advance(1);
  cast(room, 'r1');
  room.advance(0.1);
  assert.equal(snapOf(room, 'r1')[6] & 1, 1);
  room.advance(2.8);
  assert.equal(room.player('r1').caught, false);
  assert.equal(room.player('r1').spot, 0, 'the meter drained');
  room.advance(0.3);
  assert.equal(snapOf(room, 'r1')[6] & 1, 0, 'visible again');
  room.advance(2.2);
  assert.equal(room.player('r1').caught, true);
});

test('Assassin: a shrouded seeker still catches', () => {
  const room = fantasyRoom([[HOST_ID, 'blue', 'Assassin'], ['r1', 'red', null]]);
  room.move('r1', 5000, 5000);
  toSeek(room);
  room.move(HOST_ID, 5000, 5600);
  cast(room, HOST_ID);
  room.advance(2.2);
  assert.equal(room.player('r1').caught, true);
});

test('Fighter: Surge is announced with its duration; the client applies the speed', () => {
  const room = fantasyRoom([[HOST_ID, 'blue', null], ['r1', 'red', 'Fighter']]);
  cast(room, 'r1');
  assert.deepEqual(room.last(HOST_ID, 'spell'), { t: 'spell', id: 'r1', category: 'Fighter', team: 'red', ms: 3000 });
  assert.equal(room.player('r1').readyAt, room.now + 25000);
});

test('Tank: Earthshaker roots enemies within 1000 for 1.5 s, not allies or farther enemies', () => {
  const room = fantasyRoom([[HOST_ID, 'blue', 'Tank'], ['b2', 'blue', null], ['r1', 'red', null], ['r2', 'red', null]]);
  room.move('r1', 5900, 5000);
  room.move('r2', 6200, 5000);
  toSeek(room);
  room.move(HOST_ID, 5000, 5000);
  room.move('b2', 5100, 5000);
  cast(room, HOST_ID);
  const msg = room.last('r1', 'spell');
  assert.deepEqual(msg, { t: 'spell', id: HOST_ID, category: 'Tank', team: 'blue', x: 5000, z: 5000, radius: 1000, ms: 1500, hit: ['r1'] });
  assert.deepEqual(room.last('b2', 'spell'), msg, 'everyone sees the area');
  room.move('r1', 7000, 5000);
  assert.equal(room.player('r1').x, 5900, 'rooted');
  room.advance(0.2);
  assert.equal(snapOf(room, 'r1')[6] & 2, 2);
  room.move('b2', 5200, 5000);
  assert.equal(room.player('b2').x, 5200, 'allies are not rooted');
  room.advance(1.4);
  room.move('r1', 7000, 5000);
  assert.equal(room.player('r1').x, 7000, 'free again');
});

test('Tank: a hider can root seekers to escape', () => {
  const room = fantasyRoom([[HOST_ID, 'blue', null], ['r1', 'red', 'Tank']]);
  room.move('r1', 5000, 5000);
  toSeek(room);
  room.move(HOST_ID, 5000, 5600);
  cast(room, 'r1');
  assert.deepEqual(room.last(HOST_ID, 'spell').hit, [HOST_ID]);
  room.move(HOST_ID, 5000, 5300);
  assert.equal(room.player(HOST_ID).z, 5600);
});

test('Marksman: a seeker\'s Flare sees and catches far away, then fades after 4 s', () => {
  const room = fantasyRoom([[HOST_ID, 'blue', 'Marksman'], ['r1', 'red', null], ['r2', 'red', null]]);
  room.move('r1', 7500, 5000);
  room.move('r2', 9000, 5000);
  toSeek(room);
  room.move(HOST_ID, 5000, 5000);
  cast(room, HOST_ID, 9000, 5000);
  assert.equal(room.all('r1', 'spell').length, 0, 'beyond 3000');
  cast(room, HOST_ID, 7500, 5000);
  assert.deepEqual(room.last('r1', 'spell'), { t: 'spell', id: HOST_ID, category: 'Marksman', team: 'blue', x: 7500, z: 5000, radius: 500, ms: 4000 });
  room.advance(0.2);
  assert.deepEqual(room.last('r1', 'snap').f, [[HOST_ID, 7500, 5000]], 'both teams get the area');
  room.advance(2.1);
  assert.equal(room.player('r1').caught, true);
  assert.equal(room.player('r1').caughtBy, HOST_ID);
  room.advance(1.8);
  assert.deepEqual(room.last('r1', 'snap').f, []);
});

test('Marksman: a hider\'s Flare only scouts, it never spots', () => {
  const room = fantasyRoom([[HOST_ID, 'blue', null], ['r1', 'red', 'Marksman'], ['r2', 'red', null]]);
  room.move('r1', 5000, 5000);
  room.move('r2', 7000, 5000);
  toSeek(room);
  cast(room, 'r1', 7000, 5000);
  room.advance(3);
  assert.equal(room.player('r2').spot, 0);
  assert.equal(room.server.flares.length, 1);
});

test('Support: Sweep destroys nearby enemy wards and gives one ward each, with no cap', () => {
  const room = fantasyRoom([[HOST_ID, 'blue', null], ['r1', 'red', 'Support']], { seekerWards: 3, hiderWards: 1 });
  room.move('r1', 5000, 5000);
  toSeek(room);
  room.move(HOST_ID, 5000, 5500);
  for (const [x, z] of [[5000, 5600], [5400, 5300], [5000, 6000]]) room.send(HOST_ID, { t: 'ward', x, z });
  room.send('r1', { t: 'ward', x: 5100, z: 5000 });
  assert.equal(room.server.wards.length, 4);
  // Distances to r1: 600, 500, 1000 (out of range); r1's own ward stays.
  cast(room, 'r1');
  assert.equal(room.last(HOST_ID, 'spell').swept, 2);
  assert.deepEqual(room.server.wards.map((w) => [w.owner, w.x, w.z]), [[HOST_ID, 5000, 6000], ['r1', 5100, 5000]]);
  assert.equal(room.player('r1').wards, 2, 'had 1, used it, got 2: more than the starting count');
});

test('Support: a sweep with no enemy ward around still goes on cooldown', () => {
  const room = fantasyRoom([[HOST_ID, 'blue', null], ['r1', 'red', 'Support']]);
  cast(room, 'r1');
  assert.equal(room.last(HOST_ID, 'spell').swept, 0);
  assert.equal(room.player('r1').wards, 0);
  cast(room, 'r1');
  assert.equal(room.all(HOST_ID, 'spell').length, 1);
});
