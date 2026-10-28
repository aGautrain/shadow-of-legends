# Shadow of Legends: plan

A standalone browser sim of Summoner's Rift fog of war. You walk a champion
around the real map and see, live, which cells the **enemy team** can see, so
you learn which paths keep you hidden. No skills, minions, combat, multiplayer
or win condition.

The rule for every number and shape in the sim: it comes from Riot's game
files or the official wiki, so what you learn transfers one-to-one to the game.

## 1. Map data (done in v1)

| What | Source | In the repo |
| --- | --- | --- |
| Walls, brush, see-through walls, team-only base gates | Summoner's Rift navgrid `AIPath_SRX_3.aimesh_ngrid` (295 x 296 cells of 50 units), live patch 16.21 | `data/navgrid.json` (raw 16-bit flags per cell) |
| Dragon soul terrain (Infernal, Ocean, Mountain, Chemtech), Baron pit and Atakhan pit variants | Riot's `.ngrid_overlay` files for the same map | `data/navgrid.json` → `overlays` |
| Turret positions | Structure cells (flag 0x4) in the navgrid, grouped into blobs | computed at load |
| Background art | Top-down render of the 2024 map geometry, aligned to the navgrid (checked by tracing wall edges over the art) | `assets/summoners-rift.jpg` |

The navgrid and its 8 overlays were extracted from a live install (patch
16.21.8298620) of `Game/DATA/FINAL/Maps/Shipping/Map11.wad.client`; the raw
files and their original paths and hashes are on the `navgrid-extract`
branch (`raw/navgrid/INFO.md`). `tools/extract_navgrid.py` is our own parser
for the binary formats. To refresh after a patch:

1. Unpack `Map11.wad.client` with the game closed and take
   `ASSETS/Maps/NavGrid/Map11/AIPath_SRX_3.aimesh_ngrid` and
   `ASSETS/Maps/NavGrid/NavGrid_*.ngrid_overlay`.
2. Run `python3 tools/extract_navgrid.py <AIPath_SRX_3.aimesh_ngrid> infernal=<...ngrid_overlay> ... -o data/navgrid.json`.

Compared with the 2024 grid first used (from
[LoL-NGRID-converter](https://github.com/FrankTheBoxMonster/LoL-NGRID-converter),
`SR_2024/`), patch 16.21 changes only 3 cells (walkable to brush, top lane
edge) and adds the two Atakhan pit overlays. The background art is still
the 2024 render.

## 2. Vision rules the sim applies

Computed on the 50-unit navgrid, which is finer than the 128 x 128 grid the
live game draws fog with.

- A unit sees every cell whose center is within its sight radius and has a
  clear line from the unit's center.
- **Walls** block sight. **See-through walls** (diagonal wall edges, turrets,
  inhibitors, nexus) block walking but not sight.
- **Brush**: each connected brush patch is one brush. Its cells are hidden
  from, and block sight for, any unit not standing in that same patch. A unit
  inside a patch sees the whole patch and out of it. A ward in a brush
  therefore reveals that brush.
- **Base gates**: only the owning team can walk on them. Their inner strip can
  be seen into but not through.
- A unit is **seen** when the cell under its center is visible to the other
  team.

Sight radii (editable in `src/config.js`): champion 1350, Stealth Ward 900,
Control Ward 900, Farsight Ward 500, turret 1350.

## 3. What you can do in v1

- Right-click to move, like in game. Paths go around walls (A* on the
  navgrid) at your champion's real move speed (default 345, editable, with
  presets for boots).
- Place enemy champions and enemy wards (Stealth, Control, Farsight), and
  allied champions and wards. Drag to reposition, Delete to remove.
- Enemy turrets give vision; click a turret to mark it destroyed.
- Views: **Enemy vision** (red where the enemy sees), **My team's fog** (what
  your screen would show), or both.
- A banner shows when you are seen and by what, plus a running
  "seconds seen / seconds walked" counter for the current path.
- Pick blue or red side, dragon terrain, and Baron pit variant.
- Camera: mouse wheel zoom, drag to pan, Space to center on your champion,
  Y to lock the camera.
- The scenario (your position, enemies, wards, settings) is saved in the URL,
  so a setup can be shared as a link.

## 4. Tech

Static site, no build step: `index.html` + ES modules in `src/` + Canvas 2D.
Deployed from the default branch by a GitHub Actions workflow to GitHub Pages.

- `src/grid.js`: decodes the navgrid, applies overlays, labels brush patches,
  finds turrets.
- `src/vision.js`: per-source visibility (line walk over grid cells), cached
  per source cell, merged per team.
- `src/path.js`: A* with corner-cut prevention and line-of-walk smoothing.
- `src/main.js`: rendering, input, UI, URL state.

## 5. Later (not in v1)

1. Refresh the grid from a current install (section 1) and confirm champion
   sight radius from game data.
2. Validate: recreate a moment from one of your replays with fog set to the
   enemy team, and compare.
3. Ward timers (Stealth Ward 90 to 120 s) and a game clock.
4. Scripted enemy movement or enemy positions pulled from replay timelines.
5. Training drills: "reach this camp without being seen", scored routes.
6. Minion and structure vision beyond turrets; temporary reveals (attacking
   from fog reveals 300 units for 2 s).
