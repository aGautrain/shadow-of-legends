// Applies src/i18n.js to the page and adds the FR / EN switch. Imported first
// by every page, so the text is in the right language before anything else runs.
//
// Markup: data-i18n="key" sets the text, data-i18n-html="key" the HTML,
// data-i18n-attr="title:key;placeholder:key2" attributes. An empty element
// with data-lang-switch gets the switch.

import { LANGS, LANG_NAMES, lang, setLang, pickLang, t } from './i18n.js';

const KEY = 'sol-lang';
const listeners = [];

function saved() { try { return localStorage.getItem(KEY); } catch { return null; } }
function save(l) { try { localStorage.setItem(KEY, l); } catch { /* private mode */ } }

// Called after the page text is switched, to redraw what scripts wrote.
export function onLangChange(fn) { listeners.push(fn); }

export function translatePage(root = document) {
  document.documentElement.lang = lang();
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
  for (const el of root.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of el.dataset.i18nAttr.split(';')) {
      const [attr, key] = pair.split(':').map((s) => s.trim());
      el.setAttribute(attr, t(key));
    }
  }
  for (const el of root.querySelectorAll('[data-lang-switch]')) {
    el.setAttribute('aria-label', t('lang.switch'));
    for (const b of el.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.lang === lang()));
  }
}

export function changeLang(l) {
  if (pickLang(l) === lang()) return;
  setLang(l);
  save(lang());
  translatePage();
  for (const fn of listeners) fn(lang());
}

for (const el of document.querySelectorAll('[data-lang-switch]')) {
  el.setAttribute('role', 'group');
  el.innerHTML = LANGS.map((l) => `<button type="button" data-lang="${l}" lang="${l}" title="${LANG_NAMES[l]}">${l.toUpperCase()}</button>`).join('');
  el.addEventListener('click', (e) => { const b = e.target.closest('[data-lang]'); if (b) changeLang(b.dataset.lang); });
}
setLang(saved());
translatePage();
