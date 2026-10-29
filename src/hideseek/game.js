// Hide and seek: home, lobby and game screens of one page. The page stays
// the same from lobby to results so the connection to the host survives.

import { onLangChange } from '../lang.js';
import { t, num, lang } from '../i18n.js';
import { NavGrid } from '../grid.js';
import { Vision, has } from '../vision.js';
import { findPath } from '../path.js';
import { blur } from '../blur.js';
import { SIGHT, DEFAULT_MOVE_SPEED, DEFAULT_FOG_EDGE, BACKGROUND, PATCHES } from '../config.js';
import { RULES, HIDE_CHOICES, SEEK_CHOICES, WARD_CHOICES, CATCH_CHOICES, TEAMS, otherTeam, NET_RATE, TIMEOUT } from './rules.js';
import { openHost, openClient, newCode, cleanCode } from './net.js';
import { Server, HOST_ID } from './server.js';
import { loadChampions, splashUrl, searchKey } from './champions.js';
import { SPELLS, categoryOf, clampRange, blinkTarget, spellStats } from './spells.js';
import { categoryIcon } from './icons.js';

const $ = (id) => document.getElementById(id);
const canvas = $('map');
const ctx = canvas.getContext('2d');
let needsDraw = true;

const grid = new NavGrid(await (await fetch(PATCHES[0][1])).json());
const vision = new Vision(grid);
const MAP = grid.w * grid.cell;
const bg = new Image();
bg.src = BACKGROUND.src;
bg.onload = () => { needsDraw = true; };

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const teamName = (team) => t('team.' + team);
const teamSpan = (team) => `<span class="${team}-text">${teamName(team)}</span>`;
const clock = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const secs = (s) => `${Math.round(s)} s`;
const you = (id) => (id === myId ? t('you') : '');
// A Fantasy spell's name and texts in the current language, with its numbers.
const spellText = (category, field) => {
  const sp = SPELLS[category];
  return t(`spell.${category}.${field}`, { ...sp, pct: sp.speed ? Math.round((sp.speed - 1) * 100) : 0 });
};

// ---------------------------------------------------------------- connection

let link = null; // { send(msg), close() }
let server = null; // only in the host's browser
let roomCode = '';
let myId = null;
let room = null; // last 'room' message: players, settings, countdown

function showScreen(name) {
  for (const id of ['home', 'lobby', 'game']) $(id).hidden = id !== name;
  document.body.classList.toggle('in-game', name === 'game');
  if (name === 'game') resize();
}

function homeStatus(text, error = false) {
  $('home-status').textContent = text;
  $('home-status').className = 'status-line' + (error ? ' error' : '');
}

function readName() {
  const name = $('name').value.trim();
  if (!name) { homeStatus(t('hs.pickName'), true); $('name').focus(); return null; }
  store.set('sol-hs-name', name);
  return name;
}

function setBusy(on) { document.querySelectorAll('#home button, #home input').forEach((el) => { el.disabled = on; }); }

function setHash(code) { history.replaceState(null, '', location.pathname + location.search + (code ? '#' + code : '')); }

async function createRoom() {
  const name = readName();
  if (!name) return;
  setBusy(true);
  homeStatus(t('hs.creating'));
  let lastError = null;
  for (let attempt = 0; attempt < 3 && !link; attempt++) {
    const code = newCode();
    let transport = null;
    const srv = new Server(grid, vision, (id, msg) => {
      if (id === HOST_ID) { const copy = structuredClone(msg); queueMicrotask(() => onMessage(copy)); }
      else if (transport) transport.send(id, msg);
    });
    srv.categories = categories;
    try {
      transport = await openHost(code, {
        onJoin: (id) => srv.join(id),
        onMessage: (id, msg) => srv.message(id, msg),
        onLeave: (id) => srv.leave(id),
      });
      server = srv;
      roomCode = code;
      link = {
        send: (msg) => { const copy = structuredClone(msg); queueMicrotask(() => srv.message(HOST_ID, copy)); },
        close: () => { srv.close(); transport.close(); },
      };
    } catch (e) {
      srv.close();
      lastError = e;
    }
  }
  setBusy(false);
  if (!link) { homeStatus(lastError ? lastError.message : t('hs.createFailed'), true); return; }
  setHash(roomCode);
  link.send({ t: 'hello', name });
}

async function joinRoom(code) {
  const name = readName();
  if (!name) return;
  code = cleanCode(code);
  if (code.length !== 5) { homeStatus(t('hs.codeLength'), true); return; }
  setBusy(true);
  homeStatus(t('hs.joining', { code }));
  try {
    link = await openClient(code, { onMessage, onClose: () => lost(t('hs.lost')) });
  } catch (e) {
    setBusy(false);
    homeStatus(e.message, true);
    return;
  }
  setBusy(false);
  roomCode = code;
  setHash(code);
  link.send({ t: 'hello', name });
}

function lost(message) {
  if (link) link.close();
  link = null; server = null; myId = null; room = null;
  game.phase = 'lobby';
  showScreen('home');
  homeStatus(message, true);
  syncHome();
}

function send(msg) { if (link) link.send(msg); }

let lastHeard = 0;
function onMessage(m) {
  if (!m || typeof m !== 'object') return;
  lastHeard = performance.now();
  if (m.t === 'welcome') { myId = m.id; homeStatus(''); showScreen('lobby'); renderLobby(); }
  else if (m.t === 'reject') lost(m.key ? t(m.key, m) : m.reason);
  else if (m.t === 'room') { room = m; syncCountdown(); if (game.phase === 'lobby') renderLobby(); else renderBoard(); }
  else if (m.t === 'phase') onPhase(m);
  else if (m.t === 'snap') onSnap(m);
  else if (m.t === 'caught') onCaught(m);
  else if (m.t === 'spell') onSpell(m);
}

// ---------------------------------------------------------------- home

$('name').value = store.get('sol-hs-name') || '';
function syncHome() {
  const code = cleanCode(location.hash.slice(1));
  $('join-box').hidden = code.length !== 5;
  $('create-box').hidden = code.length === 5;
  $('join').textContent = t('hs.joinRoomCode', { code });
}
$('create').addEventListener('click', createRoom);
$('join').addEventListener('click', () => joinRoom(location.hash.slice(1)));
$('join-code').addEventListener('click', () => joinRoom($('code').value));
$('code').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom($('code').value); });
$('name').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  if (!$('join-box').hidden) joinRoom(location.hash.slice(1)); else createRoom();
});
$('leave-code').addEventListener('click', () => { setHash(''); syncHome(); homeStatus(''); });
window.addEventListener('hashchange', () => { if (!link) syncHome(); });

// ---------------------------------------------------------------- lobby

const playerList = () => (room ? room.players : []);
const playerById = (id) => playerList().find((p) => p.id === id);
const myTeam = () => (playerById(myId) || {}).team;
const isHost = () => myId === HOST_ID;

for (const s of HIDE_CHOICES) $('set-hide').add(new Option(`${s} s`, s));
for (const s of SEEK_CHOICES) $('set-seek').add(new Option('', s));
for (const s of CATCH_CHOICES) $('set-catch').add(new Option('', s));
// Option texts that change with the language.
function labelOptions() {
  for (const o of $('set-seek').options) { const s = Number(o.value); o.textContent = s % 60 ? t('hs.minSec', { m: Math.floor(s / 60), s: s % 60 }) : t('hs.min', { m: s / 60 }); }
  for (const o of $('set-catch').options) o.textContent = `${num(Number(o.value))} s`;
}
labelOptions();
// The host's catch delay once known, else the default.
const catchTime = () => (game.settings || (room && room.settings) || RULES).catchTime;
for (const id of ['set-seeker-wards', 'set-hider-wards']) for (const n of WARD_CHOICES) $(id).add(new Option(String(n), n));
const SETTING_INPUTS = ['set-hide', 'set-seek', 'set-catch', 'set-seeker-wards', 'set-hider-wards', 'set-training', 'set-fantasy'];
const spellOf = (p) => (p && p.category ? SPELLS[p.category] : null);

function renderLobby() {
  if (!room || !myId) return;
  $('room-code').textContent = roomCode;
  const me = playerById(myId);
  for (const team of TEAMS) {
    const list = playerList().filter((p) => p.team === team);
    $('team-' + team).innerHTML = list.length
      ? list.map((p) => `<li class="${p.id === myId ? 'me' : ''}">${avatar(p)}<span class="nm">${escapeHtml(p.name)}${you(p.id)}</span>`
        + `${p.id === room.host ? `<span class="badge">${t('hs.host')}</span>` : ''}`
        + `${p.ready ? `<span class="ok">${t('hs.isReady')}</span>` : `<span class="wait">${t('hs.notReady')}</span>`}</li>`).join('')
      : `<li class="empty">${t('hs.nobody')}</li>`;
    const btn = document.querySelector(`[data-team="${team}"]`);
    btn.disabled = me && me.team === team;
    btn.classList.toggle('mine', !!me && me.team === team);
    btn.textContent = me && me.team === team ? t('hs.yourTeam') : t('hs.joinTeam', { team: teamName(team) });
  }
  if (me && document.activeElement !== $('lobby-name')) $('lobby-name').value = me.name;
  renderChampions();
  setSplash(me && me.champion);
  $('ready').textContent = me && me.ready ? t('hs.readyOn') : t('hs.ready');
  $('ready').classList.toggle('on', !!(me && me.ready));
  $('ready').disabled = !(me && me.champion);
  $('ready').title = me && me.champion ? '' : t('hs.pickFirst');

  const s = room.settings;
  $('set-hide').value = s.hide;
  $('set-seek').value = s.seek;
  $('set-catch').value = s.catchTime;
  $('rule-catch').textContent = num(s.catchTime);
  $('set-seeker-wards').value = s.seekerWards;
  $('set-hider-wards').value = s.hiderWards;
  $('set-training').checked = s.training;
  $('set-fantasy').checked = s.fantasy;
  $('rule-fantasy').hidden = !s.fantasy;
  $('rule-fantasy').innerHTML = t('hs.rule.fantasy') + ' '
    + Object.entries(SPELLS).map(([c, sp]) => {
      const text = spellText(c, 'text');
      return t('hs.rule.spell', { cat: t('cat.' + c), name: spellText(c, 'name'), text: text[0].toLowerCase() + text.slice(1, -1), cd: sp.cooldown });
    }).join(' · ') + '.';
  for (const id of SETTING_INPUTS) $(id).disabled = !isHost();
  $('rule-wards').textContent = t('hs.rule.wards', { wards: t('hs.stealthWards', { n: s.seekerWards }), n: s.hiderWards });
  $('settings-note').textContent = isHost() ? t('hs.youHost') : t('hs.byHost');
  lobbyStatus();
}

function lobbyStatus() {
  if (!room) return;
  const el = $('lobby-status');
  const list = playerList();
  el.className = 'status-line';
  if (room.countdown !== null && countdownEnd) {
    el.className = 'status-line go';
    el.textContent = t('hs.starting', { n: Math.max(1, Math.ceil((countdownEnd - performance.now()) / 1000)) });
  } else if (list.length < 2 || !TEAMS.every((t) => list.some((p) => p.team === t))) {
    el.textContent = t('hs.needPlayers');
  } else {
    const noChamp = list.filter((p) => !p.champion).map((p) => p.name);
    const waiting = list.filter((p) => p.champion && !p.ready).map((p) => p.name);
    el.textContent = [
      noChamp.length ? t('hs.mustPick', { names: noChamp.join(', '), n: noChamp.length }) : '',
      waiting.length ? t('hs.waitReady', { names: waiting.join(', '), n: waiting.length }) : '',
    ].filter(Boolean).join(' ');
  }
}
// ---------------------------------------------------------------- champions

let champions = []; // [{ id, name, icon, tags }] once Data Dragon answers
const champById = new Map();
const categories = new Map(); // champion id -> Fantasy category, read by the host's server
const iconImages = new Map(); // id -> Image, for drawing on the map

const fantasyOn = () => !!(room && room.settings.fantasy);

// Champion portrait, with its Fantasy category badge on top when Fantasy is on.
function avatar(p) {
  const c = p && champById.get(p.champion);
  if (!c) return '';
  const img = `<img class="av" src="${c.icon}" alt="${escapeHtml(c.name)}" title="${escapeHtml(c.name)}">`;
  return fantasyOn() && p.category ? `<span class="avw">${img}${categoryIcon(p.category, 'on-av')}</span>` : img;
}

function iconImage(id) {
  const c = champById.get(id);
  if (!c) return null;
  let img = iconImages.get(id);
  if (!img) { img = new Image(); img.src = c.icon; img.onload = () => { needsDraw = true; }; iconImages.set(id, img); }
  return img.complete && img.naturalWidth ? img : null;
}

let splashShown = null;
function setSplash(id) {
  id = champById.has(id) ? id : null;
  if (id === splashShown) return;
  splashShown = id;
  document.body.style.setProperty('--splash', id ? `url("${splashUrl(id)}")` : 'none');
}

// Loads the champion list with names in the current language. Runs again on
// a language change; ids and classes stay the same.
async function showChampions() {
  const wanted = lang();
  const list = await loadChampions(wanted);
  if (wanted !== lang()) return; // switched again while loading
  const first = !champions.length;
  champions = list;
  for (const c of list) { champById.set(c.id, c); const cat = categoryOf(c.tags); if (cat) categories.set(c.id, cat); }
  if (server && first) server.broadcastRoom();
  $('champ-grid').innerHTML = list.length
    ? list.map((c) => `<button data-champ="${c.id}" title="${escapeHtml(c.name)}"><span class="pic"><img src="${c.icon}" alt="" loading="lazy" width="48" height="48">`
      + `${categoryIcon(categoryOf(c.tags), 'on-tile')}</span><span class="nm">${escapeHtml(c.name)}</span></button>`).join('')
    : `<p class="empty">${t('hs.champFailed')}</p>`;
  filterChampions();
  if (room) { renderLobby(); renderBoard(); }
}
showChampions();

function renderChampions() {
  const mine = (playerById(myId) || {}).champion;
  const takenBy = new Map(playerList().filter((p) => p.champion && p.id !== myId).map((p) => [p.champion, p.name]));
  for (const b of $('champ-grid').querySelectorAll('[data-champ]')) {
    const id = b.dataset.champ, by = takenBy.get(id), name = champById.get(id).name;
    b.classList.toggle('picked', id === mine);
    b.classList.toggle('taken', !!by);
    b.disabled = !!by;
    b.title = by ? t('hs.pickedBy', { name, by }) : name;
  }
  $('champ-note').textContent = mine && champById.has(mine) ? `· ${champById.get(mine).name}` : t('hs.pickOne');
  $('champ-box').classList.toggle('no-fantasy', !fantasyOn());
  renderSpellCard();
}

// Your champion's Fantasy spell: what it does when you hide and when you seek.
function renderSpellCard() {
  const p = playerById(myId);
  const sp = fantasyOn() && spellOf(p);
  $('spell-card').hidden = !sp;
  if (!sp) return;
  // Always four stat tiles, so every card has the same size.
  const stats = spellStats(sp, num).map(([k, v]) => `<span>${v}<em>${t('stat.' + k)}</em></span>`);
  while (stats.length < 4) stats.push('<span class="empty"></span>');
  const c = p.category;
  const html = `<div class="sc-head">${categoryIcon(c, 'big')}<div>`
    + `<div class="sc-title"><strong>${spellText(c, 'name')}</strong> <span class="muted">· ${t('spell.class', { cat: t('cat.' + c) })} · <kbd>E</kbd></span></div>`
    + `<div class="sc-text">${spellText(c, 'text').replace(/(\d) s\b/g, '$1&nbsp;s')}</div></div></div>`
    + `<div class="sc-stats">${stats.join('')}</div>`
    + `<div class="sc-roles"><div><h3>${t('spell.asHider')}</h3><p>${spellText(c, 'hider')}</p></div>`
    + `<div><h3>${t('spell.asSeeker')}</h3><p>${spellText(c, 'seeker')}</p></div></div>`;
  if ($('spell-card').innerHTML !== html) $('spell-card').innerHTML = html;
}

function filterChampions() {
  const q = searchKey($('champ-search').value);
  for (const b of $('champ-grid').querySelectorAll('[data-champ]')) {
    const c = champById.get(b.dataset.champ);
    b.hidden = !!q && !searchKey(c.name).includes(q);
  }
}

$('champ-grid').addEventListener('click', (e) => {
  const b = e.target.closest('[data-champ]');
  if (b && !b.disabled) send({ t: 'set', champion: b.dataset.champ });
});
$('champ-search').addEventListener('input', filterChampions);

// The countdown arrives as time left; keep it as a local deadline.
let countdownEnd = 0;
const syncCountdown = () => { countdownEnd = room && room.countdown !== null ? performance.now() + room.countdown : 0; };

document.querySelectorAll('[data-team]').forEach((b) => b.addEventListener('click', () => send({ t: 'set', team: b.dataset.team })));
$('ready').addEventListener('click', () => { const me = playerById(myId); send({ t: 'set', ready: !(me && me.ready) }); });
let nameTimer = 0;
$('lobby-name').addEventListener('input', () => {
  clearTimeout(nameTimer);
  nameTimer = setTimeout(() => {
    const name = $('lobby-name').value.trim();
    if (name) { store.set('sol-hs-name', name); send({ t: 'set', name }); }
  }, 350);
});
const sendSettings = () => send({
  t: 'settings', hide: Number($('set-hide').value), seek: Number($('set-seek').value), training: $('set-training').checked,
  catchTime: Number($('set-catch').value),
  seekerWards: Number($('set-seeker-wards').value), hiderWards: Number($('set-hider-wards').value), fantasy: $('set-fantasy').checked,
});
for (const id of SETTING_INPUTS) $(id).addEventListener('change', sendSettings);
$('copy-link').addEventListener('click', async () => {
  const url = location.origin + location.pathname + location.search + '#' + roomCode;
  try { await navigator.clipboard.writeText(url); $('copy-link').textContent = t('hs.copied'); }
  catch { $('copy-link').textContent = url; }
  setTimeout(() => { $('copy-link').textContent = t('hs.copyInvite'); }, 2000);
});

// ---------------------------------------------------------------- game state

const game = { phase: 'lobby', round: 0, seekTeam: null, endsAt: 0, results: [], winner: null, settings: null };
const me = { x: 0, z: 0, caught: false, spot: 0, wards: 0, flags: 0, cd: 0, surgeUntil: 0, rootUntil: 0 };
const others = new Map(); // id -> { x, z, tx, tz, caught, spot, flags }
let wards = []; // [{ owner, x, z }]
let flares = []; // [{ owner, x, z }], Marksman reveals
let effects = []; // [{ x, z, radius, team, start, until }], spell areas drawn for a moment
const SHROUDED = 1, ROOTED = 2;
let path = [];

const isSeeker = () => myTeam() === game.seekTeam;
const playing = () => game.phase === 'hide' || game.phase === 'seek';
const spectating = () => !playing() || me.caught;
// Hiders may ward from the hide phase on; seekers once they are released.
const wardPhase = () => game.phase === 'seek' || (game.phase === 'hide' && !isSeeker());
const canMove = () => !me.caught && (game.phase === 'seek' || (game.phase === 'hide' && !isSeeker()));
const rooted = () => !!(me.flags & ROOTED) || performance.now() < me.rootUntil;
const mySpell = () => (game.settings && game.settings.fantasy ? spellOf(playerById(myId)) : null);

function onPhase(m) {
  const prev = game.phase;
  Object.assign(game, { phase: m.phase, round: m.round, seekTeam: m.seekTeam, results: m.results || [], winner: m.winner || null });
  if (m.settings) game.settings = m.settings;
  game.endsAt = performance.now() + (m.ms || 0);

  if (m.phase === 'lobby') { others.clear(); wards = []; path = []; showScreen('lobby'); renderLobby(); return; }
  showScreen('game');
  if (m.phase === 'hide') {
    const s = m.spawns[myId];
    if (s) { me.x = s.x; me.z = s.z; }
    me.caught = false; me.spot = 0; path = [];
    me.flags = 0; me.cd = 0; me.surgeUntil = 0; me.rootUntil = 0;
    flares = []; effects = [];
    me.wards = game.settings ? (isSeeker() ? game.settings.seekerWards : game.settings.hiderWards) : 0;
    others.clear();
    for (const [id, p] of Object.entries(m.spawns)) {
      if (id !== myId) others.set(id, { x: p.x, z: p.z, tx: p.x, tz: p.z, caught: false, spot: 0, flags: 0 });
    }
    wards = [];
    camera.follow = true;
    if (prev === 'lobby' || prev === 'break') camera.scale = Math.min(view.w, view.h) / 4200;
    camera.x = me.x; camera.z = me.z;
    feed(t(isSeeker() ? 'hs.feed.youSeek' : 'hs.feed.youHide', { round: m.round, s: m.ms / 1000 }));
  } else if (m.phase === 'seek') {
    feed(t(isSeeker() ? 'hs.feed.go' : 'hs.feed.seekersOut'));
  }
  sourcesKey = '';
  renderBoard();
  renderOverlay();
  syncButtons();
  needsDraw = true;
}

function onSnap(m) {
  const end = performance.now() + m.ms;
  if (Math.abs(end - game.endsAt) > 300) game.endsAt = end;
  const seen = new Set();
  for (const [id, x, z, caught, spot, wardsLeft, flags = 0, cd = 0] of m.p) {
    if (id === myId) {
      if (caught && !me.caught) path = [];
      me.caught = !!caught; me.spot = spot; me.wards = wardsLeft; me.flags = flags; me.cd = cd;
      continue;
    }
    seen.add(id);
    const o = others.get(id);
    if (o) { o.tx = x; o.tz = z; o.caught = !!caught; o.spot = spot; o.flags = flags; }
    else others.set(id, { x, z, tx: x, tz: z, caught: !!caught, spot, flags });
  }
  for (const id of others.keys()) if (!seen.has(id)) others.delete(id);
  wards = m.w.map(([owner, x, z]) => ({ owner, x, z }));
  flares = (m.f || []).map(([owner, x, z]) => ({ owner, x, z }));
  needsDraw = true;
  renderBoard();
  syncButtons();
}

function onCaught(m) {
  const who = playerById(m.id), by = playerById(m.by);
  const name = (p, fallback) => (p ? escapeHtml(p.name) : fallback);
  if (m.id === myId) { me.caught = true; path = []; }
  if (m.id === myId) feed(t('hs.feed.youCaught', { by: name(by, t('hs.feed.aWard')) }));
  else feed(t('hs.feed.caught', { who: name(who, t('hs.feed.aHider')), by: m.by === myId ? t('hs.feed.byYou') : name(by, t('hs.feed.aWard')) }));
  const o = others.get(m.id);
  if (o) o.caught = true;
  renderBoard();
}

function onSpell(m) {
  const who = playerById(m.id);
  const now = performance.now();
  const mine = m.id === myId;
  if (m.category === 'Mage') {
    const o = others.get(m.id);
    // Snap, do not glide: it is a teleport.
    if (o) { o.x = o.tx = m.x; o.z = o.tz = m.z; }
  } else if (m.category === 'Fighter' && mine) {
    me.surgeUntil = now + m.ms;
  } else if (m.category === 'Tank') {
    effects.push({ x: m.x, z: m.z, radius: m.radius, team: m.team, start: now, until: now + 1200 });
    if (m.hit.includes(myId)) { me.rootUntil = now + m.ms; path = []; feed(t('hs.feed.rooted', { who: who ? escapeHtml(who.name) : t('hs.feed.aTank') })); }
    else if (mine) feed(t(m.hit.length ? 'hs.feed.rootHit' : 'hs.feed.rootMiss', { spell: spellText('Tank', 'name'), n: m.hit.length }));
  } else if (m.category === 'Marksman') {
    effects.push({ x: m.x, z: m.z, radius: m.radius, team: m.team, start: now, until: now + 600 });
  } else if (m.category === 'Support' && (mine || m.team === myTeam())) {
    effects.push({ x: m.x, z: m.z, radius: m.radius, team: m.team, start: now, until: now + 800 });
    if (mine) feed(t(m.swept ? 'hs.feed.swept' : 'hs.feed.sweptNone', { spell: spellText('Support', 'name'), n: m.swept }));
  }
  needsDraw = true;
}

function feed(html) {
  const li = document.createElement('li');
  li.innerHTML = html;
  $('feed').append(li);
  setTimeout(() => li.remove(), 6000);
  while ($('feed').children.length > 4) $('feed').firstChild.remove();
}

// ---------------------------------------------------------------- vision

let myBits = null, seekBits = null, sourcesKey = '';

function teamSources(team) {
  const list = [];
  if (myTeam() === team && !me.caught) list.push({ x: me.x, z: me.z, sight: SIGHT.champion });
  for (const [id, o] of others) {
    const p = playerById(id);
    if (p && p.team === team && !o.caught) list.push({ x: o.x, z: o.z, sight: SIGHT.champion });
  }
  for (const w of wards) { const p = playerById(w.owner); if (p && p.team === team) list.push({ x: w.x, z: w.z, sight: SIGHT.stealth }); }
  for (const f of flares) { const p = playerById(f.owner); if (p && p.team === team) list.push({ x: f.x, z: f.z, sight: SPELLS.Marksman.radius }); }
  return list;
}
const bitsOf = (list) => vision.merge(list.map((s) => vision.source(s.x, s.z, s.sight)));
const keyOf = (list) => list.map((s) => grid.index(s.x, s.z) + ':' + s.sight).join(',');

function updateVision() {
  if (!playing() && game.phase !== 'break' && game.phase !== 'results') return;
  const mine = myTeam() ? teamSources(myTeam()) : [];
  const seek = game.seekTeam ? teamSources(game.seekTeam) : [];
  const showRed = playing() && (me.caught || (!isSeeker() && game.settings && game.settings.training));
  const key = `${game.phase}|${me.caught}|${showRed}|${keyOf(mine)}|${keyOf(seek)}`;
  if (key === sourcesKey) return;
  sourcesKey = key;
  myBits = bitsOf(mine);
  seekBits = bitsOf(seek);
  paintFog(!spectating(), showRed);
  needsDraw = true;
}

const fogCanvas = document.createElement('canvas');
fogCanvas.width = grid.w; fogCanvas.height = grid.h;
const fogCtx = fogCanvas.getContext('2d');
const FOG = { dark: [0, 0, 0, 165], red: [235, 40, 50, 105] };

function paintFog(dark, red) {
  const { w, h } = grid;
  const f = new Float32Array(w * h), e = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    f[i] = dark && !has(myBits, i) ? 1 : 0;
    e[i] = red && has(seekBits, i) ? 1 : 0;
  }
  const sigma = DEFAULT_FOG_EDGE / grid.cell / 3.3;
  blur(f, w, h, sigma);
  if (red) blur(e, w, h, sigma);
  const img = fogCtx.createImageData(w, h);
  const d = img.data;
  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      const i = z * w + x;
      const o = ((h - 1 - z) * w + x) * 4;
      const af = f[i] * FOG.dark[3], ae = e[i] * (1 - f[i]) * FOG.red[3];
      const a = af + ae;
      if (a < 0.5) continue;
      for (let c = 0; c < 3; c++) d[o + c] = (FOG.dark[c] * af + FOG.red[c] * ae) / a;
      d[o + 3] = a;
    }
  }
  fogCtx.putImageData(img, 0, 0);
}

// ---------------------------------------------------------------- camera

const view = { w: 0, h: 0, dpr: 1 };
const camera = { x: MAP / 2, z: MAP / 2, scale: 0.1, follow: true };
function resize() {
  view.dpr = window.devicePixelRatio || 1;
  view.w = canvas.clientWidth; view.h = canvas.clientHeight;
  canvas.width = Math.round(view.w * view.dpr);
  canvas.height = Math.round(view.h * view.dpr);
  needsDraw = true;
}
const toScreen = (x, z) => [(x - camera.x) * camera.scale + view.w / 2, (camera.z - z) * camera.scale + view.h / 2];
const toWorld = (sx, sy) => ({ x: (sx - view.w / 2) / camera.scale + camera.x, z: camera.z - (sy - view.h / 2) / camera.scale });
function clampCamera() {
  const minScale = Math.min(view.w, view.h) / (MAP * 1.05);
  camera.scale = Math.min(2, Math.max(minScale, camera.scale));
  camera.x = Math.min(MAP, Math.max(0, camera.x));
  camera.z = Math.min(MAP, Math.max(0, camera.z));
}

// ---------------------------------------------------------------- draw

const COLORS = { blue: '#4aa8ff', red: '#ff4d5a', me: '#ffd34d', ward: '#ffd84a' };
const LIGHT = { blue: 'rgba(160,210,255,', red: 'rgba(255,170,180,' }; // spell areas, alpha appended

function draw() {
  clampCamera();
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  // Transparent outside the map, so your champion's splash art shows there.
  ctx.clearRect(0, 0, view.w, view.h);
  if (bg.complete && bg.naturalWidth) {
    const [bx, by] = toScreen(BACKGROUND.minX, BACKGROUND.minZ + BACKGROUND.size);
    const bs = BACKGROUND.size * camera.scale;
    ctx.drawImage(bg, bx, by, bs, bs);
  }
  const [gx, gy] = toScreen(grid.minX, grid.minZ + grid.h * grid.cell);
  ctx.drawImage(fogCanvas, gx, gy, grid.w * grid.cell * camera.scale, grid.h * grid.cell * camera.scale);

  const visible = (x, z) => spectating() || has(myBits, grid.index(x, z));
  const team = myTeam();

  // wards, only your own team's unless spectating
  for (const w of wards) {
    const p = playerById(w.owner);
    if (!p || (p.team !== team && !spectating())) continue;
    const [x, y] = toScreen(w.x, w.z);
    const r = Math.max(5, 40 * camera.scale);
    ctx.fillStyle = COLORS.ward; ctx.strokeStyle = COLORS[p.team]; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x, y - r * 1.3); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r * 1.3); ctx.lineTo(x - r, y); ctx.closePath();
    ctx.fill(); ctx.stroke();
  }

  // Tank and Marksman areas, seen by both teams in their caster's light team color
  const now = performance.now();
  effects = effects.filter((e) => now < e.until);
  const areas = effects.map((e) => ({ ...e, a: 1 - (now - e.start) / (e.until - e.start) }));
  for (const f of flares) { const p = playerById(f.owner); if (p) areas.push({ x: f.x, z: f.z, radius: SPELLS.Marksman.radius, team: p.team, a: 0.8 }); }
  for (const e of areas) {
    const [x, y] = toScreen(e.x, e.z);
    const r = e.radius * camera.scale;
    ctx.globalAlpha = Math.max(0, e.a);
    ctx.fillStyle = LIGHT[e.team] + '0.16)'; ctx.strokeStyle = LIGHT[e.team] + '0.85)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (effects.length) needsDraw = true;

  // path
  if (path.length) {
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(...toScreen(me.x, me.z));
    for (const p of path) ctx.lineTo(...toScreen(p.x, p.z));
    ctx.stroke(); ctx.setLineDash([]);
  }

  // other players
  for (const [id, o] of others) {
    const p = playerById(id);
    if (!p) continue;
    if (!o.caught && p.team !== team && (!visible(o.x, o.z) || ((o.flags & SHROUDED) && !spectating()))) continue;
    drawChampion(o.x, o.z, p, o, false);
  }
  const mine = playerById(myId);
  if (mine && playing()) drawChampion(me.x, me.z, mine, me, true);
}

function drawChampion(x0, z0, p, s, isMe) {
  const [x, y] = toScreen(x0, z0);
  const r = Math.max(8, 65 * camera.scale);
  ctx.globalAlpha = s.caught || (s.flags & SHROUDED) ? 0.45 : 1;
  const icon = iconImage(p.champion);
  if (icon) {
    // Champion portrait in a team-colored ring; yours gets a gold outer ring.
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(icon, x - r, y - r, 2 * r, 2 * r);
    ctx.restore();
    ctx.strokeStyle = COLORS[p.team]; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    if (isMe) { ctx.strokeStyle = COLORS.me; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r + 3, 0, Math.PI * 2); ctx.stroke(); }
  } else {
    ctx.fillStyle = isMe ? COLORS.me : COLORS[p.team];
    ctx.strokeStyle = isMe ? COLORS[p.team] : '#0b0f14'; ctx.lineWidth = isMe ? 3 : 2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  if ((s.flags & ROOTED) || (isMe && rooted())) {
    ctx.strokeStyle = '#b48a4a'; ctx.lineWidth = 3; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.arc(x, y, r + 11, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  }
  if (s.caught) {
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - r * 0.6, y - r * 0.6); ctx.lineTo(x + r * 0.6, y + r * 0.6);
    ctx.moveTo(x + r * 0.6, y - r * 0.6); ctx.lineTo(x - r * 0.6, y + r * 0.6); ctx.stroke();
  } else if (s.spot > 0) {
    // spotted meter around the champion
    ctx.strokeStyle = '#ff5a64'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(x, y, r + 6, -Math.PI / 2, -Math.PI / 2 + (2 * Math.PI * s.spot) / catchTime()); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.font = '600 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.fillStyle = '#fff';
  ctx.strokeText(p.name, x, y - r - 10);
  ctx.fillText(p.name, x, y - r - 10);
  ctx.textAlign = 'start';
}

// ---------------------------------------------------------------- HUD

function renderHud() {
  const hud = $('hud');
  const left = game.endsAt - performance.now();
  const seekName = game.seekTeam ? teamName(game.seekTeam) : '';
  const time = `<span class="time">${clock(left)}</span>`;
  let cls = 'hud', html = '';
  if (game.phase === 'hide') {
    const round = t('hs.hud.round', { round: game.round });
    html = isSeeker()
      ? `${round} · ${time} · ${t('hs.hud.held')}`
      : `${round} · ${time} · ${t('hs.hud.hide', { team: seekName })}${me.wards ? ` · ${t('hs.hud.wardsKey', { n: me.wards })}` : ''}`;
  } else if (game.phase === 'seek') {
    const hiders = playerList().filter((p) => p.team !== game.seekTeam);
    const caught = hiders.filter((p) => (p.id === myId ? me.caught : (others.get(p.id) || {}).caught)).length;
    const total = hiders.length;
    if (isSeeker()) html = `${t('hs.hud.seek')} · ${time} · ${t('hs.hud.caught', { c: caught, t: total })} · ${t('hs.hud.wards', { n: me.wards })}`;
    else if (me.caught) html = `${t('hs.hud.spectating')} · ${time} · ${t('hs.hud.caughtCount', { c: caught, t: total })}`;
    else if (me.spot > 0) { cls += ' seen'; html = `${t('hs.hud.spotted')} · ${time}`; }
    else { cls += ' hidden-ok'; html = `${t('hs.hud.hidden')} · ${time} · ${t('hs.hud.left', { n: total - caught })}${me.wards ? ` · ${t('hs.hud.wards', { n: me.wards })}` : ''}`; }
  } else if (game.phase === 'break') {
    html = t('hs.hud.break', { t: time });
  } else if (game.phase === 'results') {
    html = t('hs.hud.over');
  }
  hud.className = cls;
  if (hud.innerHTML !== html) hud.innerHTML = html;

  const showMeter = game.phase === 'seek' && !isSeeker() && !me.caught && me.spot > 0;
  $('meter').hidden = !showMeter;
  if (showMeter) {
    const pct = Math.min(100, Math.round((100 * me.spot) / catchTime()));
    $('meter').firstChild.style.width = pct + '%';
    $('meter').lastChild.textContent = t('hs.meter', { pct });
  }
}

function renderBoard() {
  if (game.phase === 'lobby') return;
  const rows = TEAMS.map((team) => {
    const role = t(team === game.seekTeam ? 'hs.board.seeking' : 'hs.board.hiding');
    const items = playerList().filter((p) => p.team === team).map((p) => {
      const out = p.id === myId ? me.caught : (others.get(p.id) || {}).caught;
      return `<li class="${out && playing() ? 'out' : ''}">${avatar(p)}<span class="nm">${escapeHtml(p.name)}${you(p.id)}</span>`
        + `<span class="tag">${out && playing() ? t('hs.board.caught') : ''}</span></li>`;
    }).join('');
    return `<h2 class="${team}">${teamName(team)}${playing() ? ` <span class="muted">· ${role}</span>` : ''}</h2><ul>${items}</ul>`;
  }).join('');
  if ($('board').innerHTML !== rows) $('board').innerHTML = rows;
}

function syncButtons() {
  const canWard = wardPhase() && me.wards > 0 && !me.caught;
  const allowance = game.settings ? (isSeeker() ? game.settings.seekerWards : game.settings.hiderWards) : 0;
  $('ward-btn').hidden = !(playing() && allowance > 0);
  $('ward-btn').disabled = !canWard;
  $('ward-btn').textContent = t('hs.wardBtn.count', { n: me.wards });
  const sp = mySpell();
  $('spell-btn').hidden = !(playing() && sp);
  if (sp) {
    $('spell-btn').disabled = !canCast();
    const c = playerById(myId).category, name = spellText(c, 'name');
    $('spell-btn').textContent = me.cd > 0 ? t('hs.spellBtn.cd', { name, s: Math.ceil(me.cd) }) : t('hs.spellBtn.name', { name });
    $('spell-btn').title = t('hs.spellBtn.info', { cat: t('cat.' + c), text: spellText(c, 'text'), cd: sp.cooldown });
  }
  $('follow-btn').classList.toggle('on', camera.follow);
}

function resultTable(r) {
  const rows = r.players.slice().sort((a, b) => (a.role === b.role ? 0 : a.role === 'seek' ? -1 : 1)).map((p) => {
    const by = r.players.find((q) => q.id === p.caughtBy);
    const detail = p.role === 'seek'
      ? t('hs.res.catches', { n: p.catches })
      : p.caughtAt !== null ? t('hs.res.caughtAt', { t: secs(p.caughtAt) }) + (by ? t('hs.res.by', { name: escapeHtml(by.name) }) : '') : t('hs.res.survived', { t: secs(p.survived) });
    return `<tr><td>${escapeHtml(p.name)}${you(p.id)}</td><td>${teamSpan(p.team)}</td><td>${t(p.role === 'seek' ? 'hs.res.seeker' : 'hs.res.hider')}</td>`
      + `<td>${detail}</td><td class="num">${p.role === 'hide' ? secs(p.spotted) : ''}</td></tr>`;
  }).join('');
  return `<table><thead><tr><th>${t('hs.res.player')}</th><th>${t('hs.res.team')}</th><th>${t('hs.res.role')}</th><th>${t('hs.res.result')}</th>`
    + `<th class="num">${t('hs.res.spotted')}</th></tr></thead><tbody>${rows}</tbody></table>`;
}

const roundLine = (r) => t('hs.res.roundLine', { team: teamSpan(r.seekTeam), c: r.caught, n: r.total })
  + (r.total && r.caught === r.total ? t('hs.res.inTime', { t: secs(r.time) }) : '');

function renderOverlay() {
  const el = $('overlay');
  el.hidden = !(game.phase === 'break' || game.phase === 'results');
  if (el.hidden) return;
  const card = $('overlay-card');
  if (game.phase === 'break') {
    const r = game.results[0];
    card.innerHTML = `<h1>${t('hs.res.round1Over')}</h1><p class="big">${roundLine(r)}</p>${resultTable(r)}`
      + `<p class="muted">${t('hs.res.round2', { seek: teamSpan(otherTeam(r.seekTeam)), hide: teamSpan(r.seekTeam) })}</p>`;
    return;
  }
  const w = game.winner;
  const head = !w ? t('hs.hud.over') : w === 'draw' ? t('hs.res.draw') : t('hs.res.wins', { team: teamSpan(w) });
  const totals = new Map();
  for (const r of game.results) for (const p of r.players) {
    const t = totals.get(p.id) || { name: p.name, team: p.team, catches: 0, survived: 0, spotted: 0 };
    t.catches += p.catches;
    if (p.role === 'hide') { t.survived += p.survived; t.spotted += p.spotted; }
    totals.set(p.id, t);
  }
  const totalRows = [...totals.entries()].sort((a, b) => b[1].catches - a[1].catches || b[1].survived - a[1].survived)
    .map(([id, tot]) => `<tr><td>${escapeHtml(tot.name)}${you(id)}</td><td>${teamSpan(tot.team)}</td>`
      + `<td class="num">${tot.catches}</td><td class="num">${secs(tot.survived)}</td><td class="num">${secs(tot.spotted)}</td></tr>`).join('');
  card.innerHTML = `<h1>${head}</h1>`
    + game.results.map((r) => `<p class="big">${t('hs.res.round', { round: r.round, line: roundLine(r) })}</p>`).join('')
    + `<table><thead><tr><th>${t('hs.res.player')}</th><th>${t('hs.res.team')}</th><th class="num">${t('hs.res.catchCol')}</th>`
    + `<th class="num">${t('hs.res.survivedCol')}</th><th class="num">${t('hs.res.spotted')}</th></tr></thead><tbody>${totalRows}</tbody></table>`
    + `<p class="muted">${t('hs.rule.win')}</p>`
    + `<div class="actions"><a class="back" href="./">${t('hs.res.leave')}</a>`
    + `${isHost() ? `<button id="rematch" class="primary">${t('hs.res.rematch')}</button>` : `<span class="muted">${t('hs.res.waitHost')}</span>`}</div>`;
  const btn = $('rematch');
  if (btn) btn.addEventListener('click', () => send({ t: 'lobby' }));
}

// ---------------------------------------------------------------- movement and loop

function orderMove(x, z) {
  if (!canMove()) return;
  const side = myTeam();
  const target = grid.nearestWalkable(x, z, side);
  if (!target) return;
  const p = findPath(grid, side, me, target);
  if (p) { path = p; needsDraw = true; }
}

function placeWard(target) {
  if (!(wardPhase() && me.wards > 0 && !me.caught)) return;
  let { x, z } = target || me;
  const d = Math.hypot(x - me.x, z - me.z);
  if (d > RULES.wardRange) { x = me.x + ((x - me.x) * RULES.wardRange) / d; z = me.z + ((z - me.z) * RULES.wardRange) / d; }
  send({ t: 'ward', x, z });
}

// Hiders cast from the hide phase on, seekers once released; never once caught.
const canCast = () => !!mySpell() && wardPhase() && !me.caught && me.cd <= 0;

function castSpell(target) {
  const sp = mySpell();
  if (!canCast()) return;
  const category = playerById(myId).category;
  const t = target || me;
  if (category === 'Mage') {
    if (rooted()) return;
    const land = blinkTarget(grid, myTeam(), me, t.x, t.z);
    // Move first: the next position we report must be the landing spot.
    me.x = land.x; me.z = land.z; path = [];
    send({ t: 'cast', x: land.x, z: land.z });
  } else if (category === 'Marksman') {
    send({ t: 'cast', ...clampRange(me.x, me.z, t.x, t.z, sp.range) });
  } else {
    send({ t: 'cast' });
  }
  me.cd = sp.cooldown; // until the next snapshot says otherwise
  syncButtons();
  needsDraw = true;
}

let last = performance.now();
let lastSend = 0, lastSentPos = '';
let lastUi = 0;
function tick(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (path.length && canMove() && !rooted()) {
    let budget = DEFAULT_MOVE_SPEED * (now < me.surgeUntil ? SPELLS.Fighter.speed : 1) * dt;
    while (budget > 0 && path.length) {
      const p = path[0];
      const d = Math.hypot(p.x - me.x, p.z - me.z);
      if (d <= budget) { me.x = p.x; me.z = p.z; path.shift(); budget -= d; }
      else { me.x += ((p.x - me.x) * budget) / d; me.z += ((p.z - me.z) * budget) / d; budget = 0; }
    }
    needsDraw = true;
  } else if (path.length && !canMove() && !(game.phase === 'hide')) path = [];

  // Report our position (and keep the connection alive in the lobby).
  if (link && myId && !server && now - lastHeard > TIMEOUT * 1000) lost(t('hs.timeout'));
  if (link && myId) {
    const pos = `${Math.round(me.x)},${Math.round(me.z)}`;
    if (playing() && now - lastSend > 1000 / NET_RATE && (pos !== lastSentPos || now - lastSend > 1000)) {
      send({ t: 'pos', x: me.x, z: me.z }); lastSend = now; lastSentPos = pos;
    } else if (!playing() && now - lastSend > 2000) { send({ t: 'ping' }); lastSend = now; }
  }

  // Others glide toward their last reported position.
  const k = Math.min(1, dt * 10);
  for (const o of others.values()) {
    if (o.x !== o.tx || o.z !== o.tz) {
      o.x += (o.tx - o.x) * k; o.z += (o.tz - o.z) * k;
      if (Math.abs(o.tx - o.x) < 1 && Math.abs(o.tz - o.z) < 1) { o.x = o.tx; o.z = o.tz; }
      needsDraw = true;
    }
  }

  if (now - lastUi > 200) {
    lastUi = now;
    if (game.phase === 'lobby' && room && room.countdown !== null) lobbyStatus();
    if (!$('game').hidden) {
      renderHud();
      const bl = $('break-left');
      if (bl) bl.textContent = clock(game.endsAt - now);
    }
  }
  if (!$('game').hidden) {
    updateVision();
    if (camera.follow && playing()) { camera.x = me.x; camera.z = me.z; }
    if (needsDraw) { draw(); needsDraw = false; }
  }
  requestAnimationFrame(tick);
}

// ---------------------------------------------------------------- input

const pointers = new Map();
let drag = null, pinch = null, lastRightOrder = 0, cursor = null;
const local = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  const [sx, sy] = local(e);
  pointers.set(e.pointerId, [sx, sy]);
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { dist: Math.hypot(a[0] - b[0], a[1] - b[1]), scale: camera.scale };
    drag = null;
    return;
  }
  if (e.button === 2) {
    const w = toWorld(sx, sy);
    orderMove(w.x, w.z); lastRightOrder = performance.now();
    drag = { type: 'order' };
    return;
  }
  drag = { type: 'pan', sx, sy, cx: camera.x, cz: camera.z, moved: false, touch: e.pointerType === 'touch' };
});
canvas.addEventListener('pointermove', (e) => {
  const [sx, sy] = local(e);
  cursor = toWorld(sx, sy);
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [sx, sy]);
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    camera.scale = pinch.scale * (Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.dist);
    needsDraw = true;
    return;
  }
  if (!drag) return;
  if (drag.type === 'order' && performance.now() - lastRightOrder > 120) {
    orderMove(cursor.x, cursor.z); lastRightOrder = performance.now();
  } else if (drag.type === 'pan') {
    if (Math.hypot(sx - drag.sx, sy - drag.sy) > 5) drag.moved = true;
    if (drag.moved) {
      camera.follow = false; syncButtons();
      camera.x = drag.cx - (sx - drag.sx) / camera.scale;
      camera.z = drag.cz + (sy - drag.sy) / camera.scale;
      needsDraw = true;
    }
  }
});
function endPointer(e) {
  const [sx, sy] = local(e);
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  if (drag && drag.type === 'pan' && !drag.moved && drag.touch) { const w = toWorld(sx, sy); orderMove(w.x, w.z); }
  drag = null;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const [sx, sy] = local(e);
  const before = toWorld(sx, sy);
  camera.scale *= Math.exp(-e.deltaY * 0.0015);
  clampCamera();
  if (!camera.follow || !playing()) {
    const after = toWorld(sx, sy);
    camera.x += before.x - after.x; camera.z += before.z - after.z;
  }
  needsDraw = true;
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if ($('game').hidden || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.code === 'Space') { e.preventDefault(); camera.x = me.x; camera.z = me.z; needsDraw = true; }
  else if (e.key === 'y' || e.key === 'Y') { camera.follow = !camera.follow; syncButtons(); needsDraw = true; }
  else if (e.key === 's' || e.key === 'S') { path = []; needsDraw = true; }
  else if (e.key === 'w' || e.key === 'W') placeWard(cursor);
  else if (e.key === 'e' || e.key === 'E') castSpell(cursor);
});
$('ward-btn').addEventListener('click', () => placeWard(null));
$('spell-btn').addEventListener('click', () => castSpell(cursor));
$('follow-btn').addEventListener('click', () => { camera.follow = !camera.follow; syncButtons(); needsDraw = true; });
window.addEventListener('resize', resize);

// ---------------------------------------------------------------- start

syncHome();
// A language switch redraws everything the script wrote; feed lines already shown stay as they are.
onLangChange(() => {
  labelOptions();
  syncHome();
  showChampions();
  if (room) renderLobby();
  renderBoard();
  renderOverlay();
  syncButtons();
});
document.body.classList.remove('loading');
requestAnimationFrame(tick);

// Exposed for debugging in the console.
window.hs = { grid, vision, game, me, others, get server() { return server; }, get room() { return room; } };
