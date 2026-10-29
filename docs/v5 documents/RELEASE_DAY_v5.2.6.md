# Farm Dashboard V5 5.2.6 — release handoff

**Status:** accepted local candidate, not yet published. Public GitHub, itch and website remain at 5.2.0 until the publication sequence is completed. Do not describe this file as proof that public downloads have changed.

## Exact candidate

Flat local drop: `C:\Users\Graham\Documents\FarmDash Release\`.

| File | Size | SHA-256 |
| --- | ---: | --- |
| `FS25-Farm-Dashboard-V5-Setup-5.2.6.exe` | 384,047,455 bytes | `36EF71B661286280611FC4AE5CEAD576ADC90153246DBE8BBA9A0B940DFFEE21` |
| `FS25_FarmDashboard.zip` | 470,369 bytes | `9D51ACA937BE74D42427923A8A3FE78F44DF2FE34D6B3C5770B1ABD2779A1064` |
| `farmdashboard-website-5.2.6-upload.zip` | 305,391,239 bytes | `F45B08914786BC3CBF060960CF09539271BAB38BE67D1262E335B6A40C7A8AA3` |

The installer SHA-512 for the V5 update feed is `AR0u/6THQSTMWljaF97zKcqc7OqBWwGn7ebLCMDLKrvU14ccbpXD9B00tCGAywhvqo8jbClRZaRf9v5zaPLl9g==`. A separate `latest-rf-5.2.6.yml` is staged locally. The public/local `latest-rf.yml` remains at 5.2.0 until publication. Never substitute the V4 `latest.yml`.

The website package is a local successor to the verified 5.2.0 public package: 15 public text files have 5.2.6/5.1.0.12 labels and selected screenshot references, and 53 installed-app screenshots were added under `assets/screenshots/current-526/`. It has 179 entries, passes ZIP CRC, contains no `/t/` tester paths or installers, and every referenced screenshot resolves within the package. Existing scroll/detail shots remain where there is no equivalent new capture; do not claim an exhaustive 5.2.6 website image recapture. Sarah must independently back up and validate the target before deployment.

## Acceptance and boundaries

- **PC Catuaí:** exact mod and installer installed; one native Windows V5 row; committed generations 1–7 without Farm Dashboard Lua errors. All 208 coffee and 17 banana orchard rows reported owned by farm 1. Coffee farmlands 88, 89, 90, 91, 92 and 105 were farm 1. The Orchards image was visible.
- **Ally DLC-526:** exact hashes installed; one native Windows row. Disposable Kinlaig saved once, manually discovered, and showed its map image and Highlands zero card. Disposable Riverbend showed Pumps N' Hoses and Emergency cards, which hid when their packs were unchecked. Exports committed generations 1–3 with no Farm Dashboard Lua errors. Tina restored the Ally's previous state and verified protected game files.
- **Ally DLC-527:** the Highlands card appeared with the pack checked on a base-game map and disappeared after a game reload with it unchecked. The installed full-screen app showed Save overview, Pastures, Fields, Productions and Fleet map images. Native **Keep data** uninstall removed the app and Windows row; reinstall of the same exact setup returned one row and retained linked sources. Tina again restored the Ally's prior app, profile, ZIP and game settings, with 517 modSettings files and 484 mod-folder entries matching the originals.
- **Limits:** these bounded tests do not prove every DLC's nonzero mechanics, every mod combination, a Full-data uninstall, or a new two-client dedicated session for this exact pair. New local saves currently require manual Auto-Detect after their first save. Core/companion help images were recaptured at 1920 × 1080 from the installed 5.2.6 app with held demo exports; Settings images still show 5.1.17 and new DLC full-screen screenshots remain to capture.

Detailed observations and source limits: [DLC coverage audit](../DLC-COVERAGE-AUDIT-2026-10-28.md). This document must not turn static coverage proposals into tested gameplay claims.

## Publication order

1. Commit and push the 5.2.6 source, player help, release notes and screenshots to `main`; verify GitHub CI on that exact revision. Recheck installer/mod hashes against the flat drop and inspect the staged V5 feed.
2. Publish GitHub Release `v5.2.6` with the two exact binaries and staged `latest-rf.yml`. Read back asset digests and mark latest only after they match.
3. Update itch V5 Windows and mod channels using the same bytes; fetch each public download and verify its inner file hash. Leave classic V4 channels separate.
4. Prepare the public website update from current V5 source/screenshots. Route backup, deployment and readback through Sarah's shared office; an INBOX request alone is not an acknowledgement or completion. Do not alter protected tester paths.
5. Verify public website, download links, update feed, version labels and images as a visitor. Publish community posts after those links work.

Record the actual commit, CI runs, public URLs, asset hashes, itch fetches, Sarah's acknowledgement/result, and website readback **after** each action. Do not pre-fill success.
