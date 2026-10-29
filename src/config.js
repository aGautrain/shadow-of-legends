// Gameplay numbers. All distances are in game units.
// Sources: League of Legends Wiki (Sight, Ward, Stealth Ward pages).
export const SIGHT = {
  champion: 1350,
  stealth: 900,
  control: 900,
  farsight: 500,
  turret: 1350,
};

export const DEFAULT_MOVE_SPEED = 345;

// Width of the fog's soft edge, like the fade the game draws. Visual only:
// whether a unit is seen still uses the hard sight radius.
export const DEFAULT_FOG_EDGE = 250;

// Placeable units. Their names are in src/i18n.js under unit.<kind>.
export const UNIT_KINDS = {
  champion: { sight: SIGHT.champion },
  stealth: { sight: SIGHT.stealth },
  control: { sight: SIGHT.control },
  farsight: { sight: SIGHT.farsight },
};

// World rectangle covered by assets/summoners-rift.jpg, found by tracing the
// navgrid wall edges over the render.
export const BACKGROUND = { src: 'assets/summoners-rift.jpg', minX: -157, minZ: -97, size: 15000 };

// Map data versions as [id, file]. The first entry is the default. Their
// names are in src/i18n.js under patch.<id>.
export const PATCHES = [
  ['16.21', 'data/navgrid.json'],
  ['2024', 'data/navgrid-2024.json'],
];

// Terrains that change the map art but not walls or brush.
export const ART_ONLY_TERRAINS = ['hextech', 'cloud'];

// Terrain choices of each map select, '' for none. Their names are in
// src/i18n.js under terrain.<kind>.<value>, 'none' for ''.
export const TERRAINS = {
  dragon: ['', 'infernal', 'ocean', 'mountain', 'chemtech', 'hextech', 'cloud'],
  baron: ['', 'baronCup', 'baronTunnel'],
  atakhan: ['', 'atakhanTop', 'atakhanBot'],
};
