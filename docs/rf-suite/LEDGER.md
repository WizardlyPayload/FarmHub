# FarmHub RF-edition ledger

Live cross-agent board for **Farm Dashboard** RF work. Append-only status rows; do not rewrite history ? strike through and add a new row if status changes.

**Dual-ledger:** this file is FarmHub-only. Do **not** mirror status into `Realistic-Farming/ecosystem-dev-tracking/CLAUDE-LOG.md`.

## Entry template (copy)

```
### [YYYY-MM-DD] <Agent> ? <Starting|Done|Blocked|Note>: <short title>
**Re:** <domain / collector / UI>
**What:** <1?3 concrete bullets>
**Why:** <player need / plan wave / blocker>
**Over to you:** <none | Agent X needs ACK on ?>
```

## Status board

| Domain / todo | Owner | Status | Notes |
|---------------|-------|--------|-------|
| Wave 0a coordination kit | Coordinator | **done** | `docs/rf-suite/*` seeded 2026-07-26 |
| Wave 0b handles + schemas | Coordinator | **done** | Verified against local Realistic-Farming; see HANDLES.md gaps |
| Versioning scaffolding | Coordinator | **done** | `docs/COMPATIBILITY.md` + RF builder channel guard |
| Shared contracts (types / presence / stubs / registry) | Coordinator | **done** | Domain agents fill bodies only |
| Land: SF + SCS export + Fields UI | Land | **done** | Collectors + Fields RF panels; OM 0?10; PF exclusion |
| Economy: Tax / MDM / Fuel / Workers / Income / Workplace | Economy | **done** | Collectors + Economy RF panels; typecheck pass |
| Dairy: DairyCore + Pastures panel | Dairy+Depot | **done** | Collectors + Pastures DairyCorePanel; SCHEMAS dairy shape |
| Life: NPC / RWE / ProStaff tabs | Life | **done** | Collectors + section bodies + Overview alerts (2026-07-26) |
| Depot: Fertilizer Depot | Dairy+Depot | **done** | Mods tab (Wizard 2026-09-04) plus Storage teaser |
| Cores: WeatherGuard / TimeGuard / presence | Cores | **done** | Collectors + top-bar/modal enrichments + presence chips (2026-07-26) |
| Release: i18n + About compat + RF packaging | Release | **done** | i18n 100%; About RF matrix; `latest-rf.yml` only; API gaps in COMPATIBILITY |
| ~~Release: i18n batch, QA, RF packaging~~ | Release | **done** | Superseded by Release Done entry 2026-07-26 |
| Release: formal 5.0.0 version cut | Release | **done** | App 5.0.0 (extraMetadata) + modDesc 5.0.0.0; classic stays 4.2.1; artifacts + latest-rf.yml verified |

## Session log

### [2026-07-26] Coordinator ? Done: Wave 0a/0b + shared contracts scaffolding
**Re:** FarmHub RF foundation (plan `rf_suite_dashboard_b121f6a6`)
**What:**
- Created FarmHub `docs/rf-suite/` kit (AGENTS, LEDGER, MEMORY, SCHEMAS, HANDLES).
- Verified mission handles against local `Realistic-Farming` + ecosystem-map; locked export schemas.
- Scaffolded types, modPresence, section stubs, collector registry stubs, merge passthrough, RF product-line build channel (`latest-rf.yml` only).
**Why:** Unblock parallel Land / Economy / Dairy+Depot / Life+Cores agents with collision-free ownership.
**Over to you:** Domain agents ? fill collector bodies + section UI under your paths in AGENTS.md. Do not edit frozen contracts without Ledger ACK.

### [2026-07-26] Land ? Starting: Soil and crop stress field panels
**Re:** Wave 1 Land collectors and NEW APP Fields UI
**What:**
- Verify Soil Fertilizer and Seasonal Crop Stress read APIs against local mod and FarmTablet sources.
- Implement authority-safe aggregate collectors and mod-gated field panels using the locked schemas.
- Add English catalog keys and run the NEW APP typecheck.
**Why:** Surface RF soil fertility, moisture, and crop stress where players already inspect fields.
**Over to you:** none

### [2026-07-26] Life+Cores ? Starting: Life tabs and core enrichments
**Re:** Wave 4?5 UI slices (NPC Favor / RWE / ProStaff / WeatherGuard / TimeGuard / presence)
**What:**
- Fill Lua collectors for npcFavor, worldEvents, proStaff, weatherGuard, timeGuard, presence against local Realistic-Farming APIs.
- Implement `lib/realisticFarming/life|cores`, section bodies, Overview alerts/chips, Weather/TimeGuard readouts.
- English keys in en.json; NEW APP typecheck only.
**Why:** Mod-gated social/world tabs plus core presence summaries for the RF edition.
**Over to you:** none

### [2026-07-26] Economy ? Starting: Wave 2 Tax/MDM/Fuel/Workers/Income/Workplace
**Re:** Economy collectors + NEW APP Economy RF panels
**What:**
- Fill RfTax / MarketDynamics / FuelCosts / WorkerCosts / Income / WorkplaceTriggers collectors (soft-detect, SCHEMAS shapes).
- Implement `lib/realisticFarming/economy/` helpers + mod-gated Economy section panels; English keys only.
**Why:** Plan Wave 2 ? Economy agent ownership.
**Over to you:** none

### [2026-07-26] Dairy+Depot ? Starting: DairyCore and FertilizerDepot export + UI
**Re:** Wave 3 dairy + Wave 4 depot (plan rf_suite_dashboard_b121f6a6)
**What:**
- Fill RfDairyDataCollector + RfFertilizerDepotDataCollector from local DairyCore / FertilizerDepot APIs.
- Implement NEW APP lib/realisticFarming/dairy + depot helpers; Pastures dairy panel; Storage depot stock/pricing panel.
- English en.json keys only; typecheck NEW APP.
**Why:** Surface DairyCore barn health/quality/spoilage and Fertilizer Depot stock + seasonal pricing in NEW APP.
**Over to you:** none (depot handle gap: use getfenv g_DepotManager until RF mission bridge)

### [2026-07-26] Land ? Done: Soil and crop stress field panels
**Re:** Wave 1 Land collectors and NEW APP Fields UI
**What:**
- Filled Soil Fertilizer and Seasonal Crop Stress collectors with authority guards, mission-handle fallbacks, `pcall` reads, and incremental per-field aggregates.
- Added RF soil N/P/K, pH, OM 0?10, yield, moisture, drought stress, and irrigation panels to Fields cards, hidden when their source is inactive.
- Added English catalog keys; NEW APP typecheck and diff checks pass.
**Why:** Complete the Wave 1 Land vertical slice without blending Precision Farming and Soil Fertilizer.
**Over to you:** Release should batch i18n; SCS 1.2.3.4 has no moisture forecast API, so `moistureOutlook` is empty.

### [2026-07-26] Dairy+Depot ? Done: DairyCore + FertilizerDepot collectors and UI
**Re:** Wave 3 dairy + Wave 4 depot
**What:**
- Implemented RfDairyDataCollector (mission.dairyCoreManager / g_dairyCoreManager) and RfFertilizerDepotDataCollector (getfenv g_DepotManager; mission.depotManager forward-compat).
- NEW APP lib/realisticFarming/dairy + depot; Pastures DairyCorePanel; Storage FertilizerDepotPanel; en.json keys only.
- Typecheck run on NEW APP.
**Why:** Domain wave complete for dairy + depot ownership paths.
**Over to you:** Release for i18n sync/fill; RF still needs mission.depotManager bridge if they want ecosystem-map parity.

### [2026-07-26] Economy ? Done: Wave 2 collectors + Economy RF panels
**Re:** Tax / MarketDynamics / Fuel / Workers / Income / Workplace
**What:**
- Filled six RF economy collectors with soft-detect + pcall aggregates matching SCHEMAS.md.
- Added `lib/realisticFarming/economy/` helpers and mod-gated `RfEconomyPanels` on Economy section; English keys in en.json.
- NEW APP `npm run typecheck` passes.
**Why:** Wave 2 complete for Economy ownership lane.
**Over to you:** Release for i18n sync/fill; Coordinator if tax/income per-farm API ever lands (currently global stats mirrored per farmId).

### [2026-07-26] Life+Cores ? Done: Life tabs and core enrichments
**Re:** NPC Favor / RWE / ProStaff / WeatherGuard / TimeGuard / presence
**What:**
- Filled RfNpcFavor, RfWorldEvents, RfProStaff, RfWeatherGuard, RfTimeGuard, RfPresence collectors (soft-detect + pcall; SCHEMAS shapes; NetworkSync pin noted as 2.0.0.0 via live modDesc).
- NEW APP life/cores helpers; npcFavor / worldevents / prostaff section bodies; Overview RF alerts + presence chips; TimeGuard badge + WeatherGuard modal enrichment.
- English keys in en.json; NEW APP typecheck passes.
**Why:** Wave 4?5 Life + Cores UI/export slice for RF edition.
**Over to you:** Release for i18n sync/fill/build; in-game SP authority smoke with NPCFavor + RWE + ProStaff + WG + TG loaded.

### [2026-07-26] Release - Done: Wave 5 polish, i18n, About compat, RF packaging
**Re:** Wave 5 / versioning-compat (plan rf_suite_dashboard_b121f6a6)
**What:**
- Cross-agent cohesion: shared About RF compatibility matrix; Fields titles softened; Dairy/Depot use catalog t(); Pro Staff flags i18n; Overview suite chip label; publish.channel latest-rf so dist emits latest-rf.yml (not rf.yml); guard fails on classic latest.yml or stray rf.yml.
- Full i18n sync/fill/build/verify: 100% coverage on 27 locales (1987 keys).
- FINALIZED docs/COMPATIBILITY.md with shipped API gaps (SCS outlook empty, Tax/Income/WorkerCosts mirror, Fuel stable maps to flat, Depot getfenv, NPC shared, RWE no history, NetworkSync 2.0.0.0).
- NEW APP typecheck + build OK; npm run build:all:rf artifacts in FarmDash Final Output / RF-edition.
**Why:** Close RF edition release gate without touching classic latest.yml.
**Over to you:** In-game SP/MP authority smoke; formal 5.0.0 app/modDesc cut when publishing; do not attach RF Setup to classic GitHub latest.yml releases.

### [2026-07-26] Wizard - Done: formal RF 5.0.0 version cut
**Re:** versioning-compat (plan rf_suite_dashboard_b121f6a6) - final task from the plan
**What:**
- App version 4.2.1 -> 5.0.0 for the RF line only, via `electron-builder.rf.yml` `extraMetadata.version: 5.0.0`. Classic `package.json` (root + app) left at 4.2.1, so `build:app` / `build:all` stay 4.x.
- `FS25_FarmDashboard_Mod/modDesc.xml` `<version>` 3.4.0.25 -> 5.0.0.0 (header comment bumped too). MIN_MOD_VERSION 3.1.0.0 unchanged; 5.0.0.0 passes the compat gate.
- `docs/COMPATIBILITY.md` version-identity section rewritten: app 5.0.0 <-> modDesc 5.0.0.0 matrix; documented the extraMetadata override so classic keeps 4.2.1.
- Ran `npm run build:all:rf`. Output: `FS25-Farm-Dashboard-RF-Setup-5.0.0.exe` + `latest-rf.yml` (version: 5.0.0) in FarmDash Final Output/RF-edition. Guard logged OK. No classic `latest.yml` / stray `rf.yml` in RF folder; parent classic `latest.yml` untouched (18/07). Removed a stale 4.2.1 RF Setup from a prior build. Mod zip rebuilt from bumped modDesc.
**Why:** Only remaining gap was artifacts reporting old versions; feature work + RF packaging already passed.
**Over to you:** In-game SP/MP authority smoke; Authenticode signing for RF Setup.exe; when publishing, keep RF assets off any release that updates classic latest.yml. No commit/push done (consent-gated).

### [2026-07-26] Wizard - Starting: Red Tape hide + Fields RF fill
**Re:** NEW APP RF edition playtest bugs (Red Tape ghost tab; Fields sparse vs FarmTablet)
**What:** starting fixes. Plan: (1) stop mergedSnapshotHold from restoring Red Tape when Lua soft-detects enabled:false; (2) stop RF land collectors from wiping moduleCache mid-cycle + return partial payloads; (3) expand Fields RF panels toward FarmTablet Soil/SCS surfaces.
**Why:** User angry that Red Tape still shows after removal and Fields RF data looks not worth adding.
**Over to you:** none.

### [2026-07-26] Wizard - Done: Red Tape hide + Fields RF fill
**Re:** NEW APP RF edition playtest bugs (Red Tape ghost tab; Fields sparse vs FarmTablet)
**What:**
- Root cause Red Tape: mergedSnapshotHold treated Lua `enabled: false` as empty and restored stale enabled:true backup/snapshot. Live data.json already had enabled:false; API on :8767 showed enabled:true. Fix: never hold over explicit soft-detect off; clear liveSectionBackup.redTape.
- Root cause Fields sparse: RF land collectStep returned nil mid-cycle and coordinator wrote `moduleCache[name] = {}`, wiping soil/crop caches every frame until cycle finished (tax etc. finish in one step so looked fine). Presence detected SF/SCS but soilFertilizer.enabled stayed false. Fix: keep prior cache on nil payload; land collectors return partial byField payloads; string field keys; wait for soilSystem.isInitialized; optional SCS moistureOutlook via weatherIntegration; richer Fields RF panels (N/P/K, pH, OM 0-10, pressures, disease unscouted, urgency, rotation, treatments, compaction, meadow, critical/irrigation/outlook).
- i18n sync/fill/build/verify OK (2006 keys). NEW APP typecheck OK. packaged mod + local mods copy + GPortal upload OK.
**Why:** Soft-detect must not false-positive; Fields must show real SF/SCS aggregates players expect from FarmTablet.
**Over to you:** Restart dedicated + client for new mod zip; restart `npm run dev:new-ui` (:8767) so Electron picks up mergedSnapshotHold + ui-v2. Verify Red Tape nav gone; Fields cards show Soil fertility / Crop moisture when SF/SCS loaded and PF not winning.

### [2026-07-26] Wizard - Starting: Fields cards RF treatment-plan depth
**Re:** Fields cards still look like base-game; need FarmTablet Soil / FieldSentry depth
**What:** starting work on RF field-card redesign. Plan: (1) extend SCHEMAS + RfSoilFertilizer collector with cropTargets, fieldArea, growthFraction, and treatmentPlan rows mirroring FarmTablet SoilNutrientApp / SoilTreatmentDialog rates; (2) restructure NEW APP FieldCard so RF soil + crop stress dominate when SF/SCS active (vanilla bars secondary); (3) i18n + typecheck + build:ui + package:mod + local mods copy + GPortal upload.
**Why:** User wants multi-stage / treatment-plan field experience on cards, not a thin soil footer under vanilla mechanics.
**Over to you:** none.

### [2026-07-26] Wizard - Done: Fields cards RF treatment-plan depth
**Re:** Fields cards still look like base-game; need FarmTablet Soil / FieldSentry depth
**What:**
- Extended SCHEMAS + types + RfSoilFertilizerDataCollector with cropTargets, fieldArea, growthFraction, spray coverage, amendBurnRisk, and treatmentPlan rows mirroring FarmTablet SoilNutrientApp / SoilTreatmentDialog (product rates when SoilConstants resolves).
- Restructured NEW APP FieldCard: when SF/SCS active, RF soil + treatment plan + crop stress dominate; vanilla N/pH bars hidden; harvest/growth + rules suggestion demoted under "Base harvest / growth".
- RfLandPanels: treatment plan hero, current-vs-target bars (N/P/K/pH/OM), pressures, rotation, crop stage / yield / coverage.
- i18n sync/fill/build/verify OK (2022 keys). NEW APP typecheck OK. build:ui + package:mod + local mods copy + GPortal upload OK.
**Why:** Cards must show the multi-stage treatment-plan field experience, not a thin soil footer under vanilla mechanics.
**Over to you:** Restart dedicated + client for new mod; restart npm run dev:new-ui (:8767). On an owned field with SF loaded (PF not winning), confirm Treatment plan rows with rates and RF panel above base harvest.

### [2026-07-26] Wizard - Done: soil card mock parity + rawget sandbox fix
**Re:** Player still sees vanilla fert/lime bars; cards must match the FarmTablet Soil mock
**What:**
- Root cause of enabled:false found. Live mirror_savegame6 data.json had presence detecting `soilFertilityManager` on the mission while `soilFertilizer` stayed `{enabled:false, fieldCount:0}`. RfSoilFertilizer / RfCropStress resolved the mission with `rawget(_G, "g_currentMission")`; RfPresence used `_G.g_currentMission`. In the FS25 mod sandbox `_G` is the mod env and engine globals come through its `__index` chain, so rawget returns nil and the manager never resolves. Both land collectors now use plain `_G.` indexing (also g_fieldManager, g_modIsLoaded, SoilConstants, PF namespace).
- Collector v1.3.0 adds a `ppm` block (SoilConstants.PPM_DISPLAY, fallback N 3.0 / P 0.6 / K 4.0) and stand-down diagnostics (reason, modLoaded, managerPresent, systemPresent, settingsEnabled) so "installed but not reporting" is visible instead of silently looking vanilla.
- NEW APP soil panel rebuilt to the mock: N/P/K ppm, pH, OM x/10, Weed/Pest/Disease % as full-width severity bars, hatched Unscouted disease, TREATMENT block (title + reason sentence + Also line + expandable product rates). Header carries urgency %; vanilla N/pH bars stay hidden while SF is active. Fields section sorts worst-first with urgent/watch/good chips and shows the stand-down note.
- FarmDashboard.VERSION was a stale 3.4.0.23 against modDesc 5.0.0.0; synced to 5.0.0.0 so the server log identifies the build.
- SCHEMAS updated (ppm block, diagnostics, the `_G` lookup rule). i18n verify 100% on 26 locales. Typecheck + build:ui OK. Mod repackaged and copied to local mods.
**Why:** The UI gate was correct all along - the payload never carried per-field soil data, so cards correctly fell back to vanilla.
**Over to you:** GPortal upload is blocked while the dedicated server holds the zip; the script refused safely and cleaned its staging file. Stop the server in the GPortal panel, re-run `npm run upload:gportal-mod`, start the server, then restart `npm run dev:new-ui` (:8767). Expect `realisticFarming.soilFertilizer.enabled: true` with a fieldCount; if it is still false the payload now names the reason.

### [2026-07-26] Wizard ? Done: Fields cards one-per-row (full width)
**Re:** NEW APP Fields UI (`NEW APP/src/sections/fields/fields.css`)
**What:**
- User found the SF field cards cramped in the responsive 2/3-column grid. Changed `.fd-fields__grid` to a single full-width column at all breakpoints (removed the `>=720px` 2-col and `>=1200px` 3-col media queries).
- Dropped the `22rem` min-height on cards so short cards no longer force wasted vertical space; the wide card lets the RF inner grids (soil bars, `__details` auto-fit, `__metrics` up to 4-up, TREATMENT, secondary harvest strip) spread across the row.
- Layout/spacing only ? no data rows removed, no strings added, urgency sort chips / GOOD counts untouched. One-per-row applies to vanilla and RF-active alike for consistency.
- Ran `npm run build:ui` (Vite OK, copied to `FS25_FarmDashboard_App/ui-v2`).
**Why:** Player wants every metric for one field visible at once without cramped horizontal scanning.
**Over to you:** Restart `npm run dev:new-ui` (:8767) or hard-refresh to pick up the rebuilt ui-v2.

### [2026-07-28] Wizard - Done: copyFile Bool/Number spam + latch
**Re:** FarmDashboardDataCollector `_copyFileFs25BestEffort` / map overview export
**What:**
- Bool-only `copyFile` trials (true then false); removed Number 1/0 compat trials that spammed Script errors every export cycle.
- Overview export failure latches `_mapOverviewExportDone` with one clear warning so it does not loop.
- Patch version 5.0.0.1; packaged + local mods + GPortal upload attempted.
**Why:** Number-as-Bool trials + missing dest file meant failed overview export retried every cycle (1100+ log errors). FS 1.21 made the spam obvious; Bool rule is older.
**Over to you:** Restart dedicated server + game client so mod 5.0.0.1 loads.

### [2026-07-28] Wizard - Note: Ash handoff Witcombe ~89% join hang
**Re:** RF MP join (not FarmDashboard) — see `docs/rf-suite/ASH-HANDOFF-witcombe-89-join-hang.md`
**What:** Evidence handoff to Ash / Claude(A) / Tyson: client sticks ~89% on Witcombe dedicated after FS25 1.21; SF value-map join storm + Invalid event id + distance-texture 255; FarmDashboard cleared of causality.
**Why:** Real RF-side sync/API ask after 5.0.0.1 copyFile fix did not unblock join.
**Over to you:** Ash inbox REQUEST on `ASH-INBOX-ARISSANI.md` (FarmHub kit holds the full note).

### [2026-09-01] Dash - Done: RF pin refresh + LiveMap fleet map + NEW APP chrome
**Re:** Fleet map, AppTopBar Live/Snap, SimHub cards, RF tested versions
**What:**
- Fleet map takes LiveMap ideas (type icons, heading, hide-border crop) without copying their assets or field polygons. Heading from `localDirectionToWorld`; crop uses FarmHub `terrainInset` instead of LiveMap's centre-50% DDS hack.
- Wired Live API / Snap XML badge, mod-required banner, SimHub structured cards.
- RF tested pins + HANDLES `depotManager` updated against 2026-09-01 local clones.
**Why:** Wizard asked to finish the RF-edition dashboard for playtest and to reference LiveMap for the map.
**Over to you:** Playtest on `:8767` (`npm run dev:new-ui`). Reload the in-game mod for heading + better vehicleType. Do not publish onto classic `latest.yml`.

### [2026-09-04] Dash - Done: NEW APP scan dialog, pastures table, RF cards, map pins, depot tab
**Re:** NEW APP chrome / map / Fertilizer Depot
**What:**
- Dashboard-styled mod picture scan progress + completion (native OS box suppressed when NEW APP owns the dialog).
- Animal side cards show full height; livestock table grows with page size up to 50 rows.
- Economy RF suite cards share the top row equally; map shows owned productions + sell points with PDA icons; Fertilizer Depot Mods tab.
**Why:** Wizard asked for these five NEW APP polish items.
**Over to you:** Restart Electron / reload the UI. Reload the in-game mod for depot settings in the new tab. Do not publish onto classic `latest.yml`.

### [2026-09-13] Dash - Done: Restore field/production export + dairy barn names
**Re:** Collectors, ESC settings inject, DairyCore panel (rescued from closed #7 tip `390db3ae`)
**What:**
- Guarded `FarmDashboard:loadMap` so a missing DataCollector cannot throw inside `loadSharedI3DFileFinished`.
- collectionSafetyV7 re-enables fields / economy / production; ESC clone setState no longer persists Off.
- Dairy rows now include optional `name` from `placeable:getName()`; Pastures panel shows that name.
**Why:** Riverbend savegame2 lost merged fields, RF map overlays, productions; Dairy Core still showed uniqueIds; map-load threw a Lua error.
**Over to you:** Restart the save so mod **5.0.0.4** loads. Do not publish onto classic `latest.yml`.

