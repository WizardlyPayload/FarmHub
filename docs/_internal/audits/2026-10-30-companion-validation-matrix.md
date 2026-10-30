# Farm Dashboard companion validation matrix

2026-10-30. This is a test tracker, not a claim that all mods have passed. The scope is dashboard integration, not every gameplay feature of each third-party mod.

Evidence levels: static source/ZIP checks; fresh in-game committed export; installed dashboard value/page; hide-on-uncheck; clean restoration. A historical export does not count as current acceptance.

A = completed Witcombe save 20 on Tina Ally, with game closed before UI inspection; B1 = nine other data readers; B2 = sixteen vault-only data readers; R = reference/detection-only or other mods without dashboard data readers. RF dashboard pages and DLC are separate from these 65 companion catalog entries.

| Mod ID | Advertised support | Dashboard section | Cohort | Live result |
|---|---|---|---|---|
| enhancedLoanSystem | live | economy | B1 | B1: live loan game/export/UI matched |
| automaticLoanRepay | live | economy | A | A: export/UI/HUD matched |
| iNeedALoan | unmapped | economy | R | No data reader claimed; active detection/navigation to check |
| noCredit | unmapped | economy | R | No data reader claimed; active detection/navigation to check |
| realisticDieselPrice | live | economy | A | A: export/UI matched; hid when unchecked |
| fluctuatingDieselPrice | live | economy | B1 | B1: export/UI matched; game price unverified |
| dynamicMarket | detection-only | economy | R | No data reader claimed; active detection/navigation to check |
| marketPriceHelper | unmapped | economy | R | No data reader claimed; active detection/navigation to check |
| enhancedSeasonalPrices | unmapped | economy | R | No data reader claimed; active detection/navigation to check |
| statisticsExtended | unmapped | economy | R | No data reader claimed; active detection/navigation to check |
| restrictedPeriods | live | fields | A | A: export/UI matched |
| regionalCropCalendar | live | fields | A | A: export/UI matched; crop counts partial |
| soilWorkYieldBonus | limited | fields | A | A: empty worked ground; gameplay unproved |
| smartCropControl | unmapped | fields | A | A: UI seen; values unverified |
| dynamicFieldPrices | unmapped | fields | R | No data reader claimed; active detection/navigation to check |
| farmlandMarketplace | limited | fields | B2 | B2: loaded, reader unavailable in save 20; gameplay/UI unproved |
| betterContracts | live | economy | A | A: export/UI matched; active contracts zero |
| missionsExpanded | unmapped | economy | R | No data reader claimed; active detection/navigation to check |
| additionalContracts | unmapped | economy | R | No data reader claimed; active detection/navigation to check |
| livestockMonitor | limited | pastures | B1 | B1: Pastures settings card; alerts unproved |
| animalFoodOverview | unmapped | pastures | A | A: UI seen; values unverified |
| animalFoodCalculator | limited | pastures | B1 | B1: feed export/UI/game pens matched |
| realisticAnimalLosses | unmapped | pastures | A | A: UI and in-game notice consistent |
| realisticMilkingTimes | unmapped | pastures | R | No data reader claimed; active detection/navigation to check |
| seasonalMilkProduction | limited | pastures | A | A: schedule matched; pen baseline pending |
| animalTrader | unmapped | pastures | R | No data reader claimed; active detection/navigation to check |
| stallRental | unmapped | pastures | R | No data reader claimed; active detection/navigation to check |
| productionWatcher | limited | productions | B1 | B1: counts matched; live alerts unreadable |
| productionControl | unmapped | productions | R | No data reader claimed; active detection/navigation to check |
| productionsManager | unmapped | productions | R | No data reader claimed; active detection/navigation to check |
| factoryProfitCalculator | limited | productions | A | A: line count matched; profit unverified |
| timeSavingStockCheck | unmapped | storage | A | A: settings only; menu unopened |
| palletDegradation | limited | storage | A | A: export/UI matched |
| realSilo | limited | storage | B1 | B1: 2 silo structures matched; both empty |
| everythingConstructable | live | dedicated page | B2 | B2: ZIP installed but checkbox off and no `Load mod` line; active project/delivery untested |
| advancedMaintenance | limited | vehicles | B1 | B2: 5.2.13 stopped false pending; 16-machine count absent. 5.2.14 candidate adds count and label; Ally confirmation pending |
| extendedVehicleMaintenance | limited | vehicles | B2 | B2: truncated export; UI generic/unlabelled. 5.2.14 candidate labels it; game comparison pending |
| realisticVehicleService | limited | vehicles | B2 | B2: truncated export; UI showed normalized 0.99999 condition as 1%. 5.2.14 candidate converts to 100% and labels it; Ally confirmation pending |
| outOfFuel | detection-only | vehicles | A | A: notice only; gameplay unproved |
| puncturedTires | unmapped | vehicles | R | No data reader claimed; active detection/navigation to check |
| collisionDamage | unmapped | vehicles | A | A: zero hits; gameplay unproved |
| vehicleMileage | unmapped | vehicles | A | A: UI seen; values unverified |
| vehicleYears | unmapped | vehicles | A | A: UI seen; values unverified |
| courseplay | unmapped | vehicles | A | A: settings only; no course |
| implementUsageCounter | unmapped | vehicles | R | No data reader claimed; active detection/navigation to check |
| ingameTimeOperatingHours | unmapped | vehicles | R | No data reader claimed; active detection/navigation to check |
| saveUnitProfiles | limited | economy | B1 | B1/B2: GBP export; Economy UI still unchecked |
| imperialSystem | unmapped | economy | R | No data reader claimed; active detection/navigation to check |
| britishFillUnits | unmapped | economy | A | A: hooks/samples only; no page |
| bushelPlus | unmapped | vehicles | A | A: no combine attached; gameplay unproved |
| seasonalWoolProduction | limited | pastures | A | A: schedule matched; no sheep |
| taskList | limited | economy | B2 | B2: empty task list; UI/game event unproved |
| productionSchedule | limited | productions | B2 | B2: empty recipes; Productions card matched empty state |
| economicHistory | limited | economy | B2 | B2: monthly totals exported; UI not inspected |
| animalPlanner | limited | pastures | B2 | B2: pen counts matched prior game/export and Pastures card |
| vipOrderManager | limited | economy | B2 | B2: empty orders; UI/game event unproved |
| fieldProfitabilityLedger | limited | fields | B2 | B2: unavailable, no sale-category data in save |
| farmReputation | limited | economy | B2 | B2: unavailable; Better Contracts dependency present; uncheck test not run |
| yieldTracker | limited | fields | B2 | B2: empty rows; UI/game event unproved |
| moistureSystem | limited | fields | B1 | B1: field values matched; bale/silo states absent |
| fieldLeasing | limited | fields | A | A: settings only; no lease |
| rentYourField | limited | fields | B2 | B2: empty agreements; UI/game event unproved |
| distributionRedux | limited | productions | B2 | B2: unavailable; Productions card accurately said unavailable |
| silageCompactionMonitor | limited | storage | B2 | B2: unavailable in save 20; game/UI unproved |
| farmOperationsDashboard | limited | overview | B2 | B2: empty fields; UI/game event unproved |

Cohort counts: A 22, B1 9, B2 16, R 18. Among all entries, 36 have live or limited data support; 29 are detection-only or unmapped. The A cohort contains 11 data readers and 11 other catalog entries.

Known declared dependencies: Farm Reputation requires Better Contracts; reference-only Enhanced Seasonal Prices requires ZYX Seasonal Prices. Fluctuating Diesel Price and Realistic Diesel Price both write fuel pricing, so their combined behavior must be tested separately.

A functional Lua regression for all 65 active catalog entries found and fixed a 64-entry export cap in source. This source change is in the 5.1.0.15 mod ZIP used for B1 and B2; the PC production mod remains 5.1.0.14.

Phase A evidence: Z:\Graham\agent-comms\ally-fh-companions-a-evidence\RESULT-FARMHUB-ALLY-20261030-COMPANIONS-A-text.md. Exact installer and mod hashes matched the phase A packet; generations 1-13 and then 1-4 committed, 22 then 21 companion pages, one Windows row, and Ally originals restored by hash. Run 2 was still under Courseplay fleet-spawn deferral, so its smaller fleet snapshot is not a separate verified vehicle regression.

## RF suite and DLC tracking

The 5.1.0.14 Ally phase A export also contained these RF presence records. Presence proves only that the mod was loaded, not that every RF feature or dashboard card was checked. Brian owns RF code; this audit can test Farm Dashboard rendering and integration only.

| RF mod | Loaded in phase A | Dashboard feature check |
|---|---|---|
| Soil Fertilizer | Yes | Pending dedicated UI/source comparison |
| Seasonal Crop Stress | Yes | Pending dedicated UI/source comparison |
| Fertilizer Depot | Yes | Pending dedicated UI/source comparison |
| Tax Mod | Yes | Pending dedicated UI/source comparison |
| Market Dynamics | Yes | Pending dedicated UI/source comparison |
| Fuel Costs | Yes | Pending dedicated UI/source comparison |
| Worker Costs | Yes | Pending dedicated UI/source comparison |
| Income Mod | Yes | Pending dedicated UI/source comparison |
| Workplace Triggers | Yes | Pending dedicated UI/source comparison |
| Dairy Core | Yes | Pending dedicated UI/source comparison |
| NPC Favor | Yes | Pending dedicated UI/source comparison |
| Random World Events | Yes | Pending dedicated UI/source comparison |
| Pro Staff Co-Op | Yes | Pending dedicated UI/source comparison |
| Weather Guard | Yes | Pending dedicated UI/source comparison |
| Time Guard | Yes | Pending dedicated UI/source comparison |
| State Ledger | Yes | Pending dedicated UI/source comparison |
| Network Sync | Yes | Pending dedicated UI/source comparison |
| Settings Hub | Yes | Pending dedicated UI/source comparison |
| Master HUD | Yes | Pending dedicated UI/source comparison |
| Farm Tablet | Yes | Pending dedicated UI/source comparison |
| Soil Scanner | No | Pending dedicated UI/source comparison |

DLC/export surfaces in this same save: Highlands Fishing enabled, Emergency Pack enabled, orchards available, Beans & Alpacas disabled. The previous Catuaí live test proved coffee and banana row ownership and map outlines using 5.1.0.14; no new DLC gameplay test has run with 5.1.0.15.

Phase B1 evidence: Z:\Graham\agent-comms\ally-fh-companions-b1-evidence\RESULT-B1-text.md. Installer 5.2.12 and mod 5.1.0.15 matched their frozen hashes, three distinct game runs committed multiple generations, one Windows app row appeared, and Tina restored the Ally by hash. The Advanced Maintenance V5 card used an older pending summary although the newer per-farm page was complete; V5 5.2.13 stopped the false pending display but did not show the machine count.

Phase B2 evidence: Z:\Graham\agent-comms\ally-fh-companions-b2-evidence\RESULT-B2-text.md, with selection and UI screenshots and decoded generation 8 export in the same folder. Exact 5.2.13 installer and 5.1.0.15 mod hashes matched the frozen packet, one Windows app row appeared, generations 1–9 committed, no reported Lua errors, and Tina restored all Ally originals by hash. Sixteen B2 readers were exercised on one disposable save: Animal Planner had meaningful matching pen counts; many others were empty or unavailable. Everything Constructable was available in the mod list but its checkbox was off and it had no `Load mod` line, so it was not active. The 5.2.14 candidate corrects the Vehicle Service percent and identifies the three maintenance readers separately. These corrections require installed Ally confirmation. No active construction project or delivery, Farm Reputation hide-on-uncheck, Save Unit Profiles Economy UI, or non-empty B2 event state has yet been verified.
