# V5 tester guide: record what actually happened

This checklist is for the **5.1.18 app / 5.1.0.9 mod candidate**. The public V5 release may differ, and classic V4 is not part of this V5 test unless a separate V4 run is requested. Follow [Install V5](INSTALL.md), then use [the manual](USER_MANUAL.md) and [optional-mod guide](COMPANION_MODS.md).

## Before you test

- Record the exact installer filename and mod ZIP version/hash. Do not call a source fix installed until the installed copy matches.
- Keep **one** canonical `FS25_FarmDashboard.zip` in the FS25 mods folder. Never add a version-suffixed duplicate.
- Record the map, save slot, farm and which optional mods are **loaded for that save**. A ZIP merely installed is not loaded.
- Preserve the save. Do not clear modSettings, unlink a server, reinstall, or replace a live game mod as a casual test step.
- For each screenshot, hide FTP passwords, pairing secrets and private player names.

## Single-player acceptance

1. Install the V5 app and game mod. Confirm the app opens the **new sidebar**, not a blank blue window or classic cards.
2. In a base save with only Farm Dashboard, confirm Overview, Fields, Vehicles, Pastures, Productions, Storage, Economy and Fleet map open without ghost RF tabs.
3. Load into the world and wait for **two completed export generations**, not merely a growing file. Record Health's generation, receipt time and any error.
4. Check the map name, farm money and a handful of field/vehicle/animal values against the game.
5. Exit the game without saving if this is a disposable test. Confirm the last good snapshot becomes **held/stale**, rather than disappearing or pretending to be live.

## Optional-mod combinations

1. Test a base save, a Precision Farming save, an RF/Soil Fertilizer save, and at least one mixed-companion save **separately**. Do not treat one big all-mod save as proof of independence.
2. Turn attention to the mod's actual dashboard surface listed in [Optional mods](COMPANION_MODS.md). A detected/reference-only entry does **not** have to produce made-up values.
3. Remove one optional mod from a disposable save and confirm its page/card disappears while unrelated readers continue. Never edit a valuable save for this check.
4. For Fields, ensure Precision Farming and Soil Fertilizer are not added together. Organic matter is 0-10, not 0-100%.
5. For RF tax/income/worker/NPC readings, note if the companion itself shares values across farms. Do not report them as per-farm when the source is global.
6. For Vehicle Mileage, Years, Courseplay, ADS, Red Tape, Hire purchase and Invoices, look at their dedicated/folded screen rather than relying only on the general companion catalog badge.

## Dedicated multiplayer acceptance

1. Confirm **same canonical mod version** on server and joining clients.
2. Join the actual server in FS25. Accept a fresh **Link this server** or re-pair challenge; do not silently revive an old same-name source.
3. With two clients in the same save, record a server committed generation and the generation seen by each V5 app. Local source IDs can differ; the server career/session/generation should agree.
4. Compare map, money, fields, vehicles, animals and companion presence. One transient transfer warning can recover; repeated warnings or stuck generations are a failure.
5. Exit each client. Check the retained MP source becomes held/stale after its freshness period. Keep old Local saves distinct from the linked replica.
6. If testing FTP, treat it as a **separate** route. Confirm a completed poll and data receipt with nobody connected.

On 14 October 2026, the PC and Ally live phase reached server generation 16; the PC continued to 17 and correctly became held after exit. Tina's explicit **Ally post-exit held** receipt was not returned in that run, so do not mark that one row passed by inference.

## Install, update, and removal

- Windows **Installed apps** can remove V5. Test **Keep data** and **Full removal** on a disposable profile; verify the save and V4 remain untouched.
- V5 update checks stay on `latest-rf.yml`. Do **not** upload V5 onto V4's `latest.yml` or tell V4 users they were upgraded.
- Optional ImageMagick failure must not block ordinary farm-data use. Do not promise external ImageMagick will be removed unless that specific installer ownership was verified.
- Test a clean profile separately from an upgrade. A remembered pairing or old Local row is not first-run proof.

## Report template

```text
App version / installer filename:
Farm Dashboard mod version and ZIP hash:
Map, save slot, farm, source name:
Single-player / host / dedicated client / FTP:
Loaded optional mods (not just installed ZIPs):
Health: source state, export generation, last receipt:
What I clicked:
What I expected:
What happened, including exact warning or error:
Screenshot path (secrets removed):
Game log time and dashboard time:
```

A passed source check does not prove package, installed lifecycle or release publication. Graham makes the final release decision.
