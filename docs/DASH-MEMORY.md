# Dash memory (FarmHub)

Cold-start bank for the **Dash** FarmHub product seat. Skimmable bullets only. Dated lessons go here; long narrative history lives in [DASH-TIMELINE.md](./DASH-TIMELINE.md). Do **not** write FarmHub chatter into RF `ecosystem-dev-tracking/`.

**Last deep refresh:** 2026-07-28 (git + docs + transcript sample).

---

## 1. Who Dash is / lane

- **Dash** = FarmHub / Farm Dashboard product seat for Wizard (WizardlyPayload). Not Ash / Claude / Samantha / George.
- **Owns:** this repo only (`FS25_FarmDashboard_Mod/`, `FS25_FarmDashboard_App/`, `NEW APP/`, `docs/`, packaging, GPortal upload for **this** mod, V4 classic 4.x + V5 rebuild channels).
- **Does not own:** Realistic Farming companion/core repos, FarmTablet, RF ledgers/MEMORY. Reading RF handles **inside** FarmHub collectors is fine when integrating; editing RF upstream is not.
- Persona: [DASH-PERSONA.md](./DASH-PERSONA.md) · Cursor rule: `.cursor/rules/farmhub-persona-dash.mdc`
- Public name is always **Wizard** (never the real first name in team-visible artifacts).

---

## 2. Product map

| Piece | Path | Role |
|-------|------|------|
| Lua mod | `FS25_FarmDashboard_Mod/` | Authority-only export → `data.json`; staggered collectors; settings; RF soft-detect collectors under `src/collectors/rf/` |
| Electron app | `FS25_FarmDashboard_App/` | Merge, FTP/local watch, Express `:8766`, classic `web/`, packaging, i18n catalogs |
| NEW APP | `NEW APP/` → packaged `ui-v2/` | **Primary** dashboard UI (Preact/TS/Vite) |
| Classic web | `FS25_FarmDashboard_App/web/` | **V4 only.** V5 ships NEW APP (`ui-v2`) and must not fall back to classic HTML shells. Leave classic modules alone unless Wizard asks |
| Docs | `docs/` | Manuals, releases, security; Realistic Farming *suite* kit in `docs/rf-suite/` (FarmHub-only) |
| Tools | `tools/` | Mod zip, ui-v2 copy, GPortal upload, electron-builder helpers, assert RF channel |

**Historic typo:** assets live under `web/assests/` (keep that spelling).

**Lineage:** Seeded from [JoshWalki/FarmDashboard](https://github.com/JoshWalki/FarmDashboard) by **file copy** (no shared git history). ~22% of original lines survive near-verbatim; ~3–4% of today’s tree. Electron + entire NEW APP are FarmHub-only. Cite: [JoshWalki retention](68ae98fb-498f-4f77-89f9-868166307233). Authors: JoshWalki + WizardlyPayload (`docs/AUTHORS.md`).

### Dual installers (same product)

| Line | App / mod | Auto-update | Output |
|------|-----------|-------------|--------|
| **V4** (classic 4.x) | `package.json` **4.2.2**; classic screens; Start Menu **Farm Dashboard V4** | **`latest.yml` only** | Private candidates under `Documents/FarmDash Release Candidates\`; do not treat `FarmDash Final Output` 4.2.1 as this rebuild |
| **V5** (rebuild 5.x) | App **5.0.5** (working tree) via `electron-builder.rf.yml` `extraMetadata` (package.json stays 4.2.2); last GitHub public **5.0.3**; shortcut **Farm Dashboard V5**; same in-game mod zip works with both | **`latest-rf.yml` only** — never V4 | **`Documents/FarmDash Release/`** (flat zip + V5 Setup.exe) |

Never put the V5 Setup.exe on V4 `latest.yml`. Guard: `tools/app/assert-rf-update-channel.mjs`. Story: [`COMPATIBILITY.md`](./COMPATIBILITY.md). Tester checklist: [`TESTERS.md`](./TESTERS.md). Do **not** call V5 “RF edition” in product-facing names.

**Version numbers (Wizard, 2026-09-13)** — app is `MAJOR.PUBLIC.DEV` (`electron-builder.rf.yml` `extraMetadata.version`):

| Part | Meaning | When it changes |
|------|---------|-----------------|
| **MAJOR** | Product generation (5 = V5 rebuild) | Rare; new product line |
| **PUBLIC** | GitHub (and matching itch) release | Every time a new version is published on GitHub |
| **DEV** | Local / tester working-tree stamp | Every app change after the last GitHub release; **reset to 0** on the next GitHub publish |

Last GitHub public: **5.0.3**. This working tree: **5.0.5**. Next GitHub publish: **5.1.0**. Mod zip is four-part (`5.0.0.x` in `modDesc.xml`); bump its last number only when the Lua zip actually changes. Do not stamp a working-tree installer with the same three-part version as GitHub Latest.

**Ports / demos:** installed V4 `:8766` (`%APPDATA%\fs25-farm-dashboard`); installed V5 `:8768` (`%APPDATA%\fs25-farm-dashboard-rf`); repo NEW UI `:8767` (`%LOCALAPPDATA%\fs25-farm-dashboard-dev`) via `npm run dev:new-ui`. Do not proxy Vite at `:5173` to installed `:8766` when testing new merge/collectors.

#### 2026-09-13 — V5 5.0.5 DEV (Riverbend collectors, not GitHub yet)
- In-game `loadSharedI3DFileFinished` red text was `FarmDashboard.lua:87` calling `:init()` after extraSourceFiles failed (incomplete unpacked `mods/FS25_FarmDashboard` folder). loadMap is now pcall-guarded.
- Live `config.xml` had **fields / economy / production off**, so merged fields, RF map overlays, and productions vanished. ESC settings clone could persist Off; inject no longer writes on setState. One-shot collectionSafetyV7 turns those three back on.
- Dairy Core cards use placeable `getName()` instead of truncated uniqueId.
- App **5.0.5**, mod **5.0.0.4**. GitHub stays **5.0.3**. Rescued from closed #7 tip `390db3ae`; ui-v2 lock stayed on main via #14.

#### 2026-09-13 — V5 5.0.4 DEV (not GitHub yet)
- App **5.0.4** after GitHub **5.0.3**. V5 no longer packs or serves classic `web/index.html` / root `setup.html`. New screens only. Mod zip still **5.0.0.3** (no Lua change). Drop: `Documents/FarmDash Release\FS25-Farm-Dashboard-V5-Setup-5.0.4.exe`.

#### 2026-09-10 — Rebuild V5 5.0.3 (replace 8 Sep 5.0.2 upload)
- GitHub **Latest** is still **v5.0.3** until the next public publish. Classic `latest.yml` (4.2.1) stays on that release so V4 auto-update is **not** offered V5. Tag `v4.2.1` remains for classic download. Tag **v5.0.2** was the 8 September tester drop; those binaries were removed from the tag. Published Setup SHA256 `C01D9AEF…DBFA59`.
- itch files: butler channels `windows-v5` (5.0.3) and `mod-v5` (5.0.0.3). Public description uses **img.itch.zone** URLs — itch strips off-site `<img>` (farmdashboard.co.uk shots show as source text). Copy lives in `docs/_internal/itch-io-*.html`.
- Site map page: `map.html` with `v5-section-fleet-map-010.png` + layers dropdown `v5-section-fleet-map-020-layers-dropdown.png`. Nav label **Map**.
- Site Discord (2026-09-10): header is **Home / Try now / Screens / Install / Discord / Download**. On `screens.html` and each screen page the bar switches to **Home + Fields / Pastures / Vehicles / Storage / Map / Economy**. Invite: `https://discord.gg/qsSTRwG2`.

#### 2026-09-09 — Marketing site V5 + scrolled shots
- Public site (`Website/`, gitignored) is V5-faced on farmdashboard.co.uk. Deploy via Ops-Centre jump (`hank@204.168.216.158`) to website CX33 `89.167.97.146` — direct SSH from Wizard's PC times out.
- Scrolled V5 PNGs: `docs/v5 documents/doc-screenshots/v5-*-scroll.png` from Riverbend savegame2 (suite mods on). Capture: `node "docs/v5 documents/capture-v5-shots.mjs" --pack suite`.
- Vanilla / base-game pack (`v5-base-*`, `--pack base`) still needs Wizard to load FS25 with **only** Farm Dashboard enabled. Do not fake vanilla by cropping the suite sidebar.

#### 2026-09-08 — V5 5.0.2 tester drop
- App **5.0.2** + mod **5.0.0.2** in `Documents/FarmDash Release` (flat). Setup SHA256 `CCF96565…ADF9B9`. Hall-stock Fertilizer Depot, map overlays / hover, GPS-only field cards. Do not overwrite public V4 `FarmDash Final Output` 4.2.1. Unsigned.

#### 2026-09-07 — Setup buttons at top (V5)
- Working drop (zip + exe, one folder): `Documents/FarmDash Release`. V5 Setup `FS25-Farm-Dashboard-V5-Setup-5.0.1.exe` SHA256 `82575B7D…9DC2BB`. Server Manager actions sit at the top of first setup. Do not invent dated candidate folders for Wizard-facing drops. Public `FarmDash Final Output` `latest.yml` still **4.2.1**.

#### 2026-09-07 — V4 / V5 naming pack
- Private candidate: `Documents/FarmDash Release Candidates/2026-09-07-v4-v5-naming`. Start Menu **Farm Dashboard V4** / **Farm Dashboard V5**. Installer `FS25-Farm-Dashboard-V5-Setup-5.0.1.exe`. Public `FarmDash Final Output` `latest.yml` still **4.2.1**.
- User-facing names are **Farm Dashboard V4** and **Farm Dashboard V5**. Install identity is unchanged (`appId` `com.farmdashboard.rf`, profile `fs25-farm-dashboard-rf`, feed `latest-rf.yml`) so existing 5.0.x installs still update.
- Current-user V5 setup still installs ImageMagick: it shows the normal Windows permission prompt for the vendor installer. Do not skip ImageMagick because the setup is per-user.

#### 2026-09-05 — Installed V4+V5 coexistence
- Shared port 8766 + shared single-instance lock made V5 quit while V4 was open. V5 now has its own profile, AppUserModelId, lock payload, and port **8768**. V4 Launch Dashboard must call `launch-dashboard` IPC (save-settings does not navigate when reboot is skipped).
- Uninstall cleanup is version-scoped (`-Edition V4|V5`). Do not test Full uninstall against Wizard’s live V4 AppData.
- Previous private candidate: `Documents/FarmDash Release Candidates/2026-09-05-remediation-coexist`. Public 4.2.1 stays untouched.

#### 2026-09-05 — Fleet vs weather (WP-07)
- Fleet count is equipment only. Consumable pallets/big bags/IBCs are Storage. Pallet forks and bale-and-pallet trailers stay in Fleet. Unresolved owners are not guessed from farm totals.
- Current weather is the merged engine `weather` block. Weather Guard is labeled companion telemetry and must not replace snow/sun/cloud. Do not invent ±5 °C forecast bands or a default 20 °C / sun export.
- Private candidate with those fixes: `Documents/FarmDash Release Candidates/2026-09-06-wp07-fleet-weather` (V4 4.2.2 / V5 5.0.1, RF-named Setup at pack time). Do not overwrite coexist or public 4.2.1.

---

## 3. Timeline / eras (short)

Full dated eras → [DASH-TIMELINE.md](./DASH-TIMELINE.md).

| When | Era |
|------|-----|
| Pre–2026-04 | JoshWalki FarmDashboard + public WizardlyPayload/FS25-Farm-Dashboard **2.0.0** |
| 2026-04 | FarmHub git born (`origin` WizardlyPayload/FarmHub); Electron/FTP/path hardening; OneDrive/Xbox paths |
| 2026-05 | Audits → **3.9** security → **4.0** public updater line |
| 2026-06 | **4.1.x** tester drops → **4.2** public (storage, farmscope, Witcombe fill gaps) |
| 2026-07 early–mid | Join-as-client mirror; NEW APP multi-agent rewrite (`ui-v2`); parity work |
| 2026-07-26 | V5 **5.0.0** cut (then labelled RF edition on disk); dual channel; soil `rawget` fix |
| 2026-07-28 | Mod **5.0.0.1** `copyFile` Bool-only; Dash persona + this memory |

**Git on this remote:** ~160 commits, 2026-04-06 → ~2026-07-08 on `main` tip; tags `3.9`, `4.0`, `4.2`. Large post-tag work often **local/uncommitted**. Published GitHub Latest (as of refresh): **4.2 BETA** tag. RF Setup + `latest-rf.yml` exist **locally**; RF public publish still open.

---

## 4. Architecture truths

```
FS25 (authority) → staggered collectors → data.json
       ↓ fs.watch / join-as-client mirror / FTP poll
Electron main → dataMerger + mergedSnapshotHold → Express/WS
       ↓
Classic web/  OR  NEW APP (ui-v2) when flagged
```

- **Authority-only export:** SP / MP host / dedicated write; MP clients do not own the full export (mirror is the dedicated-without-FTP path).
- **Stagger:** one collector module per slice over `collectionCycleMs` (default 60s). Aggregate-first; no dense coordinate dumps.
- **Merge:** Lua + savegame XML; farm-scope prune (dealership / pool-100 clutter); fill-type catalog gaps (Witcombe sparse indices).
- **Hold:** `mergedSnapshotHold.js` keeps sparse live sections from flickering empty — but **must not** restore soft-detect `enabled: false` as “empty” (Red Tape ghost tab lesson).
- **Map overview:** optional DDS copy into `modSettings/.../mapOverview/` for fleet map; latch failures so mid-cycle does not retry forever.
- **ui-v2:** `npm run build:ui` → `FS25_FarmDashboard_App/ui-v2`; Electron resolves ui-v2 then `NEW APP/dist`.
- **Dedicated data preference:** join-as-client Local watch first; FTP = Advanced / headless.
- **Giants:** single-thread Lua; `pcall` density/API; never deep-walk mission graphs into JSON; custom `toJSON` (acyclic plain tables only).
- **RF soft-detect:** read mission handles with `_G.g_currentMission` (not `rawget(_G, …)` — sandbox nil). Never write RF state from FarmDashboard.
- **Fertilizer Depot stock (1.0.4.33 hall):** dumped fill is Giants `ProductionPoint` bins (`getFillLevel` / `getCapacity`). `getStorageInfo` is the walk-in 50k shop book only. Dashboard must read the hall.

---

## 5. Standing house rules

- **NEW APP primary** for screen bugs/features; classic `web/` only if Wizard asks (no silent backport).
- **i18n:** add English in `FS25_FarmDashboard_App/web/locales/messages/en.json` → `i18n:sync` → `i18n:fill` → `i18n:build` → `i18n:verify`. Raw keys on screen = catalog not rebuilt.
- **Build after major work:** V5 zip + Setup.exe go **flat** in `Documents/FarmDash Release` (that is the drop Wizard opens). V4 public feed stays in `FarmDash Final Output`. Do not create dated candidate folders unless asked.
- **GPortal:** `npm run upload:gportal-mod`; secrets in `.cursor/secrets/gportal-ftp.env` (gitignored). **Never** leave `.part` / incomplete names in remote `mods/` — stage outside mods, rename when done.
- **copyFile / Giants Bools:** arg3 is **Bool only**. No Number `1`/`0` “compat” trials (`pcall` still prints type errors).
- **Commits/pushes:** consent-gated. Do not push FarmHub or RF unless Wizard asks.
- **Dual-ledger:** FarmHub RF work → `docs/rf-suite/` only. Do not append dashboard build noise to RF CLAUDE-LOG.
- **OM scale:** Soil Fertilizer organic matter **0–10**, never percent. SF and Precision Farming are mutually exclusive.
- **Cover crops:** oilseed radish + map mustard (Witcombe) = cultivate-in, never combine (`cover-crop-types` / rules-engine).

---

## 6. Hard lessons (cause → fix → cite)

| Lesson | Cause → fix | Cite |
|--------|-------------|------|
| **copyFile Number spam** | Number `1`/`0` trials on Bool arg; retries every cycle after map-overview fail | Bool-only + failure latch; mod **5.0.0.1**. Classic GitHub 4.2 may still spam until classic hotfix. [RF suite session](f5abf067-cf61-41ae-acb1-f18be2f5d77e) |
| **Red Tape ghost tab** | Hold treated `enabled: false` like empty → restored stale Compliance | Hold must respect soft-detect off (`mergedSnapshotHold`) |
| **Soil enabled:false for weeks** | `rawget(_G, "g_currentMission")` nil in mod sandbox; presence used `_G.…` | Always `_G.g_currentMission` in collectors (`docs/rf-suite/MEMORY.md`) |
| **GPortal `.part` in mods** | Incomplete upload names break dedicated mod load | Stage-then-rename; sweep orphans (gportal rule) |
| **dev:ui → wrong backend** | Vite proxied to installed `:8766` → missing new collectors | Use `dev:new-ui` / `dev:ui:isolated` → `:8767` (`NEW APP/AGENTS.md`) |
| **Dealership on player fleet** | Pool-100 / `needsSaving=false` showroom merged onto farms | Farm-scope merge prune (4.2 changelog) |
| **Fill type #N names** | Sparse catalog gaps (e.g. Witcombe linseed / pig food) | Mod `fillTypeTitles` + app gap fillers |
| **Courseplay isa spam** | Shop-guard stubs without `isa` → CP `:isa` on plain tables | `FarmDashboardCourseplayCompat` conservative `isa` |
| **OneDrive / Xbox paths** | Documents relocated; Store package layout | `fs25Paths.js` + read retries [OneDrive paths](31d9d7f6-3f68-4c0d-b0b3-8ddd0d63afed) |
| **Join-as-client single farm** | Export scoped to joined farm only | Export all farms on dedicated save [join-as-client](45e2c916-0bd7-4452-8ebb-319477610d28) |
| **Mustard = cover crop** | Witcombe mustard treated like harvest crop | Same rules as oilseed radish [mustard cover](f5abf067-cf61-41ae-acb1-f18be2f5d77e) |
| **Classic vs V5 channel mix** | Publishing V5 onto `latest.yml` would force V4 users | Separate feeds + assert script |
| **Depot tab empty after dump** | Collector read 50k shop book; building stores in production hall | Hall `getFillLevel` / `getCapacity` first (FertilizerDepot 1.0.4.33) |

---

## 7. Open / watch items

- **Classic 4.2 GitHub/itch hotfix** for `copyFile` / map-overview latch still **owed** on public V4 feed (local/GPortal mod may already be 5.0.0.1; V4 app line is separate).
- **V5 publish:** GitHub Latest remains **5.0.3** until Wizard asks to publish. Working-tree drop is **5.0.5** in `Documents/FarmDash Release\` (`FS25-Farm-Dashboard-V5-Setup-5.0.5.exe`). Authenticode signing still open; **do not** publish onto V4 Latest. User-facing name is Farm Dashboard V5 (not “RF edition”).
- **In-game SP/MP smoke** for RF soil/treatmentPlan after dedicated restart (often pending after GPortal upload).
- **NEW APP parity:** live QA; some P0/P1 rows still open (`NEW APP/PARITY.md`, `PARITY_GAPS.md`) — Fields cluster prefs, nav icons, etc.
- **Website demo** on `:8766` classic stays separate from repo `:8767` NEW UI.
- Large dirty working tree vs last `main` push (Jul 2026) — assume local ahead of remote until Wizard commits.

---

## 8. Index of key paths

| Need | Look here |
|------|-----------|
| Electron main / FTP / LAN | `FS25_FarmDashboard_App/main.js` |
| Merge | `dataMerger.js`, `farmScope.cjs` |
| Snapshot hold | `mergedSnapshotHold.js` |
| XML / moisture | `xmlCollector.js`, `stockMoistureFromXml.js` |
| Paths / OneDrive | `fs25Paths.js`, `fileReadRetry.js` |
| Classic UI modules | `web/assests/js/modules/*`, `rules-engine.js` |
| NEW APP shell / sections | `NEW APP/src/app/`, `src/sections/`, `src/lib/` |
| Store / types | `NEW APP/src/store/`, `src/types/dashboard.ts` |
| RF presence / panels | `src/lib/modPresence.ts`, `src/lib/realisticFarming/` |
| Mod entry / collect | `FarmDashboard.lua`, `FarmDashboardDataCollector.lua` |
| Field / vehicle / economy collectors | `src/collectors/*.lua` |
| RF collectors | `src/collectors/rf/Rf*.lua` |
| Export mirror (dedicated) | `FarmDashboardExportEvent.lua`, `FarmDashboardExportMirror.lua` |
| Mod zip | `tools/Zip-FarmDashboardMod.ps1` → `npm run package:mod` |
| GPortal upload | `tools/upload-gportal-mod.mjs` |
| RF channel guard | `tools/app/assert-rf-update-channel.mjs` |
| UX state contract | `docs/UX-STATE-CONTRACT.md`, `uxContract.cjs`, `NEW APP/src/lib/ux-state.ts` |
| Compat / RF pins | `docs/COMPATIBILITY.md` |
| RF integration kit | `docs/rf-suite/{AGENTS,LEDGER,MEMORY,SCHEMAS,HANDLES}.md` |
| Dev handover (classic-era map) | `docs/DEVELOPER_HANDOVER.md` (versions may lag; trust package.json / modDesc) |
| Dev dual-instance | `NEW APP/AGENTS.md` |
| VPS / testers site | `.cursor/rules/vps-deploy-farmdashboard.mdc` |

---

## Append discipline

When a session teaches something durable: add a short bullet under §6 or a dated note under “Dated lessons” below (or a row in the timeline file). Keep this file cold-start sized.

### Dated lessons (append)

#### 2026-07-28 — Dash memory deep refresh
- Built this bank from docs, git (Apr–Jul 2026), and ~29 parent transcripts (keyword sample). Timeline split to `DASH-TIMELINE.md`.

#### 2026-07-28 — copyFile Bool-only (mod 5.0.0.1)
- See §6. Engine wants Bool; latch map-overview failures.

#### 2026-07-26 — Red Tape hold + soil rawget
- See §6. RF kit MEMORY has session detail.

#### 2026-09-05 — Classic + RF must run as two apps
- Shared `requestSingleInstanceLock` + shared port 8766 made RF silently quit while Classic was open. Identity lives in `editionPolicy.cjs`: Classic 8766 / RF 8768 / distinct userData / AppUserModelId. Opt-in Classic→RF save import (no passwords or LAN). Uninstall `-Edition` must not wipe the other line.
- Setup Launch is `save-settings` then `launch-dashboard` (main derives `http://127.0.0.1:${PORT}/`). Saving unchanged servers used to stay on Starting.
- RF `activeServerId` persists as `farmdash_active_server_v1`. Pastures summaries use the same hydrated livestock rows as the pen list.
- Private coexist candidate: `Documents\FarmDash Release Candidates\2026-09-05-remediation-coexist` (Classic 4.2.2 + RF 5.0.1). Do not overwrite public 4.2.1 or the earlier same-day candidate folder.

#### 2026-09-03 — Guided UX / setup / freshness
- Shared contract: `docs/UX-STATE-CONTRACT.md` + `FS25_FarmDashboard_App/uxContract.cjs`. NEW APP is primary (`UiStatePanel`, `FreshnessChip`, `HelperPanel`, Settings Health). Classic `web/` got thin adapters only because the ask named those files.
- Stale cache must never look live (`cacheUsedDueToFailure` + confidence chips). Retry lives in one place (`ux-retry` / `nextRetryDelayMs`); polls must not re-loop.
- Setup status: `GET /api/setup-status` + IPC `get-setup-status`. Last-5 events only. LAN enable needs confirm + restore default.

#### 2026-09-06 — Merged / extended field outlines
- GPS / worker menu (`AISettingsDialog`) does **not** draw map i3d field polygons. It generates `FieldCourseField` via `BoundaryDetectionTask`, which walks `getDensityAtWorldPos(terrainDetailId) ~= 0` (painted tillage / ground), then draws `fieldRootBoundary` on the hire-map preview.
- Merging or extending a field only paints densmap. `Field.densityMapPolygon` stays the original i3d shape. Desktop i3d outlines have the same limit.
- Homemade wall-follower was the wrong contour (started on-field; GPS starts at the first off-field pixel). Collector now pumps engine `BoundaryDetectionTask` (owned fields only; rice placeable polygon first; i3d fallback).
- Live miss: `modSettings/.../config.xml` had `modules fields="false"`, so `data.json` exported `fields: {}` and the map used i3d originals. `collectionSafetyV6` turns fields back on.
- Playtest miss: unpacked `mods\FS25_FarmDashboard\` (Sep 2) beat the zip. Pack script now syncs that folder as well as the zip.
- FarmHub field cards, overview minis, sidebar totals, and SimHub now cluster by that painted blob so a merge is one card. Area is the painted outline (not the sum of the old map polygons). Extended fields pick up the larger GPS area on the same card.
- Do not call full `FieldCourse.generateUICourseByFieldPosition` for every field (GPS lines + async, hitch). Boundary task only, yield while it runs.

#### 2026-09-05 — Map overlays not the same on every map
- Surveyed **28** installed map zips. **28/28** find a PDA photo. Field polygons: **28/28** after skipping `TerrainTransformGroup` (FDAY/Settlers fields sit after a huge terrain block; a 16MB scene cap missed them).
- Photo is not always `textures/ui/overview.dds`: also `maps/overview.dds`, `map/overview.dds`, `mapUK/overview.dds`, `maps/ui/mapOverview.dds`, zip-root `overview.dds`. Do not pick `preview.dds`.
- Scene file is not always `maps/map.i3d`: also `mapUS/mapUS.i3d`, `mapUK/mapUK.i3d`, `maps/mapEU.i3d`, Carpathian `maps/carpathianCountrysideMap.i3d`, Settlers `Settlers_map.i3d`. Ignore cutter/tree/placeable/effects `.i3d`.
- Engine load is `FieldUtil.onCreate` (every child is a field) + `polygonIndex` (Field.lua). Apply field Y rotation. i3d cache **v5**.
- Map/public productions belong on the fleet map with owned pins when Places is on (`getChainsForFarmView(..., includePublic)`).

#### 2026-09-05 — Weather Guard outlook dashes
- Live `weatherGuard.forecast` had temps on day 0–1 only. Weather Guard `getForecastTemperature` uses `getHourlyForecast(days*24)`. Giants `WeatherForecast:getHourlyForecast` only rolls the clock forward **one** day, so dayOffset ≥ 2 returns nil. Rain still fills from `forecastItems` (~9 days).
- FarmHub collector now also reads engine `getDailyForecast` (same path as the PDA calendar) for min/max, plus `getForecastHumidity`. UI shows a high/low range instead of "—". Needs the updated in-game mod, then a collector cycle.

#### 2026-09-05 — Saxlingham XL overview miss
- Title `SaxlinghamXL` (no space) used to be one token `saxlinghamxl`. Zip is `FS25_Saxlingham_XL.zip`, so identity match failed. Distinctive tokens then made zip search return null (Riverbend safety: do not steal another map’s overview).
- Split CamelCase + size suffixes (`xl` / `xxl` / `2x` / `4x` / `16x`) and match paths with or without underscores. Prefer the XL zip over `FS25_Saxlingham_crossplay.zip` when the slug/title includes XL.

#### 2026-09-05 — Overview world is the centre 50%
- Giants PC IngameMap hardcodes `mapExtensionOffset = 0.25` and `mapExtensionScaleFactor = 0.5`. Hotspots, field-colour overlay, and Esc Map fruit/farmland all sit in that centre square of `overview.dds`. The outer half is authored scenery — black/leather on Witcombe, painted hills on Riverbend — so pixel “full-bleed” detection cannot find it.
- Do not crop the PNG. Place overlays with that inset (`INGAME_MAP_WORLD_INSET`). Hide-border clips the view to the same rect and uses 0–1 of the playable square.
- `IngameMapElement:worldToLocalPos` is 0–1 of *terrain metres*, not of the photo. Matching the picture means hotspot UV, not that click helper.

#### 2026-09-04 — Riverbend overlay shift
- MapUS `map.xml` is `width="2048"` with `imageFilename` `textures/ui/overview`. Cache **v17**: never crop the PNG (outer art is still the photo).
- A second shift: Lua `refineMapBoundsFromWorldActivity` used `maxAbs <= half * 0.98`, so a rim field at ±1020 m on a 2 km map doubled UV to 4 km and pulled every polygon toward the centre. Latch then froze that. Fix: keep engine square unless activity is clearly outside (`* 1.02`); dashboard prefers `map.xml` `mapWidth` over a doubled `terrainSize`.
- 2026-09-05 correction: PDA fruit overlay at 25%/50% **is** where the world sits on the photo (same as hotspots), not a separate density-only quirk.

#### 2026-09-04 — Settings Save hang + wiped saves
- Save always called LAN HTTP restart; `http.close()` waited on the renderer WebSocket → deadlock (“Saving…” forever). Skip restart when bind is unchanged; close sockets with a timeout.
- Save also awaited Lua hydrate of every save on the IPC thread. Persist first; reboot in the background only when the save list actually changed.
- Empty `servers: []` (Save before load finished) overwrote disk. Refuse empty overwrite. `--sync-config` now unions by id so NEW APP saves survive reopen.

#### 2026-09-01 — LiveMap map reference
- LiveMap (Companion 2.1.0) paints a canvas overlay, type PNG icons, heading from `localDirectionToWorld` + `MathUtil.getYRotationFromDirection`, and “hide map border” by treating the centre 50% of overview.dds as terrain.
- FarmHub keeps CSS/percent pins (not their 25ms canvas poll or field polygons). We copied the *ideas*: original type SVGs (do not copy their icon files), headingDeg on vehicles, hide-border using Giants `INGAME_MAP_WORLD_INSET` (centre 50%), not a per-map pixel crop.
- Do not dump field polygons or hotspot coordinate arrays into `data.json`.
