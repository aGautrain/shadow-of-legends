import { NavGrid, FLAG } from './grid.js';
import { Vision, has } from './vision.js';
import { findPath } from './path.js';
import { SIGHT, UNIT_KINDS, DEFAULT_MOVE_SPEED, DEFAULT_FOG_EDGE, BACKGROUND, TERRAINS, PATCHES } from './config.js';

const canvas = document.getElementById('map');
const ctx = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);

// The patch is read before anything else, since it decides which grid to load.
function hashPatch() {
  try { return JSON.parse(decodeURIComponent(location.hash.slice(1))).p; } catch { return undefined; }
}
const patch = PATCHES.find(([id]) => id === hashPatch()) || PATCHES[0];
const res = await fetch(patch[2]);
const grid = new NavGrid(await res.json());
const vision = new Vision(grid);
const turrets = grid.findTurrets();
const MAP = grid.w * grid.cell;

const bg = new Image();
bg.src = BACKGROUND.src;
bg.onload = () => { needsDraw = true; };

// ---------------------------------------------------------------- state

let nextId = 1;
const state = {
  side: 'blue',
  speed: DEFAULT_MOVE_SPEED,
  me: { x: 4500, z: 4800 },
  units: [],
  deadTurrets: new Set(),
  dragon: '',
  baron: '',
  atakhan: '',
  view: { enemy: true, fog: true, rings: true, grid: false },
  sight: { ...SIGHT },
  fogEdge: DEFAULT_FOG_EDGE,
};
let path = [];
let tool = 'select';
let ruler = null; // { a, b } in world units while measuring
const camera = { x: 7400, z: 7400, scale: 0.12, follow: false };
const exposure = { walked: 0, seen: 0 };
let needsDraw = true;
let visionDirty = true;
let allyBits = null, enemyBits = null;
let lastMyCell = -1;

const enemySide = () => (state.side === 'blue' ? 'red' : 'blue');
const sideOf = (team) => (team === 'ally' ? state.side : enemySide());

function addUnit(kind, team, x, z) {
  const p = grid.nearestWalkable(x, z, sideOf(team));
  if (!p) return null;
  const u = { id: nextId++, kind, team, x: p.x, z: p.z };
  state.units.push(u);
  return u;
}

function defaultScenario() {
  state.units = [];
  addUnit('champion', 'enemy', 8700, 8300);
  addUnit('stealth', 'enemy', 10174, 6008);
  addUnit('control', 'enemy', 6274, 8358);
  const p = grid.nearestWalkable(4500, 4800, state.side);
  state.me = { x: p.x, z: p.z };
}

// ---------------------------------------------------------------- URL state

function saveHash() {
  const s = {
    s: state.side, v: state.speed, d: state.dragon, b: state.baron, a: state.atakhan,
    m: [Math.round(state.me.x), Math.round(state.me.z)],
    u: state.units.map((u) => [u.kind, u.team, Math.round(u.x), Math.round(u.z)]),
    t: [...state.deadTurrets],
    o: Object.entries(state.view).filter(([, on]) => on).map(([k]) => k),
    p: patch[0],
    e: state.fogEdge,
    r: Object.keys(SIGHT).some((k) => state.sight[k] !== SIGHT[k]) ? state.sight : undefined,
  };
  history.replaceState(null, '', '#' + encodeURIComponent(JSON.stringify(s)));
}
let saveTimer = 0;
const scheduleSave = () => { clearTimeout(saveTimer); saveTimer = setTimeout(saveHash, 300); };

function loadHash() {
  if (location.hash.length < 2) return false;
  try {
    const s = JSON.parse(decodeURIComponent(location.hash.slice(1)));
    state.side = s.s === 'red' ? 'red' : 'blue';
    state.speed = Number(s.v) || DEFAULT_MOVE_SPEED;
    state.dragon = TERRAINS.dragon.some(([k]) => k === s.d) ? s.d : '';
    state.baron = TERRAINS.baron.some(([k]) => k === s.b) ? s.b : '';
    state.atakhan = TERRAINS.atakhan.some(([k]) => k === s.a) && grid.overlays[s.a] ? s.a : '';
    state.me = { x: s.m[0], z: s.m[1] };
    state.units = (s.u || []).filter(([k]) => UNIT_KINDS[k])
      .map(([kind, team, x, z]) => ({ id: nextId++, kind, team: team === 'ally' ? 'ally' : 'enemy', x, z }));
    state.deadTurrets = new Set(s.t || []);
    if (Number(s.e) >= 0) state.fogEdge = Number(s.e);
    for (const k of Object.keys(SIGHT)) if (s.r && Number(s.r[k]) > 0) state.sight[k] = Number(s.r[k]);
    if (Array.isArray(s.o)) for (const k of Object.keys(state.view)) state.view[k] = s.o.includes(k);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- vision

function sources(team) {
  const list = [];
  if (team === 'ally') list.push({ name: 'You', x: state.me.x, z: state.me.z, sight: state.sight.champion });
  state.units.forEach((u) => {
    if (u.team === team) list.push({ name: (team === 'ally' ? 'Ally ' : 'Enemy ') + UNIT_KINDS[u.kind].label, x: u.x, z: u.z, sight: state.sight[u.kind], unit: u });
  });
  const side = sideOf(team);
  turrets.forEach((t, i) => {
    if (t.side === side && !state.deadTurrets.has(i)) list.push({ name: `${t.side === 'blue' ? 'Blue' : 'Red'} ${t.lane} turret`, x: t.x, z: t.z, sight: state.sight.turret, turret: i });
  });
  return list;
}

function updateVision() {
  const myCell = grid.index(state.me.x, state.me.z);
  if (!visionDirty && myCell === lastMyCell) return;
  lastMyCell = myCell;
  allyBits = vision.merge(sources('ally').map((s) => vision.source(s.x, s.z, s.sight)));
  if (visionDirty) enemyBits = vision.merge(sources('enemy').map((s) => vision.source(s.x, s.z, s.sight)));
  visionDirty = false;
  paintFog();
  updateStatus();
  needsDraw = true;
}

function seenBy() {
  const i = grid.index(state.me.x, state.me.z);
  if (!has(enemyBits, i)) return [];
  return sources('enemy').filter((s) => has(vision.source(s.x, s.z, s.sight), i)).map((s) => s.name);
}

// ---------------------------------------------------------------- layers

const fogCanvas = document.createElement('canvas');
fogCanvas.width = grid.w; fogCanvas.height = grid.h;
const fogCtx = fogCanvas.getContext('2d');
const gridCanvas = document.createElement('canvas');
gridCanvas.width = grid.w; gridCanvas.height = grid.h;
const gridCtx = gridCanvas.getContext('2d');

// Fog layer colors (premultiplied RGBA) for: enemy sees, my fog, both.
const FOG_COLORS = {
  enemy: [235, 40, 50, 105],
  fog: [0, 0, 0, 150],
  both: [150, 10, 20, 175],
};
const premul = (c) => [(c[0] * c[3]) / 255, (c[1] * c[3]) / 255, (c[2] * c[3]) / 255, c[3]];
const FOG_PM = { enemy: premul(FOG_COLORS.enemy), fog: premul(FOG_COLORS.fog), both: premul(FOG_COLORS.both) };

// Separable Gaussian blur of a w*h scalar field, sigma in cells.
function blur(field, w, h, sigma) {
  const r = Math.ceil(sigma * 3);
  const k = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) sum += k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma));
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(w * h);
  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let i = -r; i <= r; i++) v += k[i + r] * field[z * w + Math.min(w - 1, Math.max(0, x + i))];
      tmp[z * w + x] = v;
    }
  }
  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let i = -r; i <= r; i++) v += k[i + r] * tmp[Math.min(h - 1, Math.max(0, z + i)) * w + x];
      field[z * w + x] = v;
    }
  }
}

function paintFog() {
  const { w, h } = grid;
  const e = new Float32Array(w * h), f = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    e[i] = state.view.enemy && has(enemyBits, i) ? 1 : 0;
    f[i] = state.view.fog && !has(allyBits, i) ? 1 : 0;
  }
  // The game fades fog over a band; a Gaussian goes from 5% to 95% over about 3.3 sigma.
  const sigma = state.fogEdge / grid.cell / 3.3;
  if (sigma > 0.05) { blur(e, w, h, sigma); blur(f, w, h, sigma); }

  const img = fogCtx.createImageData(w, h);
  const d = img.data;
  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      const i = z * w + x;
      const o = ((h - 1 - z) * w + x) * 4;
      const we = e[i] * (1 - f[i]), wf = f[i] * (1 - e[i]), wb = e[i] * f[i];
      const a = we * FOG_PM.enemy[3] + wf * FOG_PM.fog[3] + wb * FOG_PM.both[3];
      if (a < 0.5) continue;
      for (let c = 0; c < 3; c++) d[o + c] = ((we * FOG_PM.enemy[c] + wf * FOG_PM.fog[c] + wb * FOG_PM.both[c]) * 255) / a;
      d[o + 3] = a;
    }
  }
  fogCtx.putImageData(img, 0, 0);
}

function paintGrid() {
  const img = gridCtx.createImageData(grid.w, grid.h);
  const d = img.data;
  for (let z = 0; z < grid.h; z++) {
    for (let x = 0; x < grid.w; x++) {
      const f = grid.flags[z * grid.w + x];
      const o = ((grid.h - 1 - z) * grid.w + x) * 4;
      let c = null;
      if (f & (FLAG.BLUE_ONLY)) c = [60, 90, 255, 200];
      else if (f & FLAG.RED_ONLY) c = [255, 70, 70, 200];
      else if (grid.solid[z * grid.w + x]) c = [30, 30, 30, 150];
      else if (f & FLAG.WALL) c = [0, 210, 214, 150];
      else if (f & FLAG.BRUSH) c = [40, 220, 60, 150];
      if (c) { d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = c[3]; }
    }
  }
  gridCtx.putImageData(img, 0, 0);
}

// ---------------------------------------------------------------- camera

const view = { w: 0, h: 0, dpr: 1 };
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
function fitMap() {
  camera.scale = Math.min(view.w, view.h) / (MAP * 1.02);
  camera.x = MAP / 2; camera.z = MAP / 2;
}

// ---------------------------------------------------------------- draw

const COLORS = { ally: '#4aa8ff', enemy: '#ff4d5a', me: '#ffd34d' };
const WARD_COLORS = { stealth: '#ffd84a', control: '#ff5fd2', farsight: '#5fb8ff' };

function draw() {
  clampCamera();
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.fillStyle = '#0b0f14';
  ctx.fillRect(0, 0, view.w, view.h);

  const [gx, gy] = toScreen(grid.minX, grid.minZ + grid.h * grid.cell);
  const gw = grid.w * grid.cell * camera.scale, gh = grid.h * grid.cell * camera.scale;

  if (bg.complete && bg.naturalWidth) {
    const [bx, by] = toScreen(BACKGROUND.minX, BACKGROUND.minZ + BACKGROUND.size);
    const bs = BACKGROUND.size * camera.scale;
    ctx.drawImage(bg, bx, by, bs, bs);
  }
  ctx.imageSmoothingEnabled = false;
  if (state.view.grid) ctx.drawImage(gridCanvas, gx, gy, gw, gh);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(fogCanvas, gx, gy, gw, gh);

  const enemyVisible = (u) => !state.view.fog || has(allyBits, grid.index(u.x, u.z));

  // sight rings of enemy sources
  if (state.view.rings) {
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(255,90,100,0.75)';
    for (const s of sources('enemy')) {
      const [x, y] = toScreen(s.x, s.z);
      ctx.beginPath(); ctx.arc(x, y, s.sight * camera.scale, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  // turrets
  turrets.forEach((t, i) => {
    const [x, y] = toScreen(t.x, t.z);
    const r = Math.max(5, 90 * camera.scale);
    const dead = state.deadTurrets.has(i);
    const mine = t.side === state.side;
    ctx.fillStyle = dead ? 'rgba(80,80,80,0.6)' : mine ? 'rgba(74,168,255,0.45)' : 'rgba(255,77,90,0.45)';
    ctx.strokeStyle = dead ? '#999' : mine ? COLORS.ally : COLORS.enemy; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.rect(x - r, y - r, 2 * r, 2 * r); ctx.fill(); ctx.stroke();
    if (dead) {
      ctx.strokeStyle = '#ddd'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r); ctx.stroke();
    }
  });

  // path
  if (path.length) {
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(...toScreen(state.me.x, state.me.z));
    for (const p of path) ctx.lineTo(...toScreen(p.x, p.z));
    ctx.stroke(); ctx.setLineDash([]);
    const end = toScreen(path[path.length - 1].x, path[path.length - 1].z);
    ctx.fillStyle = '#7dff9b';
    ctx.beginPath(); ctx.arc(end[0], end[1], 4, 0, Math.PI * 2); ctx.fill();
  }

  // units
  for (const u of state.units) {
    const [x, y] = toScreen(u.x, u.z);
    ctx.globalAlpha = u.team === 'enemy' && !enemyVisible(u) ? 0.4 : 1;
    if (u.kind === 'champion') {
      const r = Math.max(7, 65 * camera.scale);
      ctx.fillStyle = COLORS[u.team]; ctx.strokeStyle = '#0b0f14'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else {
      const r = Math.max(5, 40 * camera.scale);
      ctx.fillStyle = WARD_COLORS[u.kind]; ctx.strokeStyle = COLORS[u.team]; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(x, y - r * 1.3); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r * 1.3); ctx.lineTo(x - r, y); ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
    if (u === hover) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, Math.max(11, 90 * camera.scale), 0, Math.PI * 2); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // you
  const [mx, my] = toScreen(state.me.x, state.me.z);
  const mr = Math.max(8, 65 * camera.scale);
  const seen = has(enemyBits, grid.index(state.me.x, state.me.z));
  if (seen) {
    ctx.strokeStyle = 'rgba(255,60,70,0.9)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(mx, my, mr + 6, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.fillStyle = COLORS.me; ctx.strokeStyle = state.side === 'blue' ? '#1d5fd1' : '#c4252f'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  if (ruler) drawRuler();
}

function drawRuler() {
  const [ax, ay] = toScreen(ruler.a.x, ruler.a.z);
  const [bx, by] = toScreen(ruler.b.x, ruler.b.z);
  const dist = Math.hypot(ruler.b.x - ruler.a.x, ruler.b.z - ruler.a.z);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
  ctx.beginPath(); ctx.arc(ax, ay, dist * camera.scale, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  ctx.fillStyle = '#ffffff';
  for (const [x, y] of [[ax, ay], [bx, by]]) { ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill(); }
  const label = `${Math.round(dist)} units`;
  ctx.font = '600 13px system-ui, sans-serif';
  const tw = ctx.measureText(label).width;
  const lx = bx + 12, ly = by - 12;
  ctx.fillStyle = 'rgba(11,15,20,0.85)';
  ctx.fillRect(lx - 6, ly - 15, tw + 12, 22);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(label, lx, ly);
}

// ---------------------------------------------------------------- status

function fmt(s) { return s.toFixed(1) + ' s'; }
function updateStatus() {
  const who = seenBy();
  const el = $('status');
  if (who.length) {
    el.className = 'status seen';
    el.innerHTML = `<strong>Seen</strong> by ${who.join(', ')}`;
  } else {
    el.className = 'status hidden';
    el.innerHTML = '<strong>Hidden</strong> from the enemy team';
  }
}
function updateExposure() {
  const pct = exposure.walked > 0 ? Math.round((100 * exposure.seen) / exposure.walked) : 0;
  $('exposure').textContent = `Seen ${fmt(exposure.seen)} of ${fmt(exposure.walked)} walked (${pct}%)`;
}

// ---------------------------------------------------------------- movement

function orderMove(x, z) {
  const target = grid.nearestWalkable(x, z, state.side);
  if (!target) return;
  const p = findPath(grid, state.side, state.me, target);
  if (p) { path = p; needsDraw = true; }
}

let last = performance.now();
function tick(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (path.length) {
    let budget = state.speed * dt;
    while (budget > 0 && path.length) {
      const p = path[0];
      const d = Math.hypot(p.x - state.me.x, p.z - state.me.z);
      if (d <= budget) { state.me = { x: p.x, z: p.z }; path.shift(); budget -= d; }
      else { state.me = { x: state.me.x + ((p.x - state.me.x) * budget) / d, z: state.me.z + ((p.z - state.me.z) * budget) / d }; budget = 0; }
    }
    exposure.walked += dt;
    if (has(enemyBits, grid.index(state.me.x, state.me.z))) exposure.seen += dt;
    updateExposure();
    if (!path.length) scheduleSave();
    needsDraw = true;
  }
  updateVision();
  if (camera.follow) { camera.x = state.me.x; camera.z = state.me.z; }
  if (needsDraw) { draw(); needsDraw = false; }
  requestAnimationFrame(tick);
}

// ---------------------------------------------------------------- input

let hover = null;
const pointers = new Map();
let drag = null; // { type: 'pan' | 'unit' | 'tap', ... }
let pinch = null;
let lastRightOrder = 0;

function hitUnit(sx, sy) {
  let best = null, bestD = 16;
  for (const u of state.units) {
    const [x, y] = toScreen(u.x, u.z);
    const d = Math.hypot(x - sx, y - sy);
    if (d < bestD) { bestD = d; best = u; }
  }
  return best;
}
function hitTurret(sx, sy) {
  let best = -1, bestD = Math.max(12, 110 * camera.scale);
  turrets.forEach((t, i) => {
    const [x, y] = toScreen(t.x, t.z);
    const d = Math.hypot(x - sx, y - sy);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}
const local = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

function sourcesChanged() { visionDirty = true; needsDraw = true; scheduleSave(); }

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
  const w = toWorld(sx, sy);
  if (e.button === 2) {
    orderMove(w.x, w.z); lastRightOrder = performance.now();
    drag = { type: 'order' };
    return;
  }
  if (e.button === 1) { drag = { type: 'pan', sx, sy, cx: camera.x, cz: camera.z, moved: true }; return; }

  if (tool === 'select') {
    const u = hitUnit(sx, sy);
    if (u) { drag = { type: 'unit', unit: u }; return; }
    drag = { type: 'pan', sx, sy, cx: camera.x, cz: camera.z, moved: false, touch: e.pointerType === 'touch' };
  } else if (tool === 'ruler') {
    // Shift starts the measurement from your champion.
    const a = e.shiftKey ? { x: state.me.x, z: state.me.z } : w;
    ruler = { a, b: w };
    drag = { type: 'ruler' };
    updateRulerLabel();
    needsDraw = true;
  } else if (tool === 'erase') {
    const u = hitUnit(sx, sy);
    if (u) { state.units = state.units.filter((v) => v !== u); hover = null; sourcesChanged(); }
  } else {
    const [team, kind] = tool.split(':');
    addUnit(kind, team, w.x, w.z);
    sourcesChanged();
  }
});

canvas.addEventListener('pointermove', (e) => {
  const [sx, sy] = local(e);
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [sx, sy]);
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    camera.scale = pinch.scale * (Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.dist);
    needsDraw = true;
    return;
  }
  if (!drag) {
    const h = tool === 'select' || tool === 'erase' ? hitUnit(sx, sy) : null;
    if (h !== hover) { hover = h; needsDraw = true; }
    canvas.style.cursor = h ? 'grab' : tool === 'select' ? 'default' : 'crosshair';
    return;
  }
  if (drag.type === 'order' && performance.now() - lastRightOrder > 120) {
    const w = toWorld(sx, sy);
    orderMove(w.x, w.z); lastRightOrder = performance.now();
  } else if (drag.type === 'pan') {
    if (Math.hypot(sx - drag.sx, sy - drag.sy) > 5) drag.moved = true;
    if (drag.moved) {
      camera.follow = false; syncFollow();
      camera.x = drag.cx - (sx - drag.sx) / camera.scale;
      camera.z = drag.cz + (sy - drag.sy) / camera.scale;
      needsDraw = true;
    }
  } else if (drag.type === 'ruler') {
    ruler.b = toWorld(sx, sy);
    updateRulerLabel();
    needsDraw = true;
  } else if (drag.type === 'unit') {
    const w = toWorld(sx, sy);
    const p = grid.nearestWalkable(w.x, w.z, sideOf(drag.unit.team));
    if (p) { drag.unit.x = p.x; drag.unit.z = p.z; sourcesChanged(); }
  }
});

function endPointer(e) {
  const [sx, sy] = local(e);
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  if (drag && drag.type === 'pan' && !drag.moved) {
    const t = hitTurret(sx, sy);
    if (t >= 0) {
      state.deadTurrets.has(t) ? state.deadTurrets.delete(t) : state.deadTurrets.add(t);
      sourcesChanged();
    } else if (drag.touch) {
      const w = toWorld(sx, sy);
      orderMove(w.x, w.z);
    }
  }
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
  if (!camera.follow) {
    const after = toWorld(sx, sy);
    camera.x += before.x - after.x; camera.z += before.z - after.z;
  }
  needsDraw = true;
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.code === 'Space') { e.preventDefault(); camera.x = state.me.x; camera.z = state.me.z; needsDraw = true; }
  else if (e.key === 'y' || e.key === 'Y') { camera.follow = !camera.follow; syncFollow(); needsDraw = true; }
  else if (e.key === 's' || e.key === 'S') { path = []; needsDraw = true; scheduleSave(); }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && hover) {
    state.units = state.units.filter((v) => v !== hover); hover = null; sourcesChanged();
  } else if (e.key === 'r' || e.key === 'R') setTool(tool === 'ruler' ? 'select' : 'ruler');
  else if (e.key === 'Escape') setTool('select');
});

// ---------------------------------------------------------------- panel

function setTool(t) {
  tool = t;
  document.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === t));
  canvas.style.cursor = t === 'select' ? 'default' : 'crosshair';
  $('ruler').classList.toggle('active', t === 'ruler');
  if (t !== 'ruler') { ruler = null; updateRulerLabel(); needsDraw = true; }
}
function updateRulerLabel() {
  $('ruler').textContent = ruler ? `📏 ${Math.round(Math.hypot(ruler.b.x - ruler.a.x, ruler.b.z - ruler.a.z))}` : '📏 Ruler';
}
$('ruler').addEventListener('click', () => setTool(tool === 'ruler' ? 'select' : 'ruler'));
document.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));

function syncFollow() { $('follow').checked = camera.follow; }
$('follow').addEventListener('change', (e) => { camera.follow = e.target.checked; needsDraw = true; });

for (const key of Object.keys(state.view)) {
  const box = $('view-' + key);
  box.addEventListener('change', () => {
    state.view[key] = box.checked;
    if (key === 'grid') paintGrid();
    paintFog(); needsDraw = true; scheduleSave();
  });
}

for (const [kind, sel] of [['dragon', $('dragon')], ['baron', $('baron')], ['atakhan', $('atakhan')]]) {
  for (const [value, label] of TERRAINS[kind]) sel.add(new Option(label, value));
  sel.addEventListener('change', () => { state[kind] = sel.value; applyTerrain(); });
}

function terrainLayers() { return [state.dragon, state.baron, state.atakhan].filter(Boolean); }

function applyTerrain() {
  grid.setTerrain(terrainLayers());
  vision.reset();
  paintGrid();
  path = [];
  sourcesChanged();
}

$('side').addEventListener('change', (e) => {
  state.side = e.target.value;
  const p = grid.nearestWalkable(state.me.x, state.me.z, state.side);
  if (p) state.me = p;
  path = [];
  sourcesChanged();
});

$('speed').addEventListener('input', (e) => {
  const v = Number(e.target.value);
  if (v > 0) { state.speed = v; scheduleSave(); }
});
document.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => {
  state.speed = Number(b.dataset.speed);
  $('speed').value = state.speed;
  scheduleSave();
}));

// Sight radius tuning. Inputs are built from SIGHT so new kinds show up automatically.
const SIGHT_LABELS = { champion: 'Champion', stealth: 'Stealth Ward', control: 'Control Ward', farsight: 'Farsight Ward', turret: 'Turret' };
for (const k of Object.keys(SIGHT)) {
  const label = document.createElement('label');
  label.className = 'row';
  label.textContent = SIGHT_LABELS[k] || k;
  const input = document.createElement('input');
  input.type = 'number'; input.min = 100; input.max = 3000; input.step = 25; input.id = 'sight-' + k;
  input.addEventListener('input', () => {
    const v = Math.round(Number(input.value));
    if (v >= 100 && v <= 3000) { state.sight[k] = v; sourcesChanged(); }
  });
  label.append(input);
  $('sight-inputs').append(label);
}
$('fog-edge').addEventListener('input', (e) => {
  const v = Math.round(Number(e.target.value));
  if (v >= 0 && v <= 1000) { state.fogEdge = v; paintFog(); needsDraw = true; scheduleSave(); }
});
$('sight-reset').addEventListener('click', () => {
  state.sight = { ...SIGHT };
  state.fogEdge = DEFAULT_FOG_EDGE;
  syncPanel();
  sourcesChanged();
});

$('reset-exposure').addEventListener('click', () => { exposure.walked = 0; exposure.seen = 0; updateExposure(); });
$('clear').addEventListener('click', () => { state.units = []; state.deadTurrets.clear(); sourcesChanged(); });
$('default').addEventListener('click', () => { defaultScenario(); path = []; sourcesChanged(); });
$('share').addEventListener('click', async () => {
  saveHash();
  try { await navigator.clipboard.writeText(location.href); $('share').textContent = 'Link copied'; }
  catch { $('share').textContent = 'Copy the address bar'; }
  setTimeout(() => { $('share').textContent = 'Copy share link'; }, 1800);
});
$('toggle-panel').addEventListener('click', () => document.body.classList.toggle('panel-hidden'));

for (const [id, label] of PATCHES) $('patch').add(new Option(label, id));
$('patch').value = patch[0];
$('patch').addEventListener('change', (e) => {
  // Switching grids reloads the page with the same scenario.
  saveHash();
  const s = JSON.parse(decodeURIComponent(location.hash.slice(1)));
  s.p = e.target.value;
  location.hash = encodeURIComponent(JSON.stringify(s));
  location.reload();
});
// Older grids may lack some overlays (Atakhan was added after 2024).
for (const kind of Object.keys(TERRAINS)) {
  for (const opt of $(kind).options) opt.disabled = opt.value !== '' && !grid.overlays[opt.value];
}

function syncPanel() {
  $('side').value = state.side;
  $('speed').value = state.speed;
  $('dragon').value = state.dragon;
  $('baron').value = state.baron;
  $('atakhan').value = state.atakhan;
  for (const key of Object.keys(state.view)) $('view-' + key).checked = state.view[key];
  for (const k of Object.keys(SIGHT)) $('sight-' + k).value = state.sight[k];
  $('fog-edge').value = state.fogEdge;
  syncFollow();
}

// ---------------------------------------------------------------- start

if (!loadHash()) defaultScenario();
const layers = terrainLayers();
if (layers.length) grid.setTerrain(layers);
syncPanel();
paintGrid();
window.addEventListener('resize', resize);
resize();
fitMap();
camera.scale *= 2.2; camera.x = state.me.x; camera.z = state.me.z;
updateExposure();
scheduleSave();
document.body.classList.remove('loading');
requestAnimationFrame(tick);

// Exposed for debugging in the console.
window.sim = { grid, vision, state, turrets, camera, redraw: () => { needsDraw = true; } };
