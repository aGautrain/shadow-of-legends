// Fantasy: each champion gets the active spell of its category, its first
// Data Dragon tag. Distances are in game units, times in seconds.

export const SPELLS = {
  Mage: {
    name: 'Blink', cooldown: 30, range: 450, text: 'Teleport toward the cursor, over thin walls.',
    hider: 'Hop over a wall or out of a seeker\'s sight to break their line of sight before your meter fills.',
    seeker: 'Close the gap on a hider, or hop a wall to cut off their escape.',
  },
  Assassin: {
    name: 'Shroud', cooldown: 45, duration: 3, text: 'Invisible to the enemy team for 3 s.',
    hider: 'You cannot be spotted: your meter drains even in plain sight, and the seekers lose you on their screen.',
    seeker: 'The hiders cannot see you coming, and you still see and catch them.',
  },
  Fighter: {
    name: 'Surge', cooldown: 25, duration: 3, speed: 1.4, text: '+40% move speed for 3 s.',
    hider: 'Outrun the seekers to the next brush or behind a wall.',
    seeker: 'Run down a fleeing hider, or reach a far spot first.',
  },
  Tank: {
    name: 'Earthshaker', cooldown: 40, radius: 1000, root: 1.5, text: 'Roots every enemy around you for 1.5 s.',
    hider: 'Root the seekers around you, then slip out of their sight.',
    seeker: 'Root the hiders around you so they cannot run out of your sight.',
  },
  Marksman: {
    name: 'Flare', cooldown: 45, range: 3000, radius: 500, duration: 4, text: 'Reveals an area at the cursor for 4 s.',
    hider: 'Scout where the seekers are. Your Flare never spots anyone.',
    seeker: 'Light up a far brush or corner: hiders inside fill their meter, as with a ward.',
  },
  Support: {
    name: 'Sweep', cooldown: 40, radius: 900, text: 'Destroys enemy wards around you; each one gives you a ward.',
    hider: 'Clear the seekers\' wards around your spot, and keep one ward per ward destroyed.',
    seeker: 'Clear the hiders\' lookout wards, and keep one ward per ward destroyed.',
  },
};

// The numbers shown on a spell's card, as [label, value].
export function spellStats(sp) {
  const out = [['Cooldown', `${sp.cooldown} s`]];
  if (sp.range) out.push(['Range', String(sp.range)]);
  if (sp.radius) out.push(['Radius', String(sp.radius)]);
  if (sp.speed) out.push(['Speed', `+${Math.round((sp.speed - 1) * 100)}%`]);
  if (sp.duration) out.push(['Duration', `${sp.duration} s`]);
  if (sp.root) out.push(['Root', `${sp.root} s`]);
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
