# V5 compatibility recovery: root-cause audit and execution plan for Ash

Date: 23 September 2026. All captured runtime clock times below are British Summer Time (BST, UTC+1).

**Decision: do not call this compatibility repair release-ready on the available evidence.** There is a captured bootstrap-only export failure and multiple confirmed contract defects. The exact instruction blocking the first complete export still requires one bounded diagnostic reproduction.

**Scope: audit and execution plan only.** This work created report artifacts, not product changes. No new tests, builds, installs, live game actions, save changes, settings writes or Git operations were performed.

## 1. Executive findings

The reported missing fertiliser/lime and companion information is not simply a cosmetic problem. The captured feed has no field rows and no usable companion payload even though the game continued running. Several additional source defects can hide, mis-scope or manufacture values once collection starts. Fixing only a card or only the startup delay would leave those defects in place.

- **F01 P1: The current save export is still an empty bootstrap, not a working live feed.** Observed failure; exact blocking instruction remains unproven.
- **F02 P1: Mission lifecycle initialization is unwired and updates are registered twice.** Confirmed source/engine contract mismatch; live magnitude not measured.
- **F03 P1: The original XML parsing bug still turns unrelated Settings saves into module changes.** Confirmed current source and exact local configuration.
- **F04 P1: Installed mods are being mistaken for active mods.** Confirmed against the local game ModManager source and current export/log.
- **F05 P1: Several companion readers look in the wrong Lua environment.** Confirmed source/engine namespace contract mismatch.
- **F06 P1: Unavailable companion data is displayed as reassuring factual data.** Confirmed producer-to-consumer behavior.
- **F07 P1: The selected farm can be shown another farm's enhanced-loan totals.** Confirmed UI fallback behavior.
- **F08 P1: Snapshot retention resurrects empty/disabled sections and is not session-safe.** Confirmed source transitions; needs full integration regression tests.
- **F09 P2: The merge immediately removes the freshness markers it just added.** Confirmed main-process call order.
- **F10 P2: Soil bars still conflate missing current measurements with measured zero.** Confirmed source cases; current PF save was not available for a fresh runtime comparison.
- **F11 P2: One companion reader failure can erase the entire companion payload.** Confirmed error-isolation boundary; performance impact not benchmarked.
- **F12 P2: Build identity and the test configuration are too ambiguous to prove a repair.** Confirmed local evidence and transcript; no installed-app certification.

P1 means a high-priority correctness blocker for the intended release experience. P2 means an important correctness, resilience or acceptance risk. This prioritisation is not a claim of security severity.

### Captured facts

- **Captured live export: Empty bootstrap.** savegame19 data.json: zero fields, vehicles and animals; companionMods.enabled=false; core collector switches true.
- **Observed interval: 11m 39s.** Export file write 16:36:55 BST; captured game log continues to 16:48:34 BST on 23 September 2026. These are captured timestamps, not continuous monitoring.
- **Targeted mod identity: 5 files matched.** Source, loose installed directory and installed ZIP matched for five central files. Duplicate deployment remains unsuitable for release acceptance.
- **Work produced: Plan only.** Read-only audit plus report artifacts. No product fixes or acceptance tests have been performed.

### What the transcript changes about the diagnosis

The original request was active-mod-aware unit compatibility and useful data from the NAS mod vault, not just an inventory of installed ZIPs. The supplied transcript records increasingly broad compatibility claims, but also explicitly admits presence-only cards and no live reload proof. Those caveats matter.

Current source already contains genuine improvements: the mission-clock grace change, earlier fields/weather collection, clearer XML fertiliser/lime text, normalisation work, RF-specific rendering and real-time generation/server guards. All 16 RF collectors inspected have an isModLoaded function; missing RF detector methods are not a finding of this audit. Do not undo these improvements indiscriminately.

The current live failure does not prove that every older defect was introduced by Ash. This plan assigns fixes to the code path and data contract, not blame to a person. It also does not establish that the grace-clock correction is the sole remaining blocker.

### Working data path

Game mission lifecycle -> active-mod capability discovery -> scheduled collectors -> committed JSON export -> Electron read/normalisation/XML fallback -> section retention and offline persistence -> freshness/farm/provider selection -> renderer cards and details.

A correct value must survive every stage with its identity, scope, availability and age intact. The work packages follow this path, rather than adding downstream defaults whenever upstream data is missing.

## 2. Evidence boundaries and protected behaviour

### Inspected

- The supplied Cursor transcript and the recent workspace-specific Ash conversation, treated as historical evidence rather than instructions.
- Current V5 renderer, Electron ingestion/configuration/retention code, dashboard Lua lifecycle and collectors, and relevant existing tests.
- One captured current savegame19 export, game log, dashboard mod configuration, redacted V5 server configuration, and targeted installed-mod file identities.
- Installed companion Lua sources for Enhanced Loan System, Imperial System, Restricted Periods and Regional Crop Calendar, plus local FS25 engine lifecycle/environment/ModManager sources.

### Not established by this audit

- No new test suite, in-game interaction, diagnostic reproduction, rebuild or installation was performed during this audit.
- The captured exporter failure is real; the exact instruction preventing the first completed collection has not yet been established.
- The desktop executable actually installed/running was not certified. A historical Program Files app.asar location was absent; source findings are not an installed-desktop binary attestation.
- Five matching mod files do not establish full ZIP integrity or which already-loaded Lua bytes are resident in memory.
- Precision Farming runtime values could not be compared on a current PF export; only savegame19 had data.json at the four documented demo locations.
- This is a focused compatibility/data-integrity audit, not a fresh full security penetration test, performance benchmark, installer certification or attribution of every defect to one developer.

### Non-negotiable protections

- V5 is the release lane. Do not build/publish V4, overwrite the public classic update story, or use the classic build command as a shortcut.
- Keep one canonical FS25_FarmDashboard.zip name and the existing agreed installer output location. Put candidate identity inside manifests/version metadata, not new mod basenames or a growing collection of installer folders.
- Do not wipe saves, modSettings, desktop settings, offline snapshots or unrelated mods to conceal the failure. Preserve evidence and use disposable copies for destructive transitions.
- Keep the existing mission-clock grace correction, spawn protection, field/weather prioritisation, real-time ingestion-generation/server guards, and explicit RF-versus-PF rendering separation unless a focused regression proves they are wrong.
- Keep working fleet/vehicle, animal, production, stock/bale, map-image conversion, mileage, save selection and offline functionality. Unknown is not zero, disabled is not stale-active, and historical is not live.
- Do not force all core/RF collectors on to compensate for a parser bug. Explicit user settings, active-mod state and successfully empty sections are meaningful.
- Read third-party mod sources but do not change companion mods, the NAS vault or the Realistic-Farming upstream project for this repair.
- Diagnostic logs must be bounded and redact server passwords, tokens, private addresses where unnecessary, and configuration secrets. Do not weaken IPC, local path validation, authentication or transport security to make data appear.

## 3. Detailed findings

### F01 [P1] The current save export is still an empty bootstrap, not a working live feed

**Evidence status:** Observed failure; exact blocking instruction remains unproven

**User impact:** Missing fields and companions share an upstream failure. Styling, reinstalling the desktop app or retaining XML cannot manufacture the missing live measurements.

**Evidence and failure mechanism**

- Captured savegame19/data.json was last written at 2026-09-23 16:36:55 BST. It contains zero field, vehicle and animal rows, companionMods.enabled=false and all RF collector flags false. Core fields/economy/production/companion switches are true.
- The captured game log loads Farm Dashboard, Enhanced Loan System, Restricted Periods, Regional Crop Calendar, Livestock Monitor, Production Watcher and Soil Fertilizer, then continues to 16:48:34 BST: at least 11 minutes 39 seconds after that export write. This is not a fresh 45-second grace interval.
- Five files match between current project source, the installed loose mod folder and installed ZIP: modDesc.xml, FarmDashboard.lua, FarmDashboardDataCollector.lua, FillTypeUtils.lua and CompanionModsDataCollector.lua. This is a targeted comparison, not full-package certification.
- FarmDashboard:update catches collector failures and reports them only through devWarn. FarmDashLog.devWarn returns immediately when diagnostics is false, as it is in the captured config. Silent runtime failures are therefore a credible unresolved path. Absence of a visible error does not establish a healthy exporter.

**Source references**

- [FS25_FarmDashboard_Mod/src/FarmDashboard.lua:226](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboard.lua:226)
- [FS25_FarmDashboard_Mod/src/FarmDashLog.lua:21](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashLog.lua:21)
- [FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:3399](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:3399)

**Root-cause repair direction:** Instrument one bounded diagnostic run at the actual update/collector/write boundaries, identify the first stage not progressing, and repair that stage. Keep errors visible independently of verbose tracing. Do not declare the grace-clock change the sole fix without observing a completed live export.

**Required proof**

- First update observed; selected collector begins and finishes; serialization commits; export generation advances.
- Repeat with diagnostics off: healthy output still advances and real exceptions remain visible.
- A collector exception must expose the module and failure reason while preserving unrelated completed data.

### F02 [P1] Mission lifecycle initialization is unwired and updates are registered twice

**Evidence status:** Confirmed source/engine contract mismatch; live magnitude not measured

**User impact:** The reset/grace logic Ash repaired is placed in a callback that is not wired by the reviewed mod. The same updater is registered through two engine paths, invalidating one-work-unit-per-frame assumptions.

**Evidence and failure mechanism**

- FarmDashboard defines onStartMission, but the root mod scripts contain no subscription or hook that calls it. The reviewed game Mission00:onStartMission publishes CURRENT_MISSION_START; BaseMission/FSBaseMission do not dispatch that name to mod event listeners.
- FarmDashboard is registered by addModEventListener and also mission:addUpdateable. The engine BaseMission:update iterates both collections.
- The local hasLoaded guard is set on loadMap but never reset on deleteMap. Same-process save changes can skip intended initialization unless environments are fully recreated; this transition requires an explicit test.
- No expected Post-load collection grace log line appears in the captured log. This is consistent with the missing callback, but is not proof that it alone caused the bootstrap stall.

**Source references**

- [FS25_FarmDashboard_Mod/src/FarmDashboard.lua:82](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboard.lua:82)
- [FS25_FarmDashboard_Mod/src/FarmDashboard.lua:112](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboard.lua:112)
- [FS25_FarmDashboard_Mod/src/FarmDashboard.lua:153](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboard.lua:153)
- [FS25_FarmDashboard_Mod/src/FarmDashboard.lua:181](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboard.lua:181)
- [FS25_FarmDashboard_Mod/src/FarmDashboard.lua:266](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboard.lua:266)
- [C:/Users/Graham/Documents/FS25 Game Files/extract/decompiled/scripts/mission00.lua:501](C:/Users/Graham/Documents/FS25%20Game%20Files/extract/decompiled/scripts/mission00.lua:501)
- [C:/Users/Graham/Documents/FS25 Game Files/extract/decompiled/scripts/BaseMission.lua:814](C:/Users/Graham/Documents/FS25%20Game%20Files/extract/decompiled/scripts/BaseMission.lua:814)

**Root-cause repair direction:** Use one supported mission-start subscription and one updater registration, both idempotent. Reset session-owned state on teardown. Verify callback arguments and load order against the current game source before implementation.

**Required proof**

- Cold SP load calls initialization exactly once.
- Each engine tick causes at most one coordinator update.
- Main menu -> another save, reload, MP host, dedicated host and joined-client teardown do not reuse jobs or duplicate subscriptions.

### F03 [P1] The original XML parsing bug still turns unrelated Settings saves into module changes

**Evidence status:** Confirmed current source and exact local configuration

**User impact:** Fields, economy and production can be read as disabled even though their module attributes are true. Unconditional mod-config saving can write those false values back; forcing them on at game load hides rather than repairs the cause.

**Evidence and failure mechanism**

- parseModConfigXml searches the entire XML text for fields/economy/production without an attribute boundary or parent-element scope.
- The captured config has useStateMachine_fields="false", useStateMachine_economy="false" and useStateMachine_production="false" in settings before modules fields/economy/production="true". Those suffixes satisfy the parser regex.
- SettingsModal.saveMain always invokes saveModConfig after saving UI/server settings, not only when the mod settings changed. Its mod-write failure branch marks the lifecycle saved.
- The Lua load path now forces core exporters on and writes config. This competes with the still-broken desktop parser and does not stop recurrence. Current true flags also show that this bug is not sufficient to explain the observed stalled session by itself.

**Source references**

- [FS25_FarmDashboard_App/modConfigXml.js:41](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/modConfigXml.js:41)
- [NEW APP/src/settings/SettingsModal.tsx:329](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/settings/SettingsModal.tsx:329)
- [NEW APP/src/settings/SettingsModal.tsx:391](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/settings/SettingsModal.tsx:391)
- [FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:1549](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:1549)

**Root-cause repair direction:** Parse exact attributes of exact elements with the existing XML dependency. Separate dirty states for UI, server, mod and LAN domains. Preserve unknown XML attributes and use a preserving read-modify-write transaction. Migrations must not override intentional current settings on every load.

**Required proof**

- Exact captured conflict fixture reads fields/economy/production=true.
- Changing only appearance writes no mod configuration.
- Unknown keys survive; explicit false survives load/save; malformed-present XML fails safely rather than overwriting it.
- A failed mod write produces a partial-save/failure result, never an unqualified saved/synced result.

### F04 [P1] Installed mods are being mistaken for active mods

**Evidence status:** Confirmed against the local game ModManager source and current export/log

**User impact:** Vanilla or PF-only saves can inherit units or companion cards from unrelated ZIPs in the mods folder. This directly violates the requested mod-active-only behavior.

**Evidence and failure mechanism**

- CompanionModsDataCollector.findLoadedName falls back to every entry in g_modManager.mods without checking whether that mod is loaded for the mission.
- FillTypeUtils.unitDisplayForJson scans mods and nameToMod after scanning the active list; it also treats a leftover Imperial settings XML as evidence that Imperial is present.
- The captured RF save export reports both British and Imperial presence. The captured Load mod lines include British but not Imperial. Inventory lists are not equivalent to mission activation.
- The local ModManager implements getModByName and getActiveMods, but not getActiveModByName. Current version lookup therefore relies on an unsupported API in this reference and can silently return no version.

**Source references**

- [FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua:441](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua:441)
- [FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua:470](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua:470)
- [FS25_FarmDashboard_Mod/src/FillTypeUtils.lua:663](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FillTypeUtils.lua:663)
- [FS25_FarmDashboard_Mod/src/FillTypeUtils.lua:727](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FillTypeUtils.lua:727)
- [C:/Users/Graham/Documents/FS25 Game Files/extract/decompiled/scripts/misc/ModManager.lua:89](C:/Users/Graham/Documents/FS25%20Game%20Files/extract/decompiled/scripts/misc/ModManager.lua:89)
- [C:/Users/Graham/Documents/FS25 Game Files/extract/decompiled/scripts/misc/ModManager.lua:112](C:/Users/Graham/Documents/FS25%20Game%20Files/extract/decompiled/scripts/misc/ModManager.lua:112)

**Root-cause repair direction:** Establish active mission membership first. Use the inventory only to resolve metadata for that active name. Gate settings-file fallbacks behind active membership. Support aliases explicitly; do not use an unrestricted installed-name scan to create active detections.

**Required proof**

- All compatible ZIPs installed, only Farm Dashboard active: no companion hub and litres remain unchanged.
- British-only and Imperial-only careers do not contaminate one another.
- Old Imperial settings remain on disk while its mod is disabled: no Imperial activation.
- Active renamed/known-alias packages resolve their own metadata without matching unrelated names.

### F05 [P1] Several companion readers look in the wrong Lua environment

**Evidence status:** Confirmed source/engine namespace contract mismatch

**User impact:** A mod may be detected but its useful data remains missing. Presence alone does not prove access to loan, crop-calendar, restriction or unit settings.

**Evidence and failure mechanism**

- The game creates a separate environment for each external mod, stores it under the mod name, and redirects that mod's getfenv global result back to its own environment.
- CompanionModsDataCollector.envGet("g_els_loanManager") and envGet("SlurryBan") do not look in FS25_EnhancedLoanSystem or FS25_RestrictedPeriods. The reviewed companion ZIPs create those symbols in their own environments.
- The Regional Crop Calendar ZIP creates g_regionalCropCalendar in src/RegionManager.lua. The dashboard similarly searches its own environment for that name.
- FillTypeUtils uses rawget(_G, "UnitConversionMod") instead of resolving the active Imperial mod environment. The fallback settings-file read can conceal this access error on one PC but does not establish live or multiplayer parity.

**Source references**

- [FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua:397](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua:397)
- [FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua:511](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua:511)
- [FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua:638](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua:638)
- [FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua:674](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua:674)
- [FS25_FarmDashboard_Mod/src/FillTypeUtils.lua:717](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FillTypeUtils.lua:717)
- [C:/Users/Graham/Documents/FS25 Game Files/extract/decompiled/scripts/mods.lua:300](C:/Users/Graham/Documents/FS25%20Game%20Files/extract/decompiled/scripts/mods.lua:300)

**Root-cause repair direction:** Create a source-backed adapter registry with active name, environment/mission handle, supported version, capability probe, reader and scope for each supported integration. Resolve companion-owned symbols through the owning environment or documented mission handle, never by flattening all mods into one global namespace.

**Required proof**

- Namespace-faithful fixtures keep each companion in a separate environment.
- ELS balances, Restricted Periods state, crop region and Imperial live settings match their owning mod.
- Missing manager, late initialization, unsupported version and reader failure produce distinct unavailable states.

### F06 [P1] Unavailable companion data is displayed as reassuring factual data

**Evidence status:** Confirmed producer-to-consumer behavior

**User impact:** The dashboard can say spreading is allowed, no enhanced loans exist or the calendar is vanilla when it simply failed to read the relevant mod.

**Evidence and failure mechanism**

- Restricted-period collection returns {enabled=true} when its API cannot be found. The UI treats missing anyActive as false and renders Spreading allowed.
- Missing ELS manager produces an enabled loans block with an empty byFarm map. The UI falls through to No active enhanced loans for this farm.
- Missing crop-calendar manager produces {enabled=true}; the UI defaults missing selectedRegion to vanilla.
- These are not harmless empty states: they replace unknown information with operational conclusions.

**Source references**

- [FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua:638](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua:638)
- [FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua:674](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua:674)
- [FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua:883](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua:883)
- [NEW APP/src/sections/companions/CompanionModsSection.tsx:118](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/companions/CompanionModsSection.tsx:118)
- [NEW APP/src/sections/companions/CompanionModsSection.tsx:146](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/companions/CompanionModsSection.tsx:146)
- [NEW APP/src/sections/companions/CompanionModsSection.tsx:175](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/companions/CompanionModsSection.tsx:175)

**Root-cause repair direction:** Represent detected, ready, unavailable, failed and stale separately. Only show allowed/zero/default values after a successful complete read with those actual values. Make unavailable reasons and source timestamps visible without alarming normal absent-mod users.

**Required proof**

- Missing SlurryBan API never produces Spreading allowed.
- ELS manager missing never produces a zero-loan claim.
- Valid zero loans is displayed as zero; valid no-ban is displayed as allowed.
- Stored stale values carry a last-known label and cannot be presented as current advice.

### F07 [P1] The selected farm can be shown another farm's enhanced-loan totals

**Evidence status:** Confirmed UI fallback behavior

**User impact:** In a multi-farm save a debt-free or unavailable farm can receive the all-farms debt total while its detailed loan list remains empty.

**Evidence and failure mechanism**

- CompanionModsSection uses Number(farm?.restAmount) || Number(payload.loans.restAmount) || 0 and the same pattern for count. A missing row or a valid zero falls through to the aggregate.
- companionLoansForFarm already has the correct selected-farm lookup; the UI bypasses its scope with the fallback.
- resolveActiveFarmId also overrides a valid selected farm if it owns none of fields/vehicles/husbandry, even if it has only production, contracts, stock or finances. This is a separate selection-policy risk to cover in the same farm-scope work.

**Source references**

- [NEW APP/src/sections/companions/CompanionModsSection.tsx:50](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/companions/CompanionModsSection.tsx:50)
- [NEW APP/src/lib/companionMods/index.ts:122](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/companionMods/index.ts:122)
- [NEW APP/src/lib/farm-scope.ts:176](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/farm-scope.ts:176)

**Root-cause repair direction:** Keep selected-farm and all-farms views separate. Preserve zero with explicit availability/completeness, not truthiness. Preserve a valid user-selected farm even when it owns no equipment or fields; infer only when selection is absent or invalid.

**Required proof**

- Farm A debt=0, farm B debt>0: A never shows B's debt.
- Missing A data is unavailable, not B's total.
- Explicit all-farms mode is clearly labelled and reconciles to its rows.
- A production-only or newly created farm remains selectable across refreshes.

### F08 [P1] Snapshot retention resurrects empty/disabled sections and is not session-safe

**Evidence status:** Confirmed source transitions; needs full integration regression tests

**User impact:** Sold stock, emptied pens or removed RF mods can reappear. Reusing a server/save slot can mix old field detail into a new session.

**Evidence and failure mechanism**

- Stock hold tests positive quantities, so valid all-zero stock is treated as empty and the old stock is restored.
- mergeRealisticFarmingForward replaces an explicit enabled:false block with a prior enabled:true block; field moisture/soil/crop-stress forward-merging has equivalent resurrection paths.
- The successful-empty animal guard in applyLiveSectionHold is bypassed later: updateLastGoodMergedSnapshot calls mergeSnapshotSectionsForward, which unconditionally restores previously non-empty animals/production. The next held/offline payload can resurrect them.
- sameMapIdentity guards map bounds, not all retained fields/stock/RF blocks. Field enrichment keys only by farmland id. Global minimal-export ignoring also runs before the incoming save-slot change is handled.

**Source references**

- [FS25_FarmDashboard_App/mergedSnapshotHold.js:157](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/mergedSnapshotHold.js:157)
- [FS25_FarmDashboard_App/mergedSnapshotHold.js:209](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/mergedSnapshotHold.js:209)
- [FS25_FarmDashboard_App/mergedSnapshotHold.js:558](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/mergedSnapshotHold.js:558)
- [FS25_FarmDashboard_App/mergedSnapshotHold.js:694](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/mergedSnapshotHold.js:694)
- [FS25_FarmDashboard_App/mergedSnapshotHold.js:732](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/mergedSnapshotHold.js:732)
- [FS25_FarmDashboard_App/main.js:2587](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:2587)
- [FS25_FarmDashboard_App/main.js:2637](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:2637)

**Root-cause repair direction:** Replace non-empty heuristics with section outcome and provenance. Carry forward only omitted/pending/failed data from the same save identity. Successful empty and explicit disabled must invalidate backup and persisted snapshot state. Keep offline last-good data, but label it and scope it correctly.

**Required proof**

- Non-empty -> complete empty -> disconnect -> restart stays empty.
- Enabled RF -> explicit disabled -> offline never resurrects a tab or soil block.
- Sold all stock remains zero.
- A new save/map under the same configured server id cannot inherit any previous section, geometry, history or fill-type catalog.

### F09 [P2] The merge immediately removes the freshness markers it just added

**Evidence status:** Confirmed main-process call order

**User impact:** Old retained values can look live merely because a different collector produced recent data.

**Evidence and failure mechanism**

- rebuildMerged applies live-section holding before stampLuaExportFreshness.
- For a non-stale Lua receipt, stampLuaExportFreshness deletes liveSectionsHeldAt, heldFromSnapshotAt and mergeHeldStaleAt.
- The main process then updates snapshots and broadcasts the result. A recent global receipt does not make all retained sections recent.

**Source references**

- [FS25_FarmDashboard_App/main.js:2361](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:2361)
- [FS25_FarmDashboard_App/main.js:2482](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:2482)

**Root-cause repair direction:** Separate transport freshness, export generation and per-section freshness. A successful vehicle update may clear a vehicle error, not retained soil/stock/companion provenance. Retain source timestamps through persistence and rendering.

**Required proof**

- Fresh vehicles plus failed fields show live fleet and stale fields simultaneously.
- App restart or repeated reading of the same export cannot reset the displayed measurement age.
- The UI can distinguish connected transport, exporter alive and section current.

### F10 [P2] Soil bars still conflate missing current measurements with measured zero

**Evidence status:** Confirmed source cases; current PF save was not available for a fresh runtime comparison

**User impact:** The recent Awaiting live soil map change fixes one fallback but not all. A target without a current reading can produce a false deficiency.

**Evidence and failure mechanism**

- buildSoilBars defaults missing nitrogenLevel to zero once a target exists.
- The pH live-data check accepts a valid target alone, then turns missing/non-finite current pH into zero; null is also converted to zero by Number.
- XML creates placeholder nitrogenLevel/phValue/targets of zero while separately carrying scan metadata. A bought scan flag does not prove that the live values were read.
- RF-active cards intentionally use RfLandPanels rather than PF bars. Montana RF is not a substitute for testing Riverbend PF or Montana PF.

**Source references**

- [NEW APP/src/sections/fields/field-helpers.ts:498](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/fields/field-helpers.ts:498)
- [NEW APP/src/sections/fields/field-helpers.ts:559](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/fields/field-helpers.ts:559)
- [FS25_FarmDashboard_App/xmlCollector.js:458](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/xmlCollector.js:458)
- [NEW APP/src/sections/fields/FieldCard.tsx:176](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/fields/FieldCard.tsx:176)

**Root-cause repair direction:** Resolve soil provider and measurement availability explicitly: vanilla application levels, PF N/pH or RF nutrients/pH. Targets, current values and scan status must be independent. Do not turn an unknown current value into zero or request another soil scan solely because telemetry failed.

**Required proof**

- PF scanned/current missing/target known shows unavailable, not 0 kg/ha or pH 0.
- A genuinely measured N=0 remains zero.
- PF current and target values match the in-game display, allowing only documented rounding.
- RF soil stays RF; no inferred conversion between PF kg/ha and RF ppm/percent.

### F11 [P2] One companion reader failure can erase the entire companion payload

**Evidence status:** Confirmed error-isolation boundary; performance impact not benchmarked

**User impact:** A failing optional reader can hide unrelated supported companions. The coordinator also repeats capability detection on the update path instead of using a mission-scoped registry.

**Evidence and failure mechanism**

- One outer pcall covers all detection and all adapter reads. If an unguarded reader throws, collectStep returns an empty disabled payload for the entire hub.
- getEnabledCollectorOrder calls ensureModLinkedCollectorsEnabled on each coordinator update, which probes optional integrations again. The double-registration issue can multiply this work.
- Some detail lists are capped, but detection and reader work is still one synchronous companion collectStep. No measured FPS claim is made from this inspection.

**Source references**

- [FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua:847](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua:847)
- [FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua:944](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua:944)
- [FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:2367](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:2367)
- [FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:3428](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:3428)

**Root-cause repair direction:** Isolate each adapter and preserve independent results. Cache mission activation, retry readiness at a bounded cadence, and budget expensive scans. Record duration, row truncation and failure reason per adapter.

**Required proof**

- One broken loan adapter leaves restrictions, diesel and other companions visible.
- Capability failures cannot abort the core field exporter.
- Measure first export latency and collector p50/p95/max with and without companions; preserve existing spawn safety.

### F12 [P2] Build identity and the test configuration are too ambiguous to prove a repair

**Evidence status:** Confirmed local evidence and transcript; no installed-app certification

**User impact:** Repeatedly distributing the same version and keeping two mod deployment forms makes it difficult to know what was exercised. Presence cards and compilation are being used as substitutes for end-to-end acceptance.

**Evidence and failure mechanism**

- modDesc.xml says 5.0.0.14 while FarmDashboard.VERSION is 5.0.0.12; diagnostics use the latter.
- The V5 overlay still uses 5.0.5 across multiple distinct rebuilds in the transcript. The transcript also records an accidental classic build attempt; this audit did not build either line.
- Both a loose FS25_FarmDashboard directory and its ZIP are installed. The game log explicitly warns that the loose mod is not valid for multiplayer. Five compared files match now, but dual deployment remains ambiguous.
- At capture only savegame19 data.json existed at the four documented demo export paths, and the V5 config contained one local server for savegame19. That is current setup evidence, not permission to overwrite the user's choices.
- The transcript explicitly says no live reload proof and that many cards are presence/description only. Those limitations must survive the handoff.

**Source references**

- [FS25_FarmDashboard_Mod/modDesc.xml:5](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/modDesc.xml:5)
- [FS25_FarmDashboard_Mod/src/FarmDashboard.lua:7](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboard.lua:7)
- [FS25_FarmDashboard_App/electron-builder.rf.yml:16](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/electron-builder.rf.yml:16)
- [C:/Users/Graham/Documents/cursor_game_mod_configuration_issue.md:1557](C:/Users/Graham/Documents/cursor_game_mod_configuration_issue.md:1557)
- [C:/Users/Graham/Documents/cursor_game_mod_configuration_issue.md:2283](C:/Users/Graham/Documents/cursor_game_mod_configuration_issue.md:2283)

**Root-cause repair direction:** Use one deliberate candidate with coherent version/build identifiers and canonical ZIP naming. Separate source, package, installed and live-save evidence. Retire the loose release-test copy by reversible backup only after consent and when the game is closed. Do not recreate or wipe demo saves as a debugging substitute.

**Required proof**

- Source manifest matches packaged files and the actual loaded artifact.
- One canonical mod ZIP is loaded for SP and MP acceptance.
- V5 uses latest-rf.yml; public V4 and unrelated mods are unchanged.
- Each advertised live adapter has an actual same-save comparison, not just a detected card.

## 4. Shared contracts to settle before adding integrations

The goal is a small set of explicit rules used by the existing pipeline, not a new framework or a rewrite. Agree these contracts before implementing separate cards. They should be represented in normalised types/fixtures and preserved at every merge boundary.

- **Active mod.** Installed inventory is not activity. A package can be active but its adapter can still be unavailable or not ready. Version metadata follows, rather than creates, active status.
- **Adapter availability.** Represent inactive, detected/not-ready, ready, unavailable/unsupported and failed separately. Freshness is independent. Only a completed ready read can establish zero loans or no active restrictions.
- **Scope.** Record selected-farm versus all-farm/mission scope explicitly. Preserve numeric zero and valid user farm selection. Missing farm data cannot fall back to another farm's aggregate.
- **Measurement.** Value, unit, provider, current-versus-target, availability/scan state and sample age are separate facts. Missing/null is not measured zero.
- **Section completeness.** A completed empty section is authoritative. A missing or interrupted section may retain labelled same-session history. An explicit disabled state invalidates earlier active data.
- **Identity and freshness.** Scope retention to server/save/map/session identity. Transport freshness, export commit age and section sample age cannot overwrite each other.
- **Diagnostic health.** Normal-operation failures must remain visible with verbose diagnostics off. Rate-limit repeated errors, isolate adapters and never log raw secrets.

### Suggested compatibility support record

For each companion, record canonical mod ID; active-state evidence; supported version/capability; verified owning API/environment; exported fields and units; farm/mission scope; readiness condition; error/freshness behaviour; source fixture; live comparison; support level. Support levels are live-data, limited-data, presence-only and unsupported. A detected mod is not a completed data integration.

### Dependency order

W00 first. W01 and W02 then establish a functioning, safely configured producer. W03 provides the common capability/access layer. W04 and W05 consume it; W06 must agree the shared status/identity contract with both. W07 uses the same active registry. W08 verifies the resulting contracts. Only then perform W09 candidate acceptance and W10 release handoff. Separate ownership is possible, but shared type/merge changes must be coordinated, not implemented independently with incompatible defaults.

## 5. Detailed execution work packages

Every step below is proposed work for Ash, not a claim it has been implemented. Do not move to packaging while the first-export failure remains unexplained. The acceptance checks are future tests, not results from this audit.

### W00. Freeze evidence and locate the first stalled exporter stage

**Dependencies:** None

**Findings covered:** F01, F12

**Objective:** Turn the observed bootstrap-only failure into a specific, reproducible stage failure before another speculative repair.

**Primary ownership/files**

- [FS25_FarmDashboard_Mod/src/FarmDashboard.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboard.lua)
- [FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua)
- [FS25_FarmDashboard_Mod/src/FarmDashLog.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashLog.lua)

**Implementation sequence**

1. Record source candidate identity, loaded mod name/version, selected save slot/map/farm, collection interval, enabled modules and the current export generation. Preserve copies of the failing log/config/export before changing them; omit secrets from the report.
2. Record both loose and ZIP deployment forms. Do not delete either during diagnosis. For the later packaged test, stop the game and move the loose copy to a reversible backup outside the mods directory.
3. Add narrow counters and timestamps for loadMap, mission-start notification, first update, readiness/defer reason, collector selection, collector start/end, serialisation start/end and successful export replacement.
4. Log actual exceptions through a bounded always-on error path, not the diagnostics-only devWarn path. Include collector/stage and a sanitised error; deduplicate repeated identical errors rather than flooding log.txt.
5. Run one explicitly bounded reproduction on the approved test save. Use a deadline derived from configured grace plus one collection cycle plus a small margin, for example 45 + 60 + 15 = 120 seconds of progressing game time, while recording pause/time-scale effects separately.
6. At the deadline, identify the first missing transition. No update suggests registration/lifecycle; repeated deferred updates require the exact reason; one unfinished collector requires its local stack and progress; completed collection with no file requires serialisation/write investigation.
7. Repair the demonstrated failure in its owning stage. Do not replace the evidence with another arbitrary grace period, unconditional module enablement, a desktop reinstall or repeated data resets.
8. Retain bounded stage health and last-success information for support; switch detailed tracing back off after the diagnosis. Document whether the root cause is lifecycle, a collector exception, scheduling, or write completion.

**Acceptance**

- The same failing configuration produces an actionable stage record without exposing credentials.
- A completed collection replaces the bootstrap and advances a recorded generation or equivalent unambiguous commit marker.
- With verbose diagnostics disabled, real failures are still visible and unrelated healthy collectors continue where safe.

**Deliverable:** A short reproduction record, exact failing function/call path, minimal owning-stage repair and a before/after export pair. This is the first stop/go gate.

### W01. Repair mission lifecycle and establish a single update owner

**Dependencies:** W00

**Findings covered:** F01, F02, F11

**Objective:** Make initialisation, readiness, updates and teardown follow the actual FS25 mission contract rather than an unwired method name.

**Primary ownership/files**

- [FS25_FarmDashboard_Mod/src/FarmDashboard.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboard.lua)
- [FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua)
- [FS25_FarmDashboard_Mod/src/FarmDashLog.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashLog.lua)

**Implementation sequence**

1. Use the local engine source as the API authority: mission00 publishes CURRENT_MISSION_START and BaseMission updates both updateables and mod event listeners. Verify the subscription/unsubscription signature against that local source before implementing it.
2. Wire mission-start handling through a supported subscription or verified mission hook. Make handling idempotent for one mission, with a safe already-started path only if the actual engine state supports it.
3. Remove duplicate update ownership: retain the appropriate mod-event-listener update path or one verified updateable registration, not both. Avoid suppressing legitimate work with arbitrary dt-based guesses.
4. Reset hasLoaded and all mission-scoped state at teardown. Unsubscribe hooks, release references, invalidate in-progress collection and clear per-session detection/adapter caches.
5. Initialise/reset stagger state and call onMissionLoaded at the real lifecycle boundary. Keep the grace arm and comparison on the same clock; retain existing spawn/authority checks.
6. Give each cycle explicit progress, completion and failure states. A collector that fails must not leave the whole scheduler permanently busy or prevent subsequent cycles.
7. Do not equate menu pause, save loading or a slow first frame with a data failure. Expose a clear waiting reason and enforce deadlines only while the relevant mission clock can progress.
8. Instrument update counts in the fixture or diagnostic run and show one coordinator update per expected engine dispatch. Measure, rather than claim, the frame-time effect.
9. Test a second save in the same game process, not only a full restart. The new mission must initialise once with no previous map/farm/mod references.

**Acceptance**

- Fresh load, return-to-menu, same-save reload and different-save load each initialise exactly once.
- One update dispatch produces one dashboard update; duplicate notifications do not duplicate subscriptions.
- Load failure and teardown during an unfinished cycle leave the next mission able to export.
- The bootstrap is replaced after readiness and bounded grace; the actual completed export has fields and expected companion status for the selected save.

**Deliverable:** A documented lifecycle state sequence and focused regression coverage. Preserve existing safety behaviour; do not claim W00 solved until a real completed export is observed.

### W02. Repair configuration parsing and save only changed settings domains

**Dependencies:** W00

**Findings covered:** F03

**Objective:** Stop a display-only Settings save from silently rewriting collection modules.

**Primary ownership/files**

- [FS25_FarmDashboard_App/modConfigXml.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/modConfigXml.js)
- [NEW APP/src/settings/SettingsModal.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/settings/SettingsModal.tsx)
- [FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua)

**Implementation sequence**

1. Replace whole-document suffix matching with element-scoped XML parsing. Read module attributes only from their intended element and settings/state-machine attributes only from theirs.
2. Use the existing XML parsing capability and a narrow schema mapping; preserve unknown attributes/elements and supported legacy forms during writes instead of rebuilding a lossy document.
3. Distinguish a missing config (explicit initial defaults), a present malformed config (visible error, no destructive rewrite), an absent attribute (documented default) and explicit false (honour it).
4. Add the exact captured fixture: useStateMachine_fields/economy/production=false appears before modules fields/economy/production=true. The parsed module values must remain true regardless of attribute order or whitespace.
5. Separate dirty state for UI preferences, app/server settings and mod settings in SettingsModal. Only call the mod-config save endpoint when mod settings actually changed.
6. Use the existing safe/atomic write helpers and avoid overwriting a concurrently updated file without detecting the conflict. Re-read only within the implementation's transactional save logic, not by silently discarding external changes.
7. Represent partial saves honestly. If UI preferences saved but mod configuration failed, show the failure and leave that domain dirty; do not mark the overall operation simply saved.
8. Replace repeated safety-applied rewrites with an explicit, versioned, idempotent migration only where needed. Remove forced re-enablement as a workaround after the parser and migration fixtures pass.
9. Retest older supported configs and preserve disabled collectors deliberately chosen by the user. Reset-to-defaults remains a separate explicit action.

**Acceptance**

- Exact collision fixture round-trips without module changes.
- A theme/unit/navigation preference save does not write mod config.
- An explicit module toggle writes only the intended value and survives reload.
- Malformed XML, denied write and concurrent modification do not destroy the last valid config or report complete success.

**Deliverable:** A preserving parser, per-domain dirty/save handling, migration rationale and targeted config regression tests.

### W03. Create one active-mod capability registry and correct Lua access

**Dependencies:** W01

**Findings covered:** F04, F05, F11

**Objective:** Make compatibility depend on the active mission and the actual companion API, not disk inventory or the dashboard's own Lua globals.

**Primary ownership/files**

- [FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua)
- [FS25_FarmDashboard_Mod/src/FillTypeUtils.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FillTypeUtils.lua)
- [FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua)

**Implementation sequence**

1. Build one mission-scoped active-mod registry from verified engine active-load state. Installed catalog entries are metadata only and must never promote an inactive package to active.
2. Use ModManager.getModByName for metadata and the verified active registry/filter for activity. Remove reliance on the unsupported getActiveModByName call.
3. For each supported adapter, record canonical package ID, supported version/capability, the source-confirmed owner of its API, init readiness condition, farm scope and exported fields.
4. Resolve APIs through the owning mod environment or a documented mission handle. FS25 creates a separate mod environment under the mod name; do not assume rawget on the dashboard environment reaches companion globals.
5. Trace ELS's loan manager, Restricted Periods' SlurryBan, Regional Crop Calendar's manager and Imperial System's unit configuration from their actual installed sources. Do not flatten their globals into a shared namespace.
6. Wrap each adapter read independently. One thrown exception becomes a failed adapter status, not an empty disabled payload for the entire companion hub.
7. Support delayed companion initialisation with bounded retry and explicit not-ready status. Treat an unsupported API/version as unavailable with a reason, not success with invented defaults.
8. Cache capability discovery for the mission and invalidate it on teardown/session change. Read values at the appropriate collection interval, not by scanning the installed mod manager every frame.
9. Use the same registry for unit conversion and companion presence so they cannot disagree about whether Imperial/British/other mods are active.

**Acceptance**

- Many ZIPs installed, none activated: no false companion cards or unit mode.
- Each companion active alone and in the actual combined pack: correct metadata and API access.
- Late initialisation, missing API, unsupported version and one throwing adapter leave other adapters working.
- A new mission does not inherit active-mod or API objects from the previous save.

**Deliverable:** A small source-backed adapter registry and per-adapter health contract, with contract fixtures reflecting real FS25 mod environments.

### W04. Expose useful companion data honestly and enforce farm scope

**Dependencies:** W03

**Findings covered:** F06, F07

**Objective:** Deliver the original requested useful out-of-game information, while never presenting missing data as reassuring facts.

**Primary ownership/files**

- [FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua)
- [NEW APP/src/types/dashboard.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/types/dashboard.ts)
- [NEW APP/src/lib/companionMods/catalog.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/companionMods/catalog.ts)
- [NEW APP/src/lib/companionMods/index.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/companionMods/index.ts)
- [NEW APP/src/sections/companions/CompanionModsSection.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/companions/CompanionModsSection.tsx)
- [NEW APP/src/lib/farm-scope.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/farm-scope.ts)

**Implementation sequence**

1. Define separate facts for installed/active, adapter supported, read completed, data freshness and data scope. A minimal adapter payload needs a stable ID, status, sample time/generation, reason when unavailable, scope and data.
2. Only show spreading allowed after a complete current restrictions read proves it. Missing SlurryBan/API must display unavailable/not yet read, not allowed.
3. Only show no enhanced loans when a complete selected-farm read reports zero. Preserve numeric zero using explicit/nullish handling; never fall back from a debt-free or absent farm to all-farm totals.
4. Label any all-farm summary explicitly and only show it in an intentional aggregate view. Respect a valid selected farm even when it has no fields, vehicles or husbandries.
5. Treat missing regional-calendar state as unavailable. Show vanilla only when a verified active state proves that selection, not when the manager could not be found.
6. Classify every catalog entry as live data, explicit limited/aggregate data, presence-only, or unsupported. Keep presence-only descriptions, but label them honestly and do not count them as a completed integration.
7. Prioritise ELS, spreading restrictions, crop calendar, and the livestock/production companions the user actually loads. Reuse existing pages for their corresponding domain values and use the hub as a status/summary view, not a competing source of truth.
8. Put availability, source and last-success age next to each important value. A failed/stale card should explain whether the mod is inactive, starting, unsupported or failed without dumping a raw Lua stack into the UI.
9. Use shared selectors for normalisation, farm scoping and freshness so cards, details and overview totals cannot invent different answers. Preserve display units and existing navigation patterns.
10. Add accessible labels, keyboard-reachable details/retry controls where already supported, translation keys and layouts that handle long reasons and narrow windows.

**Acceptance**

- Debt-free farm A remains zero while farm B owes money; missing farm A is unknown, not B's debt.
- No fields/vehicles/husbandry on a valid selected farm does not switch the selection to another farm.
- Unknown restriction state cannot render allowed; unknown calendar cannot render vanilla.
- Presence-only cards are visibly distinct from live adapters and never imply their data was collected.
- All advertised values match the same save, farm and in-game source.

**Deliverable:** A checked-in compatibility support matrix, honest UI states and farm-scoping regressions. Each advertised live integration needs actual data proof.

### W05. Repair the soil-data contract from provider to field display

**Dependencies:** W01, W02, W03

**Findings covered:** F01, F10

**Objective:** Keep vanilla fertiliser/lime state, Precision Farming measurements and RF soil measures distinct, available and consistent.

**Primary ownership/files**

- [FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua)
- `C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors` (bounded implementation/test scope, not permission for a broad rewrite)
- [FS25_FarmDashboard_App/xmlCollector.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/xmlCollector.js)
- [FS25_FarmDashboard_App/dataMerger.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/dataMerger.js)
- [NEW APP/src/types/dashboard.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/types/dashboard.ts)
- [NEW APP/src/sections/fields/field-helpers.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/fields/field-helpers.ts)
- [NEW APP/src/sections/fields/FieldCard.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/fields/FieldCard.tsx)
- [NEW APP/src/sections/fields/FieldsSection.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/fields/FieldsSection.tsx)

**Implementation sequence**

1. Document the owning provider and units for every displayed soil value: vanilla fertiliser/lime requirement, PF current/target nitrogen and pH, RF soil/nutrient information and scan coverage. Do not interchange their scales.
2. Trace each value through Lua collection, JSON, XML fallback, merge, type normalisation, field selector and card/detail rendering. Fix the first contract that loses or invents the value.
3. Represent current reading, target, provider, read/scan availability and source age independently. Target-known does not mean current-known; measured nitrogen zero is valid while missing/null is unavailable.
4. Remove placeholder zeros from XML fallback paths that are not measurements. Keep useful XML/static values but label their source and never allow them to override a newer authoritative live reading.
5. Make buildSoilBars require a genuine current value for a measured bar. Do not coerce null/nonfinite pH to zero or show current nitrogen as zero only because the target exists.
6. Keep existing RF-dominant rendering when an active RF provider really owns that metric. Do not display stale RF data over a current PF/base provider after a mod is disabled.
7. Validate game field ID versus farmland ID relationships for field association. Use provider-supported identifiers; do not attach soil values from an unrelated field sharing a coarse ownership key.
8. Walk scan-not-purchased, sample-purchased, available reading, field newly owned and missing-target cases on a disposable PF save. A user-facing no-scan reason must not masquerade as poor soil.
9. Ensure field list, field details, map overlays and summary totals consume the same normalised measurement and freshness policy. Keep existing correct lime/fertiliser text fixes.
10. Do not alter game agronomy, farm balances, sampling purchases or RF companion behaviour to make a visual test pass. The dashboard is observing data, not changing it.

**Acceptance**

- Base game, PF and RF fixtures each render only their own valid metric meanings.
- Current missing / target known, current zero / target known, current known / target missing, null pH, unscanned and stale readings are distinct.
- The same field's card/detail/map value agrees with a same-save in-game comparison.
- Disabling RF cannot leave RF soil badges falsely active on the next session.

**Deliverable:** One documented soil-provider contract, precise collectors/merge/selectors fixes and provider-specific tests. Choose exact RF collector files from the demonstrated failing field; do not rewrite all collectors.

### W06. Make snapshot retention session-safe and preserve real freshness

**Dependencies:** W01; coordinate contract with W04/W05

**Findings covered:** F08, F09

**Objective:** Keep offline last-known data useful without resurrecting sold/removed data or relabelling old sections as live.

**Primary ownership/files**

- [FS25_FarmDashboard_App/mergedSnapshotHold.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/mergedSnapshotHold.js)
- [FS25_FarmDashboard_App/main.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js)
- [FS25_FarmDashboard_App/dataMerger.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/dataMerger.js)
- [NEW APP/src/types/dashboard.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/types/dashboard.ts)
- [NEW APP/src/store/dashboard-store.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/store/dashboard-store.ts)
- [NEW APP/src/services/ws-client.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/services/ws-client.ts)

**Implementation sequence**

1. Define the minimum identity needed to retain a section: configured server, save slot, stable map/save identity and collection/session generation. Evaluate identity before any minimal-export early return.
2. Give sections explicit completion/availability semantics. Missing or interrupted collection is different from a successful empty array, an explicit disabled module, or a failed adapter.
3. A complete empty section must replace previous content and invalidate older per-section backups. A disabled provider must not be promoted back to active by previous snapshots.
4. Apply the policy in both applyLiveSectionHold and updateLastGoodMergedSnapshot/mergeSnapshotSectionsForward. Fixing the earlier guard alone is insufficient when a later backup merge restores old rows.
5. Handle zero stock, sold final animal, demolished production and removed companion as real transitions. Do not use positive litres or nonempty rows as the definition of authoritative data.
6. Separate transport freshness, export freshness and each retained section's original sample age. A new Lua file does not make an older held section current.
7. Change stampLuaExportFreshness so it does not delete hold markers for sections actually carried forward during the same ingest. Prefer explicit section provenance over blanket booleans that cannot explain mixed-age data.
8. Persist session identity and section provenance with offline snapshots; migrate older caches conservatively as last-known/unknown-age data. Do not delete all offline history as the solution.
9. Preserve existing WebSocket ingestion-generation and selected-server guards. Test rapid server changes with delayed prior requests so a correct cache policy is not defeated by async delivery.
10. Expose held/stale state in the renderer with a useful age/reason. Maintain a deliberate offline view but never silently blend one save/map's data into another.

**Acceptance**

- Nonempty -> successful empty -> app restart remains empty across every backup/merge layer.
- Enabled RF/companion -> disabled -> reload stays disabled.
- Same-session incomplete update can retain labelled last-known data; new-session identity cannot reuse it as current.
- Fresh export plus held animals/soil retains old section timestamps and stale labels.
- Switching server/save while a prior read is in flight cannot contaminate the selected view.

**Deliverable:** A single tested retention policy used by live merge and persisted last-good handling, with section provenance preserved end to end.

### W07. Make units follow the active mod's actual settings

**Dependencies:** W03, W04

**Findings covered:** F04, F05; units protection

**Objective:** Honour the user's original request: matching units only for mods actually active in the selected game, without inventing companion settings.

**Primary ownership/files**

- [FS25_FarmDashboard_Mod/src/FillTypeUtils.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FillTypeUtils.lua)
- [NEW APP/src/lib/fill-unit-mode.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/fill-unit-mode.ts)
- [NEW APP/src/lib/fill-units.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/fill-units.ts)
- [NEW APP/src/store/dashboard-store.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/store/dashboard-store.ts)

**Implementation sequence**

1. Read Imperial System settings from its own verified runtime environment after activity and readiness are established. An old XML settings file alone must not activate the mod.
2. Define an explicit precedence rule for genuinely simultaneous British/Imperial mods based on their source behaviour and the user's supported combination; do not infer priority from installed files.
3. Keep canonical numeric quantities in existing internal units. Apply presentation conversion in one shared formatter so stock, vehicle capacity, production and detail views remain consistent.
4. For volume-to-mass or crop-bushel values, use the upstream mod's actual per-fill-type conversion and verified density semantics. If it deliberately uses a documented fallback, mirror and identify it rather than labelling all fallbacks bugs.
5. Do not confuse BritishFillUnits with US Imperial System. Test liquids, dry crops and mass independently against the correct companion.
6. Treat absent conversion metadata as unknown or a clearly labelled supported fallback, not a confident precise value. Do not change underlying prices, inventory litres or farm totals.
7. Decide and document host-exported versus viewer-preference behaviour for multiplayer/dedicated clients. Do not advertise remote client-specific unit settings unless the data contract can represent them.
8. Preserve manual UI preferences when no active mod owns the display choice, according to the existing product rules. Saving those preferences must not modify game collector settings.

**Acceptance**

- Installed but inactive Imperial yields no active Imperial conversion, even with a leftover settings XML.
- British-only, Imperial-only and no-unit-mod saves match their own expected units.
- Known liquid/crop/mass examples agree with the actual companion; zero and missing inputs remain distinct.
- Switching saves clears unit capability and cannot retain the previous mod's mode.

**Deliverable:** A documented conversion ownership/precedence contract and same-save unit comparisons, without blanket changes to arithmetic.

### W08. Add transition regressions and measure bounded collection cost

**Dependencies:** W01-W07 implemented at source level

**Findings covered:** All findings

**Objective:** Prove the cross-layer failure modes, not just isolated helper functions or a successful compile.

**Primary ownership/files**

- `C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/tests` (bounded implementation/test scope, not permission for a broad rewrite)
- `C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/NEW APP/tests` (bounded implementation/test scope, not permission for a broad rewrite)
- `C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod` (bounded implementation/test scope, not permission for a broad rewrite)
- [NEW APP/src/services/ws-client.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/services/ws-client.ts)

**Implementation sequence**

1. Add focused config collision/round-trip tests before the parser repair, then per-domain Settings save tests covering partial failure and deliberate false.
2. Add source-backed Lua adapter fixtures that model separate FS25 mod environments, active versus installed packages, delayed API initialisation and per-adapter exceptions.
3. Create provider fixtures for base/PF/RF fields and companion statuses. Include unknown, measured zero, target-only, complete empty, disabled, stale and wrong-farm cases.
4. Test the entire ingestion chain through merge, last-good backup, freshness stamping and renderer selectors. An isolated empty-array helper test cannot certify the later merge layers.
5. Add same-process mission reload/reset coverage and delayed WebSocket/server-switch scenarios. Retain existing generation/server guards as positive regressions.
6. Inject malformed/partial export input and one failing collector. Confirm errors are bounded and visible without destroying previous valid snapshots or falsely reporting new live data.
7. Measure collector duration and API-discovery count on the actual active pack. Keep the configured per-update budget unless measured evidence justifies a documented adjustment; do not claim an FPS gain without comparable before/after measurements.
8. Run the focused app tests, existing broader tests, renderer typecheck and translation checks. Record exact commands, candidate identity, results and any skipped platform/runtime cases.
9. Do not treat a mocked Lua environment, unit test, build or automated browser run as FS25 engine, packaged install, native GUI or multiplayer acceptance.
10. Stop packaging on an unexplained regression in a previously working area. Resolve it in the owning contract rather than hiding it behind additional retention/defaulting.

**Acceptance**

- Every P1 finding has a regression that fails for its original condition and passes for the repaired path.
- No per-frame installed-vault scan remains in the normal collector hot path.
- Configured collection work is bounded and an adapter failure cannot starve unrelated modules.
- Results distinguish PASS, FAIL, NOT TESTED and BLOCKED; no skipped case is recorded as success.

**Deliverable:** A compact test/evidence record and changed-fixture list. These tests are proposed, not run by this audit.

### W09. Build one identifiable V5 candidate and run installed live acceptance

**Dependencies:** W08 passed and W00 exporter failure resolved

**Findings covered:** F12; release gates

**Objective:** Exercise the exact candidate users will receive, with no ambiguity about ZIP, desktop bundle, save or update lane.

**Primary ownership/files**

- [package.json](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/package.json)
- [FS25_FarmDashboard_Mod/modDesc.xml](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/modDesc.xml)
- [FS25_FarmDashboard_Mod/src/FarmDashboard.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboard.lua)
- [FS25_FarmDashboard_App/electron-builder.rf.yml](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/electron-builder.rf.yml)
- [docs/DEMO_COMPANION_MOD_LISTS.md](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/DEMO_COMPANION_MOD_LISTS.md)

**Implementation sequence**

1. Choose one intentional V5 candidate identity and synchronise mod descriptor, runtime diagnostic version and package/build metadata. Keep the game ZIP basename FS25_FarmDashboard.zip.
2. Use the existing V5 packaging path and agreed output directory. Never use the classic build:all command or publish an installer just because a local build finishes.
3. Create a manifest identifying source revision or source hashes, UI build, Electron bundle, mod ZIP and final installer hashes. Match packaged contents before recording package-tested.
4. Close the game for mod deployment. Preserve and move any loose release-test copy outside mods so the canonical ZIP is the only loaded form; do not delete backups or unrelated packages.
5. Install the exact candidate and record the executable/resources actually launched, not an assumed historical Program Files path. Confirm desktop and mod build IDs visibly or through bounded diagnostics.
6. Use the four documented demo scenarios only where available and approved. Capture current configuration before adding temporary server entries; do not assume missing demo exports are current or recreate saves destructively.
7. On each applicable save, wait for a proven completed export, compare game and dashboard values, open Settings and save a display-only preference, switch farm/server, close/reopen the dashboard, and verify offline/stale behaviour.
8. Test same-process game save reload and the advertised multiplayer/dedicated path with the release ZIP. Record platform/setup-dependent cases as not tested or blocked when unavailable.
9. If this candidate changes installer/runtime packaging, separately repeat install, Installed Apps visibility, uninstall/reinstall and map conversion acceptance. Do not reopen ImageMagick design or call prior installer work certified by this source audit.
10. V5 must stay on its intended update feed, including latest-rf.yml where configured. Preserve the public V4 story and do not upload/publish until all required gates are evidenced.

**Acceptance**

- Loaded source/package/install IDs agree; no duplicate loose-mod load warning in release acceptance.
- A complete fresh setup and an existing-user upgrade both reach nonempty, correctly scoped live data where the save contains it.
- Every advertised live integration matches a same-save in-game observation; presence-only support is labelled.
- Offline, units, fields, companion status, farm selection and previously working core sections pass on the installed candidate.

**Deliverable:** One candidate manifest and installed/live acceptance record, not another pile of differently named installers.

### W10. Produce the final handoff and release decision

**Dependencies:** W09 and all required gates

**Findings covered:** All findings

**Objective:** Close the loop with evidence and honest scope rather than a claim that all requested integrations are done.

**Primary ownership/files**

- [docs/COMPATIBILITY-RECOVERY-PLAN-2026-09-23.md](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/COMPATIBILITY-RECOVERY-PLAN-2026-09-23.md)
- [docs/COMPATIBILITY.md](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/COMPATIBILITY.md)
- [docs/DASH-MEMORY.md](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/DASH-MEMORY.md)

**Implementation sequence**

1. For each finding F01-F12, record the owning fix, changed files, regression proof, installed/live proof where required, and any remaining limitation.
2. For every cataloged companion, state active detection support, actual exported values, supported scope/version, freshness/error behaviour and whether the result is live-tested or presence-only.
3. Include the exact resolved first-export blocker from W00. Do not leave the original empty-bootstrap incident explained only by a list of plausible fixes.
4. Record which protected behaviours were exercised and which were not. Separate source-tested, package-tested, installed-tested and lifecycle-tested status.
5. Document rollback to the preserved previous candidate/config without deleting saves or replacing shared mods. Do not recommend broad reset as routine recovery.
6. Release only after the required gates pass on the exact final candidate. If an optional integration remains unsupported, label or withhold that integration; do not describe it as working.
7. Give Graham a concise result with candidate identity, passed scenarios, remaining risks and the compatibility support matrix. No public release or watcher/pipeline action is implied by this audit.

**Acceptance**

- No finding is marked resolved solely because code changed or the build compiled.
- No missing live/MP/installer evidence is described as a pass.
- The final support claims match what was observed and protect the established V4/V5 and ZIP-naming boundaries.

**Deliverable:** A defensible release recommendation or a precise remaining blocker list with evidence.

## 6. End-to-end acceptance scenarios

These scenarios are all **NOT RUN in this audit**. The earlier game log/export observations are diagnostic evidence, not completed acceptance. Use existing user-approved saves or disposable copies. The four historical demo slots describe intended scenarios, not a claim that all four are currently configured or available.

### T01. Base game with vault mods installed but inactive

**Setup:** Use the documented Riverbend base/demo slot 4 only if present; otherwise a disposable approved base-game copy. Keep extra ZIPs installed but inactive.

**Expected result:** No false companion or Imperial activation. Vanilla field/fertiliser/lime meanings remain correct. Full export replaces bootstrap.

**Coverage:** F01, F02, F04, F10

### T02. Precision Farming field measurements

**Setup:** Documented PF Riverbend slot 3, if available. Compare unscanned, scanned and target-only/current-zero conditions on disposable test data.

**Expected result:** Current nitrogen/pH agree with the game. Unknown is not zero. Lime/fertiliser information is not suppressed by stale RF state.

**Coverage:** F08-F10

### T03. Montana RF with the actual companion pack

**Setup:** Current savegame19 configuration, with BritishFillUnits and actually loaded RF/companion mods recorded from the game.

**Expected result:** Fields and expected companion payloads populate; per-mod API status explains any unsupported reader; useful values match the same farm/save.

**Coverage:** F01, F04-F07, F11

### T04. Montana PF / alternate unit pack

**Setup:** Documented slot 18 scenario only if present and confirmed; record the actual Imperial/companion activation rather than assuming it.

**Expected result:** PF provider and the actual active unit mod own their values. No inherited RF/British state from savegame19.

**Coverage:** F04, F05, F08, F10

### T05. Settings without mod edits

**Setup:** Open Settings, change one display-only preference, save, then reload. Also exercise the exact XML suffix-collision fixture.

**Expected result:** Collector module settings are untouched. An actual mod save failure remains visible and unsaved.

**Coverage:** F03

### T06. Two farms with contrasting loans

**Setup:** Farm A has zero loans; farm B has loans. Include an asset-empty or production-only valid selected farm.

**Expected result:** Farm A stays zero or unknown according to read completeness, never inherits B's totals, and selection is respected.

**Coverage:** F06, F07

### T07. Missing or late companion API

**Setup:** Active mod with delayed initialisation, unsupported API and one deliberately throwing adapter in a controlled fixture.

**Expected result:** Unavailable/failed is explicit. No spreading-allowed/no-loans/vanilla-calendar invention. Other companions remain populated.

**Coverage:** F05, F06, F11

### T08. Complete empty and disabled transitions

**Setup:** Fixtures or disposable save: sell the final animal/stock, remove a production entry, then disable a provider for a new session.

**Expected result:** Empty/disabled replaces old state through live merge, last-good persistence and app restart.

**Coverage:** F08

### T09. Fresh export with stale held section

**Setup:** A new export commits while one section legitimately retains its prior same-session sample.

**Expected result:** Transport can be live while that section is labelled held/stale with its original sample age.

**Coverage:** F09

### T10. Save reload and rapid server switch

**Setup:** Return to menu/load another save in the same game process; switch dashboard servers while a previous request is delayed.

**Expected result:** Exactly one new lifecycle initialises. Old callbacks/fields/units/mods cannot contaminate the new selection.

**Coverage:** F02, F04, F08

### T11. Malformed or incomplete export

**Setup:** Use input fixtures and disposable outputs, not the live save. Include truncated JSON, read failure and a collector exception.

**Expected result:** Last valid history survives but is not labelled a new successful live collection. Errors are bounded and visible.

**Coverage:** F01, F08, F11

### T12. Offline continuity and recovery

**Setup:** After a valid live sample, close the game/connection and reopen the dashboard, then restore live collection.

**Expected result:** Last-known data remains usable with honest age. Recovery replaces it only with valid identity-matched sections.

**Coverage:** F08, F09

### T13. Units and quantity integrity

**Setup:** No unit mod, British-only and Imperial-only; compare known liquid, crop and mass quantities, zero and missing metadata.

**Expected result:** Displayed conversions match the active source; underlying canonical quantities and economic totals do not change.

**Coverage:** F04, F05

### T14. Packaged multiplayer/dedicated acceptance

**Setup:** The final canonical ZIP, no loose deployment; host/client/dedicated arrangements actually advertised by the product.

**Expected result:** Supported scope is explicit; authority and farm permissions are correct; no loose-mod restriction; actual session proof recorded.

**Coverage:** F02, F05, F07, F12

### T15. Protected end-user journeys

**Setup:** Final installed V5 candidate: setup, dashboard, fields, companions, fleet, animals, production, stock/bales, map images and offline recovery.

**Expected result:** Previously working paths still work; empty/error states are understandable; keyboard and narrow-window layouts remain usable.

**Coverage:** All findings and regression protection

### T16. Candidate identity and deployment lifecycle

**Setup:** Exact final installer/ZIP; clean-profile and upgrade paths using preserved/disposable data. Installer lifecycle if affected by packaging changes.

**Expected result:** Actual launched desktop/mod identities match manifest, app opens normally, uninstall/reinstall and conversion claims have separate proof, and V4 is untouched.

**Coverage:** F12

### Candidate test commands

These are planned execution commands, not commands run for this audit. Add the focused regressions to the appropriate existing runner first. Run from the project root, stop on a failing check and record the actual command/result. The final packaging command is V5-specific; it must not be replaced with the classic build command.

```powershell
npm run test:all --prefix FS25_FarmDashboard_App
npm run typecheck --prefix "NEW APP"
npm run i18n:verify
# Only after required source checks and root-cause proof:
npm run build:all:v5
```

A successful build is only package evidence. Installed GUI, live save, offline lifecycle and multiplayer/dedicated acceptance require their own records. Any focused new test files must be included in the selected runner; do not silently skip them because a broad suite happens to pass.

## 7. Release gates

### G0. Evidence and first blocker

**Current status:** NOT RUN: diagnostic reproduction still needed

**Depends on:** W00

**Pass condition:** The first stalled stage has been reproduced and the exact blocking call/state is identified. The failure evidence and candidate identity are preserved.

### G1. Real export lifecycle

**Current status:** NOT PASSED: captured feed was bootstrap-only

**Depends on:** W01

**Pass condition:** One lifecycle/update owner; first complete export advances; second mission in the same process exports; diagnostics-off failures are visible.

### G2. Safe settings

**Current status:** NOT RUN

**Depends on:** W02

**Pass condition:** XML collision fixture, false-value preservation, UI-only saves and partial-save failure tests pass.

### G3. Correct companion facts

**Current status:** NOT RUN

**Depends on:** W03-W04

**Pass condition:** Only active mods are detected; namespace-correct reads work; per-adapter errors are isolated; unavailable is not allowed/zero; farm scope is correct.

### G4. Correct soil and units

**Current status:** NOT RUN; current PF runtime comparison unavailable

**Depends on:** W05, W07

**Pass condition:** Base/PF/RF and unit-mode matrices match same-save in-game data; unknown/zero/target-only are distinct.

### G5. Retention and identity

**Current status:** NOT RUN

**Depends on:** W06

**Pass condition:** Successful empty and disabled survive persistence; session changes cannot reuse old data as live; held sections retain their age.

### G6. Regression and cost

**Current status:** NOT RUN

**Depends on:** W08

**Pass condition:** Focused and broader checks pass, collection cost is measured/bounded, and protected working paths have no unexplained regression.

### G7. Exact installed candidate

**Current status:** NOT RUN; installed desktop candidate not certified

**Depends on:** W09-W10

**Pass condition:** Coherent V5 artifact identity, canonical ZIP, installed end-to-end walkthrough and all advertised deployment scenarios have evidence.

## 8. Evidence record and rollback rules

### Evidence required for each fix

- Finding ID and exact root cause; changed source files and coherent candidate identifier.
- Reproduction input/configuration with secrets redacted, expected result and actual result.
- Source test command and outcome, separately from packaged-content and installed-binary identity.
- Save/map/farm, active mod list and companion version for any live comparison.
- Export generation/sample timestamp and the corresponding game observation; a screenshot of a card alone cannot establish source correctness.
- Errors, retries, skipped scenarios and remaining limitations, labelled PASS, FAIL, NOT TESTED or BLOCKED.
- Protected behaviour exercised, rollback location and explicit confirmation that unrelated saves/mods/V4 were not changed.

### Stop conditions

- If the first complete export does not arrive, stop feature polish and locate the missing producer transition. Keep the failed evidence; do not reset it away.
- If a settings-only change rewrites modules, block packaging until the config regression is fixed.
- If unknown restrictions/loans/soil render as reassuring current facts, block that integration even if detection works.
- If complete empty/disabled data is resurrected after restart, block release because the desktop can show false state.
- If the candidate cannot be identified across source, ZIP, desktop and installer, do not certify it based on another build's results.
- If shared files change unexpectedly while implementing, stop and reconcile ownership rather than overwriting another developer's work.
- If a advertised mode cannot be exercised, mark it not tested and limit the release claim or defer that mode; never upgrade missing evidence to a pass.

### Reversible recovery

Before any later deployment or destructive transition test, preserve the user's current mod, settings, selected-server configuration and relevant offline cache outside the active test location. Use literal, verified paths and disposable save copies. Restore a failed candidate from its manifest/backups; do not clear all application/game data as a generic repair. This audit has not made those backups or changed the deployment.

## 9. Source and runtime evidence index

- **User-supplied change transcript:** [C:/Users/Graham/Documents/cursor_game_mod_configuration_issue.md](C:/Users/Graham/Documents/cursor_game_mod_configuration_issue.md). Requested active-only unit compatibility and NAS-vault integrations; records presence-only limitations and lack of live-reload proof. Important anchors: 1286, 1414, 1557, 2217, 2283.
- **Captured savegame19 export:** [C:/Users/Graham/Documents/My Games/FarmingSimulator2025/modSettings/FS25_FarmDashboard/savegame19/data.json](C:/Users/Graham/Documents/My%20Games/FarmingSimulator2025/modSettings/FS25_FarmDashboard/savegame19/data.json). 23 September 2026 16:36:55 BST write; bootstrap counts and flags noted above. This link targets a live file that may change after the capture.
- **Captured game log:** [C:/Users/Graham/Documents/My Games/FarmingSimulator2025/log.txt](C:/Users/Graham/Documents/My%20Games/FarmingSimulator2025/log.txt). Relevant anchors: mod load 1067/1069; Montana load 2394; spawn/authority lines 2731-2737; captured tail continues to 16:48:34 BST. Future sessions may overwrite this file.
- **Captured mod configuration:** [C:/Users/Graham/Documents/My Games/FarmingSimulator2025/modSettings/FS25_FarmDashboard/config.xml](C:/Users/Graham/Documents/My%20Games/FarmingSimulator2025/modSettings/FS25_FarmDashboard/config.xml). State-machine settings false appear before modules true, reproducing the parser suffix collision. diagnostics=false. Configuration was not changed.
- **Local engine mission start:** [C:/Users/Graham/Documents/FS25 Game Files/extract/decompiled/scripts/mission00.lua](C:/Users/Graham/Documents/FS25%20Game%20Files/extract/decompiled/scripts/mission00.lua). Lines 501-506: actual mission start and CURRENT_MISSION_START publication.
- **Local engine update dispatch:** [C:/Users/Graham/Documents/FS25 Game Files/extract/decompiled/scripts/BaseMission.lua](C:/Users/Graham/Documents/FS25%20Game%20Files/extract/decompiled/scripts/BaseMission.lua). Lines 814-826: updateables and mod-event-listener update paths both dispatched.
- **Local engine mod environments:** [C:/Users/Graham/Documents/FS25 Game Files/extract/decompiled/scripts/mods.lua](C:/Users/Graham/Documents/FS25%20Game%20Files/extract/decompiled/scripts/mods.lua). Lines 300-321: named mod environment creation and global/environment ownership.
- **Local engine ModManager:** [C:/Users/Graham/Documents/FS25 Game Files/extract/decompiled/scripts/misc/ModManager.lua](C:/Users/Graham/Documents/FS25%20Game%20Files/extract/decompiled/scripts/misc/ModManager.lua). getModByName and getActiveMods available; installed inventory differs from active load state.
- **Enhanced Loan System source:** [C:/Users/Graham/Documents/My Games/FarmingSimulator2025/mods/FS25_EnhancedLoanSystem.zip](C:/Users/Graham/Documents/My%20Games/FarmingSimulator2025/mods/FS25_EnhancedLoanSystem.zip). Read in memory, not extracted/executed. src/ELS_loanManager.lua around line 380 defines the mod-owned manager.
- **Restricted Periods source:** [C:/Users/Graham/Documents/My Games/FarmingSimulator2025/mods/FS25_RestrictedPeriods.zip](C:/Users/Graham/Documents/My%20Games/FarmingSimulator2025/mods/FS25_RestrictedPeriods.zip). Read in memory. scr/RestrictedPeriods.lua around line 7 defines SlurryBan in the companion's environment.
- **Regional Crop Calendar source:** [C:/Users/Graham/Documents/My Games/FarmingSimulator2025/mods/FS25_RegionalCropCalendar.zip](C:/Users/Graham/Documents/My%20Games/FarmingSimulator2025/mods/FS25_RegionalCropCalendar.zip). Read in memory. src/RegionManager.lua around line 770 defines the calendar manager.
- **Imperial System source:** [C:/Users/Graham/Documents/My Games/FarmingSimulator2025/mods/FS25_ImperialSystem.zip](C:/Users/Graham/Documents/My%20Games/FarmingSimulator2025/mods/FS25_ImperialSystem.zip). Read in memory to trace ownership of unit settings and conversion behaviour; installed presence is not proof it was loaded in the captured save.

### Targeted installed-mod identity comparison

The following five files matched across project source, the installed loose directory and the installed ZIP when captured. Hashes were of the compared UTF-8 contents and are not substitutes for full archive/installer hashes.

- modDesc.xml: `b38f806a46609dc8a698dd33038c362464059a3417a8f8b9ba112a6862a0f3c9`.
- src/FarmDashboard.lua: `a79472b1f7752d4edf0720f48cd67339b75d2bddacf05ca63665cc356fecce66`.
- src/FarmDashboardDataCollector.lua: `340efa478a92afd437fbf641053da98167513c7fa3e0d7c8b29a3923daec8832`.
- src/FillTypeUtils.lua: `b2877c8e573bbaab6a4fce5153604937a0e8052ee6f14b45c155a6a04d2d794b`.
- src/collectors/CompanionModsDataCollector.lua: `c2366e35bbc05b4e94c4c6c3183ec3820864fce7e6198a1cf5a90a459cea4e24`.

## 10. Direct handoff to Ash

Ash: treat this as a root-cause recovery plan, not an instruction to add more mod cards. Begin with W00 and prove the exact first-export blocker. Repair the lifecycle and settings contracts, then active-mod/API access, truthful scoped data, soil/units and retention. Preserve working paths, V5-only release boundaries and canonical ZIP naming. For each fix attach source-test and installed/live evidence separately. Do not claim release-ready while G1 or any required gate remains unproved.

**Bottom line:** restore and prove the real producer first; repair the shared data contracts next; build and test one identifiable V5 candidate last. Do not replace missing data with confident defaults, or replace live acceptance with another successful compilation.
