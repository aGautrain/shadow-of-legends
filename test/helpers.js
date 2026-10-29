// Shared test helpers: small hand-drawn navgrids and a hide and seek room
// driven by a fake clock.

import { readFileSync } from 'node:fs';
import { NavGrid, FLAG } from '../src/grid.js';
import { Vision } from '../src/vision.js';
import { Server, HOST_ID } from '../src/hideseek/server.js';

export const CELL = 50;

// One character per cell, first row is z = 0:
//   .  open floor          #  wall
//   b  brush               ~  see-through wall (blocks walking, not sight)
//   w  brush flagged as wall too (the game's brush edge against a wall)
//   g  base gate strip (blue side): walkable by Blue, seen into but not through
//   B  Blue-only floor     R  Red-only floor     S  structure (turret)
const CHARS = {
  '.': 0,
  '#': FLAG.WALL,
  b: FLAG.BRUSH,
  w: FLAG.BRUSH | FLAG.WALL,
  '~': FLAG.WALL | FLAG.SEE_THROUGH,
  g: FLAG.SEE_THROUGH | FLAG.GATE_VISION | FLAG.BLUE_ONLY,
  B: FLAG.BLUE_ONLY,
  R: FLAG.RED_ONLY,
  S: FLAG.STRUCTURE | FLAG.WALL,
};

const encode = (flags) => Buffer.from(flags.buffer, flags.byteOffset, flags.byteLength).toString('base64');

function flagsOf(rows) {
  const w = rows[0].length;
  const flags = new Uint16Array(w * rows.length);
  rows.forEach((row, z) => {
    if (row.length !== w) throw new Error(`row ${z} has ${row.length} cells, expected ${w}`);
    [...row].forEach((c, x) => {
      if (!(c in CHARS)) throw new Error(`unknown cell '${c}'`);
      flags[z * w + x] = CHARS[c];
    });
  });
  return flags;
}

// NavGrid data from rows of characters. overlays: { name: [{ x, z, rows }] }.
export function gridData(rows, overlays = {}) {
  return {
    minX: 0, minZ: 0, cellSize: CELL, width: rows[0].length, height: rows.length,
    flags: encode(flagsOf(rows)),
    overlays: Object.fromEntries(Object.entries(overlays).map(([name, boxes]) => [name,
      boxes.map((b) => ({ x: b.x, z: b.z, w: b.rows[0].length, h: b.rows.length, flags: encode(flagsOf(b.rows)) }))])),
  };
}

export const makeGrid = (rows, overlays) => new NavGrid(gridData(rows, overlays));

// World coordinates of a cell's center.
export const at = (cx, cz) => ({ x: (cx + 0.5) * CELL, z: (cz + 0.5) * CELL });

// An open square map, optionally with some cells changed: edits = [[cx, cz, char]].
export function openGrid(size, edits = []) {
  const rows = Array.from({ length: size }, () => Array(size).fill('.'));
  for (const [cx, cz, c] of edits) rows[cz][cx] = c;
  return makeGrid(rows.map((r) => r.join('')));
}

let realGrid = null;
export function loadRealGrid() {
  realGrid ||= new NavGrid(JSON.parse(readFileSync(new URL('../data/navgrid.json', import.meta.url))));
  return realGrid;
}

// ---------------------------------------------------------------- hide and seek

// The hide and seek map: an open 300 x 300 grid (the size of Summoner's
// Rift) so fountains and positions are free to choose. edits as in openGrid.
export function hideSeekGrid(edits = []) { return openGrid(300, edits); }

// A room whose clock only moves when the test says so. Every message the
// server sends is recorded per player. The server's own interval is stopped;
// the test calls tick() through advance().
export function makeRoom(grid = hideSeekGrid()) {
  let t = 1000;
  const inbox = new Map();
  const vision = new Vision(grid);
  const server = new Server(grid, vision, (id, msg) => {
    if (!inbox.has(id)) inbox.set(id, []);
    inbox.get(id).push(msg);
  }, () => t);
  server.close();

  const room = {
    server, grid, vision, inbox,
    get now() { return t; },
    send: (id, msg) => server.message(id, msg),
    join(id, name = id, team) { server.message(id, { t: 'hello', name, team }); return server.players.get(id); },
    player: (id) => server.players.get(id),
    // Last message of a type sent to a player.
    last(id, type) { return (inbox.get(id) || []).filter((m) => m.t === type).at(-1); },
    all(id, type) { return (inbox.get(id) || []).filter((m) => m.t === type); },
    // Moves the clock by `seconds`, ticking every `step` seconds. Players
    // keep talking (so nobody times out) unless listed in `silent`.
    advance(seconds, { step = 0.1, silent = [] } = {}) {
      const n = Math.round(seconds / step);
      for (let k = 0; k < n; k++) {
        t += step * 1000;
        for (const p of [...server.players.values()]) if (!silent.includes(p.id)) p.lastSeen = t;
        server.tick();
      }
    },
    // Puts a player at (x, z) as their client would report it.
    move(id, x, z) { server.message(id, { t: 'pos', x, z }); },
    // Readies players up, first picking a champion for those without one.
    ready(...ids) {
      for (const id of ids) {
        const p = server.players.get(id);
        if (p && !p.champion) server.message(id, { t: 'set', champion: 'Champ' + id });
        server.message(id, { t: 'set', ready: true });
      }
    },
  };
  return room;
}

// A lobby with the host on Blue and the given players, everyone ready, then
// run through the countdown so round 1's hide phase has begun.
export function startedRoom(players = [['p1', 'red']], grid) {
  const room = makeRoom(grid);
  room.join(HOST_ID, 'Host', 'blue');
  for (const [id, team] of players) room.join(id, id, team);
  room.ready(HOST_ID, ...players.map(([id]) => id));
  room.advance(3.1);
  return room;
}

export { HOST_ID };
