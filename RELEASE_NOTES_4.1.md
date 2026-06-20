FS25 Farm Dashboard 4.1.2

App 4.1.2 · Mod 3.3.21.0 · Windows 10/11

Download on this page: FS25 Farm Dashboard Setup 4.1.2.exe + FS25_FarmDashboard.zip (+ latest.yml for auto-update)

---

## What's new in 4.1.2 (fix)

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

Full changelog: [docs/CHANGELOG.md](docs/CHANGELOG.md) §4.1.2
