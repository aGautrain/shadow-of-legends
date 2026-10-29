# Shadow of Legends

A browser sim of fog of war on Summoner's Rift. Walk a champion around the
real map and see, live, what the enemy team can see.

**Play:** https://agautrain.github.io/shadow-of-legends/

The landing page lists the modes. The sim below is the **Pedagogic** mode
(`pedagogic/`); old share links on the root URL redirect there.

- Right-click to move (real move speed, paths around walls).
- Place enemy champions and wards; enemy turrets see too (click one to destroy it).
- Red = enemy vision. Dark = your team's fog. The banner tells you when you are seen, and by what.
- The URL holds the whole scenario, so you can share a setup as a link.

**Hide and seek** (`hide-and-seek/`) is the multiplayer mode: create a room,
share the invite link, pick a name and a team (Blue or Red) in the lobby, and
the game starts when everyone is ready. Two rounds, so each team hides once
and seeks once; a hider is caught after 2 s in the seekers' vision. It runs
peer to peer over WebRTC (PeerJS), with the room creator's browser as the
server, so it needs no backend. See [PLAN.md](PLAN.md#6-hide-and-seek-mode-multiplayer).

The map is Riot's own navigation grid (50-unit cells: walls, brush,
see-through walls, base gates), so distances and sightlines match the game.
See [PLAN.md](PLAN.md) for the vision rules, data sources and roadmap.

## Run locally

```sh
python3 -m http.server
# open http://localhost:8000 (landing) or http://localhost:8000/pedagogic/
```

To try hide and seek offline, open
`http://localhost:8000/hide-and-seek/?net=local` in several tabs of one
browser: they talk over a BroadcastChannel instead of WebRTC.

No build step. Deployed to GitHub Pages by `.github/workflows/pages.yml` on
every push to `main`.

## Refresh the map data

```sh
python3 tools/extract_navgrid.py AIPath.aimesh_ngrid \
  infernal=NavGrid_Infernal_SEASONAL.ngrid_overlay ... -o data/navgrid.json
```

## Credits

The navgrid and overlays are extracted from the live game (patch 16.21).
The map render comes from
[FrankTheBoxMonster/LoL-NGRID-converter](https://github.com/FrankTheBoxMonster/LoL-NGRID-converter)
(`SR_2024/`). Game data belongs to Riot Games. Multiplayer uses
[PeerJS](https://peerjs.com) 1.5.5 (MIT, vendored in `src/vendor/`).

Shadow of Legends isn't endorsed by Riot Games and doesn't reflect the views
or opinions of Riot Games or anyone officially involved in producing or
managing Riot Games properties. Riot Games, and all associated properties are
trademarks or registered trademarks of Riot Games, Inc.
