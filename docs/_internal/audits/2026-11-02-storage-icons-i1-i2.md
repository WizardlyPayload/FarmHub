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

## I4 archive diagnostic and I5 source correction

Tina ran the exact bundled HUD helper directly on Ally's installed archives
after RF-1479 released Ally. The game-root `dataS.gar` yielded 181 HUD DDS
files, including all 14 base-game I1/I3 misses; it took 46.8 seconds on the
measured repeat. The official Beans and Alpacas DLC in the player's
`Documents/My Games/FarmingSimulator2025/pdlc` yielded 26 HUD DDS files,
including all five sampled DLC keys, in 111.5 and 140.6 seconds. Both commands
exited 0 with empty stderr. I4 did not install V5, open FS25 or copy game art
to NAS evidence. Ally was hash-restored at 03:00:11 UTC. See
`Z:\Graham\agent-comms\ally-fh-storage-icons-i4-evidence\RESULT-STORAGE-ICONS-I4-text.md`.

The V5 5.2.44 caller imposed a 45-second helper limit, shorter than Ally's
measured base run, and searched only the game folder for `.dlc` files. This
explains the empty I3 archive cache. Candidate 5.2.45 allows 180 seconds for
`.gar` and 300 seconds for `.dlc`, scans `pdlc` under game and discovered
FS25 profile roots, and writes a private archive status file with outcome,
texture count and elapsed time. It also waits for DLC prefetch before the HUD
cache epoch is marked complete so the page can retry initially missing images.
The focused HUD tests passed 16/16 including profile DLC discovery. This is a
source correction; installed Storage icon acceptance remains pending I5.

The private 5.2.45 installer is staged at
`Z:\Graham\agent-comms\farmhub-companion-acceptance\storage-icons-candidate-5.2.45\FS25-Farm-Dashboard-V5-Setup-5.2.45.exe`,
SHA-256 `77A34319183035AF5CD30F6C446651A3454938879281AA00A39BD37D2AB426B8`.
The unchanged exporter 5.1.0.35 ZIP beside it is SHA-256
`F3551845457935AB9B9B2ECECC6772CD0E432656121DD4D6EE05052FC89FC98F`.
Private V5 packaging, bundled helper pin, UI match and artifact guards passed;
the live update feed was untouched. The frozen I5 packet SHA-256 is
`3189F30C777B7238D6123808E6C594914DFCF09C19895F888D1D8AAC6FD3BA4C`;
the exact I5 request was appended to Tina's ledger with RF priority.

## I5 installed failure and I6 streaming correction

I5's first Ally attempt stopped when Tina's agent session ended; she resumed,
restored that attempt, and ran again from a clean baseline. The second run
**failed** despite exact packet, installer, exporter and helper hashes, one
Windows row, committed generations and no FarmDash Lua stack. OAT and LIME
were real images, while the other 12 base-game rows were still emoji/404.
Two of five sampled DLC URLs passed (COPPERORE and PIGMENTS); the three coffee
URLs returned 404. The app's status recorded `dataS.gar` timed out at 180
seconds and Beans and Alpacas plus Highlands Fishing DLCs at 300 seconds.
Only 17 HUD DDS files were extracted before those stops. Tina reported full
Ally hash restoration at 09:21:14 UTC; she did not save the disposable game.
Evidence: `Z:\Graham\agent-comms\ally-fh-storage-icons-i5-evidence\RESULT-STORAGE-ICONS-I5-text.md`.
The earlier I4 helper had completed in seconds to minutes with FS25 closed;
the I5 helper ran while the game was in the world. The exact `--hud` source
called `GarArchive::open`, which reads the entire multi-gigabyte archive into
memory, then selects textures. This is a concrete inefficiency that makes the
timeout and unresponsive app plausible under concurrent game disk load; I5
did not measure disk or independently isolate every cause of UI delay.

The I6 helper source now reads only the archive header, encrypted file table
and selected HUD entries using the same bounded, seek-based approach already
used for its overview mode. On Graham's local archives it extracted all 181
base HUD files in 0.51 seconds and all 26 Beans and Alpacas files in 0.10
seconds. WHEAT, MILKCOW and COFFEEBAGS DDS hashes matched trusted local game
extracts exactly; the unchanged overview mode's result also matched its
trusted extract. A fresh private app cache resolved all 14 I1/I3 base keys
and the five DLC keys to PNG (19/19), and its status recorded successful
base and 14 installed DLC archive scans. Focused JS tests passed 16/16.
These are local source/runtime checks only. I6 still needs an installed Ally
Storage-table retest after RF releases the machine; no Catuaí nonempty page
claim follows from sampled DLC URLs.

Private V5 5.2.46 packaged with the new helper passed the bundled binary pin,
UI source match, private-artifact and update-channel guards. Its staged
installer is `Z:\Graham\agent-comms\farmhub-companion-acceptance\storage-icons-candidate-5.2.46\FS25-Farm-Dashboard-V5-Setup-5.2.46.exe`,
SHA-256 `FB66D8C77A9E9F7ECCB3964C2D258C267EC43645E7F2A81DEB76C6112AFC05D3`.
The exporter ZIP remains SHA-256
`F3551845457935AB9B9B2ECECC6772CD0E432656121DD4D6EE05052FC89FC98F`.
The bundled seek-based helper is SHA-256
`2575753CD23FEE5AA3E587B703A58AFD54687D4A99A6E3C767A6CD3AAC44FEEE`.
After RF-1484 returned BLOCKED and Tina reported full Ally hash restoration
at 10:41:58 UTC, I6 was frozen as
`Z:\Graham\agent-comms\farmhub-companion-acceptance\TEST-PACKET-STORAGE-ICONS-I6.md`,
SHA-256 `5B3B16342C8D07FACD0BB46802829073CB70679FB944E27B369FF4DA34530D36`,
and the exact request was appended to Tina's ledger with RF priority. ACK
will be receipt only; installed Storage icon acceptance remains pending.

## I6 installed result (Ally, 2026-11-02)

I6 **passed the bounded base-game Storage icon retest** on a disposable
Witcombe save20. In installed V5 5.2.46, all 18 nonempty owned Storage rows
used loaded images (`naturalWidth` 256), including the 14 base keys that
failed I1/I3/I5. All 14 URLs returned 200 `image/png`; there were zero emoji
fallbacks. The Beans and Alpacas DLC's five sampled keys (COFFEEBAGS,
COFFEECAPSULES, COFFEEPACKED, COPPERORE and PIGMENTS) also returned 200 PNG.
Tina did not load Catuaí, so those URL checks do not prove the nonempty
Catuaí table or every commodity in Graham's screenshot. Evidence:
`Z:\Graham\agent-comms\ally-fh-storage-icons-i6-evidence\RESULT-STORAGE-ICONS-I6-text.md`
and `ui\si6-v5-07.png`.

The helper completed while FS25 was in the world: 181 `dataS.gar` HUD files
in 1,593 ms and 26 Beans and Alpacas DLC files in 1,430 ms. Its cache ended
with 223 HUD DDS files and no partial files; V5 stayed responsive. The exact
packet (`5B3B16342C8D07FACD0BB46802829073CB70679FB944E27B369FF4DA34530D36`),
installer (`FB66D8C77A9E9F7ECCB3964C2D258C267EC43645E7F2A81DEB76C6112AFC05D3`)
and exporter (`F3551845457935AB9B9B2ECECC6772CD0E432656121DD4D6EE05052FC89FC98F`)
hashes were independently rechecked. One Windows install row, committed slot
generations 5/6, no FarmDash Lua stack, and full Ally hash restoration were
reported. The game log contained separate texture, console-command and
harvest-mission errors. This is a private candidate, not a public release.

## Catuaí exact owned-stock check (Graham PC, read-only save/export)

The current `savegame17` FarmDashboard export, committed generation 338,
contains 20 nonempty farm 1 Storage keys. With a fresh temporary icon cache,
the I6 source resolved **20/20** exact keys to PNG using locally installed
game/DLC archives and mod sources: STRAW, POTATO, DRYGRASS_WINDROW,
BEETROOT, GRASS_WINDROW, SORGHUM, CARROT, OAT, SPINACH, PIGMENTS,
FURNITURE, WOODBEAM, CANOLA, WHEAT, COFFEEBAGS, SOYBEAN, IRONORE,
COPPERORE, COFFEECAPSULES and COFFEEPACKED. The cache was isolated in
`%LOCALAPPDATA%\Temp\farmhub-i6-catuai-check-20261102`; no save, installed
app or user profile was changed. FURNITURE, IRONORE, COFFEEBAGS and
GRASS_WINDROW PNGs were visually inspected and depict the named commodity.
The 12 keys in Graham's screenshot are included in those 20. This closes
the source/asset-resolution gap for that exact export; the Catuaí installed
Storage table was not opened in I6, so a direct Catuaí UI observation is
still untested. Do not convert this local check into an installed Catuaí
gameplay claim.

## Isolated Catuaí page check and Graham PC install limit

An isolated V5 source instance on localhost port 8769 read only the current
Catuaí savegame17 export (generation 338) through a sanitized one-save
configuration. Its Storage table rendered all **20/20** owned commodity rows
with one complete PNG image (`naturalWidth` 256) and zero emoji fallbacks.
The 12 names in Graham's screenshot were checked individually in the DOM:
Canola, Carrots, Coffee Bags, Coffee Capsules, Coffee Packed, Copper Ore,
Furniture, Grass, Hay, Iron Ore, Oat and Pigments. The observed image URLs
carried the Catuaí map ID, and the five coffee/ore/pigment DLC keys resolved
to their exact fill-type names. A viewport screenshot showed the first six
rows with their images. The isolated instance used a fresh temporary cache
generated from Graham's locally installed archives; it did not change the
save or installed profile. It was stopped after the check, and port 8769 is
closed. This is a direct local source UI check, distinct from I6's installed
Ally test.

Graham's PC has one registered V5 **5.2.12** install. Before attempting to
update it, the 91-file installed app, V5 roaming profile (596 files), both
shortcuts and uninstall registration were backed up under
`C:\Users\Graham\.codex\backups\farmhub-storage-icons-20261102-1112`.
The 5.2.46 installer matched its pinned SHA-256, but executing it from the
NAS was denied, and the identical local copy exited 1 in silent mode.
Readback after the attempt still showed V5 5.2.12, one Windows row, the same
installed `app.asar` hash (`242E6A49E1117439FD7652FB63D452756172E2C39D018F6380D12DE4B3CA885B`),
the same V5 config hash, and zero content differences across the 596-file
roaming profile. No new version was installed on Graham's PC. The installer
did not emit a reason for the silent exit, so the cause is **undetermined**;
do not describe the private fix as already installed on Graham's PC.
