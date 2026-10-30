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
| farmlandMarketplace | limited | fields | B2 | Not yet run |
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
| everythingConstructable | live | dedicated page | B2 | Not yet run |
| advancedMaintenance | limited | vehicles | B1 | B1: 5.2.12 card falsely pending; 5.2.13 fix awaiting Ally |
| extendedVehicleMaintenance | limited | vehicles | B2 | Not yet run |
| realisticVehicleService | limited | vehicles | B2 | Not yet run |
| outOfFuel | detection-only | vehicles | A | A: notice only; gameplay unproved |
| puncturedTires | unmapped | vehicles | R | No data reader claimed; active detection/navigation to check |
| collisionDamage | unmapped | vehicles | A | A: zero hits; gameplay unproved |
| vehicleMileage | unmapped | vehicles | A | A: UI seen; values unverified |
| vehicleYears | unmapped | vehicles | A | A: UI seen; values unverified |
| courseplay | unmapped | vehicles | A | A: settings only; no course |
| implementUsageCounter | unmapped | vehicles | R | No data reader claimed; active detection/navigation to check |
| ingameTimeOperatingHours | unmapped | vehicles | R | No data reader claimed; active detection/navigation to check |
| saveUnitProfiles | limited | economy | B1 | B1: GBP export only; Economy UI unchecked |
| imperialSystem | unmapped | economy | R | No data reader claimed; active detection/navigation to check |
| britishFillUnits | unmapped | economy | A | A: hooks/samples only; no page |
| bushelPlus | unmapped | vehicles | A | A: no combine attached; gameplay unproved |
| seasonalWoolProduction | limited | pastures | A | A: schedule matched; no sheep |
| taskList | limited | economy | B2 | Not yet run |
| productionSchedule | limited | productions | B2 | Not yet run |
| economicHistory | limited | economy | B2 | Not yet run |
| animalPlanner | limited | pastures | B2 | Not yet run |
| vipOrderManager | limited | economy | B2 | Not yet run |
| fieldProfitabilityLedger | limited | fields | B2 | Not yet run |
| farmReputation | limited | economy | B2 | Not yet run |
| yieldTracker | limited | fields | B2 | Not yet run |
| moistureSystem | limited | fields | B1 | B1: field values matched; bale/silo states absent |
| fieldLeasing | limited | fields | A | A: settings only; no lease |
| rentYourField | limited | fields | B2 | Not yet run |
| distributionRedux | limited | productions | B2 | Not yet run |
| silageCompactionMonitor | limited | storage | B2 | Not yet run |
| farmOperationsDashboard | limited | overview | B2 | Not yet run |

Cohort counts: A 22, B1 9, B2 16, R 18. Among all entries, 36 have live or limited data support; 29 are detection-only or unmapped. The A cohort contains 11 data readers and 11 other catalog entries.

Known declared dependencies: Farm Reputation requires Better Contracts; reference-only Enhanced Seasonal Prices requires ZYX Seasonal Prices. Fluctuating Diesel Price and Realistic Diesel Price both write fuel pricing, so their combined behavior must be tested separately.

A functional Lua regression for all 65 active catalog entries found and fixed a 64-entry export cap in source. This source change is not in the currently installed 5.2.12 candidate.

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

Phase B1 evidence: Z:\Graham\agent-comms\ally-fh-companions-b1-evidence\RESULT-B1-text.md. Installer 5.2.12 and mod 5.1.0.15 matched their frozen hashes, three distinct game runs committed multiple generations, one Windows app row appeared, and Tina restored the Ally by hash. The Advanced Maintenance V5 card used an older pending summary although the newer per-farm page was complete; fixed in V5 5.2.13 source and regression tested, with installed Ally confirmation pending in B2.
