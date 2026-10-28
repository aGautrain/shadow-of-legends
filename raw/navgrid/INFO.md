# Summoner's Rift navgrid extract

- Game version: 16.21.8298620 (content `16.21.8298620+branch.releases-16-21.content.release`, code `…code.public`), live patchline, EUW install, macOS
- Source WAD: `/Applications/League of Legends.app/Contents/LoL/Game/DATA/FINAL/Maps/Shipping/Map11.wad.client` (WAD v3.4, 28463 entries, 2528886306 bytes, mtime 2026-10-27)
- Extracted 2026-10-28, read-only, with a custom Python WAD parser (zstd). Names recovered by xxhash64 of the lowercase paths found in the map's bin files.
- `base.aimesh_ngrid` = `ASSETS/Maps/NavGrid/Map11/AIPath_SRX_3.aimesh_ngrid`: the navgrid referenced by `Maps/MapGeometry/Map11/Base_SRX` (current SR), plus SR_Seasonal_Map, Worlds_SR_Seasonal, URF, A22, SocialSR, Trueshot, Sodapop/Milkshake/Boba SRS, Spectator_Only_Banners.
- Every Map11 map bin references the same 8 overlays below.

## Pushed files

| File | Original path | xxh64 | Size | SHA-1 |
|---|---|---|---|---|
| NavGrid_Infernal_SEASONAL.ngrid_overlay | `ASSETS/Maps/NavGrid/NavGrid_Infernal_SEASONAL.ngrid_overlay` | 1101526b76aef419 | 329 | cc9def78afdecc3731b1c6a08a52844221563ad2 |
| NavGrid_Tunnel_Base.ngrid_overlay | `ASSETS/Maps/NavGrid/NavGrid_Tunnel_Base.ngrid_overlay` | 19f7041ed0dadd39 | 2433 | 61f9cbd221decc1cce8595ef402beb4be2c3dfc0 |
| NavGrid_Mountain_SEASONAL.ngrid_overlay | `ASSETS/Maps/NavGrid/NavGrid_Mountain_SEASONAL.ngrid_overlay` | 27504e964290e3cb | 3299 | 65de89ff0206c6d30be4f868d0376a9f24275b8e |
| NavGrid_AtakhanBot.ngrid_overlay | `ASSETS/Maps/NavGrid/NavGrid_AtakhanBot.ngrid_overlay` | 2e8ec57f0b915332 | 319 | eee13f6ea6b8732946297c15acb87020e1fd4097 |
| NavGrid_Ocean_SEASONAL.ngrid_overlay | `ASSETS/Maps/NavGrid/NavGrid_Ocean_SEASONAL.ngrid_overlay` | 53d27422468ab303 | 1935 | 9933ba9286ce55ce2dbd3987939a62ff1c9f013e |
| NavGrid_Chemtech.ngrid_overlay | `ASSETS/Maps/NavGrid/NavGrid_Chemtech.ngrid_overlay` | 56b18d089cf0fe2e | 35 | 44eb76379c2f2419c596ef6e4e5c80bc6948a73a |
| NavGrid_AtakhanTop.ngrid_overlay | `ASSETS/Maps/NavGrid/NavGrid_AtakhanTop.ngrid_overlay` | 5c057368ce47d574 | 489 | a803fd72205703721b5882819c7e7ef7e41e761c |
| base.aimesh_ngrid | `ASSETS/Maps/NavGrid/Map11/AIPath_SRX_3.aimesh_ngrid` | 9d67b1c0b806e23e | 9361843 | 84431bc6cf88c7947abdb1fbd1196fb2d57a2250 |
|  | grid 295x296, cell 50.0, bounds min (-1.105, -71.241, 32.756) max (14718.4, 184.52, 14792.211) | | | |
| NavGrid_Cup_Base.ngrid_overlay | `ASSETS/Maps/NavGrid/NavGrid_Cup_Base.ngrid_overlay` | f50d18f36da30a43 | 775 | e8224cf8dbf5a09ee98b891f693e28a099a4de90 |

## Overlay boxes

Each box: x, z, w, h in grid cells.

| Overlay | Boxes | x, z, w, h |
|---|---|---|
| NavGrid_Infernal_SEASONAL.ngrid_overlay | 2 | (206,85,11,9), (192,98,8,6) |
| NavGrid_Tunnel_Base.ngrid_overlay | 7 | (95,182,32,25), (91,203,1,2), (109,207,1,6), (75,212,19,16), (108,217,6,7), (100,218,3,1), (92,230,2,1) |
| NavGrid_Mountain_SEASONAL.ngrid_overlay | 6 | (148,47,15,19), (191,85,24,19), (159,100,7,11), (226,118,16,16), (55,163,16,16), (134,231,15,18) |
| NavGrid_AtakhanBot.ngrid_overlay | 3 | (238,55,8,7), (228,75,6,5), (224,80,8,6) |
| NavGrid_Ocean_SEASONAL.ngrid_overlay | 11 | (157,62,9,6), (192,76,11,5), (209,84,13,11), (154,93,15,5), (227,108,11,12), (87,135,12,8), (197,155,1,3), (197,155,11,9), (60,180,11,6), (126,198,17,5), (129,228,10,7) |
| NavGrid_Chemtech.ngrid_overlay | 1 | (189,96,4,2) |
| NavGrid_AtakhanTop.ngrid_overlay | 3 | (63,217,8,5), (64,223,6,6), (47,236,13,11) |
| NavGrid_Cup_Base.ngrid_overlay | 2 | (88,192,19,10), (77,203,15,12) |

## Other Map11 navgrids (not pushed)

All have the same header (295x296, cell 50) and size; they differ in content. Event/mode variants. Ask if you want them.
Duplicates: Boba_SRS_Act2A == Act2B; Tutorial == Crepe.

| Original path | xxh64 | Size | SHA-1 |
|---|---|---|---|
| `ASSETS/Maps/NavGrid/Map11/AIPath.aimesh_ngrid` | 59c8e0541c0960ce | 9361843 | fdcb16d5d194bdd1d95c2b399db6c97e77db36bf |
| `ASSETS/Maps/NavGrid/Map11/AIPath_NPE_1.aimesh_ngrid` | f0f5ec0956387220 | 9361843 | 00989559877626d4e63b4db9b9ea32c2ef634596 |
| `ASSETS/Maps/NavGrid/Map11/AIPath_SRX.aimesh_ngrid` | b7b2b65287ed2102 | 9361843 | f804fde437e13632f0dc0bddf6fbc58d85f13745 |
| `ASSETS/Maps/NavGrid/Map11/AIPath_SRX_2.aimesh_ngrid` | e08d20957d2e2a3a | 9361843 | a1350c836dc8742287210c18949a7dacccf102b3 |
| `ASSETS/Maps/NavGrid/Map11/AIPath_UltBook.aimesh_ngrid` | 0b6356e3cec7c67c | 9361843 | 4b900cf06e2e1be9830f2a190f31184987692475 |
| `ASSETS/Maps/NavGrid/Map11/Bloom.aimesh_ngrid` | 520dad3eb8e91304 | 9361843 | 543c1c0c424e64c4e5d782ea723172cbe4895bbc |
| `ASSETS/Maps/NavGrid/Map11/Boba_SRS_Act2A.aimesh_ngrid` | 96a6661f0da8128e | 9361843 | 830effee2b4f08df20e297f3ca52bfbac81503c9 |
| `ASSETS/Maps/NavGrid/Map11/Boba_SRS_Act2B.aimesh_ngrid` | 306816775a61d671 | 9361843 | 830effee2b4f08df20e297f3ca52bfbac81503c9 |
| `ASSETS/Maps/NavGrid/Map11/ContentCapture.aimesh_ngrid` | 0ed56f1b0729052f | 9361843 | 4e59fb79bf20e92873728da13d072c1532a3cc07 |
| `ASSETS/Maps/NavGrid/Map11/Crepe.aimesh_ngrid` | 4a2e88b8c8db631d | 9361843 | c4806636fc1568bb7c719d538539217ba8dc632f |
| `ASSETS/Maps/NavGrid/Map11/Ruby_SR.aimesh_ngrid` | 9d75d3bcf1d982d7 | 9361843 | aec9bfb561566b35a6698ce875409ee1fe4c1957 |
| `ASSETS/Maps/NavGrid/Map11/Tutorial.aimesh_ngrid` | 0db3d762553b6ad9 | 9361843 | c4806636fc1568bb7c719d538539217ba8dc632f |
