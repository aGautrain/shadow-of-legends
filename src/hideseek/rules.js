// Hide and seek numbers. Distances are in game units, times in seconds.

export const RULES = {
  maxPlayers: 10,
  countdown: 2,
  hide: 30, // default hide phase, host can change it in the lobby
  seek: 120, // default seek phase, host can change it in the lobby
  catchTime: 1.5, // seconds in a row inside the seekers' vision to be caught, host can change it
  seekerWards: 3, // Stealth Wards per seeker, host can change it in the lobby
  hiderWards: 1, // Stealth Wards per hider, host can change it in the lobby
  wardRange: 600, // like the trinket: placed at the cursor, up to this far
  roundBreak: 5, // summary between the two rounds
  speed: 425, // move speed, faster than in game to keep the chase tense
  hideSpeed: 500, // move speed during the hide phase, so hiders get away fast
};

// Move speed for a phase. Only hiders move during the hide phase.
export const moveSpeed = (phase) => (phase === 'hide' ? RULES.hideSpeed : RULES.speed);

export const HIDE_CHOICES = [15, 20, 30, 45];
export const SEEK_CHOICES = [60, 90, 120, 180, 240];
export const WARD_CHOICES = [0, 1, 2, 3, 4, 5];
export const CATCH_CHOICES = [0.5, 1, 1.5, 2, 3, 4, 5];

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
