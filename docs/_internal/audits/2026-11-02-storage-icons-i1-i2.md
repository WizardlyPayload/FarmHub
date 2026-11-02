# Storage fill-type HUD icons — I1 failure and private retest candidates

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

I2 was queued, then cancelled before a substantive result after an isolated
profile test found that a DLC request made during archive extraction did not
retry its disk lookup. The extracted DLC textures existed, yet the initial
request returned 404. A follow-up source change retries the lookup after
prefetch; a second isolated profile with no loose game extract resolved
all 14 I1 failures plus COFFEEBAGS, COFFEECAPSULES, COFFEEPACKED,
COPPERORE and PIGMENTS from locally installed archives to PNG files (19/19).
This is V5 5.2.44 source/local-runtime proof, not portable acceptance.

Tina had installed 5.2.43 when the cancel arrived; she ran no game or icon
test, and reported full Ally hash restoration at 02:14:56 UTC. I3 was frozen
as `TEST-PACKET-STORAGE-ICONS-I3.md` SHA-256
`060D63ED49ED542B91386D42070EE23CED64D5788990694A2398B7C1EFC13899`
and queued behind RF-1478. RF-1478 was cancelled without staging, so Tina
ran I3 next.

Private V5 5.2.44 candidate installer SHA-256
`5AE7185E798A41260F98F9DDBBEAC99393235BB4DD69FA9B0881BDC9DD36045D`
is staged in `storage-icons-candidate-5.2.44` beside the unchanged exporter.

## I3 installed result (Ally, 2026-11-02)

I3 **failed**: V5 5.2.44, exporter 5.1.0.35 and bundled helper all matched
the packet hashes; one Windows row, committed generations through 8, and
full Ally hash restoration were reported. The same 14 base-game owned rows
remained emoji/HTTP 404 while the four mod-added controls showed PNGs.
Five installed Beans and Alpacas DLC icon URLs also returned 404, though
Catuaí nonempty page rows were not tested. Evidence:
`Z:\Graham\agent-comms\ally-fh-storage-icons-i3-evidence\RESULT-STORAGE-ICONS-I3-text.md`.

The exact game root contained `dataS.gar`, but V5's
`fill_type_hud/_local_archive_sources` cache had **zero files**. This narrows
the failure to archive discovery or reader execution/extraction on Ally;
the evidence does not distinguish those cases. The local installed game
path differs from Graham's tested Steam path. A standalone helper diagnostic
I4 was frozen as `TEST-PACKET-STORAGE-ICONS-I4.md` SHA-256
`B6279F898E349C7C705C45DF027C7DF2A3B4BEE6264A5B0D0FC0391C4B1EECA9`
and queued behind RF-1479. It will test the exact reader against Ally's
local archives into disposable temp dirs without installing V5 or launching
the game. No GIANTS texture bytes will be copied to evidence.

The eventual replacement must repeat the installed same-generation Storage table check on Ally:
18 owned rows, each game image loaded and URL 200 `image/png`; check game
archive discovery, one Windows row, committed export generations, logs and
full restoration. Official DLC/Catuaí proof is separate and remains open.
