// The room, run in the host's browser. It owns the lobby, the phases and
// their timers, and decides catches from the seeking team's vision.
// Players own their positions: each client walks its own champion and
// reports where it is.

import { has } from '../vision.js';
import { SIGHT } from '../config.js';
import { validChampionId } from './champions.js';
import { RULES, HIDE_CHOICES, SEEK_CHOICES, FOUNTAIN, TEAMS, seekerOf, NET_RATE, TIMEOUT } from './rules.js';

export const HOST_ID = 'host';

const cleanName = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 16);
const round2 = (v) => Math.round(v * 100) / 100;

export class Server {
  // send(id, msg) delivers to one player, the host's own player included.
  constructor(grid, vision, send) {
    this.grid = grid;
    this.vision = vision;
    this.send = send;
    this.players = new Map();
    this.settings = { hide: RULES.hide, seek: RULES.seek, training: false };
    this.phase = 'lobby';
    this.round = 0;
    this.endsAt = 0;
    this.countdownAt = 0; // lobby countdown end, 0 when not counting
    this.wards = [];
    this.results = [];
    this.timer = setInterval(() => this.tick(), 1000 / NET_RATE);
    this.last = performance.now();
  }

  close() { clearInterval(this.timer); }

  broadcast(msg) { for (const id of this.players.keys()) this.send(id, msg); }

  // ------------------------------------------------------------ connections

  // A connection is only a player once it says 'hello' with a name.
  join() {}

  leave(id) {
    if (!this.players.delete(id)) return;
    this.wards = this.wards.filter((w) => w.owner !== id);
    this.broadcastRoom();
    if (this.phase === 'lobby') this.checkStart();
    else if (this.phase === 'hide' || this.phase === 'seek') this.checkRoundOver();
  }

  message(id, m) {
    if (!m || typeof m !== 'object') return;
    const p = this.players.get(id);
    if (p) p.lastSeen = performance.now();

    if (m.t === 'hello') return this.hello(id, m);
    if (!p) return;
    if (m.t === 'set' && this.phase === 'lobby') {
      if (m.name !== undefined && cleanName(m.name)) p.name = cleanName(m.name);
      if (TEAMS.includes(m.team) && m.team !== p.team) { p.team = m.team; p.ready = false; }
      // Each champion can be picked by one player only.
      if (validChampionId(m.champion) && ![...this.players.values()].some((q) => q !== p && q.champion === m.champion)) p.champion = m.champion;
      // No champion, no ready.
      if (typeof m.ready === 'boolean') p.ready = m.ready && !!p.champion;
      this.broadcastRoom();
      this.checkStart();
    } else if (m.t === 'settings' && id === HOST_ID && this.phase === 'lobby') {
      if (HIDE_CHOICES.includes(m.hide)) this.settings.hide = m.hide;
      if (SEEK_CHOICES.includes(m.seek)) this.settings.seek = m.seek;
      if (typeof m.training === 'boolean') this.settings.training = m.training;
      this.broadcastRoom();
    } else if (m.t === 'pos') {
      if (!(this.phase === 'hide' || this.phase === 'seek') || p.caught) return;
      if (this.phase === 'hide' && p.team === this.seekTeam) return; // held in fountain
      const x = Number(m.x), z = Number(m.z);
      if (Number.isFinite(x) && Number.isFinite(z)) { p.x = x; p.z = z; }
    } else if (m.t === 'ward') {
      if (this.phase !== 'seek' || p.team !== this.seekTeam || p.wards <= 0) return;
      const x = Number(m.x), z = Number(m.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      if (Math.hypot(x - p.x, z - p.z) > RULES.wardRange + 100) return;
      const spot = this.grid.nearestWalkable(x, z, p.team);
      if (!spot) return;
      p.wards--;
      this.wards.push({ owner: id, x: spot.x, z: spot.z });
    } else if (m.t === 'lobby' && id === HOST_ID && this.phase === 'results') {
      this.toLobby();
    }
  }

  hello(id, m) {
    if (this.players.has(id)) return;
    if (this.phase !== 'lobby') return this.send(id, { t: 'reject', reason: 'A game is in progress in this room. Wait for it to end and reload.' });
    if (this.players.size >= RULES.maxPlayers) return this.send(id, { t: 'reject', reason: `This room is full (${RULES.maxPlayers} players).` });
    const count = (t) => [...this.players.values()].filter((p) => p.team === t).length;
    const team = TEAMS.includes(m.team) ? m.team : count('blue') <= count('red') ? 'blue' : 'red';
    this.players.set(id, {
      id, name: cleanName(m.name) || 'Player', team, ready: false, champion: null,
      x: 0, z: 0, caught: false, spot: 0, wards: 0, lastSeen: performance.now(),
    });
    this.send(id, { t: 'welcome', id });
    this.broadcastRoom();
    this.checkStart();
  }

  roomMessage() {
    return {
      t: 'room',
      host: HOST_ID,
      players: [...this.players.values()].map(({ id, name, team, ready, champion }) => ({ id, name, team, ready, champion })),
      settings: this.settings,
      phase: this.phase,
      countdown: this.countdownAt ? Math.max(0, this.countdownAt - performance.now()) : null,
    };
  }

  broadcastRoom() { this.broadcast(this.roomMessage()); }

  // ------------------------------------------------------------ lobby

  canStart() {
    const list = [...this.players.values()];
    return list.length >= 2 && list.every((p) => p.ready) && TEAMS.every((t) => list.some((p) => p.team === t));
  }

  checkStart() {
    const ok = this.canStart();
    if (ok && !this.countdownAt) this.countdownAt = performance.now() + RULES.countdown * 1000;
    else if (!ok && this.countdownAt) this.countdownAt = 0;
    else return;
    this.broadcastRoom();
  }

  toLobby() {
    this.phase = 'lobby';
    this.round = 0;
    this.results = [];
    this.wards = [];
    for (const p of this.players.values()) { p.ready = false; p.caught = false; p.spot = 0; }
    this.broadcastRoom();
    this.broadcast({ t: 'phase', phase: 'lobby' });
  }

  // ------------------------------------------------------------ rounds

  startGame() {
    this.countdownAt = 0;
    this.results = [];
    this.startRound(1);
  }

  startRound(round) {
    this.round = round;
    this.seekTeam = seekerOf(round);
    this.wards = [];
    const spawns = {};
    for (const team of TEAMS) {
      const list = [...this.players.values()].filter((p) => p.team === team);
      list.forEach((p, i) => {
        const a = (2 * Math.PI * i) / Math.max(1, list.length);
        const r = list.length > 1 ? 180 : 0;
        const c = FOUNTAIN[team];
        const s = this.grid.nearestWalkable(c.x + r * Math.cos(a), c.z + r * Math.sin(a), team) || c;
        p.x = s.x; p.z = s.z;
        p.caught = false; p.spot = 0; p.caughtAt = null; p.caughtBy = null; p.spotted = 0;
        p.wards = team === this.seekTeam ? RULES.wardsPerSeeker : 0;
        p.catches = 0;
        spawns[p.id] = { x: s.x, z: s.z };
      });
    }
    this.setPhase('hide', this.settings.hide, { spawns });
  }

  setPhase(phase, seconds, extra = {}) {
    this.phase = phase;
    this.endsAt = performance.now() + seconds * 1000;
    if (phase === 'seek') this.seekStart = performance.now();
    this.broadcast({ t: 'phase', phase, round: this.round, seekTeam: this.seekTeam, ms: seconds * 1000, settings: this.settings, results: this.results, ...extra });
  }

  hiders() { return [...this.players.values()].filter((p) => p.team !== this.seekTeam); }
  seekers() { return [...this.players.values()].filter((p) => p.team === this.seekTeam); }

  checkRoundOver() {
    const hiders = this.hiders();
    if (!this.seekers().length || !hiders.length || hiders.every((p) => p.caught)) this.endRound();
  }

  endRound() {
    const now = performance.now();
    const seekTime = this.phase === 'seek' ? (now - this.seekStart) / 1000 : 0;
    const hiders = this.hiders();
    const caught = hiders.filter((p) => p.caught).length;
    const allCaught = hiders.length > 0 && caught === hiders.length;
    const result = {
      round: this.round,
      seekTeam: this.seekTeam,
      caught,
      total: hiders.length,
      time: allCaught ? Math.max(...hiders.map((p) => p.caughtAt)) : this.settings.seek,
      players: [...this.players.values()].map((p) => ({
        id: p.id, name: p.name, team: p.team,
        role: p.team === this.seekTeam ? 'seek' : 'hide',
        catches: p.catches,
        caughtAt: p.caught ? round2(p.caughtAt) : null,
        caughtBy: p.caughtBy,
        survived: round2(p.caught ? p.caughtAt : Math.min(seekTime, this.settings.seek)),
        spotted: round2(p.spotted),
      })),
    };
    this.results.push(result);
    if (this.round === 1 && TEAMS.every((t) => [...this.players.values()].some((p) => p.team === t))) {
      this.setPhase('break', RULES.roundBreak);
    } else {
      this.finish();
    }
  }

  finish() {
    this.phase = 'results';
    this.wards = [];
    this.broadcast({ t: 'phase', phase: 'results', round: this.round, results: this.results, winner: winner(this.results), settings: this.settings });
  }

  // ------------------------------------------------------------ tick

  tick() {
    const now = performance.now();
    const dt = Math.min(0.5, (now - this.last) / 1000);
    this.last = now;

    for (const p of [...this.players.values()]) {
      if (p.id !== HOST_ID && now - p.lastSeen > TIMEOUT * 1000) this.leave(p.id);
    }

    // Keep-alive, so players notice a vanished host even when nothing happens.
    if (!(this.phase === 'hide' || this.phase === 'seek') && now - (this.lastPing || 0) > 2000) {
      this.lastPing = now;
      this.broadcast({ t: 'ping' });
    }

    if (this.phase === 'lobby') {
      if (this.countdownAt && now >= this.countdownAt) {
        if (this.canStart()) this.startGame(); else { this.countdownAt = 0; this.broadcastRoom(); }
      }
      return;
    }
    if (this.phase === 'results') return;
    if (this.phase === 'break') {
      if (now >= this.endsAt) this.startRound(2);
      return;
    }
    if (this.phase === 'hide' && now >= this.endsAt) this.setPhase('seek', this.settings.seek);
    if (this.phase === 'seek') {
      this.spot(dt);
      if (this.phase === 'seek' && now >= this.endsAt) this.endRound();
    }
    if (this.phase === 'hide' || this.phase === 'seek') this.snapshot();
  }

  seekerSources() {
    const list = this.seekers().map((p) => ({ x: p.x, z: p.z, sight: SIGHT.champion, owner: p.id }));
    for (const w of this.wards) list.push({ x: w.x, z: w.z, sight: SIGHT.stealth, owner: w.owner });
    return list;
  }

  // Fill or drain each hider's spotted meter, and catch the ones that fill it.
  spot(dt) {
    const sources = this.seekerSources();
    const bits = this.vision.merge(sources.map((s) => this.vision.source(s.x, s.z, s.sight)));
    const t = (performance.now() - this.seekStart) / 1000;
    for (const h of this.hiders()) {
      if (h.caught) continue;
      const cell = this.grid.index(h.x, h.z);
      const seen = has(bits, cell);
      h.spot = Math.max(0, h.spot + (seen ? dt : -dt));
      if (seen) h.spotted += dt;
      if (h.spot < RULES.catchTime) continue;
      h.caught = true;
      h.caughtAt = t;
      // Credit the closest source that sees the hider.
      let by = null, best = Infinity;
      for (const s of sources) {
        const d = Math.hypot(s.x - h.x, s.z - h.z);
        if (d < best && has(this.vision.source(s.x, s.z, s.sight), cell)) { best = d; by = s.owner; }
      }
      const seeker = this.players.get(by);
      if (seeker) seeker.catches++;
      h.caughtBy = by;
      this.broadcast({ t: 'caught', id: h.id, by });
    }
    this.checkRoundOver();
  }

  snapshot() {
    const ms = Math.max(0, this.endsAt - performance.now());
    const p = [...this.players.values()].map((q) => [q.id, Math.round(q.x), Math.round(q.z), q.caught ? 1 : 0, round2(Math.min(q.spot, RULES.catchTime)), q.wards]);
    const w = this.wards.map((x) => [x.owner, Math.round(x.x), Math.round(x.z)]);
    this.broadcast({ t: 'snap', ms, p, w });
  }
}

// The team that caught the larger share of hiders wins; on a tie, the faster one.
export function winner(results) {
  if (results.length < 2) return null;
  const score = (r) => (r.total ? r.caught / r.total : 0);
  const [a, b] = results;
  if (score(a) !== score(b)) return score(a) > score(b) ? a.seekTeam : b.seekTeam;
  if (a.time !== b.time) return a.time < b.time ? a.seekTeam : b.seekTeam;
  return 'draw';
}
