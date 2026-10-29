// French and English UI text: same keys in both, French by default, and
// every key the pages and scripts use exists.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { LANGS, DEFAULT_LANG, STRINGS, t, setLang, pickLang, num } from '../../src/i18n.js';
import { SPELLS } from '../../src/hideseek/spells.js';
import { searchKey } from '../../src/hideseek/champions.js';
import { teamSources } from '../../src/sources.js';
import { SIGHT } from '../../src/config.js';

const root = new URL('../../', import.meta.url).pathname;
const read = (p) => readFileSync(join(root, p), 'utf8');
const PAGES = ['index.html', 'pedagogic/index.html', 'hide-and-seek/index.html'];
const scripts = (dir) => readdirSync(join(root, dir), { recursive: true })
  .filter((f) => f.endsWith('.js') && !f.includes('vendor')).map((f) => join(dir, f));
const placeholders = (s) => [...new Set([...JSON.stringify(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();

test('French is the default, and anything unknown falls back to it', () => {
  assert.equal(DEFAULT_LANG, 'fr');
  assert.deepEqual(LANGS, ['fr', 'en']);
  assert.equal(pickLang(null), 'fr');
  assert.equal(pickLang('de'), 'fr');
  assert.equal(pickLang('en'), 'en');
  assert.equal(setLang('xx'), 'fr');
  assert.equal(t('hs.ready'), 'Prêt');
  setLang('en');
  assert.equal(t('hs.ready'), 'Ready');
  setLang('fr');
});

test('both languages have the same keys, plural forms and placeholders', () => {
  assert.deepEqual(Object.keys(STRINGS.fr).sort(), Object.keys(STRINGS.en).sort());
  for (const key of Object.keys(STRINGS.en)) {
    for (const l of LANGS) {
      const s = STRINGS[l][key];
      if (typeof s === 'object') assert.ok(s.one && s.other, `${l} ${key} needs one and other`);
      else assert.ok(typeof s === 'string' && s.length, `${l} ${key}`);
    }
    assert.deepEqual(placeholders(STRINGS.fr[key]), placeholders(STRINGS.en[key]), key);
  }
});

test('t fills placeholders, picks plurals per language and writes numbers the local way', () => {
  setLang('en');
  assert.equal(t('hs.joining', { code: 'AB12C' }), 'Joining room AB12C…');
  assert.equal(t('hs.hud.left', { n: 0 }), '0 hiders left');
  assert.equal(t('hs.hud.left', { n: 1 }), '1 hider left');
  assert.equal(num(1.5), '1.5');
  setLang('fr');
  assert.equal(t('hs.hud.left', { n: 0 }), '0 caché restant', 'French treats 0 as singular');
  assert.equal(t('hs.hud.left', { n: 1 }), '1 caché restant');
  assert.equal(t('hs.hud.left', { n: 3 }), '3 cachés restants');
  assert.equal(num(1.5), '1,5');
  assert.equal(num(3000), '3000', 'game units are not grouped');
  assert.equal(num(12.34, 1), '12,3');
  assert.equal(t('spell.Tank.text', SPELLS.Tank), 'Immobilise tous les ennemis autour de vous pendant 1,5 s.');
  assert.equal(t('no.such.key'), 'no.such.key');
});

test('every key the pages and scripts use exists', () => {
  const used = new Set();
  for (const page of PAGES) {
    const html = read(page);
    for (const m of html.matchAll(/data-i18n(?:-html)?="([^"]+)"/g)) used.add(m[1]);
    for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) for (const pair of m[1].split(';')) used.add(pair.split(':')[1].trim());
  }
  for (const file of scripts('src')) {
    for (const m of read(file).matchAll(/\bt\('([\w.]+)'\s*[,)]/g)) used.add(m[1]);
  }
  assert.ok(used.size > 150, `found only ${used.size} keys`);
  for (const key of used) assert.ok(key in STRINGS.en, `missing key ${key}`);
});

test('the pages are French until the script runs', () => {
  const plain = (s) => s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  for (const page of PAGES) {
    const html = read(page);
    assert.match(html, /<html lang="fr">/, page);
    assert.match(html, /data-lang-switch/, `${page} has the language switch`);
    for (const m of html.matchAll(/data-i18n="([^"]+)"[^>]*>([^<]*)</g)) {
      if (m[1] === 'ped.ruler' || m[1] === 'ped.loading') continue;
      assert.equal(plain(m[2]), plain(STRINGS.fr[m[1]]), `${page} ${m[1]}`);
    }
  }
});

test('every map terrain, data version and unit has a name in both languages', async () => {
  const { TERRAINS, PATCHES } = await import('../../src/config.js');
  for (const l of LANGS) {
    for (const [kind, values] of Object.entries(TERRAINS)) for (const v of values) assert.ok(STRINGS[l][`terrain.${kind}.${v || 'none'}`], `${l} ${kind} ${v}`);
    for (const [id] of PATCHES) assert.ok(STRINGS[l][`patch.${id}`], `${l} patch ${id}`);
    for (const k of Object.keys(SIGHT)) assert.ok(STRINGS[l][`unit.${k}`], `${l} unit ${k}`);
  }
});

test('the spell card texts fit the card in both languages', () => {
  // The card has fixed heights: two lines for the effect, three per role.
  for (const l of LANGS) {
    setLang(l);
    for (const [category, sp] of Object.entries(SPELLS)) {
      const params = { ...sp, pct: sp.speed ? Math.round((sp.speed - 1) * 100) : 0 };
      const text = (field) => t(`spell.${category}.${field}`, params);
      assert.ok(t(`cat.${category}`), `${l} ${category} class`);
      assert.ok(text('name').length <= 12, `${l} ${category} name`);
      assert.ok(text('text').length <= 62, `${l} ${category} text: ${text('text').length}`);
      for (const role of ['hider', 'seeker']) assert.ok(text(role).length <= 105, `${l} ${category} ${role}: ${text(role).length}`);
      for (const field of ['name', 'text', 'hider', 'seeker']) assert.doesNotMatch(text(field), /\{/, `${l} ${category} ${field}`);
    }
  }
  setLang('fr');
});

test('vision sources are named in the current language', () => {
  const scenario = {
    side: 'blue', me: { x: 0, z: 0 }, units: [{ kind: 'control', team: 'ally', x: 1, z: 1 }],
    turrets: [{ x: 5, z: 5, side: 'blue', lane: 'mid' }], deadTurrets: new Set(), sight: { ...SIGHT },
  };
  setLang('fr');
  assert.deepEqual(teamSources('ally', scenario).map((s) => s.name), ['Vous', 'Balise de contrôle alliée', 'Tourelle mid bleue']);
  setLang('en');
  assert.deepEqual(teamSources('ally', scenario).map((s) => s.name), ['You', 'Ally Control Ward', 'Blue mid turret']);
  setLang('fr');
});

test('champion search ignores case, accents and punctuation', () => {
  assert.equal(searchKey('Maître Yi'), 'maitreyi');
  assert.equal(searchKey("K'Santé"), 'ksante');
  assert.ok(searchKey('Nunu et Willump').includes(searchKey('nunu')));
});
