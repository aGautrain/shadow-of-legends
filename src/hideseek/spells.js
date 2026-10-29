// Fantasy: each champion gets the active spell of its category, its first
// Data Dragon tag. Distances are in game units, times in seconds. Names and
// texts are in src/i18n.js under spell.<category>.

export const SPELLS = {
  Mage: { cooldown: 30, range: 450 },
  Assassin: { cooldown: 45, duration: 3 },
  Fighter: { cooldown: 25, duration: 3, speed: 1.4 },
  Tank: { cooldown: 40, radius: 1000, root: 1.5 },
  Marksman: { cooldown: 45, range: 3000, radius: 500, duration: 4 },
  Support: { cooldown: 40, radius: 900 },
};

// The numbers shown on a spell's card, as [label, value]. Labels are keys of
// stat.<label> in src/i18n.js; fmt writes the numbers.
export function spellStats(sp, fmt = String) {
  const out = [['Cooldown', `${fmt(sp.cooldown)} s`]];
  if (sp.range) out.push(['Range', fmt(sp.range)]);
  if (sp.radius) out.push(['Radius', fmt(sp.radius)]);
  if (sp.speed) out.push(['Speed', `+${fmt(Math.round((sp.speed - 1) * 100))}%`]);
  if (sp.duration) out.push(['Duration', `${fmt(sp.duration)} s`]);
  if (sp.root) out.push(['Root', `${fmt(sp.root)} s`]);
  return out;
}

export const CATEGORIES = Object.keys(SPELLS);

// Category from a champion's Data Dragon tags, or null.
export const categoryOf = (tags) => (Array.isArray(tags) && SPELLS[tags[0]] ? tags[0] : null);

// Brings a cast target within range of (x, z), on the line toward it.
export function clampRange(x, z, tx, tz, range) {
  const d = Math.hypot(tx - x, tz - z);
  if (d <= range) return { x: tx, z: tz };
  return { x: x + ((tx - x) * range) / d, z: z + ((tz - z) * range) / d };
}

// Where a Blink toward (tx, tz) lands: the target brought in range, or, if
// that is in a wall, the last floor before it on the line back to the caster.
export function blinkTarget(grid, side, from, tx, tz) {
  const t = clampRange(from.x, from.z, tx, tz, SPELLS.Mage.range);
  const d = Math.hypot(t.x - from.x, t.z - from.z);
  const step = grid.cell / 2;
  for (let s = d; s > 0; s -= step) {
    const x = from.x + ((t.x - from.x) * s) / d, z = from.z + ((t.z - from.z) * s) / d;
    if (grid.walkable(grid.index(x, z), side)) return { x, z };
  }
  return { x: from.x, z: from.z };
}
