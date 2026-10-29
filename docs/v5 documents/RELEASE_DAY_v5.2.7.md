# Farm Dashboard V5 5.2.7 — release handoff

**Status (29 October 2026):** V5 5.2.7 is published on GitHub and itch.io. The website deployment is with Sarah under `SARAH-20261029-005`; do not call the website updated until she reports a successful public readback. App 5.2.7 is a dependency-only successor to the 5.2.6 functional candidate. The exact 5.2.7 installer passed PC and Ally install/launch plus Ally Keep-data uninstall/reinstall; the bounded DLC gameplay proof is on 5.2.6 with the same byte-identical game mod.

## Exact candidate

Flat local drop: `C:\Users\Graham\Documents\FarmDash Release\`.

| File | Size | SHA-256 |
| --- | ---: | --- |
| `FS25-Farm-Dashboard-V5-Setup-5.2.7.exe` | 384,055,994 bytes | `B204BAF48DA9F24B16D52FCF564A569CAC7447E27E5C910B655B7DFEB8996884` |
| `FS25_FarmDashboard.zip` | 470,369 bytes | `9D51ACA937BE74D42427923A8A3FE78F44DF2FE34D6B3C5770B1ABD2779A1064` |
| `farmdashboard-website-5.2.7-upload.zip` | 311,635,063 bytes | `751B6E0972A7467D95D51CE0D490C4B0D7A529EE9E6491EF2E0458F4CF0BA5BC` |

The installer SHA-512 for the V5 update feed is `t1mW36q2WjRTTkdx+LJ5+xxsLStxK/Mb5xOYuj9B/TDClIi5JtuQ7Lda7i+KzNqtFNVNzCtMNfWGc3kDwO+j6w==`. The public GitHub `releases/latest/download/latest-rf.yml` was fetched back on 29 October and matched the staged 5.2.7 feed SHA-256 `2E94AFFBA3A09A2824C634693543C0E54447CE1E2A81B917C90BC5E539468631`. Never substitute the V4 `latest.yml`.

The website package is a local successor to the verified 5.2.0 public package. It has 183 entries, passes ZIP CRC, contains no tester `/t/` paths or installers, and every referenced screenshot resolves. It includes the 5.2.6 core/companion screenshots and four new Catuaí 5.2.7 captures. Existing scroll/detail shots remain where there is no equivalent new capture; do not claim an exhaustive 5.2.7 website image recapture. Sarah must independently back up and validate the target before deployment.

## Acceptance and boundaries

- **PC 5.2.6 Catuaí:** exact mod and installer installed; one native Windows V5 row; committed generations 1–7 without Farm Dashboard Lua errors. All 208 coffee and 17 banana orchard rows reported owned by farm 1. Coffee farmlands 88, 89, 90, 91, 92 and 105 were farm 1. The Orchards image was visible.
- **PC 5.2.7 app:** exact installer installed over the existing profile; one native Windows V5 5.2.7 row, preserved `config.json` SHA-256 `18EDD7EF9E44A2F92F7B955348C83158800B07BE974839F646C1707FEC83E1E2`, installed executable FileVersion 5.2.7 and SHA-256 `8B1DB1A27B3B29303F1B738C6EA08E24AFC1348FEA04632BBAEB9F4642022B7A`, and live local API reported 5.2.7. Headless captures from the installed app showed the Catuaí overview, Orchards, Productions and decoded Fleet map image at 1920 × 1080. The running game/save was not operated for these captures.
- **Ally 5.2.6 DLC-526:** exact hashes installed; one native Windows row. Disposable Kinlaig saved once, manually discovered, and showed its map image and Highlands zero card. Disposable Riverbend showed Pumps N' Hoses and Emergency cards, which hid when their packs were unchecked. Exports committed generations 1–3 with no Farm Dashboard Lua errors. Tina restored the Ally's previous state and verified protected game files.
- **Ally 5.2.6 DLC-527:** the Highlands card appeared with the pack checked on a base-game map and disappeared after a game reload with it unchecked. The installed full-screen app showed Save overview, Pastures, Fields, Productions and Fleet map images. Native **Keep data** uninstall removed the app and Windows row; reinstall of the same exact setup returned one row and retained linked sources. Tina again restored the Ally's prior app, profile, ZIP and game settings, with 517 modSettings files and 484 mod-folder entries matching the originals.
- **Ally 5.2.7 APP-527:** Tina verified the exact installer SHA-256 `B204BAF48DA9F24B16D52FCF564A569CAC7447E27E5C910B655B7DFEB8996884` before both installs. One native 5.2.7 row and real uninstaller appeared; installed executable and local API reported 5.2.7; a selected existing source and page background rendered. The native **Keep data** uninstall removed the row and app while retaining source configuration. Reinstall restored one row, launch and source selection. Tina restored the Ally's original 5.1.18 app (88/88 files), roaming profile (57/57), local profile (105/105), updater, Windows uninstall-key list, and FS25 settings/mods with zero reported hash mismatches. Evidence: `Z:\Graham\agent-comms\app-527-evidence\`. No game load or mod ZIP replacement was part of this app-only run. After Keep reinstall, the dashboard opens on **Data source** until one retained source is selected; image caches are rebuilt.
- **Limits:** these bounded tests do not prove every DLC's nonzero mechanics, every mod combination, a Full-data uninstall, or a new two-client dedicated session for this exact pair. New local saves currently require manual Auto-Detect after their first save. Core/companion help images were recaptured at 1920 × 1080 from the installed 5.2.6 app with held demo exports; Catuaí screenshots are from 5.2.7. Settings images still show 5.1.17.

Detailed observations and source limits: [DLC coverage audit](../DLC-COVERAGE-AUDIT-2026-10-28.md). This document must not turn static coverage proposals into tested gameplay claims.

## Publication order

1. Commit and push the 5.2.7 source, player help, release notes and screenshots to `main`; verify GitHub CI on that exact revision. Recheck installer/mod hashes against the flat drop and inspect the staged V5 feed.
2. Publish GitHub Release `v5.2.7` with the two exact binaries and staged `latest-rf.yml`. Read back asset digests and mark latest only after they match.
3. Update itch V5 Windows and mod channels using the same bytes; fetch each public download and verify its inner file hash. Leave classic V4 channels separate.
4. Prepare the public website update from current V5 source/screenshots. Route backup, deployment and readback through Sarah's shared office; an INBOX request alone is not an acknowledgement or completion. Do not alter protected tester paths.
5. Verify public website, download links, update feed, version labels and images as a visitor. Publish community posts after those links work.

Record the actual commit, CI runs, public URLs, asset hashes, itch fetches, Sarah's acknowledgement/result, and website readback **after** each action. Do not pre-fill success.

## Publication record — 29 October 2026

- Source and release notes were pushed to `main` at `289f43860ba2af8eced9060a54a93de676e57536`. [CI run 40878968143](https://github.com/WizardlyPayload/FarmHub/actions/runs/40878968143) passed on that exact commit.
- [GitHub v5.2.7](https://github.com/WizardlyPayload/FarmHub/releases/tag/v5.2.7) was published as latest at 13:17 UTC. The tag targets the same commit. All four assets were downloaded from the release and their SHA-256 hashes matched the local installer, blockmap, canonical mod ZIP and V5 update feed.
- itch.io `windows-v5` build `2243560` reports app 5.2.7; `mod-v5` build `2243621` reports mod 5.1.0.12. Both channels were fetched back with Butler. The installer readback was 384,055,994 bytes with SHA-256 `B204BAF48DA9F24B16D52FCF564A569CAC7447E27E5C910B655B7DFEB8996884`; the inner `FS25_FarmDashboard.zip` was 470,369 bytes with SHA-256 `9D51ACA937BE74D42427923A8A3FE78F44DF2FE34D6B3C5770B1ABD2779A1064`. The mod channel also contains `INSTALL.txt` so Butler preserves the canonical inner ZIP instead of unpacking it.
- The [public itch page](https://wizardlypayload.itch.io/farm-dashobaord-fs25) and installation instructions were read back with app 5.2.7, mod 5.1.0.12 and the versioned GitHub link. Its existing embedded screenshots still show earlier V5 screens. The current 5.2.7 Catuaí screenshots are in the website package; itch image upload remains pending because the connected Chrome extension does not allow local file uploads. Do not call itch screenshot refresh complete.
- Sarah acknowledged the read-only website preflight under `SARAH-20261029-002/003` at 10:18 GMT and independently verified the exact 311,635,063-byte package SHA-256 `751B6E0972A7467D95D51CE0D490C4B0D7A529EE9E6491EF2E0458F4CF0BA5BC`, 183-entry CRC, free space and protected tester path. After Graham's final release go-ahead, `SARAH-20261029-005` requested the bounded public deployment. An inbox entry is not an ACK or completion; record Sarah's RESULT and public website readback below when received.
