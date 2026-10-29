// Vision sources of the Pedagogic sim, kept free of the DOM so they can be tested.

import { has } from './vision.js';
import { t } from './i18n.js';

// Sources of one team ('ally' or 'enemy'): you (ally only), the team's
// placed champions and wards, and the standing turrets of its side. Names are
// in the current language.
export function teamSources(team, { side, me, units, turrets, deadTurrets, sight }) {
  const list = [];
  if (team === 'ally') list.push({ name: t('src.you'), x: me.x, z: me.z, sight: sight.champion });
  units.forEach((u) => {
    if (u.team === team) list.push({ name: t(`src.${team}.${u.kind}`), x: u.x, z: u.z, sight: sight[u.kind], unit: u });
  });
  const teamSide = team === 'ally' ? side : side === 'blue' ? 'red' : 'blue';
  turrets.forEach((tu, i) => {
    if (tu.side === teamSide && !deadTurrets.has(i)) list.push({ name: t('src.turret', { side: t(`src.turret.${tu.side}`), lane: tu.lane }), x: tu.x, z: tu.z, sight: sight.turret, turret: i });
  });
  return list;
}

// Names of the sources that see the cell under (x, z).
export function whoSees(grid, vision, list, x, z) {
  const i = grid.index(x, z);
  return list.filter((s) => has(vision.source(s.x, s.z, s.sight), i)).map((s) => s.name);
}
