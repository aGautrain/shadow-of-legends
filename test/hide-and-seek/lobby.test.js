// Hide and seek: joining a room, teams, champion picks, ready and countdown.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES } from '../../src/hideseek/rules.js';
import { makeRoom, HOST_ID } from '../helpers.js';

test('a connection becomes a player only after hello, and is welcomed', () => {
  const room = makeRoom();
  room.send('p1', { t: 'set', ready: true });
  assert.equal(room.player('p1'), undefined);
  room.join('p1', 'Ahri');
  assert.deepEqual(room.last('p1', 'welcome'), { t: 'welcome', id: 'p1' });
  assert.equal(room.player('p1').ready, false);
  assert.equal(room.player('p1').champion, null);
});

test('names are trimmed, squashed and cut to 16 characters, with a default', () => {
  const room = makeRoom();
  assert.equal(room.join('a', '   Lee    Sin  ').name, 'Lee Sin');
  assert.equal(room.join('b', 'x'.repeat(30)).name, 'x'.repeat(16));
  assert.equal(room.join('c', '   ').name, 'Player');
  room.send('a', { t: 'set', name: '  ' });
  assert.equal(room.player('a').name, 'Lee Sin', 'a blank rename is ignored');
  room.send('a', { t: 'set', name: 'Zed' });
  assert.equal(room.player('a').name, 'Zed');
});

test('players without a team choice fill the smaller team', () => {
  const room = makeRoom();
  assert.equal(room.join('a').team, 'blue');
  assert.equal(room.join('b').team, 'red');
  assert.equal(room.join('c').team, 'blue');
  assert.equal(room.join('d', 'd', 'blue').team, 'blue', 'an explicit team is kept');
  assert.equal(room.join('e').team, 'red');
});

test('a full room rejects new players', () => {
  const room = makeRoom();
  for (let i = 0; i < RULES.maxPlayers; i++) room.join('p' + i);
  room.join('late');
  assert.equal(room.player('late'), undefined);
  assert.match(room.last('late', 'reject').reason, /full/);
});

test('saying hello twice does not reset the player', () => {
  const room = makeRoom();
  room.join('p1', 'Ahri', 'red');
  room.ready('p1');
  room.join('p1', 'Other', 'blue');
  assert.equal(room.player('p1').name, 'Ahri');
  assert.equal(room.player('p1').ready, true);
});

test('switching team clears ready', () => {
  const room = makeRoom();
  room.join('p1', 'p1', 'blue');
  room.ready('p1');
  room.send('p1', { t: 'set', team: 'red' });
  assert.equal(room.player('p1').team, 'red');
  assert.equal(room.player('p1').ready, false);
  room.send('p1', { t: 'set', team: 'green' });
  assert.equal(room.player('p1').team, 'red', 'unknown team ignored');
});

test('each champion can be picked by one player only', () => {
  const room = makeRoom();
  room.join('a'); room.join('b');
  room.send('a', { t: 'set', champion: 'Ahri' });
  room.send('b', { t: 'set', champion: 'Ahri' });
  assert.equal(room.player('a').champion, 'Ahri');
  assert.equal(room.player('b').champion, null, 'taken');
  room.send('a', { t: 'set', champion: 'Ahri' });
  assert.equal(room.player('a').champion, 'Ahri', 'picking your own champion again is fine');
  room.send('a', { t: 'set', champion: 'Zed' });
  room.send('b', { t: 'set', champion: 'Ahri' });
  assert.equal(room.player('b').champion, 'Ahri', 'free again once released');
});

test('a champion is mandatory: no pick, no ready', () => {
  const room = makeRoom();
  room.join('a');
  room.send('a', { t: 'set', ready: true });
  assert.equal(room.player('a').ready, false);
  room.send('a', { t: 'set', champion: 'Ahri', ready: true });
  assert.equal(room.player('a').ready, true, 'picking and readying in one message works');
});

test('a pick cannot be cleared, only changed', () => {
  const room = makeRoom();
  room.join('a');
  room.send('a', { t: 'set', champion: 'Ahri', ready: true });
  room.send('a', { t: 'set', champion: null });
  assert.equal(room.player('a').champion, 'Ahri');
  assert.equal(room.player('a').ready, true);
  room.send('a', { t: 'set', champion: 'Zed' });
  assert.equal(room.player('a').champion, 'Zed');
});

test('a player who lost the race for a champion still cannot ready up', () => {
  const room = makeRoom();
  room.join('a'); room.join('b');
  room.send('a', { t: 'set', champion: 'Ahri' });
  room.send('b', { t: 'set', champion: 'Ahri', ready: true });
  assert.equal(room.player('b').champion, null);
  assert.equal(room.player('b').ready, false);
});

test('a player leaving frees their champion', () => {
  const room = makeRoom();
  room.join('a'); room.join('b');
  room.send('a', { t: 'set', champion: 'MonkeyKing' });
  room.server.leave('a');
  room.send('b', { t: 'set', champion: 'MonkeyKing' });
  assert.equal(room.player('b').champion, 'MonkeyKing');
});

test('invalid champion ids are ignored', () => {
  const room = makeRoom();
  room.join('a');
  room.send('a', { t: 'set', champion: 'Ahri' });
  for (const bad of ['', 'Kai\'Sa', '<img>', 'x'.repeat(33), 42, {}]) {
    room.send('a', { t: 'set', champion: bad });
    assert.equal(room.player('a').champion, 'Ahri', JSON.stringify(bad));
  }
});

test('the room message lists players without their private state', () => {
  const room = makeRoom();
  room.join(HOST_ID, 'Host', 'blue');
  room.send(HOST_ID, { t: 'set', champion: 'Ahri' });
  const msg = room.last(HOST_ID, 'room');
  assert.deepEqual(msg.players, [{ id: HOST_ID, name: 'Host', team: 'blue', ready: false, champion: 'Ahri' }]);
  assert.equal(msg.phase, 'lobby');
  assert.equal(msg.countdown, null);
});

test('only the host changes settings, and only to listed values', () => {
  const room = makeRoom();
  room.join(HOST_ID); room.join('p1');
  room.send('p1', { t: 'settings', hide: 20 });
  assert.equal(room.server.settings.hide, RULES.hide);
  assert.equal(room.server.settings.seekerWards, 2, 'seekers get 2 wards by default');
  assert.equal(room.server.settings.hiderWards, 0, 'hiders get none by default');
  room.send(HOST_ID, { t: 'settings', hide: 20, seek: 300, training: true, seekerWards: 4, hiderWards: 1 });
  const set = { hide: 20, seek: 300, training: true, seekerWards: 4, hiderWards: 1 };
  assert.deepEqual(room.server.settings, set);
  room.send(HOST_ID, { t: 'settings', hide: 25, seek: 1, training: 'yes', seekerWards: 9, hiderWards: -1 });
  assert.deepEqual(room.server.settings, set);
  room.send('p1', { t: 'settings', seekerWards: 0, hiderWards: 3 });
  assert.deepEqual(room.server.settings, set);
});

test('the game needs two players, both teams and everyone ready', () => {
  const room = makeRoom();
  room.join('a', 'a', 'blue');
  room.ready('a');
  assert.equal(room.server.canStart(), false, 'alone');
  room.join('b', 'b', 'blue');
  room.ready('b');
  assert.equal(room.server.canStart(), false, 'one team only');
  room.send('b', { t: 'set', team: 'red' });
  assert.equal(room.server.canStart(), false, 'b is no longer ready');
  room.ready('b');
  assert.equal(room.server.canStart(), true);
});

test('everyone ready starts a 3 s countdown, then round 1', () => {
  const room = makeRoom();
  room.join(HOST_ID, 'Host', 'blue'); room.join('p1', 'p1', 'red');
  room.ready(HOST_ID, 'p1');
  assert.equal(room.last('p1', 'room').countdown, RULES.countdown * 1000);
  room.advance(2.9);
  assert.equal(room.server.phase, 'lobby');
  room.advance(0.2);
  assert.equal(room.server.phase, 'hide');
  assert.equal(room.server.round, 1);
});

test('unreadying cancels the countdown', () => {
  const room = makeRoom();
  room.join('a', 'a', 'blue'); room.join('b', 'b', 'red');
  room.ready('a', 'b');
  room.advance(1);
  room.send('b', { t: 'set', ready: false });
  assert.equal(room.server.countdownAt, 0);
  assert.equal(room.last('a', 'room').countdown, null);
  room.advance(5);
  assert.equal(room.server.phase, 'lobby');
});

test('a player joining during the countdown cancels it', () => {
  const room = makeRoom();
  room.join('a', 'a', 'blue'); room.join('b', 'b', 'red');
  room.ready('a', 'b');
  room.join('c');
  room.advance(5);
  assert.equal(room.server.phase, 'lobby');
});

test('nobody can join once the game started', () => {
  const room = makeRoom();
  room.join('a', 'a', 'blue'); room.join('b', 'b', 'red');
  room.ready('a', 'b');
  room.advance(3.1);
  room.join('late');
  assert.equal(room.player('late'), undefined);
  assert.match(room.last('late', 'reject').reason, /in progress/);
});

test('lobby changes are refused once the game started', () => {
  const room = makeRoom();
  room.join(HOST_ID, 'Host', 'blue'); room.join('b', 'b', 'red');
  room.ready(HOST_ID, 'b');
  room.advance(3.1);
  room.send('b', { t: 'set', team: 'blue', champion: 'Ahri' });
  room.send(HOST_ID, { t: 'settings', hide: 20 });
  assert.equal(room.player('b').team, 'red');
  assert.equal(room.player('b').champion, 'Champb');
  assert.equal(room.server.settings.hide, RULES.hide);
});

test('a silent player is dropped after the timeout, the host never is', () => {
  const room = makeRoom();
  room.join(HOST_ID); room.join('p1');
  room.advance(9, { silent: ['p1', HOST_ID] });
  assert.equal(room.player('p1'), undefined);
  assert.ok(room.player(HOST_ID));
});

test('malformed messages are ignored', () => {
  const room = makeRoom();
  room.join('a');
  for (const m of [null, undefined, 'hello', 42, { t: 'nope' }]) room.send('a', m);
  assert.equal(room.server.players.size, 1);
});
