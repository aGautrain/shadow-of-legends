# Shadow of Legends

A browser sim of fog of war on Summoner's Rift. Walk a champion around the
real map and see, live, what the enemy team can see.

**Play:** https://agautrain.github.io/shadow-of-legends/

- Right-click to move (real move speed, paths around walls).
- Place enemy champions and wards; enemy turrets see too (click one to destroy it).
- Red = enemy vision. Dark = your team's fog. The banner tells you when you are seen, and by what.
- The URL holds the whole scenario, so you can share a setup as a link.

The map is Riot's own navigation grid (50-unit cells: walls, brush,
see-through walls, base gates), so distances and sightlines match the game.
See [PLAN.md](PLAN.md) for the vision rules, data sources and roadmap.

## Run locally

```sh
python3 -m http.server
# open http://localhost:8000
```

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
(`SR_2024/`). Game data belongs to Riot Games.

Shadow of Legends isn't endorsed by Riot Games and doesn't reflect the views
or opinions of Riot Games or anyone officially involved in producing or
managing Riot Games properties. Riot Games, and all associated properties are
trademarks or registered trademarks of Riot Games, Inc.
