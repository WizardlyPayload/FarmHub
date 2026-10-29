# Farm Dashboard V5 5.2.7 — release handoff

**Status:** local 5.2.7 candidate, not yet published. Public GitHub, itch and website remain at 5.2.0 until the publication sequence is completed. App 5.2.7 is a dependency-only successor to the 5.2.6 functional candidate; the exact 5.2.7 installer has PC install/launch proof, while the bounded Ally lifecycle proof is on 5.2.6. Do not describe this file as proof that public downloads have changed.

## Exact candidate

Flat local drop: `C:\Users\Graham\Documents\FarmDash Release\`.

| File | Size | SHA-256 |
| --- | ---: | --- |
| `FS25-Farm-Dashboard-V5-Setup-5.2.7.exe` | 384,055,994 bytes | `B204BAF48DA9F24B16D52FCF564A569CAC7447E27E5C910B655B7DFEB8996884` |
| `FS25_FarmDashboard.zip` | 470,369 bytes | `9D51ACA937BE74D42427923A8A3FE78F44DF2FE34D6B3C5770B1ABD2779A1064` |
| `farmdashboard-website-5.2.7-upload.zip` | 311,635,063 bytes | `751B6E0972A7467D95D51CE0D490C4B0D7A529EE9E6491EF2E0458F4CF0BA5BC` |

The installer SHA-512 for the V5 update feed is `t1mW36q2WjRTTkdx+LJ5+xxsLStxK/Mb5xOYuj9B/TDClIi5JtuQ7Lda7i+KzNqtFNVNzCtMNfWGc3kDwO+j6w==`. A separate `latest-rf-5.2.7.yml` is staged locally. The public/local `latest-rf.yml` remains at 5.2.0 until publication. Never substitute the V4 `latest.yml`.

The website package is a local successor to the verified 5.2.0 public package. It has 183 entries, passes ZIP CRC, contains no tester `/t/` paths or installers, and every referenced screenshot resolves. It includes the 5.2.6 core/companion screenshots and four new Catuaí 5.2.7 captures. Existing scroll/detail shots remain where there is no equivalent new capture; do not claim an exhaustive 5.2.7 website image recapture. Sarah must independently back up and validate the target before deployment.

## Acceptance and boundaries

- **PC 5.2.6 Catuaí:** exact mod and installer installed; one native Windows V5 row; committed generations 1–7 without Farm Dashboard Lua errors. All 208 coffee and 17 banana orchard rows reported owned by farm 1. Coffee farmlands 88, 89, 90, 91, 92 and 105 were farm 1. The Orchards image was visible.
- **PC 5.2.7 app:** exact installer installed over the existing profile; one native Windows V5 5.2.7 row, preserved `config.json` SHA-256 `18EDD7EF9E44A2F92F7B955348C83158800B07BE974839F646C1707FEC83E1E2`, installed executable FileVersion 5.2.7 and SHA-256 `8B1DB1A27B3B29303F1B738C6EA08E24AFC1348FEA04632BBAEB9F4642022B7A`, and live local API reported 5.2.7. Headless captures from the installed app showed the Catuaí overview, Orchards, Productions and decoded Fleet map image at 1920 × 1080. The running game/save was not operated for these captures.
- **Ally 5.2.6 DLC-526:** exact hashes installed; one native Windows row. Disposable Kinlaig saved once, manually discovered, and showed its map image and Highlands zero card. Disposable Riverbend showed Pumps N' Hoses and Emergency cards, which hid when their packs were unchecked. Exports committed generations 1–3 with no Farm Dashboard Lua errors. Tina restored the Ally's previous state and verified protected game files.
- **Ally 5.2.6 DLC-527:** the Highlands card appeared with the pack checked on a base-game map and disappeared after a game reload with it unchecked. The installed full-screen app showed Save overview, Pastures, Fields, Productions and Fleet map images. Native **Keep data** uninstall removed the app and Windows row; reinstall of the same exact setup returned one row and retained linked sources. Tina again restored the Ally's prior app, profile, ZIP and game settings, with 517 modSettings files and 484 mod-folder entries matching the originals.
- **Limits:** these bounded tests do not prove every DLC's nonzero mechanics, every mod combination, a Full-data uninstall, or a new two-client dedicated session for this exact pair. The exact 5.2.7 installer has not undergone an Ally Keep-data lifecycle test. New local saves currently require manual Auto-Detect after their first save. Core/companion help images were recaptured at 1920 × 1080 from the installed 5.2.6 app with held demo exports; Catuaí screenshots are from 5.2.7. Settings images still show 5.1.17.

Detailed observations and source limits: [DLC coverage audit](../DLC-COVERAGE-AUDIT-2026-10-28.md). This document must not turn static coverage proposals into tested gameplay claims.

## Publication order

1. Commit and push the 5.2.7 source, player help, release notes and screenshots to `main`; verify GitHub CI on that exact revision. Recheck installer/mod hashes against the flat drop and inspect the staged V5 feed.
2. Publish GitHub Release `v5.2.7` with the two exact binaries and staged `latest-rf.yml`. Read back asset digests and mark latest only after they match.
3. Update itch V5 Windows and mod channels using the same bytes; fetch each public download and verify its inner file hash. Leave classic V4 channels separate.
4. Prepare the public website update from current V5 source/screenshots. Route backup, deployment and readback through Sarah's shared office; an INBOX request alone is not an acknowledgement or completion. Do not alter protected tester paths.
5. Verify public website, download links, update feed, version labels and images as a visitor. Publish community posts after those links work.

Record the actual commit, CI runs, public URLs, asset hashes, itch fetches, Sarah's acknowledgement/result, and website readback **after** each action. Do not pre-fill success.
