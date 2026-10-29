// Champion list and art from Riot's Data Dragon CDN, fetched at runtime so
// new champions show up without a change here. Data Dragon allows
// cross-origin requests.

const CDN = 'https://ddragon.leagueoflegends.com';

let list = null;

// Resolves to [{ id, name }] sorted by name, or [] if Data Dragon is unreachable.
export function loadChampions() {
  list ||= (async () => {
    const versions = await (await fetch(`${CDN}/api/versions.json`)).json();
    const version = versions[0];
    const data = (await (await fetch(`${CDN}/cdn/${version}/data/en_US/champion.json`)).json()).data;
    return Object.values(data)
      .map((c) => ({ id: c.id, name: c.name, icon: `${CDN}/cdn/${version}/img/champion/${c.image.full}` }))
      .sort((a, b) => a.name.localeCompare(b.name));
  })().catch((e) => { console.warn('Champion list unavailable', e); return []; });
  return list;
}

// Ids are Data Dragon keys like "MonkeyKing" (Wukong) or "KSante".
export const validChampionId = (id) => typeof id === 'string' && /^[A-Za-z0-9]{1,32}$/.test(id);
export const splashUrl = (id) => `${CDN}/cdn/img/champion/splash/${id}_0.jpg`;
