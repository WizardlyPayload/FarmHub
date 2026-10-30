# Farm Dashboard V5 5.2.12 candidate handoff

30 October 2026. This records a **local candidate**, not a published update. The public website and GitHub release remain on their separately approved versions until Graham authorises publication.

## Exact artifacts

- Windows app installer: `C:\Users\Graham\Documents\FarmDash Release\FS25-Farm-Dashboard-V5-Setup-5.2.12.exe`, SHA-256 `0F7E1F5F84E5E2A7828438EC12B6BD2A71D1478A5701EC9E06BAD12E2255AEA6`.
- Canonical game mod: `C:\Users\Graham\Documents\FarmDash Release\FS25_FarmDashboard.zip`, version `5.1.0.14`, SHA-256 `82D7CB0E4592A36595C1B2C78283BE7FE13EE87C43C53D8BE0097EFD3A119AFE`. The installed game ZIP matched this hash during the Catuaí test and after the app upgrade.
- Supported-mods website **staging package**: `C:\Users\Graham\Documents\FarmDash Release\farmdashboard-website-supported-mods-v2-staged.zip`, SHA-256 `2CEDC899A53718E4E6A30BC388497D5BCAE3B6317F8177F93FC5DA5CEFC82DD6`. This is based on the public 5.2.7 site package and does not publish the 5.2.12 app.
- Earlier test installers 5.2.8–5.2.11 were archived in `%TEMP%\farmdash-superseded-candidates-20261030`; the older public/candidate files from 5.2.0–5.2.7 were retained.

## What changed and what was checked

- Stable local save identity and selected-career recovery: Catuaí remained selected across installed app upgrades and restarts. The dashboard config SHA-256 stayed `18EDD7EF9E44A2F92F7B955348C83158800B07BE974839F646C1707FEC83E1E2`.
- Saved production sites: the XML parser reads nested career settings and owned production sites. With FS25 closed, the installed 5.2.12 app showed 16 Catuaí chains. Stale live activity badges say **at last export**; save-only cards identify values from the last game save.
- Orchard map: the mod exports separate banana and coffee row outlines, avoiding a hull over unrelated fields. On Catuaí save slot 17, 22 export generations were committed in the live test, 17 banana and 208 coffee four-point outlines appeared, and no Farm Dashboard Lua error was observed in the targeted log. The installed map image and row shapes were visually checked. That live test used the same `5.1.0.14` mod, with the then-current 5.2.9 app; the 5.2.12 app was installed and checked against its retained export without restarting FS25.
- Map key: crop colors come from loaded fruit types, ownership from the FS25 farm palette, growth and base soil states from FS25's default map colors, and weed/stone shades from the loaded map. The installed 5.2.12 app showed five weed and three stone levels, a matching native stone overlay, and no obsolete relative gradient for the native layers. Precision Farming and Soil Fertilizer remain dashboard-specific per-field readings.
- Focused checks: 6 Jest suites, 39 tests passed, including orchard geometry, source discovery, saved productions, map palette and field overlays. V5 UI TypeScript check passed. The package guard verified 3386 `app.asar` entries and 90 unpacked files, the fresh UI manifest, and the V5-only update channel. This is **not** a claim that the entire historic test suite or every mod combination passed on 5.2.12.
- Installer: silent per-user upgrade exited 0; Windows showed one native `FS25 Farm Dashboard V5 5.2.12` uninstall entry. The local dashboard profile and FS25 save remained intact. No uninstall/reinstall cycle was run for this exact candidate.
- Website: 36 integrated companion pages plus an index, based on 65 catalog rows (8 direct, 28 partial, 29 reference/detected only). The staged ZIP passed CRC, contained 221 entries, and all local links on the 37 new pages resolved inside the package. Shared-shell references use a new cache key. No public deployment has been verified.

## Pending publication and operations

Sarah request `SARAH-20261030-001` is in `Z:\OpenClaw\Sarah Office\INBOX.txt` for a targeted website addition with backup, protected tester-tree preservation and public readback. There was no matching Sarah OUTBOX result at handoff time. An inbox entry alone is not approval or completion.

Do not upload this app installer to GitHub/itch or change the updater feed until Graham's release go-ahead. Route any VPS work through Sarah. Before publication, reconcile the final source commit and artifact hashes, verify the public website response after Sarah's result, and prepare exact 5.2.12 release notes and manual links.
