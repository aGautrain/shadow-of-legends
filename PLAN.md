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
| Terrain art (dragon souls incl. Hextech and Cloud, Baron pits) | Per-variant renders, cut by `tools/make_terrain_art.py` into patches of the pixels that differ from the base render | `assets/terrain/` |

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

## 6. Hide and seek mode (multiplayer)

A second mode at `hide-and-seek/`, for 2 to 10 players on the same map,
vision and movement as the Pedagogic mode. It turns the sim's lesson into a
game: hiders win by staying out of the enemy's sight, seekers win by reading
where the fog hides people.

### Flow

1. **Lobby.** One player creates a room and shares its link
   (`hide-and-seek/#CODE`). Everyone who opens it picks a name and a team
   (Blue or Red) and clicks Ready. When every player is ready and both teams
   have at least one player, a 3 s countdown starts the game. Unreadying or a
   team going empty cancels it. The room creator (the host) can change the
   round settings while everyone is in the lobby.
2. **Two rounds**, so that every player hides once and seeks once.
   Round 1: Blue seeks, Red hides. Round 2: Red seeks, Blue hides.
   Each round has two phases:
   - **Hide** (40 s by default): hiders leave their fountain and look for a
     spot. Seekers are held in their own fountain.
   - **Seek** (3 min by default): seekers hunt. Each seeker has 2 Stealth
     Wards to place (W, at the cursor, 600 range like the trinket).
3. **Catching.** A hider is caught after being **in the seeking team's vision
   for 2 s in a row** (the meter drains at the same rate when they break
   sight). Same vision rules as section 2: brush hides you unless a seeker or
   ward is in that brush, walls block sight. There is no tagging by contact:
   both teams move at 345, so a chase would never end, and the point of the
   game is vision. The hider sees their own "Spotted" meter fill; seekers see
   it above the hider. Caught hiders become spectators for the rest of the
   round and see the whole map with the seekers' vision drawn in red.
4. The round ends when every hider is caught or the timer runs out. A short
   summary shows, then the next round starts automatically.
5. **Results.** The team that caught the larger share of hiders as seekers
   wins; on a tie, the team that caught them faster. Per player: catches as a
   seeker, time survived and time spotted as a hider. The host can send
   everyone back to the lobby for a rematch.

What each player sees: their own team's fog only, like in game. Enemies are
drawn only when inside their team's vision. Turrets give no vision in this
mode (no team owns the map). A host setting, **Training: show enemy vision**,
paints the seekers' vision in red on the hiders' screens, for learning.

### Networking on a static host

GitHub Pages only serves files, so there is no game server. Options:

| Option | Server needed | Accounts / keys | Notes |
| --- | --- | --- | --- |
| **WebRTC with PeerJS** (chosen) | Free public PeerJS signaling server for the handshake only | None | Browser-to-browser data channels; PeerJS ships Google STUN and its own free TURN relay for strict NATs |
| WebRTC with Trystero (signaling over public BitTorrent trackers / Nostr) | None we run | None | Full mesh, more moving parts, signaling depends on third-party trackers |
| Firebase Realtime DB / Supabase Realtime / Ably | Hosted service | A project and an API key in the repo | Most reliable, but needs an account and has quotas |

We use **PeerJS 1.5.5** (vendored in `src/vendor/`, MIT), in a star layout:
the host's browser is the authoritative server. The room code becomes the
host's peer id (`sol-hs-<CODE>`); joiners connect to it. If the host closes
the tab, the room ends. A self-hosted PeerServer can be used with
`?peer=host:port`, and `?net=local` swaps WebRTC for a BroadcastChannel so
the game can be tested with several tabs of one browser, offline.

Message flow (JSON over one reliable data channel per player):

- Clients send their name, team and ready flag in the lobby, then their own
  position about 10 times a second during play (each client walks its own
  champion with the shared A* code, so movement feels instant) and ward
  placements.
- The host keeps the room state, runs the phases and timers, computes the
  seeking team's vision every tick, fills the spotted meters, decides
  catches, and broadcasts a snapshot of every position, meter and ward about
  10 times a second. Clients interpolate other players between snapshots.
- Positions of everyone are sent to everyone, and each client hides enemies
  outside its team's vision when drawing. That is enough for a game among
  friends; a cheat-proof version would have the host filter snapshots per
  team.

### Files

- `hide-and-seek/index.html`: page with the lobby and game screens (one page,
  since leaving the page would drop the WebRTC connection).
- `src/hideseek/net.js`: PeerJS and BroadcastChannel transports.
- `src/hideseek/server.js`: host-side room, phases, catching, scores.
- `src/hideseek/game.js`: lobby UI, map rendering, input, HUD.
- `src/hideseek/rules.js`: timings and numbers.

### Later

- Host picks the dragon / Baron terrain for the match.
- Hider tools (one Stealth Ward, or a Sweeping Lens for seekers).
- Per-team filtered snapshots, reconnect after a dropped connection, host
  migration.
- Replay at the end of a round showing each hider's path over the seekers'
  vision.
