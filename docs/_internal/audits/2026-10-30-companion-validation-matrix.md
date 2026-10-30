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
| everythingConstructable | live | dedicated page | B2 | B5: eligible £10,000 Farm Barn created a project; seven material rows, cost and site matched export/UI. Delivery and in-game material checklist comparison remain untested |
| advancedMaintenance | limited | vehicles | B1 | B3: 5.2.14 installed card showed 16 machines from complete page despite older pending summary; passed this reading |
| extendedVehicleMaintenance | limited | vehicles | B2 | B3: 5.2.14 installed card separately labelled; partial coverage disclosed; live service event unproved |
| realisticVehicleService | limited | vehicles | B2 | B3: 5.2.14 installed card separately labelled and normalized 0.99999 showed 100%; truncated coverage disclosed |
| outOfFuel | detection-only | vehicles | A | A: notice only; gameplay unproved |
| puncturedTires | unmapped | vehicles | R | No data reader claimed; active detection/navigation to check |
| collisionDamage | unmapped | vehicles | A | A: zero hits; gameplay unproved |
| vehicleMileage | unmapped | vehicles | A | A: UI seen; values unverified |
| vehicleYears | unmapped | vehicles | A | A: UI seen; values unverified |
| courseplay | unmapped | vehicles | A | A: settings only; no course |
| implementUsageCounter | unmapped | vehicles | R | No data reader claimed; active detection/navigation to check |
| ingameTimeOperatingHours | unmapped | vehicles | R | No data reader claimed; active detection/navigation to check |
| saveUnitProfiles | limited | economy | B1 | B5: HUD GBP, runtime export GBP and 5.2.15 card GBP with partial-verification notice; Units menu showed EURO/US and mod logged no mapped profile, so menu sync remains a third-party/FS25 issue to diagnose |
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
| farmReputation | limited | economy | B2 | B3: hide-on-uncheck passed with Better Contracts still active; reputation values unavailable in save |
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

Phase B2 evidence: Z:\Graham\agent-comms\ally-fh-companions-b2-evidence\RESULT-B2-text.md, with selection and UI screenshots and decoded generation 8 export in the same folder. Exact 5.2.13 installer and 5.1.0.15 mod hashes matched the frozen packet, one Windows app row appeared, generations 1–9 committed, no reported Lua errors, and Tina restored all Ally originals by hash. Sixteen B2 readers were exercised on one disposable save: Animal Planner had meaningful matching pen counts; many others were empty or unavailable. Everything Constructable was available in the mod list but its checkbox was off and it had no `Load mod` line, so it was not active. B2 exposed the Vehicle Service percentage and unlabeled maintenance readings; B3 tested their correction. No active construction project or delivery or non-empty B2 event state has yet been verified.

Phase B3 evidence: Z:\Graham\agent-comms\ally-fh-companions-b3-evidence\RESULT-B3-text.md. Exact 5.2.14 installer and 5.1.0.15 mod hashes matched the frozen packet, one Windows install row appeared, generations 1–10 committed in run 1 and 1–5 in run 2, no reported Lua errors, and Tina restored Ally originals by hash. The installed Vehicles card showed Advanced Maintenance's 16-machine page reading, separate service-mod labels, a 100% normalized condition and partial-coverage notices. Farm Reputation hid when unchecked, while Better Contracts remained. Everything Constructable was checked and loaded but had zero active sites; a site/material gameplay path is still untested. Save Unit Profiles' Economy card showed GBP but not its `lastApplyOk=false` / partial verification state; the 5.2.15 correction passed in B4.

Phase B4 evidence: Z:\Graham\agent-comms\ally-fh-companions-b4-evidence\RESULT-B4-text.md. Exact 5.2.15 installer and 5.1.0.15 mod hashes matched, one Windows app row appeared, generations 1–15 committed, and Tina restored Ally originals by hash. The installed Economy card displayed both GBP and “Profile settings could not be fully verified,” closing the B3 display gap. The in-game Units menu showed EURO/US while the export reported GBP and `lastApplyOk=false`; which setting is authoritative remains unproved. Tina placed a £1,000 Stables Bales item; funds decreased but the EC export still had zero projects. The exact EC 1.0.0.3 `ECConfig.lua` excludes placeables priced at or below £5,000, so that item cannot validate a construction project. A base-game Easy Shed 01 (£10,000, `data/placeables/easySheds/easyShed01/easyShed01.xml`) or workshop (£45,000, `data/placeables/brandless/workshop/workshop.xml`) is a candidate for the next disposable test. B4's log had four base-game GUI errors while navigating menus; none was in a Farm Dashboard or EC stack. Those errors and the currency mismatch should be tracked separately from EC project acceptance.

Phase B5 evidence: Z:\Graham\agent-comms\ally-fh-companions-b5-evidence\RESULT-B5-text.md, fresh generation 11 export and `ui\03-EverythingConstructable.png`. Exact 5.2.15 installer and 5.1.0.15 mod were installed with one Windows row; Tina restored all Ally originals by hash. A base-game £10,000 Farm Barn placed on disposable owned land produced an EC project and a visible fenced site. The export reported farm 1, one site, seven pending materials, £8,100 remaining, project name Farm Barn, phase 1 of 1, and exact material quantities; the installed full-screen dashboard matched. In-game placement preview and cost supported project creation, but Tina did not open the mod's on-site checklist or deliver material, so these two paths remain partial. The EC setting row was not found in General Settings even though projects were operational; no settings were changed. The HUD showed £ and runtime/export reported GBP, while the Units menu showed US/EURO. Save Unit Profiles logged that no profile was mapped for savegame20; `lastApplyOk=false` and the dashboard's verification notice were appropriate. One base-game GUI error occurred during menu navigation, without a Farm Dashboard/EC stack. B5 is meaningful live project coverage, not proof of delivery updates or every companion combination.
