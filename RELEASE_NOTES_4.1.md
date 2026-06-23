FS25 Farm Dashboard 4.1.5

App 4.1.5 · Mod 3.3.21.2 · Windows 10/11

Download on this page: FS25 Farm Dashboard Setup 4.1.5.exe + FS25_FarmDashboard.zip (+ latest.yml for auto-update)

---

## What's new in 4.1.5 (fix)

- **Correct equipment pictures**: some vehicles/implements showed the wrong picture because the dashboard guessed the image from the display name and could land on a similar sibling/variant. The mod now tells the app the game's own store-icon for each vehicle, and the app matches it **exactly** before any guessing — so base-game equipment is right out of the box. **Requires the new mod (3.3.21.2).**
- **Mod-image tool upgrade**: the "Scan mod images" tool now names extracted pictures by their authoritative store-icon, so your mod equipment matches exactly too. Re-running it automatically converts any images extracted by older versions (renames them and removes the old copy — no duplicates).
- **Duplicate vehicles fixed**: the fleet tab could list the same vehicle twice on dedicated servers (live vs saved positions) or briefly show other farms' equipment. Merge now uses config file + farm; the grid stays scoped to your active farm.

## Carried over from 4.1.4 (fix)

- **Courseplay menu crash fixed**: after buying a vehicle, opening the Courseplay combine-unloader menu could crash with `CpAIJobCombineUnloader.lua:93: attempt to call missing method 'isa' of table` (single-player and dedicated host). The mod now answers Courseplay's station type-check safely for not-yet-loaded objects, so the menu opens normally.
- **Livestock table matches the totals**: on some RealisticLivestock multi-pen barns the summary/pen total was higher than the number of animals actually listed in the table. The dashboard now keeps the pen's real total and lists the herd against it, so the table, pen card, and summary all agree.
- **Mown grass fields read correctly**: a grass field you just cut showed "Growing · stage 2/4" instead of harvested. It now shows a **Harvested** badge and a **Mown · regrowing** bar, matching the game.

## Carried over from 4.1.3 (fix)

- **Livestock counts now match the game**: on some RealisticLivestock pens the dashboard was showing far fewer animals than the game (e.g. a Milking Parlour reading **7** when the game showed **71/100**). Pen cards and the livestock summary now show the right numbers.

## Carried over from 4.1.2 (fix)

- **Mod-config save no longer wipes your mod settings**: editing mod settings inside the desktop app used to rewrite the whole `config.xml`, silently resetting Red Tape, stock, diagnostics, and all performance tuning to defaults. The app now merges your change into the existing file and preserves everything else.

## Carried over from 4.1.1 (security + offline)

- **Security — CORS lockdown**: only this PC (loopback + your own LAN IP on the dashboard port) and the official farmdashboard.co.uk domains can make cross-origin requests. Fixes a flaw where any website served on port 8766 could read your dashboard data.
- **Security — less exposure**: `/api/status` now returns map/count metadata only (save name removed); the HTTP API has an explicit request-size limit.
- **Mod version fix**: the in-app mod version now reports **3.3.21.0** (previously showed 3.3.20.0) and matches modDesc.
- **Offline last-known state**: field moisture, environment moisture, and bale moisture persist when the game/server is closed, so you can browse and pick a save/server.

## Carried over from 4.1.0

- **Fleet map** — live vehicle pins on PDA overview; pan/zoom; multi-farm legend
- **Economy → Storage** — silo stock, bale inventory (field vs shed), pallets
- **Integrations** — ADS vehicle panels, Moisture System field badge, Red Tape compliance tab
- Updated [USER_MANUAL.md](docs/USER_MANUAL.md)

Full changelog: [docs/CHANGELOG.md](docs/CHANGELOG.md) §4.1.5
