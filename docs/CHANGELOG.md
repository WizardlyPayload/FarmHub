# Farm Dashboard — Changelog

All notable changes to this project are recorded here. For GitHub release blurbs, see [GITHUB_RELEASE_v4.1.5.md](./GITHUB_RELEASE_v4.1.5.md) (current) · [GITHUB_RELEASE_v4.1.0.md](./GITHUB_RELEASE_v4.1.0.md). For **network exposure and trust assumptions**, see [SECURITY.md](./SECURITY.md).

---

## Versioning

| Artifact | Where it lives | Format |
|----------|----------------|--------|
| **Desktop app** | `FS25_FarmDashboard_App/package.json` | Semver (e.g. `4.1.0`) |
| **FS25 mod** | `FS25_FarmDashboard_Mod/modDesc.xml` and `FarmDashboard.VERSION` in Lua | Giants style (e.g. `3.1.0.0`) |
| **Source headers** | First line of many `.js` / `.lua` files | Often `v2.0.0` historically; bump only when you intentionally resync headers |

---

## 4.1.5 — Accurate store images for equipment (tester drop)

**App:** `4.1.5` (`package.json`) · **Mod:** `3.3.21.2` (`modDesc.xml` + `FarmDashboard.VERSION`; app requires **3.1.0.0+** via `modVersionPolicy.js`).

### Fixed
- **Wrong picture shown for some equipment.** The dashboard used to pick a vehicle's image by **fuzzy-matching its display name**, which could land on a sibling/variant icon (e.g. the wrong trim of a tractor, or a same-series implement). The mod now exports the game's own store-icon basename per vehicle (`storeItem.imageFilename` → e.g. `store_t7`), and the app resolves that **exactly** against its shipped image library before any fuzzy guessing. Base-game equipment is now authoritative out of the box; ambiguous/unknown tokens still fall back to the existing fuzzy match, so nothing regresses.
- **Duplicate vehicles on the fleet tab.** The same physical vehicle could appear twice on dedicated servers when live Lua positions differed from saved XML (merge paired only by position), or briefly when the UI re-rendered the full unfiltered fleet before active-farm filters applied. `mergeVehicles` now pairs Lua/XML records by stable **config file + farm** (position is a tiebreaker only); fleet refresh scopes summary cards and the grid to the active farm.

### Changed
- **Mod (`VehicleDataCollector.lua`):** exports a new `storeImage` field (the lowercased store-texture basename, no path) for each vehicle. Mod version `3.3.21.1` → `3.3.21.2`.
- **App (`vehicles.js`):** new exact store-image index (curated `items/` + extracted `items_mod_extract/`), keyed by the `store_*`/`icon_*` basename; curated (base-game) hits win ties, ambiguous keys defer to fuzzy matching. The leaf token is parsed after the final `__` so nested-zip mod keys are handled.
- **Mod-image extractor (`tools/Export-ModStoreImages.ps1`):** `store_*`/`icon_*` textures are now exported as `ModFolder__store_<basename>.png` (authoritative, exactly matchable) instead of by in-game display name. Non store/icon textures keep display-name naming for the fuzzy fallback. **Migration:** when re-run, any image already extracted under the old display-name convention is renamed in place to the new basename file and the old file is removed — only when that old file actually exists, so there are no duplicates and no re-conversion.

### Tests
- Full Jest suite + Node `--test` (.mjs) green, including `vehicleStoreImage.test.mjs` (token extraction, curated-vs-mod precedence, ambiguity/unknown fallback, nested-zip keys), `mergeVehicles.test.js` (moved-vehicle dedupe, same-model pairing, cross-farm isolation), `vehicleFarmScope.test.mjs` (active-farm grid scope), and a functional migration test of the mod-image extractor.

---

## 4.1.4 — Courseplay menu crash fix + livestock table/total agreement + grass field status (tester drop)

**App:** `4.1.4` (`package.json`) · **Mod:** `3.3.21.1` (`modDesc.xml` + `FarmDashboard.VERSION`; app requires **3.1.0.0+** via `modVersionPolicy.js`).

### Fixed
- **Courseplay menu crash (`CpAIJobCombineUnloader.lua:93: attempt to call missing method 'isa' of table`).** Reproduced in single-player after buying a vehicle, then opening the Courseplay combine-unloader menu (it also affected dedicated hosts). Courseplay's `getUnloadingStations()` walks **every** station in `g_currentMission.storageSystem` and calls `station:isa(UnloadingStation)`. Our shop-spawn shield gives half-loaded objects `getOwnerFarmId()`/`getName()` so `accessHandler:canPlayerAccess(station)` doesn't throw — but that made `canPlayerAccess` return *true* for a not-yet-loaded placeholder station, so Courseplay then called `:isa()` on a plain table that has no such method, spamming the error every frame. `FarmDashboardCourseplayCompat.applyIdentityStubs` now also installs a conservative `isa()` (returns `false` for a placeholder — it isn't a real `UnloadingStation` yet) so Courseplay correctly *skips* it, exactly as it would have if `canPlayerAccess` had returned false. The stub is only added when `isa` is genuinely missing (real stations/vehicles expose it via their class), and is removed once the real class method is available, so no loaded object is ever shadowed.
- **Livestock table now agrees with the pen total/summary (RealisticLivestock).** On a multi-component barn where a per-animal detail file shares a husbandry id with a *different* component, the detail hydrator could replace a pen's full aggregate (e.g. an 80-head Milking Parlour) with an incomplete 7-animal detail file — leaving the summary/total higher than the rows actually shown. The hydrator now **keeps the pen aggregate** whenever a detail file holds fewer heads than the pen already reports, and fans the clusters out to the full pen, so the table rows, the pen card, and the summary total always match.
- **Mown grass fields no longer show as "Growing".** A grass field that was just cut (fresh, non-hay windrow present, standing crop below the tall ready-to-cut stage) was labelled "Growing · stage 2/4" because regrowth stages overlap the initial growth stages. The app now detects a fresh grass cut (`isFreshlyMownGrass`) and shows a **"Harvested"** badge with a **"Mown · regrowing"** progress bar, matching the game.

### Changed
- Mod `FarmDashboardCourseplayCompat` bumped to `v3.3.21` internally; mod version `3.3.21.0` → `3.3.21.1`.

### Tests
- Full Jest suite + Node `--test` (.mjs) green, including the hydrator skip-guard cases and the new `isFreshlyMownGrass` field-status coverage.

---

## 4.1.3 — Correct livestock counts for partially-captured pens (tester drop)

**App:** `4.1.3` (`package.json`) · **Mod:** `3.3.21.0` (unchanged; `modDesc.xml` + `FarmDashboard.VERSION`; app requires **3.1.0.0+** via `modVersionPolicy.js`).

### Fixed
- **Livestock head counts were too low for some pens (RealisticLivestock).** On a pen where the mod's per-animal capture (`getClusters()`) only returned a subset of the herd, the dashboard counted the *captured rows* instead of the game's real total — e.g. a Milking Parlour with **71/100** in-game showed **7**. The mod already records the engine's authoritative `getNumOfAnimals()` as `numOfAnimalsReported` (the same "x/cap" number the game shows), so the app now **trusts that count** for pen totals and the livestock summary, using captured rows only as a floor. Pens that were already counted correctly (e.g. fully-captured 44/50) are unchanged.
- The per-pen detail hydrator no longer overwrites `numOfAnimalsReported`/`animalCount` with the captured-row count, and now tags base-game cluster detail rows so every head is counted.
- Average health is now weighted over the captured rows' own denominator, so partial capture can't dilute the percentage.

> Note: counts/summaries now match the game. The livestock **table** still lists only the individual animals the mod managed to capture for an affected pen until RealisticLivestock exposes the rest; the totals are authoritative.

### Changed
- New pure, unit-tested `husbandryHeadCount()` helper in `pastures-warnings.js`; `pastures.js` and `livestock.js` delegate pen/summary counts to it.

### Tests
- **317** Jest tests (added hydrator count-reconciliation cases and `husbandryHeadCount` coverage).

---

## 4.1.2 — Mod-config save no longer wipes mod settings (tester drop)

**App:** `4.1.2` (`package.json`) · **Mod:** `3.3.21.0` (unchanged; `modDesc.xml` + `FarmDashboard.VERSION`; app requires **3.1.0.0+** via `modVersionPolicy.js`).

### Fixed
- **In-app "Save mod config" was a destructive full rewrite.** The desktop editor only knew 7 modules + 4 settings, but the mod writes ~20 tuning settings plus the `stock` and `redTape` modules. Saving from the app replaced the whole `config.xml`, silently dropping `diagnostics`, every `*PerFrame` budget, `stock`/`redTape`, and the `collectionSafetyV*Applied` flags — so the mod reverted them to defaults on next load (and could re-trigger one-time migrations). The writer is now a **read-modify-write merge** (`modConfigXml.js`): it patches only the editor-managed keys and preserves everything else verbatim. `stock`/`redTape` are now also parsed/round-tripped.

### Changed
- Config XML parse/merge logic extracted to `modConfigXml.js` (pure, unit-tested).

### Docs / security
- Tester gate (`Website/js/testers-gate.js`) annotated as a **convenience gate, not a security boundary** — real protection of `/t/fs25-beta/*` (page **and** `files/`) must be enforced by nginx Basic / Cloudflare Access (already documented in `Website/README.md`).

### Tests
- **307** Jest tests (added `modConfigXml.test.js` — verifies a save preserves unmanaged keys and round-trips `stock`/`redTape`).

---

## 4.1.1 — Security hardening + offline moisture (tester drop)

**App:** `4.1.1` (`package.json`) · **Mod:** `3.3.21.0` (`modDesc.xml` + `FarmDashboard.VERSION`; app requires **3.1.0.0+** via `modVersionPolicy.js`).

### Security
- **CORS lockdown** (`main.js`, new `corsPolicy.js`) — cross-origin requests are now allowed only from loopback, **this machine's own NIC IPs on the dashboard port**, and the authorized `farmdashboard.co.uk` domains. Closes a flaw where any page served on port `8766` could read loopback dashboard data cross-origin. Same hardening applied to the write-origin/CSRF check.
- **`/api/status`** — drops `savegameName`; public/unauthenticated payload is now non-PII map/count metadata only.
- **HTTP API body cap** — explicit `express.json({ limit: '256kb' })`.
- **`fileReadRetry.js`** — bounded the `sleepSync` fallback so a missing `SharedArrayBuffer` can't cause a CPU busy-spin / freeze.

### Mod
- **`FarmDashboard.VERSION`** corrected `3.3.20.0` → `3.3.21.0` so the exported `serverInfo.modVersion` (and the in-app mod badge / compatibility check) matches `modDesc.xml`.

### Offline / last-known state
- Field soil moisture, environment (MoistureSystem) moisture, and bale moisture now persist across game/server shutdown and minimal exports (`dataMerger.js`, `mergedSnapshotHold.js`), so the dashboard shows last-known status for save/server selection while offline.

### Tests
- **297** Jest tests (added `corsPolicy.test.js`, `fieldMoistureCache.test.js`).

---

## 4.1.0 — Fleet map, storage inventory, integrations

**App:** `4.1.0` (`package.json`) · **Mod:** `3.1.0.0` (`modDesc.xml` + Lua; app requires **3.1.0.0+** via `modVersionPolicy.js`).

Narrative: **[RELEASE_v4.1.0.md](./RELEASE_v4.1.0.md)** · GitHub body: **[GITHUB_RELEASE_v4.1.0.md](./GITHUB_RELEASE_v4.1.0.md)**.

### Fleet map
- **`fleet-map.js`**, **`fleetMapGeo.js`**, **`fleetMapViewport.js`**, **`mapOverviewResolver.js`**, **`mapOverviewTerrainInset.cjs`** — PDA overview resolve, terrain inset clip (cache v6), pan/zoom, multi-farm pins.
- Known limitation: 4 km maps use ±1024 m PDA bounds — documented in app README.

### Bale & storage
- **`BaleInventoryCollector.lua`**, **`FillTypeUtils.lua`**, **`InventoryScan.lua`** — unified scan; shed bales via `spec_objectStorage`.
- **`dataMerger.js`**, **`fillTypeResolve.cjs`** — dedupe on-field rollup; fill-type catalog merge.
- Economy **Storage** tab: silo table, bale stock cards, pallets (`storage.js`).

### Optional mod integrations
- **ADS** — breakdown / workshop panels (`vehicleAds.js`); i18n from mod XML (`i18n:ads`).
- **Moisture System** — field moisture badge when exported.
- **Red Tape** — Compliance tab (`redTape.js`).

### Rules & fields
- **`rules-engine.js`** — roll-before-weed on early growth; mechanical weed hints.
- Field hectares / farm scope fixes (`farmScope.js`, `fields.js`).

### Mod config
- Separate **`enableBaleInventory`** from **`enableStock`**; **`enableRedTape`** module in `config.xml`.

### Tests & docs
- **279** Jest + **17** `.mjs` tests; parity tests for farm scope, fleet geo, fill types.
- **[USER_MANUAL.md](./USER_MANUAL.md)** — fleet map, storage, ADS, Red Tape, moisture; new screenshots embedded.
- App **4.1.0** / mod **3.1.0.0** across README, wiki, release notes.

---

## 4.0.0 — Stable line: auto-update + mod version awareness

**App:** `4.0.0` (`package.json`) · **Mod:** `3.0.0.0` (`modDesc.xml` + Lua; app requires **3.0.0.0+** via `modVersionPolicy.js`).

Narrative: **[RELEASE_v4.0.0.md](./RELEASE_v4.0.0.md)** · GitHub body: **[GITHUB_RELEASE_v4.0.0.md](./GITHUB_RELEASE_v4.0.0.md)**.

### Auto-update (3.9 → 4.0)

- Packaged **3.9.0** clients use **`electron-updater`** against **GitHub Releases** (`package.json` → `build.publish`, repo **`WizardlyPayload/FarmHub`**).
- Publish **4.0.0** as a **non-draft** release with **`latest.yml`** + **`FS25 Farm Dashboard Setup 4.0.0.exe`** — drafts are not visible to the updater.
- User flow: startup check (~10s) or **Settings → Check for updates** → download → **Restart and install** dialog (`app-updater.js`).

### Mod version badge

- Lua: `serverInfo.modVersion` from `FarmDashboard.VERSION` on each `data.json` write.
- Node: **`modVersionPolicy.js`** (`MIN_MOD_VERSION` **3.0.0.0**) attached to merged API payloads as **`modVersionCheck`**.
- UI: unobtrusive navbar badge when mod is **outdated** or **unknown** (legacy mod without version export).

### Tests & docs

- **`tests/modVersionPolicy.test.js`** — version compare + assess paths.
- **`npm test`**: **13** suites, **230** tests.
- App version **4.0.0** across README, manuals, wiki, **`RELEASE_NOTES.md`**.

---

## 3.9.0 — Pre-final hardening (security, i18n, tests, docs)

**App:** `3.9.0` (`package.json`) · **Mod:** `2.3.0.0` (`modDesc.xml` + Lua, now in lockstep).

Narrative: **[_internal/archive-releases/RELEASE_v3.9.0.md](./_internal/archive-releases/RELEASE_v3.9.0.md)** · Audit: **[_internal/AUDIT_v3.9_PREFINAL.md](./_internal/AUDIT_v3.9_PREFINAL.md)**.

### Security blockers closed

- **LAN credential policy** — `lanCredentialPolicy.js` now rejects the historic default `admin / farmhub` pair, passwords below 10 characters, and a known-weak password list when LAN access is enabled. The settings UI surfaces field-level error keys (`settings.lanErrDefaultCreds`, `settings.lanErrPasswordTooShort`, `settings.lanErrWeakPassword`).
- **DOM XSS sweep** — Added shared `web/assests/js/utils/escape.js` (`farmDashEscape.escapeHtml`). Pasture warning modals, low-health drilldown, dairy mother-offspring detail, and pasture card headers now route every game-sourced string (`pasture.name`, `animal.name`, `subType`, `husbandryName`, etc.) through the helper. Notifications already escaped title and body — verified by `tests/xss.smoke.test.js`.

### Testing — production parity, no more drift

- **Realtime fan-out** — Extracted `web/assests/js/realtime-fanout.js` (UMD: `farmDashFanOut.fanOutClustersIndividualRows`). `realtime-connector.js` delegates to it; tests exercise the same source. Added `tests/realtime-connector.fanOut.test.js` and `tests/realtime-connector.updateAnimals.test.js` covering per-pen + global caps and multi-pen aggregation.
- **Dedupe key** — Extracted `realtime-dedupe.js` (UMD: `computePayloadDedupeKey`). `tests/contextSwitch.test.js` verifies that farm-switch and server-switch invalidate the cache while volatile heartbeat fields don't.
- **Pasture warnings** — Extracted `pastures-warnings.js` (UMD: `buildFoodWaterDecisions`, `countLivestockHeads`). v3.9 separates **telemetry-absent** (info severity, `data_unavailable` type, new keys `pastures.warnNoFoodTelemetry` / `pastures.warnFoodTelemetryHint`) from **critical low-stock** (warning/danger). Counts inside `calculateAllPastureWarnings` are now head-aware via `countLivestockHeads`. `tests/pastures.warnings.test.js` covers the boundary.
- **Setup hardening** — Extracted `setup-validation.js` (UMD: `mapSaveError`, `findMissingFtpFields`). `setup.html` now renders per-field `is-invalid` styling, an `invalid-feedback` element next to each required input, and a green success card before redirecting (1.5 s). Network / auth / path / token errors are mapped to actionable copy. `tests/setup.validation.test.js` locks the structure and the regex set.

### i18n sweep

- New keys for pasture cards (`pastures.card.*`), warnings heading, status badges, table headers, drilldown details, and notification time-ago variants live in `web/locales/messages/en.json`. `npm run i18n:build` regenerates `translations.json` (~**987** keys × 27 locales as of 3.9.0; run `npm run i18n:verify` for the live count).
- `tests/i18n.coverage.test.js` guards against backsliding by failing on previously-localized literals (`<strong>Total Animals:</strong>`, `<small>Lactating Cows</small>`, `Just now`, etc.).

### Version unification

- `modDesc.xml` bumped to **`2.3.0.0`** to match the `FarmDashboard.VERSION` Lua constant.
- `package.json` and `package-lock.json` bumped to **`3.9.0`**.
- `INSTALL.md` malformed markdown fixed (`**data.json` → `data.json`, `**FS25_FarmDashboard` → `FS25_FarmDashboard`); release URL pointed at the canonical `WizardlyPayload/FarmHub` GitHub repo.
- **Mod packaging / docs** — **`Zip-FarmDashboardMod.ps1`** packs **only** **`modDesc.xml`**, **`icon.png`**, and **`src/`** at the zip root (Giants `sourceFile` paths). Install docs name the player-facing mod **`FS25_FarmDashboard`** in **`mods\`**, not the repo folder **`FS25_FarmDashboard_Mod`**. Screenshot manifest: **1920 × 1080** desktop, **1080 × 1920** tablet LAN rows only.
- **Supply chain & CI** — **`fast-xml-parser`** raised to **^5.7.3** (moderate advisory); **`npm audit --omit=dev`** clean on the app tree. GitHub Actions **`.github/workflows/ci.yml`** runs **`npm ci`**, **`npm test`**, **`npm run verify:electron-pack`** (main-process `require('./…')` closure vs **`build.files`**), **`npm run i18n:verify`**, **`npm audit --omit=dev`** on Windows for **`main` / `master` / `develop`**. Root **`LICENSE`** added (all rights reserved). **Packaging:** **`build.files`** includes **`detailAnimalsHydrate.js`**, **`livestockDetail.js`**, **`icon.ico`** so packaged installs do not throw **Cannot find module** at startup. **XSS:** **`livestock.js`** (`formatLocation`, breed column), **`navigation.js`** (farm picker, unknown section), **`vehicles.js`** (card title / brand / thumb labels), **`economy.js`** / **`changes.js`** / **`fields.js`** (market rows, data-change modal, field card titles) — escape via **`_safe`** / **`escapeFieldHtml`**. Extended **`tests/xss.smoke.test.js`** (**223** tests).
- **i18n** — Ran **`sync-keys-from-en.mjs`**: all **26** non-English locales now include every key from **`en.json`** (**987** keys each); **`npm run i18n:verify`** passes (no missing keys / placeholder drift). **`translations.json`** regenerated. **`npm run i18n:sync`** added to **`package.json`**; **[docs/_internal/I18N.md](./I18N.md)** documents the workflow.
- `USER_MANUAL.md`, `DEVELOPER_HANDOVER.md` rename `lanUser` → `lanUsername` to match `main.js` `LAN_ACCESS_DEFAULTS` keys.

### Repository layout

- **Electron build scripts** moved to **`tools/app/`** (repo root). `package.json` npm scripts use **`../tools/app/...`** from `FS25_FarmDashboard_App/`.
- **Validation runbook** consolidated as **[VALIDATION-RUNBOOK.md](./VALIDATION-RUNBOOK.md)** (formerly under the mod tree). Index: **[tools/README.md](../tools/README.md)**.

### Acceptance

`npm test` reports green across **12** suites (**223** tests) on the reference machine — re-run **`npm test`** and **`npm run verify:electron-pack`** before tagging. The remaining release gate is the updater smoke test (3.9.0 → 4.0.0 channel) per [`UPDATER_QA.md`](./UPDATER_QA.md). Operator checklist: **[_internal/RELEASE_READINESS_v3.9.md](./_internal/RELEASE_READINESS_v3.9.md)**.

---

## 3.0.0 — Farm Dashboard (rules-first), windrow UX, docs aligned to shipping SKU

**App:** `3.0.0` (`package.json`) · **Mod:** `2.0.0.0` unless you ship a new mod build.

Narrative: **[_internal/archive-releases/RELEASE_v3.0.0.md](./_internal/archive-releases/RELEASE_v3.0.0.md)** · GitHub blurb: **[GITHUB_RELEASE_v4.0.0.md](./GITHUB_RELEASE_v4.0.0.md)**.

### Product scope (documentation + supported surface)

- **Offline field guidance** — **`rules-engine.js`** and field-card UI provide **local** “suggested next step” style hints from merged Lua + XML. No external model or subscription is part of the **3.0.0** manuals in this tree.
- **Windrows** — Mod exports **`windrowLiters`** / **`windrowType`**; **`dataMerger.js`** normalizes; **`fields.js`** shows a **volume badge** when data exists.

### Dashboard (web / Electron)

- **Single Settings entry** — Server & save management under **Settings (gear) → Servers & saves** (`dashboard.openUnifiedSettingsModal('servers')` in `dashboard-settings.js` where present).
- **Connection/API error panel** — “Back to Home” on the API error card opens **Settings → Servers & saves** instead of only legacy full-screen setup-only flows.
- **Notification History modal** — CSS fix so `.modal-backdrop` does not stack above `.modal` and block clicks (`web/assests/css/styles.css`).
- **Top bar** — Farm dropdown overflow fixes for narrow layouts; combined **XML + Live + API** status badge where implemented.
- **LAN access** — Optional bind with **HTTP Basic** + **IP allowlist**; loopback bypass in `main.js`. See [SECURITY.md](./SECURITY.md).

### Windows build, installer, uninstall

- **Default `npm run dist` / `pack`** — `tools/app/run-electron-builder.mjs` writes under **`%LOCALAPPDATA%\fs25-farm-dashboard-electron-out`** to avoid IDE/Windows Search locks on `app.asar` inside the repo.
- **NSIS** — `customCheckAppRunning` uses **`taskkill /F /T`** so child processes release file locks during upgrade.
- **Uninstall** — Optional **wipe all user profile data** (settings/caches) vs keep data (`build/installer.nsh`, `FarmDashWipeUserData`).
- **Supporting scripts** — `clean:build-out`, `unlock-install`, `remove-build-output-folders.ps1`, `stop-farmdash-install-lock.ps1` for repeatable builds.

### Documentation

- **USER_MANUAL**, **USER_GUIDE**, **RELEASE_NOTES**, **RELEASE_v3.0.0**, **DEVELOPER_HANDOVER**, **PROJECT_CONTEXT**, **SALES_HANDOVER**, **docs/README**, root **README**, app **README** — rewritten for **3.0.0** without optional cloud-stack assumptions.

### Historical note

Git history or older branches may contain experiments and code paths not described here. **CHANGELOG** §3.0.0 reflects the **supported** FarmHub **3.0.0** documentation and product story for this repository snapshot.

---

## Release overview

| Version | Focus |
|---------|--------|
| **4.0.0** | Stable promotion: validated in-app updater (3.9→4.0), mod version navbar badge, docs at 4.0 — see §4.0.0 and [RELEASE_v4.0.0.md](./RELEASE_v4.0.0.md). |
| **3.9.0** | Pre-final hardening: LAN credential policy, DOM XSS sweep, telemetry-vs-critical pasture warnings, setup UX, i18n sweep, test parity, version unification — see §3.9.0 above and [_internal/archive-releases/RELEASE_v3.9.0.md](./_internal/archive-releases/RELEASE_v3.9.0.md). |
| **3.0.0** | Rules-first field UX, windrow export/merge/UI, unified Settings, LAN security, default build output outside repo, NSIS upgrade/uninstall hardening — see §3.0.0 above and [_internal/archive-releases/RELEASE_v3.0.0.md](./_internal/archive-releases/RELEASE_v3.0.0.md). |
| **1.0.0** | First public release: mod + Electron app, local/FTP, XML + Lua merge, full dashboard sections. |
| **1.1.2** | Mod shop image export pipeline, vehicle thumbnails from extracted PNGs, installer resources. |
| **2.0.0** | Field accuracy and merge rules, single-player authority, multi-farm UI, data pipeline robustness, packaging, docs, repo hygiene, security/network documentation. |

---

## 1.0.0 — First public release

**App:** `1.0.0` · **Mod:** `1.0.0.0`

Initial shipping version documented in [GITHUB_RELEASE_v4.0.0.md](./GITHUB_RELEASE_v4.0.0.md).

### Product

- **FS25 mod** — Background collector writing `data.json` under the user profile (`modSettings/FS25_FarmDashboard/…`), configurable update interval (default 10s).
- **Desktop app (Electron)** — HTTP + WebSocket on port **8766**, reads local files or **FTP**, merges **live Lua JSON** with **savegame XML** (`xmlCollector.js` + `dataMerger.js`).
- **Dashboard (web)** — Livestock, vehicles, fields (including variable-rate soil overlays when exported), economy, pastures, productions, weather, notifications, theming.

### Install expectations

Mod must be enabled and the save loaded at least once before the desktop app can show data; see [README.md](../README.md).

---

## 1.1.2 — Mod shop images & vehicle thumbnails

**App:** `1.1.2` · **Mod:** unchanged at `1.0.0.0` on this line (mod version bumps with **2.0.0**).

### PowerShell: `tools/Export-ModStoreImages.ps1`

- Recursively scans the FS25 **mods** folder (unpacked dirs and `.zip` archives).
- Prefers **store** textures (`store_*.png` / `.dds`, `textures\store`, etc.); icon-only assets opt-in via flags.
- Maps mod XML to English display names; outputs **`ModKey__<sanitized title>.png`** (or basename fallback) under `web/assests/img/items_mod_extract/`.
- **DDS → PNG** via ImageMagick `magick` or DirectXTex **texconv** (optional bundled exe).
- Emits **`FD_JSON`** progress lines for Electron; supports **skip if file exists**, **`-Force`**, summary JSON for the app.

### Electron (`main.js`)

- IPC **`export-mod-store-images`** with line-buffered stdout, BOM-safe summary JSON, long timeout, completion dialogs.
- **`GET /api/item-image-filenames`** — lists curated `items/` and mod-extract PNGs for the renderer.

### Web

- **`modExportProgress.js`** — modal/overlay progress on setup and dashboard.
- **`vehicles.js` / `app.js`** — loads mod-extract filenames from the API; **strict-then-fuzzy** filename matching vs curated Giants-style `items/` assets; manual **`vehicleModelMap`** fallbacks.

### Build

- `electron-builder` **`extraResources`** ships the PowerShell script (and optional `texconv`).

### Known limitations (1.1.2)

- Vehicle ↔ thumbnail matching can still be wrong in edge cases (title vs in-game name, fuzzy collisions). Export tooling is solid; matching heuristics remain the main follow-up.

---

## 2.0.0 — Full change set since 1.0.0 (shipping line)

**App:** `2.0.0` · **Mod:** `2.0.0.0` (`modDesc.xml`, `FarmDashboard.VERSION`)

This release **includes everything below**, including behaviour refined during development after **1.0.0** and **1.1.2** (field pipeline, merge rules, authority, UI). It supersedes ad-hoc session notes when they conflict with the shipped tree.

### A. Mod — runtime & authority

- **`FarmDashboard:isAuthority()`** — Data collection runs in **single-player** and on **MP host / dedicated**, not only when `g_server` is set. Fixes **no `data.json` updates in SP** when `g_server` was nil.
- **Debug / introspection bridge** — Any experimental `FieldStateDebugBridge` / `field_introspection` paths from development were **removed**; shipping mod writes normal **`data.json`** only.

### B. Mod — field data (`FieldDataCollector.lua` and related)

- **Owned vs NPC fields** — Player-owned fields use the same **`FieldState:update`-style sampling** as unowned/NPC fields where applicable, instead of relying only on APIs that could **lag or disagree** with the map for owned land.
- **Ground type** — Adjustments that cleared **growth** no longer run when a **crop is planted** (avoids wiping growth stage used for rolling / status).
- **Rolling / compaction** — **`rollerLevel`** from the engine is exported as a **rolled fraction** consistent with HUD-style semantics (engine raw value can be “remaining work”, not “progress”).
- **Growth / rolling windows** — Handles **grass vs arable** growth-stage differences where the rolling window applies.
- **Field suggestions (Lua)** — Ordering and harvest/mulch/stubble logic aligned with live probes; dead **withered + grass** branch removed where it could never run.

### C. App — merge layer (`dataMerger.js`, `xmlCollector.js`)

- **`needsWork`** — When both Lua and XML exist, **Lua wins** (`luaField.needsWork ?? xmlField.needsWork`). XML-only heuristics (`limeLevel`, `sprayLevel`, `plowLevel`, etc.) no longer force **false “needs work”** on healthy growing crops.
- **Field suggestions** — If Lua provides suggestions, **Lua list is used** (sorted by priority); XML harvest lines are **filtered** when the live probe shows **mulched stubble**, **no crop**, etc., to avoid stale “Harvest …” rows.
- **Full field list for multi-farm** — Merge prefers **`allFields`** from XML when present so the API exposes **every field** with **`ownerFarmId`**; the UI filters by selected farm.

### D. Dashboard — web client (`web/assests/js/…`)

- **Lua tables as JSON objects** — `fields` (and similar) often arrive as **`{ "1": {…} }`**, not arrays. **`coerceJsonArray` / `normalizeFieldsPayload`** (and related paths in **`realtime-connector.js`**, **`apiStorage.js`**, **`fields.js`**) convert these so lists render and filters work.
- **`buildSuggestion` / empty suggestions** — Empty Lua `suggestions` serializes as **`{}`**; code no longer assumes **array**-only or throws when spreading.
- **Initial file read** — Local **`data.json`** watch can miss **`add`** for an existing file; **immediate read** after watch start avoids “empty dashboard until touch” in some cases.
- **Multi-farm** — **`dashboard.allFields`** holds the full list; **`filterFieldsForFarmView`** (and farm switch) show the correct farm without always including farm **1**.
- **Status badge** — “Needs work” aligns with **`needsWork || needsRolling`** and the Needs Work filter.
- **Merged top-level fields** — **`money`** and other merger outputs update when **`!== undefined`** (including zero balance).
- **Livestock tag image** — **`tag.svg`** replaces missing **`tag.png`** reference.

### E. Network & browser use (unchanged behaviour, now documented)

- Server listens on **`0.0.0.0:8766`**; **CORS** enabled — you can open **`http://<PC-LAN-IP>:8766`** from another device on the same network. See **[SECURITY.md](./SECURITY.md)** for trust boundaries (no login on LAN).

### F. Packaging, repo, and versions

- **`preload.js`** included in **`electron-builder` `files`** so it ships if preload is wired later.
- **Removed** unused **`VehicleDataCollectorSimple.lua`** (never listed in `modDesc.xml`); tooling lists updated accordingly.
- **Source headers** normalized to **`v2.0.0`** across tracked app and mod sources for this release.
- **Generated mod shop PNGs** — Contents of **`web/assests/img/items_mod_extract/`** are **gitignored** (keep locally after export; **`.gitkeep`** preserves the folder). Not required for a clean clone.

### G. Mod — staggered collection & `config.xml` (different from the app’s FTP poll)

After **1.0.0**, the mod moved to **staggered collection** so the game is not asked to run **every** collector in the same frame on every tick:

- **`FarmDashboardDataCollector`** runs **one enabled module per time slice** (animals → vehicles → fields → … in a fixed order) across a **`collectionCycleMs`** window (default **60s**, clamped **5s–30min**). Each slice still **assembles cached data** and **rewrites `data.json`**, so the file updates often but work is spread out.
- **`config.xml`** (under `modSettings/FS25_FarmDashboard/`) supports **`updateInterval`**, **`collectionCycleMs`**, and **per-module toggles** (animals, vehicles, fields, finance, weather, economy, production). Older configs without `collectionCycleMs` get a derived cycle length (legacy: at least **7×** the old update interval or **60s** minimum).
- **`FarmDashboard.UPDATE_INTERVAL`** follows **`collectionCycleMs`** (the Lua mission update cadence), not the old single 10s “do everything” model.

This is **independent** of the **desktop app’s FTP polling** settings below.

### H. App — setup screen, FTP polling, and mod image export

- **FTP polling** (`setup.html` + `main.js`): For dedicated / hosted servers, users can set **delay before first poll (seconds)**, **poll every (minutes)** (1–25), and **schedule mode** — **sync** (poll **all** FTP servers on the same tick) or **staggered** (one FTP server per sub-interval so work is spread across the interval). Stored under **`config.ftpPolling`** and executed by **`startFtpPollingCoordinator`**.
- **Scan FS25 mods for dashboard images** — Button on setup runs the **mod shop export** pipeline (PowerShell **`Export-ModStoreImages.ps1`** via IPC), filling **`items_mod_extract/`** for vehicle thumbnails (see **1.1.2**).
- **Scan local saves** — **`scan-local-saves`** helps discover **`modSettings/FS25_FarmDashboard`** save folders for configuration.

*Note:* Earlier development sessions experimented with extra dashboard-only timers and debug APIs; the **shipping 2.0.0** tree standardises on **file watch + FTP coordinator + mod export** as above.

### I. Farm switcher (multi-farm & GPortal)

- **`isFarmDropdownEnabled()`** — The navbar farm dropdown appears when the active server is **FTP** **or** when there is **more than one player farm** in the save (local multi-farm), so you are not limited to the original **FTP-only** switcher in some **1.0.0** builds.
- Development history included several **reverts and re-applies** (farm id types, `ownerFarmId` from Lua vs XML, `activeFarmId === 0` edge cases). **2.0.0** keeps **Lua-first `ownerFarmId`** in merge where applicable, **`allFields`**, **`filterFieldsForFarmView`**, and numeric-safe comparisons as in the current **`apiStorage.js`** / **`fields.js`** / **`realtime-connector.js`**.

### J. Known limitations (2.0.0)

- **FTP mode** — Savegame **XML** merge needs local or downloaded files; **Lua-only** merge is expected when XML is unavailable on hosted paths.
- **Husbandry totals (Lua)** — Some aggregations still assume **farm 1** in places; multi-farm husbandry totals may be incomplete for other farm IDs until a future release.
- **`npm audit`** — Some advisories remain in **electron** / **electron-builder** transitive trees; address with tested major upgrades post-release unless a critical runtime CVE applies to your threat model.

### Maintainer note

After pulling, run **`npm install`** under `FS25_FarmDashboard_App` before **`npm run dist`** so `package-lock.json` matches `package.json`.

---

## Documentation map

| File | Role |
|------|------|
| [README.md](../README.md) | Install, build, LAN browser access, troubleshooting, GitHub workflow |
| [INSTALL.md](./INSTALL.md) | Basic install order: mod in every target save **before** the desktop app |
| [GITHUB_RELEASE_v4.0.0.md](./GITHUB_RELEASE_v4.0.0.md) | Short copy-paste text for GitHub Releases |
| [_internal/archive-releases/RELEASE_v3.0.0.md](./_internal/archive-releases/RELEASE_v3.0.0.md) | Long-form **3.0.0** release narrative |
| [SCREENSHOTS.md](./SCREENSHOTS.md) | Long-form product description + screenshot checklist |
| [SECURITY.md](./SECURITY.md) | Network exposure, LAN browser use, trust model |
| [DEVELOPER_HANDOVER.md](./DEVELOPER_HANDOVER.md) | FarmHub: dashboard + mod architecture and file map |
| [AUTHORS.md](./AUTHORS.md) | JoshWalki & WizardlyPayload |
| This file | Full version history |

---

## Reporting issues

Include: FS25 version, single-player vs dedicated, **mod** version (see `modDesc.xml`), **app** version (see `package.json`), local vs FTP, and steps to reproduce.

---

## Credits

**JoshWalki** (Josh) / **Wizardlypayload** and **WizardlyPayload** — see **[AUTHORS.md](./AUTHORS.md)** and `modDesc.xml`.
