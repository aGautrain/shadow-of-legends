// Hide and seek: who wins the game from the two rounds.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { winner } from '../../src/hideseek/server.js';

const round = (seekTeam, caught, total, time) => ({ seekTeam, caught, total, time });

test('no winner before both rounds are played', () => {
  assert.equal(winner([]), null);
  assert.equal(winner([round('blue', 3, 3, 50)]), null);
});

test('the team that caught the larger share of hiders wins', () => {
  assert.equal(winner([round('blue', 3, 5, 180), round('red', 4, 5, 180)]), 'red');
  assert.equal(winner([round('blue', 2, 2, 180), round('red', 4, 5, 60)]), 'blue');
});

test('it is the share that counts, not the number, with uneven teams', () => {
  // Blue catches 2 of 2 Red hiders; Red catches 2 of 3 Blue hiders.
  assert.equal(winner([round('blue', 2, 2, 100), round('red', 2, 3, 100)]), 'blue');
});

test('on the same share, the faster team wins', () => {
  assert.equal(winner([round('blue', 3, 3, 95.5), round('red', 3, 3, 80)]), 'red');
  assert.equal(winner([round('blue', 1, 2, 180), round('red', 1, 2, 181)]), 'blue');
});

test('same share and same time is a draw', () => {
  assert.equal(winner([round('blue', 0, 2, 180), round('red', 0, 2, 180)]), 'draw');
});

test('a round with no hiders scores zero', () => {
  assert.equal(winner([round('blue', 0, 0, 180), round('red', 1, 2, 180)]), 'red');
});
