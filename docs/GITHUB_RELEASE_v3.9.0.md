# GitHub Release — FS25 Farm Dashboard 3.9.0 (copy/paste)

Use this as the **Release description** on GitHub for tag `v3.9.0`.  
**Compared to:** public repo [WizardlyPayload/FS25-Farm-Dashboard](https://github.com/WizardlyPayload/FS25-Farm-Dashboard) (app **2.0.0** / mod **2.0.0.0**).  
**Canonical repo:** [WizardlyPayload/FarmHub](https://github.com/WizardlyPayload/FarmHub/releases).

---

## Install first (mod → app)

**Install order matters.** The Windows app cannot read your farm until the game mod has created `data.json` for each save.

| Step | What to do |
|------|------------|
| **1 — Mod** | Install **`FS25_FarmDashboard.zip`** into `Documents\My Games\FarmingSimulator2025\mods\` (zip root must contain **`modDesc.xml`**, **`icon.png`**, **`src/`** only). Enable the mod on **every** save you care about and **load that save once** in the world so `data.json` is created. |
| **2 — App** | Install **`FS25 Farm Dashboard Setup 3.9.0.exe`**, launch Farm Dashboard, complete **Settings → Servers & saves** (local folder or FTP). |
| **3 — Open** | On this PC: **http://localhost:8766**. On a phone/tablet on the same Wi‑Fi: **http://&lt;your-PC-LAN-IP&gt;:8766** (enable **LAN access** in Settings and use a strong password — see [SECURITY.md](SECURITY.md)). |

**Full guide:** [docs/INSTALL.md](INSTALL.md) · **Upgrade from 2.0.0:** [docs/UPGRADE_FROM_FS25-Farm-Dashboard.md](UPGRADE_FROM_FS25-Farm-Dashboard.md)

---

## Attach to this release

| File | Version |
|------|---------|
| `FS25 Farm Dashboard Setup 3.9.0.exe` | App **3.9.0** |
| `FS25_FarmDashboard.zip` | Mod **2.3.0.0** |

---

## Upgrade from the public 2.0.0 release

If you used the old **[FS25-Farm-Dashboard](https://github.com/WizardlyPayload/FS25-Farm-Dashboard)** repo:

1. Replace the mod with **`FS25_FarmDashboard.zip` (2.3.0.0)** and load each save once with the mod enabled.
2. Install app **3.9.0** (or let **3.9 → 4.0** auto-update after you publish 4.0).
3. Re-check **Settings → Servers & saves** (especially **FTP** servers — they always pull fresh data, no stale cache).

---

## What’s new since public 2.0.0 (full changelog)

Everything below is **cumulative** since app **2.0.0** / mod **2.0.0.0**, including the **3.0.0** product line and **3.9.0** hardening. For version-by-version detail see [CHANGELOG.md](CHANGELOG.md).

### Look & feel

- **Section background art** — Full-screen **crossfade backgrounds** per dashboard section (Home, Livestock, Vehicles, Fields, Economy, Pastures, Productions). Drop PNGs in `web/assests/img/Dashboard PIctures/` (default `Background.png`; optional per-section files).
- **Themes** — **Settings → Theme** tab: save accent/theme preferences with the rest of UI settings.
- **27 languages** — Dashboard UI strings via `messages/*.json` + `translations.json` (~987 keys); `npm run i18n:sync` / `i18n:verify` in CI.
- **Illustrated manual** — [USER_MANUAL.md](USER_MANUAL.md) + [SCREENSHOT_MANIFEST.md](SCREENSHOT_MANIFEST.md) for capture recipes.

### Fields — rules, harvest, soil, and workflow

- **Offline field rules engine** (`rules-engine.js`) — Primary **“Suggested next step”** on each field card from merged Lua + XML (harvest, lime, fertiliser, weeds, rolling, post-harvest pipeline, fleet vs shop tool hints). No cloud service.
- **Field rules cache** — Rules refresh in the background; cards update when cache rebuilds.
- **Mulched ground** — Rules now require **cultivation before seeding** (no direct-drill suggestion on mulched stubble).
- **Lime suggestions** — Show **pH gap** to target (e.g. current **5.8** → target **6.5**, gap **0.7**).
- **Harvest / post-harvest accuracy** — Better handling of **harvested**, **mulched fallow**, and stale XML `harvestReady`; realtime respects **active server** so another farm’s data does not overwrite your view.
- **Field display clusters** — **Settings → Dashboard**: auto-merge adjacent same-crop fields or manual cluster groups; merged cards on the Fields tab.
- **Field exclusions** — Hide specific farmland IDs per server from the Fields list.
- **Precision Farming** — When the save exports PF data: N/pH bars, scan state, target gaps on field cards (unchanged core from 2.x, documented and refined in 3.9).

### Fields — forage, windrows, and bales (mod + UI)

- **Windrow export** — Per field: **`windrowLiters`**, **`windrowType`** (Straw / Grass / Hay), sampled volume badge on the card.
- **Loose forage detection** — Separate probes for **loose straw**, **grass windrow**, and **hay windrow** (`looseStrawLiters`, `hasLooseGrassWindrow`, `hasLooseHayWindrow`, etc.).
- **Bale detection** — **`baleCountOnField`** from in-game bale scan; **bale count badge** on field cards.
- **Forage badges on cards** — Visual tags for **bales on field**, **loose straw**, **grass/hay windrow**, **baleable loose**, and **windrow material** (with liter totals where available).
- **Rules aligned with badges** — Ted/bale/finish-grass suggestions suppressed when forage badges are hidden; **2000 L workflow floor** so tiny leftover patches do not block the next job or show misleading badges.
- **Bale inventory (export)** — Mod can export **`baleInventory`** aggregates (on-field vs off-field by category) for economy/rules context.
- **Mod windrow engine** — Density-map height util probes, `windrowByFillName`, staggered field collection; `pcall`-safe on mod conflicts.

### Livestock & pastures

- **Livestock detail API** — On-demand pen detail files (`details/animals_*.json`), dirty-pen index, bounded request queue for large herds.
- **LOD / fan-out** — Large clusters split to per-head rows for the table (caps to protect the browser).
- **Pasture warnings rework** — **Telemetry missing** (info) vs **critical low stock** (warning/danger) are separate; head-aware counts.
- **Pasture & livestock UI** — Card labels, drilldowns, dairy pairs; game-sourced names escaped for safety (3.9).

### Vehicles & economy

- **Mod shop image export** — Setup / Settings: scan FS25 `mods` folder → **`items_mod_extract/`** PNGs (PowerShell + optional texconv).
- **Vehicle thumbnails** — Curated `items/` + mod-extract matching on vehicle cards.
- **Economy / changes** — Market and data-change views hardened (escaped strings in 3.9).

### Data pipeline & multiplayer

- **Lua + XML merge** (2.0 foundation) — Live `data.json` merged with savegame XML; **Lua wins** for `harvestReady`, `needsWork`, field suggestions when both exist.
- **Single-player / host authority** — Mod writes on SP and MP host/dedicated (not stale MP client exports).
- **Staggered mod collectors** — One module per slice over `collectionCycleMs` (~60s default); tunable in `config.xml`.
- **FTP polling** — Sync or staggered multi-server schedule; configurable delay and interval.
- **Multi-farm** — Farm selector for FTP and multi-farm local saves; filter fields/vehicles/animals by active farm.
- **Offline snapshot (3.9)** — **Local** servers: last merged data restored on app restart. **FTP** servers: always wait for fresh download (no stale cache).
- **Browser snapshot** — `localStorage` cache of last merged payload for faster cold open.
- **WebSocket + HTTP** — Live updates on port **8766**; dedupe keys include **server + farm** so switching farm/server refreshes correctly.

### Settings, setup, and SimHub

- **Unified Settings** — **Gear → Servers & saves** (paths, FTP, LAN, section toggles, field clusters, exclusions, SimHub layout).
- **Setup validation** — Per-field errors, success card before redirect; mapped FTP/auth/path messages.
- **SimHub read-only page** — `simhub.html` for a slim second-screen view (follows desktop farm/server selection).
- **Section toggles** — Enable/disable Home, Livestock, Vehicles, Fields, Economy, Pastures, Productions per preference.

### Security & LAN (3.0 + 3.9)

- **LAN access** — Optional bind to `0.0.0.0`; **HTTP Basic** + optional **IP allowlist**.
- **Strong LAN passwords (3.9)** — Rejects default **`admin` / `farmhub`**, passwords under 10 characters, and known-weak passwords when LAN is enabled.
- **Optional LAN auth mode** — Documented trade-off; warning banner when enabled.
- **DOM XSS hardening (3.9)** — Shared `escapeHtml` across pastures, livestock, vehicles, fields, economy, notifications.
- **Secrets** — FTP passwords not returned in API GET; setup write token for browser setup saves.

### Windows app, build, and updates

- **NSIS installer** — Language-first installer; aggressive process cleanup on upgrade; optional **wipe user data** on uninstall.
- **Build output** — Default `npm run dist` writes outside repo (`%LOCALAPPDATA%\fs25-farm-dashboard-electron-out`) to avoid file locks.
- **Auto-updater** — `electron-updater` from GitHub Releases (**FarmHub**); download + install on quit when packaged.
- **CI (3.9)** — GitHub Actions: `npm test`, `verify:electron-pack`, `i18n:verify`, `npm audit --omit=dev`.
- **Packaging fixes** — `livestockDetail.js`, `detailAnimalsHydrate.js`, `icon.ico` included in packaged app.

### Documentation & repo

- **FarmHub** repo — All docs under `docs/`; install, security, developer handover, updater QA, upgrade guide from old public repo.
- **Mod zip layout** — Release zip contains only Giants-expected root files (`modDesc.xml`, `icon.png`, `src/`).

---

## Known limitations

- **FTP** — Requires working FTP path and fresh polls; XML merge needs downloaded savegame files.
- **LAN** — No TLS built-in; use only on trusted home networks with strong credentials.
- **Vehicle thumbnails** — Heuristic matching; some mods may not match perfectly.
- **Mod version banner** — Planned for a future release (compare app vs mod version in Settings).

---

## Reporting issues

Include: FS25 version, SP vs dedicated, **app 3.9.0**, **mod 2.3.0.0**, local vs FTP, steps to reproduce.

**Authors:** [AUTHORS.md](AUTHORS.md)
