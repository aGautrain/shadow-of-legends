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

export const UNIT_KINDS = {
  champion: { label: 'Champion', sight: SIGHT.champion },
  stealth: { label: 'Stealth Ward', sight: SIGHT.stealth },
  control: { label: 'Control Ward', sight: SIGHT.control },
  farsight: { label: 'Farsight Ward', sight: SIGHT.farsight },
};

// World rectangle covered by assets/summoners-rift.jpg, found by tracing the
// navgrid wall edges over the render.
export const BACKGROUND = { src: 'assets/summoners-rift.jpg', minX: -157, minZ: -97, size: 15000 };

// Map data versions. The first entry is the default.
export const PATCHES = [
  ['16.21', '16.21 (your install)', 'data/navgrid.json'],
  ['2024', '2024 (GitHub repo)', 'data/navgrid-2024.json'],
];

// Terrains that change the map art but not walls or brush.
export const ART_ONLY_TERRAINS = ['hextech', 'cloud'];

export const TERRAINS = {
  dragon: [
    ['', 'No soul terrain'],
    ['infernal', 'Infernal'],
    ['ocean', 'Ocean'],
    ['mountain', 'Mountain'],
    ['chemtech', 'Chemtech'],
    ['hextech', 'Hextech'],
    ['cloud', 'Cloud'],
  ],
  baron: [
    ['', 'Default pit'],
    ['baronCup', 'Baron pit: cup'],
    ['baronTunnel', 'Baron pit: tunnel'],
  ],
  atakhan: [
    ['', 'No Atakhan'],
    ['atakhanTop', 'Atakhan: top side'],
    ['atakhanBot', 'Atakhan: bot side'],
  ],
};
