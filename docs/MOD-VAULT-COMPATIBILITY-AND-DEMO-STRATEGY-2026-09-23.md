# Mod vault compatibility and demo strategy

Date: 23 September 2026. Prepared for Graham and Ash. Read-only research plus report artifacts; no game/mod/source changes or new compatibility tests.

## Executive decision

**Ash was right about the opportunity, but not all of the descriptions, implementation claims or demo assumptions are right.** The dashboard can provide genuinely useful out-of-game information for these mods. The product should be a useful native farm dashboard with independent optional integrations, not a mandatory curated mod pack or a catalog of detected ZIPs.

**Keep the four public demo themes, but do not publish them as complete showcases yet.** Several highlighted features have no meaningful saved state. Independently selectable, sanitised recorded demos are the best fit for an always-available website, with a separate live view when a real game session is running.

**Independence rule:** Farm Dashboard + mod X + X's genuine upstream requirements must work without unrelated companions. If X genuinely requires Y, declare that dependency. Our adapter must not add RF, PF, a specific map or another optional mod as an accidental prerequisite.

## 1. What was inspected, and what was not

- Screened all 665 ZIP entries at P:/FS25 MOD VAULT. Read 651 mod descriptors. Twelve editor/prefab-style archives had no readable modDesc.xml; two archives were rejected by the ZIP reader. Those exceptions are recorded in the inventory and are not in-game test results.
- Read available Lua sources from 70 selected gameplay/data packages and examined relevant managers, state, API names, specialisations and dependency/conflict paths. This is targeted source feasibility screening, not an exhaustive line-by-line security review of every script.
- Read six installed RF/weather packages to understand the actual Montana stack and distinguish intentional optional bridges from conflicting state writers.
- Read career/vehicle/placeable/farm/field data for saves 3, 4, 18 and 19, plus the relevant PF, loan, silo, calendar, animal and seasonal state files. Saved state may differ from a later unsaved game session.
- Compared against the 47-entry companion catalog and producer captured in the preceding audit. Previously read source/transcript evidence was reused, not treated as proof of a newly rebuilt app.
- Read the local Website/demo.html, Website/js/site-config.js, demo banner and demo documentation. No live-site, tunnel or public API test was performed.
- Checked selected official ModHub pages for published requirements/mode limitations. Local package versions remain the primary source for this vault assessment.
- No saves were created, populated, loaded, reset or deleted. No mod was enabled/disabled, installed or renamed. No project implementation, build, test suite or deployment was run.

### Why versions must be explicit

The vault is not uniformly the same version as the save manifests. Examples: Dynamic Market is 1.2.0.0 in the reviewed vault package versus 1.3.0.0 in savegame19; RealSilo is 1.0.0.0 versus 1.1.0.2. The official Farm Reputation listing shows 1.1.0.1 while the vault copy is 1.1.0.0. These differences require a pinned adapter target and real compatibility evidence, not automatic replacement of the working installed copies.

### Three different meanings of support

- Native compatibility: the mod changes standard game fields, vehicles, storage, prices or production, and the existing dashboard should show the final effective game state without a dedicated integration.
- Optional live integration: the dashboard reads a mod-specific state or capability that is not represented adequately in native data.
- Presence/information only: a mod is identified and explained, but no additional live data is exported. This is useful context, not the same as a completed integration.

Do not advertise all 665 vault items, or all 47 catalog entries, as individually live-tested integrations. Most vehicle/placeable/visual/QoL packages need generic correctness rather than dedicated pages.

## 2. Where the current idea needs correction

### Stall Rental

**Current issue:** Described as renting stall capacity rather than owning a building.

**Correct interpretation:** It pays boarding income for qualifying healthy horses in your stalls. Useful output is eligible horses and income, not a rent-expense/capacity contract.

**Evidence:** StallRental.lua:2-3, 74 onward in [P:/FS25 MOD VAULT/FS25_339275_Stall_Rental.zip](P:/FS25%20MOD%20VAULT/FS25_339275_Stall_Rental.zip). Catalog: [NEW APP/src/lib/companionMods/catalog.ts:267](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/companionMods/catalog.ts:267).

### Animal Food Overview

**Current issue:** Described as viewing food/water stock across barns.

**Correct interpretation:** The package explains animal feed groups and their accepted food types. Treat it as a feed-reference enhancement; barn stock monitoring is a separate capability.

**Evidence:** modDesc.xml and the feed-group dialog implementation in [P:/FS25 MOD VAULT/FS25_309457_Animal_Food_Overview.zip](P:/FS25%20MOD%20VAULT/FS25_309457_Animal_Food_Overview.zip). Catalog: [NEW APP/src/lib/companionMods/catalog.ts:218](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/companionMods/catalog.ts:218).

### Smart Crop Control

**Current issue:** Described vaguely as planning what the player should plant.

**Correct interpretation:** It controls selected NPC crop allocation by field size and category. Surface the active rules if useful, not a fictional player-crop planner.

**Evidence:** modDesc.xml and its NPC-field control script in [P:/FS25 MOD VAULT/FS25_366374_Smart_Crop_Control.zip](P:/FS25%20MOD%20VAULT/FS25_366374_Smart_Crop_Control.zip). Catalog: [NEW APP/src/lib/companionMods/catalog.ts:160](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/companionMods/catalog.ts:160).

### Production Control

**Current issue:** Described as prioritising production chains.

**Correct interpretation:** Its main feature is adjustable production speed from 50% to 300%, with operating-cost consequences. Show effective speed/cost and live recipe values.

**Evidence:** modDesc.xml and production-control Lua in [P:/FS25 MOD VAULT/FS25_319198_Production_Control.zip](P:/FS25%20MOD%20VAULT/FS25_319198_Production_Control.zip). Catalog: [NEW APP/src/lib/companionMods/catalog.ts:284](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/companionMods/catalog.ts:284).

### Out Of Fuel

**Current issue:** Described mainly as extra fuel warnings or harsher engine stopping.

**Correct interpretation:** It removes the automatic safety fuel top-up on save load. Basic dashboard fuel warnings are native functionality, not dependent on this mod.

**Evidence:** modDesc.xml and on-load fuel hook in [P:/FS25 MOD VAULT/FS25_342105_Out_Of_Fuel.zip](P:/FS25%20MOD%20VAULT/FS25_342105_Out_Of_Fuel.zip). Catalog: [NEW APP/src/lib/companionMods/catalog.ts:358](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/companionMods/catalog.ts:358).

### Bushel Plus

**Current issue:** Classified in the units category despite a partly corrected description.

**Correct interpretation:** It is a combine calibration/harvest-loss system, not a global volume-unit converter. Reclassify to fleet/harvest and read actual specialised values before promising metrics.

**Evidence:** modDesc.xml and combine specialisation in [P:/FS25 MOD VAULT/FS25_309911_Bushel_Plus.zip](P:/FS25%20MOD%20VAULT/FS25_309911_Bushel_Plus.zip). Catalog: [NEW APP/src/lib/companionMods/catalog.ts:432](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/companionMods/catalog.ts:432).

### Ingame Time Operating Hours

**Current issue:** Catalog mentions scaled operating hours without the fuel-consumption consequence.

**Correct interpretation:** The mod scales operating hours and fuel consumption with game time. Do not double-scale exported readings or imply it only changes a label.

**Evidence:** modDesc.xml and time-scaled runtime hooks in [P:/FS25 MOD VAULT/FS25_311491_Ingame_Time_Operating_Hours.zip](P:/FS25%20MOD%20VAULT/FS25_311491_Ingame_Time_Operating_Hours.zip)

### Enhanced Seasonal Prices

**Current issue:** Catalog frames it mainly as deeper selling-price seasonality.

**Correct interpretation:** The package also changes buying prices and requires its Seasonal Prices base package. Read effective buy/sell prices and record the declared dependency.

**Evidence:** modDesc.xml dependencies and SeasonalPrices.lua in [P:/FS25 MOD VAULT/FS25_310803_Enhanced_Seasonal_Prices.zip](P:/FS25%20MOD%20VAULT/FS25_310803_Enhanced_Seasonal_Prices.zip)

### Animal Trader

**Current issue:** Catalog suggests a generic alternative animal trading flow.

**Correct interpretation:** This particular vault mod is a placeable business with specific buying/selling and rent mechanics. Most useful dashboard data belongs in existing placeable/finance views.

**Evidence:** modDesc.xml placeable description in [P:/FS25 MOD VAULT/FS25_339284_Animal_Trader.zip](P:/FS25%20MOD%20VAULT/FS25_339284_Animal_Trader.zip)

### RealSilo, Dynamic Market, pallet degradation, soil work bonus and seasonal milk

**Current issue:** A liveKey/catalog card can be mistaken for a live data integration.

**Correct interpretation:** The current companion producer emits enabled=true placeholders for these blocks. Detection is useful but must not be advertised as reading compartments, condition, market curves, field coverage or milk factors.

**Evidence:** FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua:919-935

## 3. Recommended integration roadmap

Finish working, useful integrations before increasing the badge count. Each entry below is a feasible direction based on the reviewed package; none is a new claim that its adapter already works or that every game-mode combination passes. Related core information must remain available without the optional mod.

### Enhanced Loan System

**Priority:** Finish first | **Type:** Existing adapter repair | **Reviewed vault version:** 1.0.0.0

**User benefit:** Per-farm outstanding principal, monthly payment, interest, remaining term and collateral headroom where the verified loan manager exposes it.

**Source access:** src/ELS_loanManager.lua and src/ELS_loan.lua; the mod owns an annuity-loan model separate from vanilla debt.

**Boundary:** Do not require another finance mod or substitute vanilla/all-farm debt for an unavailable ELS record.

**Meaningful demonstration:** Give the demo one real outstanding ELS loan and a contrasting debt-free farm; the captured save has settings but no loan records.

**Package:** [P:/FS25 MOD VAULT/FS25_314906_Enhanced_Loan_System.zip](P:/FS25%20MOD%20VAULT/FS25_314906_Enhanced_Loan_System.zip)

**Descriptor multiplayer flag:** true; this is an author declaration, not our runtime test. **Declared dependencies:** None in this descriptor; runtime/feature requirements still need checking.

### Restricted Periods

**Priority:** Finish first | **Type:** Existing adapter repair | **Reviewed vault version:** 1.0.0.0

**User benefit:** An actionable spreading calendar: slurry/digestate/manure permitted or blocked now, with reason and the next applicable window.

**Source access:** scr/RestrictedPeriods.lua:34 SlurryBan.isBanActive(category), with separate liquid/solid rules and temperature handling.

**Boundary:** Calendar period numbers must follow the source; an unread API is unknown, not spreading allowed. No dependency on RF or RCC is declared.

**Meaningful demonstration:** Capture an allowed example and an actual blocked/frost example on disposable saves, not just a mod-present badge.

**Package:** [P:/FS25 MOD VAULT/FS25_352961_Restricted_Periods.zip](P:/FS25%20MOD%20VAULT/FS25_352961_Restricted_Periods.zip)

**Descriptor multiplayer flag:** true; this is an author declaration, not our runtime test. **Declared dependencies:** None in this descriptor; runtime/feature requirements still need checking.

### Regional Crop Calendar

**Priority:** Finish first | **Type:** Existing adapter repair | **Reviewed vault version:** 1.1.0.2

**User benefit:** Selected region, planting and harvesting windows by actual crop, and optional weather/yield modifiers with source labels.

**Source access:** src/RegionManager.lua, CalendarService.lua, WeatherService.lua and YieldService.lua; selectedRegion and optional toggles are distinct.

**Boundary:** Custom-map crops may retain map calendars. RCC weather/yield features can overlap other providers; calendar-only use is not the same as enabling all toggles.

**Meaningful demonstration:** Select a meaningful non-vanilla region. The captured RF save currently selects vanilla with weather/yield off.

**Package:** [P:/FS25 MOD VAULT/FS25_368342_Regional_Crop_Calendar.zip](P:/FS25%20MOD%20VAULT/FS25_368342_Regional_Crop_Calendar.zip)

**Descriptor multiplayer flag:** true; this is an author declaration, not our runtime test. **Declared dependencies:** None in this descriptor; runtime/feature requirements still need checking.

### RealSilo - Realistic Silo Compartments

**Priority:** Finish first | **Type:** Presence-only payload to real data | **Reviewed vault version:** 1.0.0.0

**User benefit:** Silo compartments, crop, litres/capacity, free space, active compartment and transfer progress.

**Source access:** scripts/realSiloManager.lua getSilo/getTransfer; realSiloCompartmentStorage.lua getSlots/getActiveSlot; RealSiloUtil.getFarmIdForUid.

**Boundary:** Read all compartments without double-counting aggregated base storage. Vault version 1.0.0.0 differs from save manifest 1.1.0.2; pin the implementation target.

**Meaningful demonstration:** Configure and fill several compartments with different crops. All nine captured entries are unconfigured and empty.

**Package:** [P:/FS25 MOD VAULT/FS25_369067_RealSilo_Realistic_Silo_Compartments.zip](P:/FS25%20MOD%20VAULT/FS25_369067_RealSilo_Realistic_Silo_Compartments.zip)

**Descriptor multiplayer flag:** true; this is an author declaration, not our runtime test. **Declared dependencies:** None in this descriptor; runtime/feature requirements still need checking.

### Storage Overhaul: Pallet Degradation System

**Priority:** Finish first | **Type:** Presence-only payload to real data | **Reviewed vault version:** 1.2.0.0

**User benefit:** Pallet condition, sheltered/exposed state, temporary/permanent damage, value adjustment and at-risk goods.

**Source access:** src/PalletMetadata.lua, PalletDegradationManager.lua and PalletPriceModifier.lua contain the owning condition/value logic.

**Boundary:** Read bounded cached metadata rather than raycasting every pallet again. Show stock only once; quality-adjusted valuation must not multiply the penalty twice.

**Meaningful demonstration:** Stage matching sheltered and exposed pallets after genuine time progression. A default enabled flag does not demonstrate this feature.

**Package:** [P:/FS25 MOD VAULT/FS25_360720_Storage_Overhaul_Pallet_Degradation_System.zip](P:/FS25%20MOD%20VAULT/FS25_360720_Storage_Overhaul_Pallet_Degradation_System.zip)

**Descriptor multiplayer flag:** true; this is an author declaration, not our runtime test. **Declared dependencies:** None in this descriptor; runtime/feature requirements still need checking.

### Advanced Maintenance

**Priority:** Finish first | **Type:** Fleet adapter | **Reviewed vault version:** 1.0.2.0

**User benefit:** Maintenance condition, start/breakdown restriction and service urgency on each relevant vehicle/tool.

**Source access:** src/advancedmaintenance.lua and registration script define a distinct maintenance specialisation.

**Boundary:** Keep this adapter independent of EVM, Realistic Vehicle Service and ADS. Basic damage/fuel remains available without any maintenance mod.

**Meaningful demonstration:** One healthy machine, one due machine, and one serviced example using a single maintenance owner.

**Package:** [P:/FS25 MOD VAULT/FS25_307003_Advanced_Maintenance.zip](P:/FS25%20MOD%20VAULT/FS25_307003_Advanced_Maintenance.zip)

**Descriptor multiplayer flag:** true; this is an author declaration, not our runtime test. **Declared dependencies:** None in this descriptor; runtime/feature requirements still need checking.

### Extended Vehicle Maintenance

**Priority:** Later alternative | **Type:** Fleet adapter | **Reviewed vault version:** 1.0.0.0

**User benefit:** Service overdue status, fault type, chosen service route, unavailable-machine state and remaining service time where exposed.

**Source access:** scripts/ExtendedVehicleMaintenance.lua and EVMServiceDialog.lua include maintenance, service, collision and fault logic.

**Boundary:** It already includes collision damage and puncture-style faults. Combining separate mods for the same behaviour is a risk requiring evidence, not an automatic supported preset.

**Meaningful demonstration:** Use an alternative fleet scenario rather than installing every maintenance system into one showcase.

**Package:** [P:/FS25 MOD VAULT/FS25_363077_Extended_Vehicle_Maintenance.zip](P:/FS25%20MOD%20VAULT/FS25_363077_Extended_Vehicle_Maintenance.zip)

**Descriptor multiplayer flag:** true; this is an author declaration, not our runtime test. **Declared dependencies:** None in this descriptor; runtime/feature requirements still need checking.

### Realistic Vehicle Service

**Priority:** Later alternative | **Type:** Fleet adapter | **Reviewed vault version:** 1.0.0.0

**User benefit:** Faults, warm-up/availability and recovery/workshop status as read-only fleet details.

**Source access:** scripts/core/FaultSystem.lua and scripts/specs/BreakdownSpec.lua/ImmobilizerSpec.lua.

**Boundary:** Never invoke towing, repair or key actions just to read status. Coexistence with other start/fault systems needs targeted tests.

**Meaningful demonstration:** A separate maintenance variant only after the first fleet adapter is reliable.

**Package:** [P:/FS25 MOD VAULT/FS25_359741_Realistic_Vehicle_Service.zip](P:/FS25%20MOD%20VAULT/FS25_359741_Realistic_Vehicle_Service.zip)

**Descriptor multiplayer flag:** true; this is an author declaration, not our runtime test. **Declared dependencies:** None in this descriptor; runtime/feature requirements still need checking.

### Seasonal Milk Production

**Priority:** Finish first | **Type:** Presence-only payload to real data | **Reviewed vault version:** 1.0.0.1

**User benefit:** Current seasonal milk modifier, phase/next peak and any available health factor beside actual output.

**Source access:** scripts/SeasonalMilkProduction.lua:getSeasonalModifier and getHealthModifier.

**Boundary:** A modifier is not realised milk output or guaranteed forecast. Preserve distinctions between this mod, DairyCore and Ritter data.

**Meaningful demonstration:** Use producing dairy animals and capture a genuine seasonal contrast; do not use beef cattle as the milk example.

**Package:** [P:/FS25 MOD VAULT/FS25_365513_Seasonal_Milk_Production.zip](P:/FS25%20MOD%20VAULT/FS25_365513_Seasonal_Milk_Production.zip)

**Descriptor multiplayer flag:** true; this is an author declaration, not our runtime test. **Declared dependencies:** None in this descriptor; runtime/feature requirements still need checking.

### Seasonal Wool Production

**Priority:** High-value addition | **Type:** Seasonal livestock | **Reviewed vault version:** 1.0.0.2

**User benefit:** Next shearing, accumulation period, health effects and expected fee where source data supports it.

**Source access:** scripts/SeasonalWoolAdapter.lua includes distinct vanilla and Realistic Livestock reads; SeasonalWoolProduction.lua owns period state.

**Boundary:** This source explicitly accommodates Ritter rather than requiring it. Verify live ownership and accumulated values, not only settings.

**Meaningful demonstration:** Use sheep that have accumulated wool. The current catalog has seasonal milk but no matching seasonal-wool entry despite the RF save loading it.

**Package:** [P:/FS25 MOD VAULT/FS25_356143_Seasonal_Wool_Production.zip](P:/FS25%20MOD%20VAULT/FS25_356143_Seasonal_Wool_Production.zip)

**Descriptor multiplayer flag:** true; this is an author declaration, not our runtime test. **Declared dependencies:** None in this descriptor; runtime/feature requirements still need checking.

### Imperial System Conversion Settings

**Priority:** Finish first | **Type:** Display compatibility | **Reviewed vault version:** 1.1.0.0

**User benefit:** Follow the active mod's chosen liquid/crop/mass/measurement settings across existing screens.

**Source access:** scripts/UnitConversionManager.lua, UnitConversionData.lua and UnitConversionOverrides.lua.

**Boundary:** Display-only; this is not an excuse to change prices or inventory arithmetic. Saved profile files cannot activate an inactive mod.

**Meaningful demonstration:** Include known grain, liquid, mass and piece-count examples. Test alone, not only with Save Unit Profiles.

**Package:** [P:/FS25 MOD VAULT/FS25_368117_Imperial_System_Conversion_Settings.zip](P:/FS25%20MOD%20VAULT/FS25_368117_Imperial_System_Conversion_Settings.zip)

**Descriptor multiplayer flag:** true; this is an author declaration, not our runtime test. **Declared dependencies:** None in this descriptor; runtime/feature requirements still need checking.

### Save Unit Profiles

**Priority:** Finish first | **Type:** Display compatibility | **Reviewed vault version:** 1.2.0.2

**User benefit:** Show the selected save's currency and supported unit profile consistently.

**Source access:** scripts/SU_Core.lua; regional profile selection is separate from the Imperial fill conversion mod.

**Boundary:** Per-save/profile/client context must be explicit. Do not require Imperial or British Fill Units.

**Meaningful demonstration:** Switch between controlled UK/US/metric demonstrations without cross-save settings leaking.

**Package:** [P:/FS25 MOD VAULT/FS25_362921_Save_Unit_Profiles.zip](P:/FS25%20MOD%20VAULT/FS25_362921_Save_Unit_Profiles.zip)

**Descriptor multiplayer flag:** true; this is an author declaration, not our runtime test. **Declared dependencies:** None in this descriptor; runtime/feature requirements still need checking.

### Livestock Monitor

**Priority:** Finish first | **Type:** Useful enrichment plus native coverage | **Reviewed vault version:** 1.0.0.0

**User benefit:** Barn warnings, alert state and supported settings alongside the dashboard's own food/water/health data.

**Source access:** scripts/LivestockMonitor.lua, LivestockMonitorAlerts.lua and settings code.

**Boundary:** The current dashboard reader covers alert/settings fields, not the full detailed barn data described by the catalog. Native livestock monitoring must not require this mod.

**Meaningful demonstration:** Show a healthy occupied barn and a genuinely low-resource barn, with the same animal data still visible when this mod is removed.

**Package:** [P:/FS25 MOD VAULT/FS25_367447_Livestock_Monitor.zip](P:/FS25%20MOD%20VAULT/FS25_367447_Livestock_Monitor.zip)

**Descriptor multiplayer flag:** true; this is an author declaration, not our runtime test. **Declared dependencies:** None in this descriptor; runtime/feature requirements still need checking.

### Production Watcher

**Priority:** Finish first | **Type:** Useful enrichment plus native coverage | **Reviewed vault version:** 1.0.0.0

**User benefit:** Input shortage and output blockage warnings with production context.

**Source access:** scripts/ProductionWatcher.lua; the mod has low-input/high-output alert rules.

**Boundary:** Native production levels and useful warnings must work without Production Watcher. Do not call a summary of alert objects complete production integration.

**Meaningful demonstration:** One running production, one starved input and one blocked output. An enabled production with no stored materials is not the full demonstration.

**Package:** [P:/FS25 MOD VAULT/FS25_319635_Production_Watcher.zip](P:/FS25%20MOD%20VAULT/FS25_319635_Production_Watcher.zip)

**Descriptor multiplayer flag:** true; this is an author declaration, not our runtime test. **Declared dependencies:** None in this descriptor; runtime/feature requirements still need checking.

### Production Schedule

**Priority:** High-value addition | **Type:** Production planning | **Reviewed vault version:** 1.1.0.0

**User benefit:** Per-recipe active-month calendar and the reason a production is intentionally paused.

**Source access:** Scripts/ProductionSchedule.lua stores self.data by point/recipe, with months/status and owned-production helpers.

**Boundary:** Do not describe planned seasonal shutdown as a breakdown. Other scheduling controllers may compete for the same recipe state.

**Meaningful demonstration:** Schedule one recipe off this month and another on, then show the next activation month.

**Package:** [P:/FS25 MOD VAULT/FS25_352788_Production_Schedule.zip](P:/FS25%20MOD%20VAULT/FS25_352788_Production_Schedule.zip)

**Descriptor multiplayer flag:** true; this is an author declaration, not our runtime test. **Declared dependencies:** None in this descriptor; runtime/feature requirements still need checking.

### Economic History

**Priority:** High-value addition | **Type:** Finance history | **Reviewed vault version:** 1.0.0.1

**User benefit:** Farm-scoped historical income/cost categories, trends and loan/balance history, clearly dating the recorded coverage.

**Source access:** src/EconomicHistoryDataCollect.lua FinancialLogger history/current-finance functions and persistent month/farm records.

**Boundary:** Do not invent history before installation or expose another farm's restricted ledger. Prefer a bounded adapter over arbitrary-path CSV scraping.

**Meaningful demonstration:** A save with genuine multi-period activity, not an empty new career.

**Package:** [P:/FS25 MOD VAULT/FS25_367175_Economic_History.zip](P:/FS25%20MOD%20VAULT/FS25_367175_Economic_History.zip)

**Descriptor multiplayer flag:** true; this is an author declaration, not our runtime test. **Declared dependencies:** None in this descriptor; runtime/feature requirements still need checking.

### Task List

**Priority:** High-value addition | **Type:** Read-only work planner | **Reviewed vault version:** 1.2.0.1

**User benefit:** Due and upcoming tasks, priorities, recurrence, effort and field/group links.

**Source access:** main.lua contains activeTasks/taskGroups and getActiveTasksForCurrentFarm/getTasksForNextYear.

**Boundary:** The current-farm helper depends on playerUserId; a dedicated exporter needs explicit farm scoping, not a fake player. Do not add remote task mutation in this first scope.

**Meaningful demonstration:** One overdue task, one upcoming recurring task and one completed task; basic dashboard operations must still work without Task List.

**Package:** [P:/FS25 MOD VAULT/FS25_312938_Task_List.zip](P:/FS25%20MOD%20VAULT/FS25_312938_Task_List.zip)

**Descriptor multiplayer flag:** true; this is an author declaration, not our runtime test. **Declared dependencies:** None in this descriptor; runtime/feature requirements still need checking.

### Animal Food Calculator

**Priority:** High-value enrichment | **Type:** Feeding and production rates | **Reviewed vault version:** 1.1.0.2

**User benefit:** Active reference/scaling mode and correctly adjusted feed, water, straw and supported production rates.

**Source access:** AFCConsumptionScaling.lua:getScaleFactor plus reference manager and actual animal data.

**Boundary:** AFC can change simulation rates, not just display them. Do not multiply already-scaled live consumption again or assume universal animal-system compatibility.

**Meaningful demonstration:** Demonstrate vanilla rate, active scaling and a changing days-per-period setting in controlled variants.

**Package:** [P:/FS25 MOD VAULT/FS25_338159_Animal_Food_Calculator.zip](P:/FS25%20MOD%20VAULT/FS25_338159_Animal_Food_Calculator.zip)

**Descriptor multiplayer flag:** true; this is an author declaration, not our runtime test. **Declared dependencies:** None in this descriptor; runtime/feature requirements still need checking.

### Animal Planner

**Priority:** High-value addition | **Type:** Livestock planning | **Reviewed vault version:** 1.0.0.0

**User benefit:** Current and full-capacity consumption/output, feed-cost estimates, herd value growth and supported logistics mode.

**Source access:** scripts/AnimalPlannerData.lua:getHusbandryData; admin/logistics modules expose separate capabilities.

**Boundary:** First release should be read-only. Its logistics/admin features can change behaviour/capacity, so do not silently combine competing distribution controllers.

**Meaningful demonstration:** A populated barn with sensible feed stocks and a visible current-versus-full-capacity comparison.

**Package:** [P:/FS25 MOD VAULT/FS25_368672_Animal_Planner.zip](P:/FS25%20MOD%20VAULT/FS25_368672_Animal_Planner.zip)

**Descriptor multiplayer flag:** true; this is an author declaration, not our runtime test. **Declared dependencies:** None in this descriptor; runtime/feature requirements still need checking.

### Field Profitability Ledger

**Priority:** High-value addition | **Type:** Field economics, SP-limited | **Reviewed vault version:** 1.0.0.0

**User benefit:** Per-field/crop-cycle costs, crop value, margin, yield and data-quality confidence.

**Source access:** src/services/ReportService.lua and the ledger/export/runtime modules separate reported totals, quality and live/canonical data.

**Boundary:** The vault descriptor declares multiplayer unsupported. Do not advertise dedicated-server coverage or equate projected crop value with actual sale revenue.

**Meaningful demonstration:** A single-player harvest cycle with real input/work/harvest records, plus an incomplete record to demonstrate honest confidence.

**Package:** [P:/FS25 MOD VAULT/FS25_369866_Field_Profitability_Ledger.zip](P:/FS25%20MOD%20VAULT/FS25_369866_Field_Profitability_Ledger.zip)

**Descriptor multiplayer flag:** false; this is an author declaration, not our runtime test. **Declared dependencies:** None in this descriptor; runtime/feature requirements still need checking.

### VIP Order Manager

**Priority:** High-value addition | **Type:** Orders, SP-limited | **Reviewed vault version:** 1.2.1.0

**User benefit:** Current VIP order, deliveries remaining, destination, reward and upcoming orders.

**Source access:** VIPOrderManager.lua and gui/OrderFrame.lua expose order quantities, delivered fill levels, payout and destination.

**Boundary:** The reviewed version and official listing do not support multiplayer. Read-only progress, not automatic delivery/cancellation.

**Meaningful demonstration:** Partially fulfil a real order; show what remains and the next order without implying it can already be delivered.

**Package:** [P:/FS25 MOD VAULT/FS25_310861_VIP_Order_Manager.zip](P:/FS25%20MOD%20VAULT/FS25_310861_VIP_Order_Manager.zip)

**Descriptor multiplayer flag:** false; this is an author declaration, not our runtime test. **Declared dependencies:** None in this descriptor; runtime/feature requirements still need checking.

### Farm Reputation

**Priority:** Useful later | **Type:** Contracts with genuine dependency | **Reviewed vault version:** 1.1.0.0

**User benefit:** Farm/contractor reputation, rank progress, limits, evaluation and unlocked opportunities.

**Source access:** scripts/ReputationManager.lua stores reputationByFarm/contractorDataByFarm; AKF evaluation readers provide the breakdown.

**Boundary:** Requires Better Contracts by descriptor and official listing. That is a real upstream dependency; our other adapters must not inherit it.

**Meaningful demonstration:** Better Contracts plus Farm Reputation alone, followed by a compatible mixed pack. Show recorded progress, not a zero-rank placeholder.

**Package:** [P:/FS25 MOD VAULT/FS25_367320_Farm_Reputation.zip](P:/FS25%20MOD%20VAULT/FS25_367320_Farm_Reputation.zip)

**Descriptor multiplayer flag:** true; this is an author declaration, not our runtime test. **Declared dependencies:** FS25_BetterContracts.

### Yield Tracker

**Priority:** Useful later | **Type:** Harvest history, SP-limited | **Reviewed vault version:** 1.0.0.2

**User benefit:** Field/year/crop yield trends where the mod has actual captured harvest history.

**Source access:** scripts/yieldTracker.lua and trackedCropTypes.lua.

**Boundary:** The reviewed package is single-player-only and enumerates supported fill types; do not promise every Montana multifruit crop.

**Meaningful demonstration:** A supported crop with completed harvest records; explicitly distinguish unsupported crops.

**Package:** [P:/FS25 MOD VAULT/FS25_326441_Yield_Tracker.zip](P:/FS25%20MOD%20VAULT/FS25_326441_Yield_Tracker.zip)

**Descriptor multiplayer flag:** false; this is an author declaration, not our runtime test. **Declared dependencies:** None in this descriptor; runtime/feature requirements still need checking.

### Moisture System

**Priority:** Useful later | **Type:** Moisture and quality provider | **Reviewed vault version:** 2.0.0.3

**User benefit:** Available crop/material moisture, quality and storage/harvest warnings.

**Source access:** The package has dedicated moisture/quality runtime code rather than only a visual HUD.

**Boundary:** Feasible candidate, not a certified adapter. Review exact ownership and compatibility against RF crop stress, Realistic Weather and other drying mods before adopting a combined preset.

**Meaningful demonstration:** A separate moisture-focused variant with real wet/dry and storage states.

**Package:** [P:/FS25 MOD VAULT/FS25_354130_Moisture_System.zip](P:/FS25%20MOD%20VAULT/FS25_354130_Moisture_System.zip)

**Descriptor multiplayer flag:** true; this is an author declaration, not our runtime test. **Declared dependencies:** None in this descriptor; runtime/feature requirements still need checking.

### Silage Compaction Monitor

**Priority:** Prefer native first | **Type:** Silage planning | **Reviewed vault version:** 1.1.0.0

**User benefit:** Bunker fill and compaction, plus a clearly labelled equipment-dependent time estimate where available.

**Source access:** Compaction_Monitor.lua reads bunker and vehicle/implement mass context.

**Boundary:** Core bunker progress should not require this HUD mod. Its current-vehicle estimate is not necessarily available on an unattended dedicated server.

**Meaningful demonstration:** One partly compacted bunker; preserve useful native information when no player is driving.

**Package:** [P:/FS25 MOD VAULT/FS25_349039_Silage_Compaction_Monitor.zip](P:/FS25%20MOD%20VAULT/FS25_349039_Silage_Compaction_Monitor.zip)

**Descriptor multiplayer flag:** true; this is an author declaration, not our runtime test. **Declared dependencies:** None in this descriptor; runtime/feature requirements still need checking.

### Field Leasing

**Priority:** Useful later | **Type:** Land tenure | **Reviewed vault version:** 1.0.0.1

**User benefit:** Leased fields, monthly payments, minimum term and termination eligibility.

**Source access:** Field Leasing's agreement/manager source records rental contracts separately from simple land ownership.

**Boundary:** Distinct from renting your own land out and multiplayer marketplace deals. Never label leased land as permanently owned.

**Meaningful demonstration:** One leased field plus an owned field for comparison.

**Package:** [P:/FS25 MOD VAULT/FS25_338381_Field_Leasing.zip](P:/FS25%20MOD%20VAULT/FS25_338381_Field_Leasing.zip)

**Descriptor multiplayer flag:** true; this is an author declaration, not our runtime test. **Declared dependencies:** None in this descriptor; runtime/feature requirements still need checking.

### Rent Your Field

**Priority:** Useful later | **Type:** Land income | **Reviewed vault version:** 1.0.0.1

**User benefit:** Fields rented out, rent income, minimum duration and early-termination liability.

**Source access:** src/RentAgreement.lua and RentYourFieldManager.lua.

**Boundary:** Owner and operator can differ. A generic farm-ownership filter must not pretend rented-out land is currently worked by the player.

**Meaningful demonstration:** One active outward rental with a visible next-payment/termination story.

**Package:** [P:/FS25 MOD VAULT/FS25_356641_Rent_Your_Field.zip](P:/FS25%20MOD%20VAULT/FS25_356641_Rent_Your_Field.zip)

**Descriptor multiplayer flag:** true; this is an author declaration, not our runtime test. **Declared dependencies:** None in this descriptor; runtime/feature requirements still need checking.

### Farmland Marketplace

**Priority:** Useful later | **Type:** Multiplayer land business | **Reviewed vault version:** 1.0.4.0

**User benefit:** Pending offers, accepted sale/lease agreements, owner/operator and farm-specific obligations.

**Source access:** Package is explicitly multiplayer-only; offer/acceptance changes land use and money.

**Boundary:** Needs a real multi-farm multiplayer demonstration, not either single-player Montana save.

**Meaningful demonstration:** A separate MP snapshot after a verified two-farm agreement; publish only permitted public/demo data.

**Package:** [P:/FS25 MOD VAULT/FS25_369241_Farmland_Marketplace.zip](P:/FS25%20MOD%20VAULT/FS25_369241_Farmland_Marketplace.zip)

**Descriptor multiplayer flag:** true; this is an author declaration, not our runtime test. **Declared dependencies:** None in this descriptor; runtime/feature requirements still need checking.

### Distribution Redux

**Priority:** Later complex integration | **Type:** Production logistics | **Reviewed vault version:** 1.0.0.1

**User benefit:** Distribution modes, sources/destinations, effective demand and available transfer statistics.

**Source access:** SmartDistribution.lua getAssetMode/getAssetSellTiming and distribution stats/events.

**Boundary:** Only export available observed state, not invented routes. Test with RealSilo, Animal Planner and other distribution modifiers; start read-only.

**Meaningful demonstration:** A small two-production supply chain before attempting a fully mixed logistics pack.

**Package:** [P:/FS25 MOD VAULT/FS25_365583_Distribution_Redux.zip](P:/FS25%20MOD%20VAULT/FS25_365583_Distribution_Redux.zip)

**Descriptor multiplayer flag:** true; this is an author declaration, not our runtime test. **Declared dependencies:** None in this descriptor; runtime/feature requirements still need checking.

### Factory Profit Calculator

**Priority:** Finish catalog coverage | **Type:** Production economics | **Reviewed vault version:** 1.0.0.1

**User benefit:** Effective recipes/cycles/capacities and clearly labelled expected margin at current prices.

**Source access:** Factory Profit Calculator includes a calculator and an administrator recipe/capacity editor.

**Boundary:** Read modified live recipes, not original XML, and distinguish expected from realised profit. Do not export admin write controls publicly.

**Meaningful demonstration:** One genuinely modified recipe and one standard recipe, both independently matched to in-game values.

**Package:** [P:/FS25 MOD VAULT/FS25_368477_Factory_Profit_Calculator.zip](P:/FS25%20MOD%20VAULT/FS25_368477_Factory_Profit_Calculator.zip)

**Descriptor multiplayer flag:** true; this is an author declaration, not our runtime test. **Declared dependencies:** None in this descriptor; runtime/feature requirements still need checking.

### Farm Operations Dashboard

**Priority:** Prefer native first | **Type:** Operations overview | **Reviewed vault version:** 1.1.0.0

**User benefit:** A unified what-needs-attention board across existing fields, animals, production, fleet and markets.

**Source access:** FarmOperationsDashboard.lua is another view over much of the same native game state.

**Boundary:** Do not make our basic dashboard depend on another dashboard. Learn the useful product requirements without copying implementation or creating two competing totals.

**Meaningful demonstration:** Demonstrate our own native overview with this mod absent; optional recognition can remain informational.

**Package:** [P:/FS25 MOD VAULT/FS25_364188_Farm_Operations_Dashboard.zip](P:/FS25%20MOD%20VAULT/FS25_364188_Farm_Operations_Dashboard.zip)

**Descriptor multiplayer flag:** true; this is an author declaration, not our runtime test. **Declared dependencies:** None in this descriptor; runtime/feature requirements still need checking.

### Additional sensible native enhancements

- One what-needs-attention board combining genuine field work, animal supplies, production interruptions, fleet service/fuel and time-sensitive selling opportunities, with clear source/freshness.
- Feed days remaining and production time-to-empty/time-to-full only when a trustworthy effective rate exists. Label estimates and do not double-apply AFC, seasonal or time-scale multipliers.
- Price opportunity and stock value from actual live prices and quantities, with potential value clearly separate from realised income and no double-counting of RealSilo/pallet aggregates.
- Generic custom-crop/fill-type and modded-vehicle/placeable support through game metadata. Do not hardcode Montana or a vault filename as the identity of a crop or object.
- Existing Vehicle Mileage, Implement Usage Counter and game-time hours can enrich fleet history, but most operating data should remain useful without all three.
- Do not prioritise camera effects, mirrors, graphical HUD-only mods, editor scripts or decorative assets as dedicated dashboard integrations. Only add a surface when it provides real out-of-game value.

## 4. Dependencies and conflicts: evidence, not pack labels

The present demo document uses a broad hard-conflict list. Some separations are correct, others are just sensible simple presets, and some risks were omitted. Replace a binary assumption with versioned, capability-specific evidence.

### PF and RF Soil Fertilizer

**Classification:** Explicit source exclusion

**Evidence:** Installed SoilFertilityManager.lua:593-607 disables RF Soil when PF is detected.

**Rule:** Keep the separate PF and RF showcase presets. Show a disabled/conflict reason rather than falsely active RF soil.

**Limit of this finding:** This is evidence about the reviewed Soil Fertilizer version, not a blanket assertion that every RF-family mod conflicts with PF.

### Diesel price writers

**Classification:** Confirmed competing write targets

**Evidence:** RDP RealisticDieselPrice.lua:106, FDP.lua:29-33 and RF FuelPriceEngine.lua:110 all write DIESEL.pricePerLiter. Savegame19 includes both RF Fuel Costs and Realistic Diesel Price.

**Rule:** Choose or verify one effective price owner per preset. Audit configuration/timing before declaring the current stack safe; the old conflict list omitted RF Fuel Costs.

**Limit of this finding:** The exact observed overwrite/order is not live-tested here. A loaded package might have an inactive price feature.

### ELS versus vanilla-credit automation

**Classification:** Different debt models / policy conflict

**Evidence:** ELS replaces vanilla credit with its own loans. NoCredit sets Farm.MIN_LOAN/MAX_LOAN to zero. I Need A Loan and Automatic Loan Repay target vanilla credit behaviour.

**Rule:** Keep ELS distinct from incompatible vanilla-credit policies unless an explicit bridge is proven. I Need A Loan plus Automatic Loan Repay is a sensible candidate combination, not a mandatory pair.

**Limit of this finding:** NoCredit is not a required dependency, and an opposite loan policy is not necessarily a game crash.

### Units

**Classification:** Potential shared-formatting override

**Evidence:** Imperial and British-style formatters may own the same surfaces; Save Unit Profiles chooses per-save settings and can be complementary.

**Rule:** Use one clear fill-format owner in marketing presets. Test Save Unit Profiles alone and with each supported formatter.

**Limit of this finding:** Do not reject every pair just because they are all in a units category.

### Maintenance, collision and tyre faults

**Classification:** Overlapping behaviour; pair-specific proof required

**Evidence:** EVM includes collision/fault/puncture behaviour itself; other maintenance and fault mods can affect the same vehicle state.

**Rule:** Use one main maintenance system per simple demo. Test specific additive combinations and preserve previously verified setups.

**Limit of this finding:** Shared subject matter is a risk signal, not proof every combination is impossible.

### Market Dynamics + Dynamic Market + seasonal pricing

**Classification:** Price-model overlap needs configured-state audit

**Evidence:** Savegame19 lists RF Market Dynamics and Dynamic Market. Their price hooks operate in related selling-price paths.

**Rule:** Expose effective current prices and contributing provider/settings; use one primary model for the first clear showcase.

**Limit of this finding:** No claim of a proven crash or unconditional incompatibility. Do not multiply already-modified prices again.

### RCC weather/yield + RF crop stress + Realistic Weather

**Classification:** Settings-dependent overlap and intentional integration

**Evidence:** RCC weather/yield are optional and currently off. SCS contains a WeatherIntegration path for Realistic Weather.

**Rule:** Calendar-only RCC can be assessed separately from RCC weather/yield. Respect existing optional bridges and test stacking when extra modifiers are enabled.

**Limit of this finding:** Do not categorically ban Realistic Weather with RF simply because both concern weather.

### DairyCore / Ritter / seasonal milk and wool / AFC

**Classification:** Mixed intentional bridges and rate overlap

**Evidence:** DairyCore has an optional Ritter bridge with Standard mode; Seasonal Wool has separate vanilla/Ritter adapters; AFC can change consumption/output rates.

**Rule:** Resolve the owning source per metric and do not double-apply factors. Preserve optional integration instead of making Ritter a prerequisite.

**Limit of this finding:** The complete combined animal pack still needs live comparison. Saved Ritter records must be scoped through its own identity, not only vanilla clusters.

### Additional Contracts + Better Contracts / animal variants

**Classification:** No declared Better Contracts dependency; feature-specific caveat

**Evidence:** Additional Contracts has no Better Contracts descriptor dependency. Better Contracts changelog explicitly acknowledges it. Animal-dealer contracts warn about unsupported Realistic Livestock variants.

**Rule:** Test Additional Contracts alone and together with Better Contracts. Restrict the specific animal-contract capability if unsupported, not all unrelated contract data.

**Limit of this finding:** Descriptor absence alone is not universal proof of independence; retain runtime/API checks.

### Production scheduling/distribution/capacity modifiers

**Classification:** Shared-state overlap

**Evidence:** Production Schedule, Productions Manager, Production Control, Factory Profit Calculator, Distribution Redux and Animal Planner can affect different but intersecting recipe/logistics/capacity state.

**Rule:** Read final effective values and identify the owning setting; exercise combinations intentionally instead of adding all controllers to a showcase.

**Limit of this finding:** Do not assume all production mods conflict; pure readers can coexist.

### True declared dependencies

**Classification:** Verified metadata requirements

**Evidence:** Farm Reputation -> Better Contracts; Demand-oriented Application Rate -> PF; Enhanced Seasonal Prices -> Seasonal Prices base; FilterYears/Through The Years/Disable GPS By Year -> Vehicle Years; several tool packs -> their base packages.

**Rule:** Represent these edges explicitly and allow each dashboard adapter with only its actual prerequisites. The full inventory records the descriptor dependencies.

**Limit of this finding:** Do not fabricate standalone operation for a genuine upstream add-on.

### Deployment mode

**Classification:** Explicit upstream limits

**Evidence:** VIP Order Manager, Yield Tracker and Field Profitability Ledger descriptors are single-player-only; Farmland Marketplace is explicitly multiplayer-only.

**Rule:** Add SP/MP/dedicated capability labels and use a correct-mode demo for each feature.

**Limit of this finding:** Our dashboard cannot confer multiplayer support on an upstream mod by successfully parsing its JSON.

### Important published constraints

- [Farm Reputation on official ModHub](https://www.farming-simulator.com/mod.php?mod_id=367320&title=fs2025) explicitly requires Better Contracts. This is an upstream requirement, not dashboard coupling.
- [VIP Order Manager on official ModHub](https://www.farming-simulator.com/mod.php?mod_id=310861&title=fs2025) states that multiplayer is not supported; the reviewed descriptor agrees.
- [Farmland Marketplace on official ModHub](https://www.farming-simulator.com/mod.php?mod_id=369241&title=fs2025) is designed for multiplayer farm-to-farm business; do not demonstrate it as a single-player capability.
- [Field Profitability Ledger on official ModHub](https://www.farming-simulator.com/mod.php?mod_id=369866&title=fs2025) describes its field/cycle reporting. The reviewed local descriptor declares multiplayer unsupported, which must remain a support limitation.

## 5. Assessment of the actual four saves

These are saved-file observations, not a live playthrough. All four careers exist. The preceding audit found only one configured V5 local server and only savegame19 exporting at the checked demo export locations; the existence of the four careers does not mean the website currently offers four usable demos. Do not confuse all-map field rows with player-owned fields.

### Save 4: Riverbend Base

**Recorded mod count:** 1

**Verdict:** Keep as the clean baseline; improve its content.

**Evidence**

- Only Farm Dashboard is recorded in the save manifest.
- Farm 1 has 10 saved vehicles, a small three-cow Angus group at health 0, and no owned production point in the inspected placeables.
- Different crop/vehicle states from the PF save mean it is not yet a controlled before/after comparison.

**Preparation before showcasing**

1. Use healthy, supplied animals plus one deliberate low-resource example.
2. Add one simple operating production, useful stored crop, working field states and representative fleet fuel/damage.
3. Keep all companion mods off; prove the native dashboard is valuable on its own.

**Suggested public route:** `/demo/base` (proposal, not deployed).

**Save manifest:** [C:/Users/Graham/Documents/My Games/FarmingSimulator2025/savegame4/careerSavegame.xml](C:/Users/Graham/Documents/My%20Games/FarmingSimulator2025/savegame4/careerSavegame.xml).

### Save 3: Riverbend Precision Farming

**Recorded mod count:** 2

**Verdict:** Keep; it is the best isolation example already set up.

**Evidence**

- The manifest lists only Farm Dashboard and Precision Farming.
- PF XML and density-map files exist, but that alone is not proof of purchased sample coverage or correct live nitrogen/pH rendering.
- Farm 1 has nine vehicles, the same small zero-health Angus group and no owned production point in the inspected placeables.

**Preparation before showcasing**

1. Prepare scanned and unscanned fields with genuinely different nitrogen/pH needs.
2. Use the same comparable baseline farm layout where practical, without overwriting the user's originals.
3. Capture in-game PF values and the matching completed dashboard export before publishing.

**Suggested public route:** `/demo/precision-farming` (proposal, not deployed).

**Save manifest:** [C:/Users/Graham/Documents/My Games/FarmingSimulator2025/savegame3/careerSavegame.xml](C:/Users/Graham/Documents/My%20Games/FarmingSimulator2025/savegame3/careerSavegame.xml).

### Save 19: Montana RF and companions

**Recorded mod count:** 55

**Verdict:** Useful rich showcase, but not a clean independence test and not yet a strong demonstration of several advertised integrations.

**Evidence**

- Manifest records 55 mods and 23 farm-1 vehicles.
- els_loans.xml contains settings but no loan entries.
- realSiloData.xml contains nine silos, zero configured entries and zero filled slots.
- regionalCropCalendar.xml selects vanilla; weather, yield and strict suitability are off.
- Ritter has separate saved animal records; missing vanilla clusters must not be interpreted as no livestock.
- RF Fuel Costs and Realistic Diesel Price coexist; Market Dynamics and Dynamic Market also coexist and need ownership/configuration review.

**Preparation before showcasing**

1. Create a meaningful ELS loan through normal game play in the demo copy.
2. Configure and fill RealSilo compartments, select an actual RCC region, and stage a producing livestock/production setup.
3. Provide one clear state per highlighted feature: an alert, a value, a reason and an action the player can take in game.
4. Review duplicate price owners and optional weather/yield settings without deleting working mods indiscriminately.
5. Use single-mod test profiles separately; do not infer independence from this 55-mod save.

**Suggested public route:** `/demo/realistic-farming` (proposal, not deployed).

**Save manifest:** [C:/Users/Graham/Documents/My Games/FarmingSimulator2025/savegame19/careerSavegame.xml](C:/Users/Graham/Documents/My%20Games/FarmingSimulator2025/savegame19/careerSavegame.xml).

### Save 18: Montana PF and companions

**Recorded mod count:** 33

**Verdict:** Keep as the alternative rich showcase; populate the features and separate it from compatibility evidence.

**Evidence**

- Manifest records 33 mods and 23 farm-1 vehicles.
- Five farm-1 husbandries have no saved vanilla animal clusters in the inspected placeables.
- Vanilla farm loan is zero, so repayment policy can be displayed but a repayment event is not demonstrated.
- soilWorkYieldBonus.xml contains only its header/settings, with no saved worked-cell data.
- The owned production points have recipes enabled but no saved input stock in their inspected storage blocks.

**Preparation before showcasing**

1. Populate livestock with the intended supported animal system and safe feed/water levels.
2. Create a controlled vanilla debt example for I Need A Loan/Automatic Loan Repay.
3. Actually work a field with a supported implement to generate Soil Work Yield Bonus coverage.
4. Prepare a service-due machine and genuine recipe/input/output examples.
5. Keep a deliberate PF and Imperial story; do not exclude Livestock Monitor or Production Watcher solely because Pack A also uses them.

**Suggested public route:** `/demo/precision-companions` (proposal, not deployed).

**Save manifest:** [C:/Users/Graham/Documents/My Games/FarmingSimulator2025/savegame18/careerSavegame.xml](C:/Users/Graham/Documents/My%20Games/FarmingSimulator2025/savegame18/careerSavegame.xml).

### Do not erase the useful setup

Keep these themes and prepare preserved copies through normal game actions. There is no reason to wipe personal careers or all modSettings. Store an explicit active-mod manifest and a feature checklist for each capture. A saved empty ELS loan list can be valid gameplay, but it cannot showcase loan detail; the same distinction applies to empty silos, unused soil-work modifiers and unpopulated barns.

### Add only the missing reference scenarios

- An RF-only reference is valuable for internal tests and potentially as an optional public comparison. It should contain the chosen RF modules and their real structural prerequisites, not the full third-party companion pack.
- A companion-minimal test profile for each adapter is essential, but these do not all need public save slots or website cards.
- A real multiplayer/multi-farm example is needed if adopting MP-only marketplace data or making cross-farm claims. Keep it separate from the four single-player themes.
- Do not add a fifth or sixth public save merely to increase the count. Add a scenario when it demonstrates a distinct supported capability.

## 6. Public demo architecture

The current local website has one live dashboard URL; the current demo guide deliberately leaves one save loaded. That design cannot fulfil four independently browsable, always-available showcases by itself. The recommended design is a gallery of versioned recorded snapshots using the real V5 renderer, plus an optional separate live source.

1. Keep the four themes as the main gallery: Base, Precision Farming, RF + companions, and PF + companions. Visitors should understand the benefits, not have to interpret a list of 55 ZIPs.
2. Add per-demo feature links such as Fields and soil, Loans, Silo compartments, Livestock, Production and Service planning. Each highlighted feature must open an actually populated view.
3. Publish a complete sanitised snapshot plus the map/image assets required by the normal V5 renderer. This preserves a real interactive product experience rather than reducing the demo to screenshots.
4. Serve snapshots from the existing website/NAS infrastructure if it can serve the required static assets. No paid platform is inherently necessary. Check the deployed server capability before implementation; no hosting changes were made here.
5. Use four immutable demo IDs and independent data contexts. Switching one visitor's demo must not change another visitor's view or the host app's globally selected server.
6. Keep an optional separately labelled Live farm route. A single running game save does not make all four saved careers live simultaneously.
7. Label static captures clearly: Recorded demo, collected date, game date/season, map/provider and relevant limitations. Never give an old snapshot the current time or a live badge.
8. If animated replay is added later, label it Replay and use a coherent ordered sequence from one save. Do not blend unrelated exports to make the screen look busy.
9. Publish only an explicit allowlist of demo data. Strip player identifiers, private names where needed, raw Windows/NAS paths, secrets, connection settings and non-demo server metadata; do not assume serialising the whole current object is safe.
10. Make read-only enforceable at the server/data-source boundary, not only by hiding buttons. No public config writes, mod installation, game control, uploads, arbitrary file reads or host-server selection.
11. Give every demo manifest a stable ID, schema version, map/save identity, app/mod/build versions, active mod versions, captured timestamp, featured capabilities, asset manifest and limitations.
12. Validate completion and feature coverage before an atomic publication. Keep the previous known-good demo if an export is partial; never replace a rich showcase with a bootstrap.
13. Keep each demo's caches, requests and assets scoped by ID/generation. Reuse the existing stale-response guards; test rapid switches and two concurrent visitors.
14. Treat mod images, maps and downloadable saves separately from factual demo data. Use assets you are entitled to publish and link to authors' downloads rather than repackaging third-party ZIPs; assess distribution permissions before offering save bundles.
15. Do not change the existing live tunnel, passwords or deployed website during this planning pass. The current local website source still points at one demoAppUrl and advertises one live save; deployed-site behaviour was not exercised.

### Proposed manifest and publication contract

Each demo needs: stable demo ID, display name, provider, map ID/title, app/mod/game versions, active-mod versions, collection time, in-game season/date, featured capabilities, required assets and stated limitations. An isLive=false flag belongs to captured snapshots. The active-mod manifest must describe the recorded session, not whatever ZIPs happen to be installed on the hosting PC.

Preparation sequence: run the intended demo -> wait for a complete export -> compare highlighted values in game -> copy/sanitise into a staging bundle -> ensure the advertised views and assets are present -> publish the complete bundle atomically. Preserve the last known-good bundle if capture fails. This pipeline is a proposal; it was not executed.

### Suggested visitor experience

1. Choose a theme from four clear cards. Each says what extra functionality it demonstrates and whether the data is recorded or live.
2. Open the real dashboard already scoped to that demo, with a persistent demo label and captured date.
3. Use feature shortcuts to reach populated views: PF soil, RF soil, ELS loan, compartment storage, livestock, production and service examples.
4. Open a concise support panel distinguishing mod installed/active, live adapter, native compatibility and presence-only information.
5. Return to the gallery or switch only the visitor's selected demo without changing the host game/app session.

**Relevant local website source:** [Website/demo.html:100](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/Website/demo.html:100), [Website/js/site-config.js:30](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/Website/js/site-config.js:30), [NEW APP/src/platform/DemoBanner.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/platform/DemoBanner.tsx). These are source observations; no deployed-site vulnerability or read-only enforcement test is claimed.

## 7. Adapter independence requirements

1. Base dashboard plus no companions must work. Native fields, animals, storage, fleet and production must not require Livestock Monitor, Production Watcher, RF, PF, a particular map or another dashboard.
2. Each optional adapter has one canonical mod ID, supported version/capability, genuine dependency list, deployment modes, scope and verified read surface. Vault download filenames with numeric prefixes are not canonical runtime mod IDs.
3. Activity is mission-loaded state, not installed ZIP inventory. Cache discovery per mission; do not scan 665 archives from the frame update.
4. Absence, inactive, starting, unsupported version, missing prerequisite, failed, complete empty and stale are distinct states. None may silently become healthy zero/allowed.
5. Use an independent error boundary per adapter. Failure of one optional integration cannot disable all companion output or the base exporter.
6. Use the companion's owning Lua namespace or documented mission API, not guessed globals. Avoid invoking gameplay actions, money changes or setters to collect data.
7. Never use current-player UI helpers as universal dedicated-server APIs. Scope data explicitly by farm and use server-authoritative state where required.
8. Normalise each metric once with source, units, farm/entity identity and timestamp. Core totals must not double-count mod aggregates or double-apply price, quantity or production multipliers.
9. Two mods contributing different capabilities can coexist. Two providers claiming the same authoritative value need an explicit ownership/composition policy grounded in their actual game behaviour.
10. True upstream dependencies and conflicts remain visible, versioned edges. Do not create a global Pack A/Pack B or RF/PF gate for unrelated mods.
11. Do not make use of a companion mod a condition for purchasing or running the dashboard. Optional integrations enrich native views and fail gracefully.
12. Keep reading gameplay state separate from public demo publication. Publish an allowlisted, sanitised projection, never the raw mod folder or game configuration.
13. Preserve coherent V5 builds, the canonical FS25_FarmDashboard.zip name and the public V4 boundary. No new installer folders or renamed mod identities are needed for this work.

### Concrete examples of the intended contract

- Farm Dashboard + ELS alone should show ELS loans; it must not need Soil Fertilizer, PF, FarmTablet, Livestock Monitor or the Montana map.
- Farm Dashboard + RealSilo alone should show compartments; removing Production Watcher must not affect them.
- Farm Dashboard + Livestock Monitor alone should enrich livestock alerts; removing ELS must not disable the companion hub.
- Farm Dashboard + Seasonal Wool alone should use its supported vanilla path; Ritter is an optional bridge, not an invented prerequisite.
- Farm Dashboard + Farm Reputation requires Better Contracts because Farm Reputation itself does. Other dashboard features remain usable without either.
- Farm Dashboard + Demand-oriented Application Rate requires PF because it is a PF add-on. That requirement must not spread to unrelated field/finance adapters.
- If an actual unsupported upstream combination is loaded, show the affected capability as unsupported/disabled while retaining unrelated correct data.

## 8. How to prove combination support

Do not promise exhaustive testing of every subset. Forty-seven catalog entries already imply more than 140 trillion possible subsets, before versions, settings and game modes. The defensible approach is independent adapters, minimum-set tests, a constrained pairwise coverage set and explicit high-risk multi-provider scenarios. This targets accidental dependencies without claiming impossible exhaustive proof.

### Minimum supported set

For each adapter X: base game/map + Farm Dashboard + X + only X's genuine required dependencies. Check meaningful positive data and absence of unrelated features.

**Status:** Proposed; not run in this research.

### Uninstalled and inactive

X absent; X installed but unchecked; stale X settings on disk; many unrelated vault ZIPs installed. Native behaviour must remain identical.

**Status:** Proposed; not run in this research.

### Optional bridge absent

For adapters with vanilla/Ritter/PF/RF bridges, run the ordinary supported mode with that optional bridge absent. No transitive dependency should appear.

**Status:** Proposed; not run in this research.

### Pairwise valid combinations

Build a constrained pairwise covering set across supported adapters and base/PF/RF providers. Cover each permitted pair and exclude only documented upstream conflicts, not demo-pack choices.

**Status:** Proposed; not run in this research.

### Targeted multi-mod stacks

Explicitly test price writers, units/profile combinations, animal scaling/seasonal/realism combinations, maintenance/fault overlaps and production scheduling/distribution/capacity combinations.

**Status:** Proposed; not run in this research.

### Failure isolation

One reader throws, initialises late, returns incomplete data or lacks its prerequisite. Other adapters and native collectors remain working and the failed one explains why.

**Status:** Proposed; not run in this research.

### Removal and save reload

Disable X, reload in the same game process, switch save/map/farm and restart the desktop. No stale presence, units or mod-specific data should survive as current.

**Status:** Proposed; not run in this research.

### Scope and deployment

SP, MP host, joining client and dedicated server only where upstream and dashboard support them. Include two farms with contrasting data; restrict private information correctly.

**Status:** Proposed; not run in this research.

### Effective values and scale

Read current prices, recipe rates, capacity, units and animal consumption once after modifiers. Compare against the same in-game source and expose estimate/quality limitations.

**Status:** Proposed; not run in this research.

### Demo isolation

Two visitors choose different demo IDs without changing each other's view or the host's live source. Public requests cannot switch the real app server, mutate settings or access non-demo paths.

**Status:** Proposed; not run in this research.

### Snapshot completeness

Accept only a completed, identity-matched export with the promised fields/sections. Validate linked assets, timestamps, sanitisation and offline availability before atomic publication.

**Status:** Proposed; not run in this research.

### Repeatability and support claim

Record version manifests, exact scenarios and results. A screenshot, modDesc flag or successful build is not a passed in-game combination test.

**Status:** Proposed; not run in this research.

### Evidence to retain for each supported adapter

- Canonical mod ID, version range actually tested, upstream dependency IDs and supported game modes.
- The source/read API and whether it is stable, UI-only, client-local or server-authoritative.
- Minimum-set result, absent/inactive result, removal/reload result and covered valid combinations.
- One positive meaningful in-game comparison, not only an empty structure or detected flag.
- Scope, unit conversion, freshness and complete-empty handling; one fault-isolation result.
- Known conflicts stated narrowly by feature/version/settings, and links to evidence rather than an unqualified pack ban.

## 9. Ordered implementation handoff

### 1. Correct the claims and stabilise the data path

1. Use the preceding recovery plan to resolve the exporter/configuration/namespace/retention defects first.
2. Correct the inaccurate catalog meanings and distinguish native compatibility, presence-only and live data.
3. Record real dependency/mode constraints and the exact installed versus vault versions.

### 2. Finish the highest-value existing integrations

1. Complete ELS, restrictions, calendar, units, RealSilo and pallet condition readers with independent failure states.
2. Complete one maintenance adapter before adding alternative service systems.
3. Retain useful native livestock/production behaviour with companions absent; add seasonal wool as a close, worthwhile extension.

### 3. Prepare the four saves as product demonstrations

1. Work on preserved demo copies, not personal saves or destructive resets.
2. Populate loans, compartments, livestock, production inputs, worked fields and service examples as specified.
3. Produce a feature checklist and same-save game/export comparison for every demo.

### 4. Build an isolated, always-available demo gallery

1. Add four immutable demo IDs and per-demo sanitised exports/assets/manifest metadata.
2. Use the actual dashboard renderer in a read-only snapshot data mode; keep an optional live route separate.
3. Add feature navigation and status labels; do not expose global live-server switching to visitors.

### 5. Prove independence and optional combinations

1. Run minimum-set and absence tests for every claimed adapter.
2. Run constrained pairwise and high-risk multi-provider scenarios; document upstream restrictions precisely.
3. Add a clean RF-only reference for testing, and an MP reference only when a multiplayer-only integration is actually adopted.

### 6. Add new integrations in small releases

1. Start with Task List, Production Schedule and Economic History once the foundation is stable.
2. Then consider field profitability/SP orders, livestock planning, reputation and land/logistics features based on demonstrable user value.
3. Each new adapter needs its own minimum-set proof and a small meaningful demo; do not expand the giant pack as a substitute.

## 10. Full vault inventory and limitations

Inventory: [C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/docs/MOD-VAULT-INVENTORY-2026-09-23.json](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/MOD-VAULT-INVENTORY-2026-09-23.json). It records all 665 archive names, parsed title/version, declared dependencies and MP flag, descriptor-reader exceptions and whether Lua source was screened. It deliberately does not label metadata-only entries as supported.

The two archives rejected by the reader were `FS25_361041_Menu_Scroll_Memory.zip` and `FS25_369583_Object_Storage_Visuals.zip`, both with ZIP comment-length errors. Do not diagnose their game behaviour from that alone. Twelve other archives lacked readable mod descriptors, principally editor tools/prefab content, and should not be marketed as runtime dashboard integrations.

The preceding recovery plan remains relevant: [C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/docs/COMPATIBILITY-RECOVERY-PLAN-2026-09-23.md](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/COMPATIBILITY-RECOVERY-PLAN-2026-09-23.md). This follow-up adds feature feasibility, catalog correction, real dependency boundaries and demo strategy; it does not certify that the preceding fixes have since been implemented.

## Final recommendation

Keep Ash's broad direction, correct the inaccurate claims, and prioritise real data over card count. Finish the current core integrations, prepare the four existing saves so their advertised features actually contain useful state, and host those captures as independent read-only demos. Then add a small number of high-value integrations with an explicit minimal-dependency contract and evidence. Do not rely on a 55-mod save as proof that each mod works by itself.
