# Storage fill-type HUD icons — I1 failure and I2 candidate

## I1 installed result (Ally, 2026-11-02)

Tina installed private V5 5.2.42 and exporter 5.1.0.35 on a disposable
Witcombe save20. The exact artifacts and frozen I1 packet passed hash gates;
there was one Windows installation row, committed export generations, no Lua
traceback, and full Ally hash restoration. Evidence:
`Z:\Graham\agent-comms\ally-fh-storage-icons-i1-evidence\RESULT-STORAGE-ICONS-I1-text.md`.

The owned Storage table had 18 nonempty fill types. LINSEED, POPPY, SPELT and
TRITICALE showed PNG game icons. Fourteen base-game types returned HTTP 404 and
fell back to emoji: WHEAT, BARLEY, OAT, STRAW, DRYGRASS_WINDROW, SILAGE,
HERBICIDE, LIME, MILK, MANURE, LIQUIDMANURE, FERTILIZER, SEEDS and DIESEL.
The Lua exporter had copied 53 mod-added HUD files but none of these base
textures. The official DLC icons in the Catuaí screenshot were not tested on
Ally because that map was not loaded. I1 therefore **failed** its requirement;
the earlier local PC success depended on a local game extract/cache.

## I2 correction (private candidate, installed retest pending)

The V5 app now uses its already-bundled, pinned `gar-lib` helper in a narrow
`--hud` mode to read only `menu/hud/fillTypes` textures from the player's
locally installed `dataS.gar` and `.dlc` files. The helper writes to a private
cache on that PC; no game artwork is included in the installer. Its original
single-DLC overview mode still extracted the official Beans and Alpacas
overview in a regression check.

On Graham's local installed game, `--hud` extracted 181 base textures from
`dataS.gar` and 26 textures from `beansAndAlpacasPack.dlc`. A fresh-cache
Node run resolved all 14 fill types that failed I1 to PNG files. This is
source/local-runtime proof, not Ally installed acceptance or Catuaí DLC page
proof. The `fillTypeHud.test.js` suite passed 15/15; V5 private packaging and
its bundled-binary, UI and artifact guards passed.

Private I2 V5 5.2.43 installer:
`Z:\Graham\agent-comms\farmhub-companion-acceptance\storage-icons-candidate-5.2.43\FS25-Farm-Dashboard-V5-Setup-5.2.43.exe`
SHA-256 `0EB11FC9CA0A7EB541FF7EDD71776112E1B23B7BB7A798F908E176B3EC54DF6A`.
The exporter remains 5.1.0.35, SHA-256
`F3551845457935AB9B9B2ECECC6772CD0E432656121DD4D6EE05052FC89FC98F`.

I2 must repeat the installed same-generation Storage table check on Ally:
18 owned rows, each game image loaded and URL 200 `image/png`; check game
archive discovery, one Windows row, committed export generations, logs and
full restoration. Official DLC/Catuaí proof is separate and remains open.
