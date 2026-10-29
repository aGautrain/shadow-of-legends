// Fantasy: each champion gets the active spell of its category, its first
// Data Dragon tag. Distances are in game units, times in seconds.

export const SPELLS = {
  Mage: { name: 'Blink', cooldown: 30, range: 450, text: 'Teleport toward the cursor, over thin walls.' },
  Assassin: { name: 'Shroud', cooldown: 45, duration: 3, text: 'Invisible to the enemy team for 3 s.' },
  Fighter: { name: 'Surge', cooldown: 25, duration: 3, speed: 1.4, text: '+40% move speed for 3 s.' },
  Tank: { name: 'Earthshaker', cooldown: 40, radius: 1000, root: 1.5, text: 'Roots every enemy around you for 1.5 s.' },
  Marksman: { name: 'Flare', cooldown: 45, range: 3000, radius: 500, duration: 4, text: 'Reveals an area at the cursor for 4 s.' },
  Support: { name: 'Sweep', cooldown: 40, radius: 900, text: 'Destroys enemy wards around you; each one gives you a ward.' },
};

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
