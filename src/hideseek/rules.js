// Hide and seek numbers. Distances are in game units, times in seconds.

export const RULES = {
  maxPlayers: 10,
  countdown: 3,
  hide: 40, // default hide phase, host can change it in the lobby
  seek: 180, // default seek phase, host can change it in the lobby
  catchTime: 2, // seconds in a row inside the seekers' vision to be caught
  wardsPerSeeker: 2,
  wardRange: 600, // like the trinket: placed at the cursor, up to this far
  roundBreak: 8, // summary between the two rounds
};

export const HIDE_CHOICES = [20, 30, 40, 60];
export const SEEK_CHOICES = [90, 120, 180, 240, 300];

// Fountain spawn centers. Players are spread on a small circle around them.
export const FOUNTAIN = {
  blue: { x: 560, z: 560 },
  red: { x: 14200, z: 14200 },
};

export const TEAMS = ['blue', 'red'];
export const otherTeam = (t) => (t === 'blue' ? 'red' : 'blue');

// Round 1: Blue seeks. Round 2: Red seeks.
export const seekerOf = (round) => (round === 1 ? 'blue' : 'red');

// Snapshot and position rates (per second).
export const NET_RATE = 10;
// A player silent for this long is dropped from the room.
export const TIMEOUT = 8;
