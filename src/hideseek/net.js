// Transports for a hide and seek room. The host's browser is the server and
// every other player keeps one connection to it (a star, not a mesh).
//
// - 'peer' (default): WebRTC data channels through PeerJS. The free PeerJS
//   cloud server only brokers the handshake; game traffic then goes browser
//   to browser (or through PeerJS's free TURN relay behind strict NATs).
//   `?peer=host:port` points at a self-hosted PeerServer instead.
// - 'local' (`?net=local`): BroadcastChannel between tabs of one browser,
//   for testing without a network.
//
// Both expose the same API:
//   openHost(code, { onJoin(id), onMessage(id, msg), onLeave(id) })
//     -> { send(id, msg), close() }
//   openClient(code, { onMessage(msg), onClose() })
//     -> { send(msg), close() }

import { t } from '../i18n.js';

const PREFIX = 'sol-hs-';
const params = new URLSearchParams(location.search);
const kind = params.get('net') === 'local' ? 'local' : 'peer';

// Room codes avoid letters that read alike (I/1, O/0).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}
export const cleanCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);

export const openHost = (code, h) => (kind === 'local' ? localHost(code, h) : peerHost(code, h));
export const openClient = (code, h) => (kind === 'local' ? localClient(code, h) : peerClient(code, h));

// ---------------------------------------------------------------- PeerJS

let peerLib = null;
function loadPeer() {
  peerLib ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = new URL('../vendor/peerjs.min.js', import.meta.url).href;
    s.onload = () => resolve(window.Peer);
    s.onerror = () => reject(new Error(t('net.lib')));
    document.head.append(s);
  });
  return peerLib;
}

function peerOptions() {
  const custom = params.get('peer');
  if (!custom) return { debug: 1 };
  const [host, port] = custom.split(':');
  const local = host === 'localhost' || host === '127.0.0.1';
  return { host, port: Number(port) || (local ? 9000 : 443), path: '/', secure: !local, debug: 1 };
}

function withTimeout(promise, ms, message) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))]);
}

function peerError(e) {
  if (e && e.type === 'unavailable-id') return new Error(t('net.taken'));
  if (e && e.type === 'peer-unavailable') return new Error(t('net.notFound'));
  if (e && (e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error')) return new Error(t('net.server'));
  if (e && e.type === 'browser-incompatible') return new Error(t('net.webrtc'));
  return e instanceof Error ? e : new Error(String(e && e.type || e));
}

async function peerHost(code, h) {
  const Peer = await loadPeer();
  const peer = new Peer(PREFIX + code, peerOptions());
  await withTimeout(new Promise((resolve, reject) => {
    peer.once('open', resolve);
    peer.once('error', (e) => reject(peerError(e)));
  }), 15000, t('net.server')).catch((e) => { peer.destroy(); throw e; });

  const conns = new Map();
  // Losing the signaling server does not drop open data channels; reconnect
  // so new players can still join.
  peer.on('disconnected', () => { if (!peer.destroyed) setTimeout(() => peer.reconnect(), 1000); });
  peer.on('error', (e) => console.warn('PeerJS', e.type || e));
  peer.on('connection', (conn) => {
    const drop = () => { if (conns.get(conn.peer) === conn) { conns.delete(conn.peer); h.onLeave(conn.peer); } };
    conn.on('open', () => { conns.set(conn.peer, conn); h.onJoin(conn.peer); });
    conn.on('data', (d) => h.onMessage(conn.peer, d));
    conn.on('close', drop);
    conn.on('error', drop);
  });
  window.addEventListener('pagehide', () => peer.destroy());
  return {
    send(id, msg) { const c = conns.get(id); if (c && c.open) c.send(msg); },
    close() { peer.destroy(); },
  };
}

async function peerClient(code, h) {
  const Peer = await loadPeer();
  const peer = new Peer(peerOptions());
  const conn = await withTimeout(new Promise((resolve, reject) => {
    peer.once('error', (e) => reject(peerError(e)));
    peer.once('open', () => {
      const c = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
      c.once('open', () => resolve(c));
      c.once('error', (e) => reject(peerError(e)));
    });
  }), 20000, t('net.connect')).catch((e) => { peer.destroy(); throw e; });

  let closed = false;
  const end = () => { if (!closed) { closed = true; h.onClose(); } };
  conn.on('data', (d) => h.onMessage(d));
  conn.on('close', end);
  conn.on('error', end);
  peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
  window.addEventListener('pagehide', () => peer.destroy());
  return {
    send(msg) { if (conn.open) conn.send(msg); },
    close() { closed = true; peer.destroy(); },
  };
}

// ---------------------------------------------------------------- BroadcastChannel

async function localHost(code, h) {
  const ch = new BroadcastChannel(PREFIX + code);
  // Is someone already hosting this code?
  const taken = await new Promise((resolve) => {
    const timer = setTimeout(() => { ch.onmessage = null; resolve(false); }, 300);
    ch.onmessage = (e) => { if (e.data.k === 'here') { clearTimeout(timer); resolve(true); } };
    ch.postMessage({ k: 'probe' });
  });
  if (taken) { ch.close(); throw new Error(t('net.taken')); }

  const peers = new Set();
  ch.onmessage = ({ data: m }) => {
    if (m.k === 'probe') ch.postMessage({ k: 'here' });
    else if (m.k === 'hello') { peers.add(m.from); ch.postMessage({ k: 'open', to: m.from }); h.onJoin(m.from); }
    else if (m.k === 'data' && m.to === 'host' && peers.has(m.from)) h.onMessage(m.from, m.d);
    else if (m.k === 'bye' && peers.delete(m.from)) h.onLeave(m.from);
  };
  window.addEventListener('pagehide', () => ch.postMessage({ k: 'end' }));
  return {
    send(id, msg) { if (peers.has(id)) ch.postMessage({ k: 'data', to: id, d: msg }); },
    close() { ch.postMessage({ k: 'end' }); ch.close(); },
  };
}

async function localClient(code, h) {
  const ch = new BroadcastChannel(PREFIX + code);
  const id = 'p' + Math.random().toString(36).slice(2, 10);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ch.close(); reject(new Error(t('net.notFound'))); }, 1500);
    ch.onmessage = ({ data: m }) => { if (m.k === 'open' && m.to === id) { clearTimeout(timer); resolve(); } };
    ch.postMessage({ k: 'hello', from: id });
  });
  let closed = false;
  ch.onmessage = ({ data: m }) => {
    if (m.k === 'data' && m.to === id) h.onMessage(m.d);
    else if (m.k === 'end' && !closed) { closed = true; h.onClose(); }
  };
  window.addEventListener('pagehide', () => ch.postMessage({ k: 'bye', from: id }));
  return {
    send(msg) { ch.postMessage({ k: 'data', from: id, to: 'host', d: msg }); },
    close() { closed = true; ch.postMessage({ k: 'bye', from: id }); ch.close(); },
  };
}
