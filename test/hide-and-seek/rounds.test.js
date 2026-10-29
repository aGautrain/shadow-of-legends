// Hide and seek: round flow, role swap, moving, catching and wards.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, FOUNTAIN, seekerOf, otherTeam, moveSpeed } from '../../src/hideseek/rules.js';
import { startedRoom, makeRoom, hideSeekGrid, HOST_ID, at } from '../helpers.js';

const HIDE = RULES.hide, SEEK = RULES.seek;

// From the start of round 1's hide phase to its seek phase.
function toSeek(room) { room.advance(HIDE + 0.1); }

test('players move at 500 during the hide phase and 345 otherwise', () => {
  assert.equal(moveSpeed('hide'), 500);
  assert.equal(moveSpeed('seek'), 345);
  assert.equal(moveSpeed('lobby'), 345);
});

test('Blue seeks in round 1 and Red in round 2', () => {
  assert.equal(seekerOf(1), 'blue');
  assert.equal(seekerOf(2), 'red');
  assert.equal(otherTeam('blue'), 'red');
  assert.equal(otherTeam('red'), 'blue');
});

test('round 1 starts in the hide phase with everyone at their fountain', () => {
  const room = startedRoom([['b2', 'blue'], ['r1', 'red'], ['r2', 'red']]);
  const msg = room.last('r1', 'phase');
  assert.equal(msg.phase, 'hide');
  assert.equal(msg.round, 1);
  assert.equal(msg.seekTeam, 'blue');
  assert.equal(msg.ms, HIDE * 1000);
  for (const [id, p] of room.server.players) {
    const c = FOUNTAIN[p.team];
    assert.ok(Math.hypot(p.x - c.x, p.z - c.z) <= 200, `${id} near the ${p.team} fountain`);
    assert.deepEqual(msg.spawns[id], { x: p.x, z: p.z });
  }
  const [r1, r2] = [room.player('r1'), room.player('r2')];
  assert.notDeepEqual([r1.x, r1.z], [r2.x, r2.z], 'teammates are spread out');
});

test('by default seekers get 2 wards and hiders none', () => {
  const room = startedRoom([['r1', 'red']]);
  assert.equal(room.player(HOST_ID).wards, 2);
  assert.equal(room.player('r1').wards, 0);
});

// A started room after the host picked ward counts in the lobby.
function wardRoom(seekerWards, hiderWards, players = [['r1', 'red']]) {
  const room = makeRoom();
  room.join(HOST_ID, 'Host', 'blue');
  for (const [id, team] of players) room.join(id, id, team);
  room.send(HOST_ID, { t: 'settings', seekerWards, hiderWards });
  room.ready(HOST_ID, ...players.map(([id]) => id));
  room.advance(3.1);
  return room;
}

test('the host\'s ward counts are handed out each round', () => {
  const room = wardRoom(4, 1);
  assert.equal(room.player(HOST_ID).wards, 4);
  assert.equal(room.player('r1').wards, 1);
  room.move('r1', 5000, 5000);
  toSeek(room);
  room.move(HOST_ID, 5000, 5600);
  room.advance(2.2);
  room.advance(RULES.roundBreak + 0.1);
  assert.equal(room.server.round, 2);
  assert.equal(room.player('r1').wards, 4, 'Red seeks now');
  assert.equal(room.player(HOST_ID).wards, 1, 'Blue hides now');
});

test('seekers are held in their fountain during the hide phase', () => {
  const room = startedRoom([['r1', 'red']]);
  const host = room.player(HOST_ID);
  const start = [host.x, host.z];
  room.move(HOST_ID, 5000, 5000);
  room.move('r1', 6000, 6000);
  assert.deepEqual([host.x, host.z], start);
  assert.deepEqual([room.player('r1').x, room.player('r1').z], [6000, 6000]);
});

test('positions must be finite numbers', () => {
  const room = startedRoom([['r1', 'red']]);
  room.move('r1', 6000, 6000);
  for (const [x, z] of [[NaN, 1], [Infinity, 1], ['a', 1], [undefined, 1]]) room.move('r1', x, z);
  assert.deepEqual([room.player('r1').x, room.player('r1').z], [6000, 6000]);
});

test('the hide phase lasts the chosen time, then the seek phase starts', () => {
  const room = startedRoom([['r1', 'red']]);
  room.advance(HIDE - 0.2);
  assert.equal(room.server.phase, 'hide');
  room.advance(0.3);
  assert.equal(room.server.phase, 'seek');
  assert.equal(room.last('r1', 'phase').ms, SEEK * 1000);
});

test('a hider in the seekers\' vision is caught after 2 s in a row', () => {
  const room = startedRoom([['r1', 'red']]);
  room.move('r1', 5000, 5000);
  toSeek(room);
  room.move(HOST_ID, 5000, 5600);
  room.advance(1.8);
  assert.equal(room.player('r1').caught, false);
  assert.ok(room.player('r1').spot > 1.7);
  room.advance(0.4);
  assert.equal(room.player('r1').caught, true);
  assert.deepEqual(room.last('r1', 'caught'), { t: 'caught', id: 'r1', by: HOST_ID });
});

test('the host\'s catch delay replaces the 2 s default', () => {
  for (const catchTime of [0.5, 4]) {
    const room = makeRoom();
    room.join(HOST_ID, 'Host', 'blue');
    room.join('r1', 'r1', 'red');
    room.send(HOST_ID, { t: 'settings', catchTime });
    room.ready(HOST_ID, 'r1');
    room.advance(3.1);
    room.move('r1', 5000, 5000);
    toSeek(room);
    room.move(HOST_ID, 5000, 5600);
    room.advance(catchTime - 0.2);
    assert.equal(room.player('r1').caught, false, `not yet at ${catchTime - 0.2} s`);
    room.advance(0.4);
    assert.equal(room.player('r1').caught, true, `caught just after ${catchTime} s`);
  }
});

test('leaving vision drains the meter instead of resetting it', () => {
  const room = startedRoom([['r1', 'red']]);
  room.move('r1', 5000, 5000);
  toSeek(room);
  room.move(HOST_ID, 5000, 5600);
  room.advance(1.5);
  room.move('r1', 9000, 9000); // out of sight
  room.advance(0.5);
  const spot = room.player('r1').spot;
  assert.ok(spot > 0.9 && spot < 1.1, `meter at ${spot}`);
  room.advance(2);
  assert.equal(room.player('r1').spot, 0, 'never below zero');
  assert.equal(room.player('r1').caught, false);
  assert.ok(Math.abs(room.player('r1').spotted - 1.5) < 0.05, 'time seen is kept for the score');
});

test('a wall between seeker and hider keeps the hider safe', () => {
  // A wall along x = 100 cells, z = 90..109.
  const wall = Array.from({ length: 20 }, (_, k) => [100, 90 + k, '#']);
  const room = startedRoom([['r1', 'red']], hideSeekGrid(wall));
  const hider = at(103, 100), seeker = at(97, 100);
  room.move('r1', hider.x, hider.z);
  toSeek(room);
  room.move(HOST_ID, seeker.x, seeker.z);
  room.advance(5);
  assert.equal(room.player('r1').caught, false);
  assert.equal(room.player('r1').spot, 0);
});

test('a hider in a brush is safe from seekers outside it', () => {
  const brush = [];
  for (let x = 100; x < 104; x++) for (let z = 100; z < 104; z++) brush.push([x, z, 'b']);
  const room = startedRoom([['r1', 'red']], hideSeekGrid(brush));
  const hider = at(101, 101), outside = at(96, 101), inside = at(103, 103);
  room.move('r1', hider.x, hider.z);
  toSeek(room);
  room.move(HOST_ID, outside.x, outside.z);
  room.advance(4);
  assert.equal(room.player('r1').caught, false);
  room.move(HOST_ID, inside.x, inside.z);
  room.advance(2.2);
  assert.equal(room.player('r1').caught, true);
});

test('caught hiders cannot move', () => {
  const room = startedRoom([['r1', 'red'], ['r2', 'red']]);
  room.move('r1', 5000, 5000);
  room.move('r2', 12000, 3000);
  toSeek(room);
  room.move(HOST_ID, 5000, 5600);
  room.advance(2.2);
  room.move('r1', 7000, 7000);
  assert.deepEqual([room.player('r1').x, room.player('r1').z], [5000, 5000]);
});

test('the closest seeing source gets the catch', () => {
  const room = startedRoom([['b2', 'blue'], ['r1', 'red']]);
  room.move('r1', 5000, 5000);
  toSeek(room);
  room.move(HOST_ID, 5000, 6200);
  room.move('b2', 5000, 5400);
  room.advance(2.2);
  assert.equal(room.player('r1').caughtBy, 'b2');
  assert.equal(room.player('b2').catches, 1);
  assert.equal(room.player(HOST_ID).catches, 0);
});

// ---------------------------------------------------------------- wards

test('seekers can place up to two wards in range during the seek phase', () => {
  const room = startedRoom([['r1', 'red']]);
  room.move('r1', 12000, 3000);
  room.send(HOST_ID, { t: 'ward', x: 700, z: 700 });
  assert.equal(room.server.wards.length, 0, 'not during the hide phase');
  toSeek(room);
  const host = room.player(HOST_ID);
  room.move(HOST_ID, 5000, 5000);
  room.send(HOST_ID, { t: 'ward', x: 5000 + RULES.wardRange + 200, z: 5000 });
  assert.equal(room.server.wards.length, 0, 'too far');
  room.send(HOST_ID, { t: 'ward', x: 5300, z: 5000 });
  room.send(HOST_ID, { t: 'ward', x: 5000, z: 5300 });
  room.send(HOST_ID, { t: 'ward', x: 4700, z: 5000 });
  assert.deepEqual(room.server.wards, [{ owner: HOST_ID, team: 'blue', x: 5300, z: 5000 }, { owner: HOST_ID, team: 'blue', x: 5000, z: 5300 }]);
  assert.equal(host.wards, 0);
});

test('with the default settings hiders cannot place wards', () => {
  const room = startedRoom([['r1', 'red']]);
  toSeek(room);
  room.move('r1', 5000, 5000);
  room.send('r1', { t: 'ward', x: 5100, z: 5000 });
  assert.equal(room.server.wards.length, 0);
});

test('a seeker with 0 wards set by the host cannot place any', () => {
  const room = wardRoom(0, 0);
  toSeek(room);
  room.move(HOST_ID, 5000, 5000);
  room.send(HOST_ID, { t: 'ward', x: 5100, z: 5000 });
  assert.equal(room.server.wards.length, 0);
});

test('hiders with wards can place them from the hide phase on', () => {
  const room = wardRoom(2, 2);
  room.move('r1', 5000, 5000);
  room.send('r1', { t: 'ward', x: 5200, z: 5000 });
  assert.deepEqual(room.server.wards, [{ owner: 'r1', team: 'red', x: 5200, z: 5000 }]);
  toSeek(room);
  room.send('r1', { t: 'ward', x: 5000, z: 5200 });
  room.send('r1', { t: 'ward', x: 4800, z: 5000 });
  assert.equal(room.server.wards.length, 2, 'only as many as the host allowed');
  assert.equal(room.player('r1').wards, 0);
});

test('a hider\'s ward never spots or catches anyone', () => {
  const room = wardRoom(2, 1, [['r1', 'red'], ['r2', 'red']]);
  room.move('r1', 5000, 5000);
  room.move('r2', 5300, 5000);
  room.send('r1', { t: 'ward', x: 5100, z: 5000 });
  toSeek(room);
  room.advance(4);
  assert.equal(room.player('r1').spot, 0);
  assert.equal(room.player('r2').spot, 0);
  assert.equal(room.player('r1').caught, false);
  assert.equal(room.player('r2').caught, false);
});

test('caught hiders cannot place their remaining wards', () => {
  const room = wardRoom(2, 1, [['r1', 'red'], ['r2', 'red']]);
  room.move('r1', 5000, 5000);
  room.move('r2', 12000, 3000); // far away, so the round goes on
  toSeek(room);
  room.move(HOST_ID, 5000, 5600);
  room.advance(2.2);
  assert.equal(room.player('r1').caught, true);
  assert.equal(room.server.phase, 'seek');
  room.send('r1', { t: 'ward', x: 5100, z: 5000 });
  assert.equal(room.server.wards.length, 0);
});

test('a ward on a wall is moved to the nearest floor', () => {
  const wall = [];
  for (let x = 98; x <= 102; x++) for (let z = 98; z <= 102; z++) wall.push([x, z, '#']);
  const room = startedRoom([['r1', 'red']], hideSeekGrid(wall));
  toSeek(room);
  const near = at(96, 100), onWall = at(100, 100);
  room.move(HOST_ID, near.x, near.z);
  room.send(HOST_ID, { t: 'ward', x: onWall.x, z: onWall.z });
  const [w] = room.server.wards;
  assert.ok(room.grid.walkable(room.grid.index(w.x, w.z), 'blue'));
});

test('wards see for the seekers and their owner gets the catch', () => {
  const room = startedRoom([['r1', 'red']]);
  room.move('r1', 5000, 5000);
  toSeek(room);
  room.move(HOST_ID, 5000, 4300);
  room.send(HOST_ID, { t: 'ward', x: 5000, z: 4600 });
  room.move(HOST_ID, 1000, 1000); // walks away
  room.advance(2.2);
  assert.equal(room.player('r1').caught, true);
  assert.equal(room.player('r1').caughtBy, HOST_ID);
});

test('a seeker who leaves takes their wards with them', () => {
  const room = startedRoom([['b2', 'blue'], ['r1', 'red']]);
  room.move('r1', 12000, 3000);
  toSeek(room);
  room.move('b2', 5000, 5000);
  room.send('b2', { t: 'ward', x: 5200, z: 5000 });
  assert.equal(room.server.wards.length, 1);
  room.server.leave('b2');
  assert.equal(room.server.wards.length, 0);
});

// ---------------------------------------------------------------- round flow

test('catching every hider ends the round early, then a break, then roles swap', () => {
  const room = startedRoom([['r1', 'red']]);
  room.move('r1', 5000, 5000);
  toSeek(room);
  room.move(HOST_ID, 5000, 5600);
  room.advance(2.2);
  assert.equal(room.server.phase, 'break');
  const [r] = room.server.results;
  assert.equal(r.round, 1);
  assert.equal(r.seekTeam, 'blue');
  assert.equal(r.caught, 1);
  assert.equal(r.total, 1);
  assert.ok(r.time > 1.9 && r.time < 2.3, `round time ${r.time}`);

  room.advance(RULES.roundBreak + 0.1);
  assert.equal(room.server.phase, 'hide');
  assert.equal(room.server.round, 2);
  assert.equal(room.server.seekTeam, 'red');
  assert.equal(room.player('r1').caught, false, 'everyone is free again');
  assert.equal(room.player('r1').wards, 2);
  assert.equal(room.player(HOST_ID).wards, 0);
  assert.equal(room.server.wards.length, 0);
  const c = FOUNTAIN.red;
  assert.ok(Math.hypot(room.player('r1').x - c.x, room.player('r1').z - c.z) <= 200, 'back to the fountain');
});

test('the seek timer running out ends the round with the hiders left', () => {
  const room = startedRoom([['r1', 'red'], ['r2', 'red']]);
  room.move('r1', 5000, 5000);
  room.move('r2', 12000, 3000);
  toSeek(room);
  room.move(HOST_ID, 5000, 5600);
  room.advance(2.2);
  room.move(HOST_ID, 1000, 1000);
  room.advance(SEEK - 2.3, { step: 0.5 });
  assert.equal(room.server.phase, 'seek');
  room.advance(0.5);
  assert.equal(room.server.phase, 'break');
  const [r] = room.server.results;
  assert.deepEqual([r.caught, r.total, r.time], [1, 2, SEEK]);
  const byId = Object.fromEntries(r.players.map((p) => [p.id, p]));
  assert.equal(byId.r2.caughtAt, null);
  assert.equal(byId.r2.survived, SEEK);
  assert.ok(byId.r1.caughtAt > 1.9 && byId.r1.caughtAt < 2.3);
  assert.equal(byId.r1.caughtBy, HOST_ID);
  assert.equal(byId[HOST_ID].role, 'seek');
  assert.equal(byId[HOST_ID].catches, 1);
  assert.equal(byId.r2.role, 'hide');
});

test('the round ends at once when all hiders or all seekers leave', () => {
  const a = startedRoom([['r1', 'red'], ['b2', 'blue']]);
  toSeek(a);
  a.server.leave('r1');
  assert.equal(a.server.phase, 'results', 'no hiders left; a team is empty so no round 2');

  const b = startedRoom([['r1', 'red'], ['b2', 'blue']]);
  b.server.leave('b2');
  b.server.leave(HOST_ID);
  assert.equal(b.server.phase, 'results');
});

test('after round 2 the game shows results, and only the host returns to the lobby', () => {
  const room = startedRoom([['r1', 'red']]);
  room.move('r1', 5000, 5000);
  toSeek(room);
  room.move(HOST_ID, 5000, 5600);
  room.advance(2.2);
  room.advance(RULES.roundBreak + 0.1);
  // Round 2: Red seeks and never finds the host.
  room.move(HOST_ID, 12000, 3000);
  room.advance(HIDE + SEEK + 1, { step: 0.5 });
  assert.equal(room.server.phase, 'results');
  const msg = room.last('r1', 'phase');
  assert.equal(msg.phase, 'results');
  assert.equal(msg.results.length, 2);
  assert.equal(msg.winner, 'blue');
  assert.equal(room.server.wards.length, 0);

  room.send('r1', { t: 'lobby' });
  assert.equal(room.server.phase, 'results');
  room.send(HOST_ID, { t: 'lobby' });
  assert.equal(room.server.phase, 'lobby');
  assert.equal(room.server.round, 0);
  assert.deepEqual(room.server.results, []);
  assert.ok([...room.server.players.values()].every((p) => !p.ready && !p.caught));
});
