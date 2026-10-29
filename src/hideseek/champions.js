// Champion list and art from Riot's Data Dragon CDN, fetched at runtime so
// new champions show up without a change here. Data Dragon allows
// cross-origin requests.

import { DDRAGON_LOCALE, DEFAULT_LANG } from '../i18n.js';

const CDN = 'https://ddragon.leagueoflegends.com';

let version = null;
const lists = new Map(); // language -> Promise of the list

// Resolves to [{ id, name, icon, tags }] sorted by name, with names in the
// given language, or [] if Data Dragon is unreachable.
export function loadChampions(lang = DEFAULT_LANG) {
  if (!lists.has(lang)) {
    lists.set(lang, (async () => {
      version ||= fetch(`${CDN}/api/versions.json`).then((r) => r.json()).then((v) => v[0]);
      const v = await version;
      const locale = DDRAGON_LOCALE[lang] || DDRAGON_LOCALE[DEFAULT_LANG];
      const data = (await (await fetch(`${CDN}/cdn/${v}/data/${locale}/champion.json`)).json()).data;
      return Object.values(data)
        .map((c) => ({ id: c.id, name: c.name, icon: `${CDN}/cdn/${v}/img/champion/${c.image.full}`, tags: c.tags || [] }))
        .sort((a, b) => a.name.localeCompare(b.name, lang));
    })().catch((e) => {
      console.warn('Champion list unavailable', e);
      version = null; lists.delete(lang); // let a later call try again
      return [];
    }));
  }
  return lists.get(lang);
}

// A name reduced for search: no case, accents, spaces or punctuation, so
// "maitre yi" finds "Maître Yi" and "ksante" finds "K'Santé".
export const searchKey = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Ids are Data Dragon keys like "MonkeyKing" (Wukong) or "KSante".
export const validChampionId = (id) => typeof id === 'string' && /^[A-Za-z0-9]{1,32}$/.test(id);
export const splashUrl = (id) => `${CDN}/cdn/img/champion/splash/${id}_0.jpg`;
