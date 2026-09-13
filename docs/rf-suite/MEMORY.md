# FarmHub Realistic Farming suite memory

Append-only dashboard build history for optional Realistic Farming suite panels on Farm Dashboard V5.  
**Not** the RF suite `ecosystem-dev-tracking/MEMORY.md` — do not write FarmHub noise there.

## Entry template (copy)

```
### [YYYY-MM-DD] <Agent> ? <title>
**Done:** <bullets>
**Not done / open:** <bullets>
**Working tree notes:** <branch or key paths if useful>
**Next:** <one concrete next step>
```

### [2026-09-07] Dash — Fertilizer Depot hall stock
**Done:**
- Clone 1.0.4.33 placeable is a vendored Giants production hall. Tip/load hits `ProductionPoint` bins (100k inputs / 1M outputs). Walk-in dialog still uses the separate 50k `depotSystem.storageLevel` book.
- `RfFertilizerDepotDataCollector` now reads hall via `spec_productionPoint.productionPoint:getFillLevel` / `getCapacity` (same as Esc). Shop book is fallback only.
- NEW APP hides the misleading 50k “silo capacity” headline when `settings.stockSource` is `hall`. About pin 1.0.4.33.
**Not done / open:** In-game reload to confirm dumped litres match the Fertilizer Depot tab. Walk-in shop book is intentionally not merged.
**Working tree notes:** `RfFertilizerDepotDataCollector.lua`, FertilizerDepotPanel, compatibility pin.
**Next:** Reload the in-game mod + restart the desktop app.

## Snapshot (where things stand)

- **Product line:** V4 stays on `latest.yml` in FarmDash Final Output. V5 zip + Setup.exe land **flat** in `Documents/FarmDash Release` with **`latest-rf.yml` only**. User-facing name is Farm Dashboard V5 (not “RF edition”).
- **Foundation (2026-07-26):** Wave 0a/0b + shared contracts complete.
- **Domain waves (2026-07-26):** Land, Economy, Dairy+Depot, Life+Cores complete.
- **Release (2026-07-26):** i18n 100% (1987 keys  27 locales); About RF compatibility matrix; COMPATIBILITY.md finalized with API gaps; NEW APP typecheck + build; `build:all:rf` artifacts shipped locally (not published).
- **Version cut (2026-07-26):** RF edition is now **5.0.0** (app) / **5.0.0.0** (modDesc). App bump is RF-only via `electron-builder.rf.yml` `extraMetadata.version: 5.0.0`; classic `package.json` stays **4.2.1** so `build:app`/`build:all` remain 4.x. Verified artifacts: `FS25-Farm-Dashboard-RF-Setup-5.0.0.exe` + `latest-rf.yml` (5.0.0), guard OK, no classic `latest.yml`/`rf.yml` in RF folder.
- **OM scale:** Soil Fertilizer organic matter is **0?10**, never percent.
- **PF:** Mutual exclusion with Soil Fertilizer ? no hybrid soil UI.
- **depotManager:** FertilizerDepot **1.0.4.33** still publishes `g_currentMission.depotManager = g_DepotManager`. Stock is the production hall, not `getStorageInfo`.
- **Engine globals in collectors:** always `_G.g_currentMission`, never `rawget(_G, "g_currentMission")`. `_G` inside a mod is that mod's environment table and engine globals resolve through its `__index` chain, so rawget silently returns nil.
- **NetworkSync:** Local pin is **2.0.1.0**; presence reads live modDesc version.
- **RF pins (2026-09-07):** About/tested versions refreshed from local Realistic-Farming clones after a handle/API audit (SF 2.5.0.126, SCS 1.2.5.142, DairyCore 1.0.5.39, FarmTablet 2.6.0.11, etc.). Mission handles and collector getters still match. `soilSystem.PFActive` is gone; FarmHub PF stand-down still uses `g_modIsLoaded`.
- **Outstanding:** In-game SP/MP authority smoke; Authenticode signing for RF Setup.exe; keep RF assets off classic latest.yml. NEW APP still opt-in (`useNewUi` / `FARMDASH_UI_V2=1`).

---

### [2026-07-26] Coordinator ? Foundation wave complete
**Done:**
- FarmHub `docs/rf-suite/` kit with dual-ledger rule.
- HANDLES.md + SCHEMAS.md from local Realistic-Farming (FarmTablet apps + ecosystem-map + source).
- `docs/COMPATIBILITY.md` with pinned local modDesc versions.
- NEW APP types / modPresence / section stubs / `lib/realisticFarming/*` ownership folders.
- Lua RF collector stubs + registry toggles; dataMerger + snapshot-hold passthrough for `realisticFarming`.
- RF electron-builder channel scaffolding (must not overwrite classic `latest.yml`).
**Not done / open:** Domain collector logic + UI bodies; i18n sync/fill (Release); full QA / `build:all`.
**Working tree notes:** FarmHub dirty with Wave 0 scaffolding; no commit requested.
**Next:** Parallel domain agents start from SCHEMAS.md + their AGENTS.md paths.

### [2026-07-26] Land ? Wave 1 soil and crop stress complete
**Done:**
- Soil Fertilizer collector exports field-average N/P/K, pH, OM 0?10, pressures, rotation, yield, urgency, treatments, compaction, and FieldSentry state.
- Seasonal Crop Stress collector exports moisture, drought stress, critical state, irrigation activity, difficulty, and alert hints.
- Fields cards show mod-gated RF soil and crop moisture panels; Soil Fertilizer stands down completely when Precision Farming is active.
- English keys added; NEW APP typecheck passed.
**Not done / open:** SCS 1.2.3.4 exposes no moisture forecast API, so `moistureOutlook` remains empty. Release still owns i18n sync/fill/build and release builds.
**Working tree notes:** Land-owned collector, helper, Fields panel, CSS, English catalog, ledger, and memory paths are dirty; no commit requested.
**Next:** Release batches translations and in-game QA verifies SP authority export, then MP host/dedicated export.

### [2026-07-26] Dairy+Depot ? Dairy Core + Fertilizer Depot wired
**Done:**
- Lua collectors RfDairyDataCollector + RfFertilizerDepotDataCollector (SCHEMAS shapes; soft-detect + pcall).
- Depot handle: primary getfenv(0).g_DepotManager; mission.depotManager only as forward-compat (documented in collector).
- NEW APP helpers + Pastures dairy panel + Storage depot stock/seasonal pricing panel.
- English keys in en.json (Release owns sync/fill).
**Not done / open:** i18n pipeline; in-game SP/MP QA; RF publishing mission.depotManager.
**Working tree notes:** Domain files under collectors/rf, lib/realisticFarming/dairy|depot, sections/pastures + storage.
**Next:** Release i18n batch; playtest with DairyCore + FertilizerDepot loaded on authority.

### [2026-07-26] Economy ? Wave 2 complete
**Done:**
- Collectors: RfTax, RfMarketDynamics, RfFuelCosts, RfWorkerCosts, RfIncome, RfWorkplaceTriggers export real aggregates when mods present.
- NEW APP Economy section shows mod-gated RF panels; helpers under `lib/realisticFarming/economy/`.
- English i18n keys only; typecheck pass.
**Not done / open:**
- Tax Mod and Income Mod are global (not true per-farm) ? byFarm mirrors shared stats to each farmId.
- Fuel trend maps API `stable` to schema `flat`.
- i18n sync/fill/build left to Release.
**Working tree notes:** Economy domain paths only; frozen Coordinator contracts untouched.
**Next:** In-game SP smoke with Tax/MDM/Fuel/Workers/Income/WT loaded; Release i18n batch.

### [2026-07-26] Life+Cores ? Life tabs + Weather/Time/presence complete
**Done:**
- Lua: RfNpcFavorDataCollector, RfWorldEventsDataCollector, RfProStaffDataCollector, RfWeatherGuardDataCollector, RfTimeGuardDataCollector, RfPresenceDataCollector.
- NEW APP: `lib/realisticFarming/life|cores`, sections npcFavor/worldevents/prostaff, Overview RF alerts + presence chips, AppTopBar TimeGuard badge, WeatherModal WeatherGuard outlook.
- English keys only in en.json; `npm run typecheck` in NEW APP passes.
**Not done / open:**
- NPC Favor relationships are shared (not true per-farm) ? byFarm mirrors the same relationship list and filters favors by ownerFarmId/farmId.
- RWE history is unused in mod source (FarmTablet note); only active event + cooldown exported.
- i18n sync/fill/build left to Release; no build:all.
**Working tree notes:** Life+Cores ownership paths; frozen Coordinator contracts untouched; no commit.
**Next:** Release i18n batch; SP authority playtest with life mods + WeatherGuard + TimeGuard.

### [2026-07-26] Release - Wave 5 polish and RF packaging complete
**Done:**
- Cohesion: About RF compat table (lib/realisticFarming/compatibility.ts); Fields title polish; Dairy/Depot t(); Pro Staff flag keys; Overview suite label; channel latest-rf.
- i18n sync/fill/build/verify: OK 100% / 1987 keys / 27 locales.
- docs/COMPATIBILITY.md finalized with API gaps table.
- NEW APP typecheck + Vite build OK; build:all:rf wrote FarmDash Final Output/RF-edition with FS25-Farm-Dashboard-RF-Setup-4.2.1.exe + latest-rf.yml; classic latest.yml untouched in parent folder; guard verified.
**Not done / open:**
- In-game SP authority + MP host smoke with RF suite loaded.
- Formal 5.0.0 version bump on package.json / modDesc for public RF line (installer still reports 4.2.1 from package.json).
- Authenticode signing for RF Setup.exe.
**Working tree notes:** FarmHub dirty with Release polish + i18n catalogs + RF packaging fixes; no commit requested.
**Next:** Playtest; when publishing, upload RF assets to a feed that never updates classic latest.yml.

### [2026-07-26] Wizard - RF 5.0.0 formal version cut
**Done:**
- App version bumped to 5.0.0 for the RF line only via `electron-builder.rf.yml` `extraMetadata.version` (electron-builder merges it into packaged metadata: Setup filename, `latest-rf.yml`, and `app.getVersion()`/About all read 5.0.0). Classic root + app `package.json` untouched at 4.2.1.
- `FS25_FarmDashboard_Mod/modDesc.xml` `<version>` 3.4.0.25 -> 5.0.0.0; header comment bumped. `modVersionPolicy.js` MIN_MOD_VERSION 3.1.0.0 still satisfied.
- `docs/COMPATIBILITY.md` version-identity section rewritten with the 5.0.0 <-> 5.0.0.0 matrix and the extraMetadata override note.
- `npm run build:all:rf` OK: mod zip rebuilt from bumped modDesc, RF Setup + `latest-rf.yml` (version 5.0.0) written to FarmDash Final Output/RF-edition, guard OK, classic `latest.yml` absent from RF folder and untouched in parent. Removed stale 4.2.1 RF Setup from a previous build.
**Not done / open:** In-game SP/MP authority smoke; Authenticode signing for RF Setup.exe; publishing (consent-gated, not done).
**Working tree notes:** Changed files: `FS25_FarmDashboard_App/electron-builder.rf.yml`, `FS25_FarmDashboard_Mod/modDesc.xml`, `docs/COMPATIBILITY.md`, `docs/rf-suite/LEDGER.md`, `docs/rf-suite/MEMORY.md`. No commit/push.
**Next:** Playtest the 5.0.0 RF build; sign the installer before public RF publish.

### [2026-07-26] Wizard - Red Tape hold + Land cache wipe fixes
**Done:**
- Red Tape nav/section no longer held from stale snapshot when Lua exports enabled:false.
- RF soil/crop collectors no longer wipe moduleCache mid-cycle; Fields UI expanded toward FarmTablet Soil app surfaces; SCS outlook from weatherIntegration (approximate).
- Mod 5.0.0.0 repackaged, copied to local mods, uploaded to GPortal; NEW APP ui-v2 rebuilt.
**Not done / open:** In-game confirm after dedicated/client restart that fields[].soilFertilizer / cropStress arrive with enabled:true and non-zero fieldCount.
**Working tree notes:** App hold + NEW APP Fields + Lua land collectors + i18n; no commit.
**Next:** User restarts dedicated + :8767 and spot-checks Fields on an owned farmland.

### [2026-07-26] Wizard - Fields cards RF treatment-plan depth
**Done:**
- Collector exports FarmTablet-parity treatmentPlan (rates via SoilConstants), cropTargets, growthFraction, coverage/session, amendBurnRisk.
- Field cards RF-dominant layout; vanilla soil bars secondary/hidden when SF active.
- i18n 2022 keys; typecheck; ui-v2 build; mod packaged, local mods + GPortal uploaded.
**Not done / open:** In-game confirm treatmentPlan + rates after dedicated/client restart; rates require SoilConstants visibility from SF (static fallback text if missing).
**Working tree notes:** Land collectors + Fields UI + SCHEMAS + types + i18n; no commit.
**Next:** User verifies Fields card treatment plan after restart.

### [2026-07-26] Wizard - Soil card mock parity + rawget sandbox fix
**Done:**
- Found why soil data never arrived: RfSoilFertilizer / RfCropStress used `rawget(_G, "g_currentMission")`, which is nil inside the mod sandbox. RfPresence used `_G.g_currentMission` and detected the same manager, which is what made the contradiction obvious in the live payload. Both land collectors now index `_G` normally.
- Collector v1.3.0: `ppm` block (SoilConstants.PPM_DISPLAY with N 3.0 / P 0.6 / K 4.0 fallback) plus stand-down diagnostics so a stood-down SF names its reason.
- Soil panel rebuilt to the FarmTablet mock: severity bars for N/P/K ppm, pH, OM x/10, Weed/Pest/Disease %, hatched Unscouted disease, TREATMENT block, urgency % in the header, worst-first sorting with urgent/watch/good chips. Vanilla fert/lime bars hidden while SF is active.
- FarmDashboard.VERSION synced 3.4.0.23 -> 5.0.0.0 to match modDesc.
**Not done / open:** GPortal upload blocked by the running dedicated server holding the zip (script refused safely, staging cleaned). In-game confirmation still pending.
**Working tree notes:** Land collectors, FarmDashboard.lua version, NEW APP fields section + land lib + types, fields.css, en.json, SCHEMAS/LEDGER/MEMORY; no commit.
**Next:** Stop the dedicated server, re-run `npm run upload:gportal-mod`, restart server and :8767, then confirm `soilFertilizer.enabled: true` with a fieldCount.

### [2026-07-28] Wizard - copyFile Bool/Number spam fix
**Done:**
- Removed Number `1`/`0` trials from `_copyFileFs25BestEffort`; engine wants Bool `forceOverwrite` only. `pcall` does not silence type-check Script errors.
- Map overview export now latches `_mapOverviewExportDone = true` on failure after one attempt (single `Logging.warning`), so mid-cycle collectors never retry forever.
- modDesc + FarmDashboard.VERSION patch bump `5.0.0.0` -> `5.0.0.1`.
- Lesson banked here + one-liner in `.cursor/rules/fs25-giants-engine-farmhub.mdc`.
**Durable lesson (Giants API types):**
- Never use Number `1`/`0` as Bool for Giants APIs (`copyFile`, etc.). Vanilla always used Bool; this predates FS 1.21.
- Compat trial loops that include wrong types flood the script log even inside `pcall`.
- Failed optional exports must set a done/failed latch so staggered collectors do not retry every cycle.
- Confirm APIs against wiki/decompile/vanilla call sites before guessing alternate signatures. Do not invent densmap/API breaks from log spam alone.
**Not done / open:** User must restart dedicated + client after deploy for the zip to load.
**Working tree notes:** FarmDashboardDataCollector.lua, FarmDashboard.lua, modDesc.xml, docs/rf-suite MEMORY/LEDGER, fs25-giants rule; no commit.
**Next:** Confirm script log is clean of `copyFile` Argument 3 Bool/Number spam after restart.

### [2026-07-28] Wizard - Witcombe ~89% MP join hang handoff
**Done:** Plain-English Ash handoff at `docs/rf-suite/ASH-HANDOFF-witcombe-89-join-hang.md` (+ Ash inbox REQUEST). FarmDashboard not root cause; 5.0.0.1 copyFile fix cleaned logs only.
**Not done / open:** RF seats own SF join sync (#756 family), event registration, #755 texture/fill pressure, MDM/MasterHUD load thrash.
**Next:** Ash routes to Claude(A)/Tyson; binary tests (SF off, vanilla Witcombe, tiny fleet, SP) while FarmDashboard stays on.

### [2026-09-01] Dash - RF pins + LiveMap map + NEW APP chrome
**Done:** LiveMap-inspired fleet map (type SVGs, heading, hide-border via terrainInset); Live/Snap badge; mod-required banner; SimHub cards; RF tested versions + depotManager verified on 1.0.4.1.
**Not done / open:** In-game SP/MP smoke; heading needs a mod reload; NEW APP still untracked in git; no classic `latest.yml` publish.
**Working tree notes:** NEW APP fleet-map + VehicleDataCollector headingDeg; no commit.
**Next:** Wizard playtest `npm run dev:new-ui` on :8767.

### [2026-09-05] Dash - Weather Guard outlook temps
**Done:** RfWeatherGuardDataCollector fills daily min/max via engine `getDailyForecast` when WG hourly temp is nil (Giants hourly wrap is one day). Modal shows high/low; rain 0% hidden.
**Not done / open:** Needs in-game mod reload + collector cycle; WG itself still only publishes hourly temps.
**Working tree notes:** FarmHub only (no Weather Guard repo edit).
**Next:** Playtest Weather modal after new mod zip is loaded.

### [2026-09-07] Dash - RF handle audit vs current clones
**Done:** Compared FarmHub collectors to local Realistic-Farming clones. Mission handles and getter names still match. Bump-only version pins (SF 2.5.0.126, SCS 1.2.5.142, Dairy 1.0.5.39, etc.). `soilSystem.PFActive` removed upstream; FarmHub still stands down via `g_modIsLoaded`.
**Not done / open:** In-game SP/MP smoke of RF panels after dedicated reload.
**Working tree notes:** FarmHub docs + About pins only; no RF repo edits.
**Next:** None unless a live collector comes back empty.
