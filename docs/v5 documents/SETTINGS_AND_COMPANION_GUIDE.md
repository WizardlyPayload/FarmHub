# Settings and companion-mod pages (V5)

The pictures were taken from the installed 5.1.17 desktop app at 1920 x 1080. App 5.1.18 changed packaged dependencies, so these screens were not recaptured. The demo saves are examples; your farm's numbers, visible mods and available sections will differ. Private names, addresses, paths and typed values are hidden in the Settings pictures. Nothing in this guide requires changing a working save.

## Find the right data first

1. Open Farm Dashboard and choose the intended save or server in the top bar.
2. Check the source/connection badge. A displayed card can be the last received snapshot; it does not by itself prove that the game is currently exporting.
3. Open **Settings** in the top right, or choose a detected mod under **MODS** in the left menu.
4. If a mod page is missing, check that the mod is enabled and loaded in that save. A ZIP merely sitting in the mods folder does not make the page active.

## Settings

Open **Settings** in the top bar. The six tabs below share one window. **Save** commits applicable settings; simply opening, scrolling or selecting a tab does not save a change.

### Dashboard

Use **Main menu - show sections** to hide sections you do not need. **Default section on open** chooses where the dashboard starts. **Fill units** affects how quantities are displayed, not the game's stored amounts. The lower part contains field exclusions, merged field cards and the read-only SimHub view. Change these only for a known display preference; they are not companion-mod switches.

![Dashboard settings](doc-screenshots/current-5057/settings-dashboard.png)

### Servers & saves

This tab holds local sources, remote/LAN access, dedicated-server pairing and advanced FTP polling. For a local save, use discovery or the setup window instead of inventing a path. For a dedicated server, use the in-game pairing flow when available; do not mistake a saved server name for a verified live link. FTP is an advanced alternative, not required for a client-joined server. The Server Manager area is lower in the pane. Do not put real credentials into screenshots or support posts.

![Servers and saves, LAN settings with private values hidden](doc-screenshots/current-5057/settings-servers-lan.png)

![Servers and saves, dedicated-server settings with private values hidden](doc-screenshots/current-5057/settings-servers-dedicated.png)

![Servers and saves, server list with private values hidden](doc-screenshots/current-5057/settings-servers-list.png)

### FS25 mod

The **FS25 mod** tab changes the local mod's `config.xml` collection intervals and data modules. Leave the defaults alone unless diagnosing a specific issue. Disabling a collector can remove data from dashboard sections; it is not a way to hide a menu item. These settings affect future game exports, so a dashboard refresh alone may not show the result immediately.

![FS25 mod settings](doc-screenshots/current-5057/settings-fs25-mod.png)

### Appearance

Choose the language and colour theme. V5 uses its own dashboard interface. The theme selector offers Global Default and separate Vehicles, Fields, Economy and Pastures palettes. **Save Theme** is the theme action; the main **Save** applies other settings. The five pictures show each palette selector, not five different game saves.

![Global appearance](doc-screenshots/current-5057/settings-appearance-global.png)

![Vehicles appearance](doc-screenshots/current-5057/settings-appearance-vehicles.png)

![Fields appearance](doc-screenshots/current-5057/settings-appearance-fields.png)

![Economy appearance](doc-screenshots/current-5057/settings-appearance-economy.png)

![Pastures appearance](doc-screenshots/current-5057/settings-appearance-pastures.png)

### Health

Start here when data looks missing or old. Check connection health and recent status before treating a card as live. A snapshot can remain visible after the game closes; use the freshness/status indication rather than a non-empty page as proof of a current export. See [Troubleshooting](TROUBLESHOOTING.md) for the next steps.

![Health settings](doc-screenshots/current-5057/settings-health.png)

### About

This tab shows app and mod versions, RF compatibility information and update links. **Show all pinned companions** expands the compatibility list; it does not install or enable those mods. Compare versions here before reporting that a companion page is absent.

![About settings](doc-screenshots/current-5057/settings-about.png)

## How the companion pages work

The dashboard has **20 dedicated companion pages**. They appear under **MODS** when their mod is detected in the chosen save. Each page is read-only: it explains or displays information from that mod but does not replace its in-game controls. The top bar chooses the save; the left menu chooses the page. Scroll inside the page for its **About this mod** and, where provided, **What to look for in game** explanations. The example images below were captured from demo saves after the page finished loading. A `-lower.png` companion image, where present, shows the lower part of a long page.

### Finance and prices

**Enhanced Loan System:** Open the page to see open loans, outstanding debt, monthly payments, lending room and bank settings. Use it to understand the loans already in the save, not to apply for a loan. Example: demo save 10.

![Enhanced Loan System](doc-screenshots/current-5057/mod-enhancedLoanSystem.png)

**I Need A Loan:** Read the credit line used, available offers, where the mod is active and its settings. If no offer is shown, check the mod in-game rather than assuming the dashboard can create one. Example: demo save 18.

![I Need A Loan](doc-screenshots/current-5057/mod-iNeedALoan.png)

**Automatic Loan Repay:** Check the next repayment run and configured rules. This is a status view, not a manual repayment button. Example: demo save 18.

![Automatic Loan Repay](doc-screenshots/current-5057/mod-automaticLoanRepay.png)

**Realistic Diesel Price:** Compare the displayed regional presets and current region information. It is a read-only price explanation; game purchases still happen in FS25. Example: demo save 10.

![Realistic Diesel Price](doc-screenshots/current-5057/mod-realisticDieselPrice.png)

**Fluctuating Diesel Price:** Read the current price, its range when known and prices observed during this dashboard session. This mod does not provide a durable price history, so an empty or short history is not necessarily a fault. Example: demo save 3.

![Fluctuating Diesel Price](doc-screenshots/current-5057/mod-fluctuatingDieselPrice.png)

**Dynamic Market:** Compare market groups, seasonal price curves, station sell pressure and favourite products. A price trend is advice for planning, not a guaranteed sale price. Example: demo save 10.

![Dynamic Market](doc-screenshots/current-5057/mod-dynamicMarket.png)

**Better Contracts:** Read active contracts, higher-paying offers, offer types and NPC standing. Take and complete contracts in the game; the dashboard does not accept them for you. Example: demo save 10.

![Better Contracts](doc-screenshots/current-5057/mod-betterContracts.png)

### Animals

**Seasonal Milk Production:** Check the yearly output pattern, milking pens and mod settings to plan around seasonal changes. Example: demo save 10.

![Seasonal Milk Production](doc-screenshots/current-5057/mod-seasonalMilkProduction.png)

**Seasonal Wool Production:** Check the shearing schedule, sheep pens and mod settings. The schedule describes the mod's rules; it does not shear animals from the dashboard. Example: demo save 10.

![Seasonal Wool Production](doc-screenshots/current-5057/mod-seasonalWoolProduction.png)

**Realistic Animal Losses:** Review pen risk, loss rules and the old-age threshold. Treat this as a warning/overview, not a prediction that a particular animal will die. Example: demo save 18.

![Realistic Animal Losses](doc-screenshots/current-5057/mod-realisticAnimalLosses.png)

**Animal Food Overview:** Compare feed by animal type. Use the game to load or buy feed; this page does not move inventory. Example: demo save 18.

![Animal Food Overview](doc-screenshots/current-5057/mod-animalFoodOverview.png)

**Animal Food Calculator:** Review pens, settings and game values the mod adjusts. This is different from Animal Food Overview: it explains calculated needs and adjustments rather than only listing feed. Example: demo save 18.

![Animal Food Calculator](doc-screenshots/current-5057/mod-animalFoodCalculator.png)

### Production and storage

**Factory Profit Calculator:** Review estimated monthly profit by production line. Check actual prices, inputs and running status in-game before treating an estimate as guaranteed income. Example: demo save 18.

![Factory Profit Calculator](doc-screenshots/current-5057/mod-factoryProfitCalculator.png)

**Pallet Degradation:** See pallets by condition and by contents. This helps identify goods at risk but does not protect or move pallets. Example: demo save 10.

![Pallet Degradation](doc-screenshots/current-5057/mod-palletDegradation.png)

**RealSilo:** See the detected silo and its mod-specific information. Check the in-game silo for any physical fill or operation changes. Example: demo save 10.

![RealSilo](doc-screenshots/current-5057/mod-realSilo.png)

### Fields and crops

**Restricted Periods:** Read closed periods by fertiliser and the spreaders loaded in your fleet. Check the date and rules before scheduling application. Example: demo save 10.

![Restricted Periods](doc-screenshots/current-5057/mod-restrictedPeriods.png)

**Regional Crop Calendar:** Check planting and harvest windows, region profile and rain/drought balance. The map and active mods decide what really grows in your save. Example: demo save 10.

![Regional Crop Calendar](doc-screenshots/current-5057/mod-regionalCropCalendar.png)

**Moisture System:** Review harvest moisture, stored crops, weather-exposed bales, irrigation contractors and forecast. Scroll down: this is one of the longest pages. Example: demo save 18.

![Moisture System](doc-screenshots/current-5057/mod-moistureSystem.png)

**Field Leasing:** Review current leases, charges and lease settings. Buy, lease or end land arrangements in-game rather than expecting this page to perform the transaction. Example: demo save 18.

![Field Leasing](doc-screenshots/current-5057/mod-fieldLeasing.png)

**Smart Crop Control:** Read crop keep chances, controlled crop groups and NPC field summaries. Scroll down for the full groups and field list. These are mod rules and observations, not a promise of a crop on any one field. Example: demo save 18.

![Smart Crop Control](doc-screenshots/current-5057/mod-smartCropControl.png)

## Companions without a dedicated page

The broader companion catalogue contains more mods than the 20 pages above. Many contribute data inside **Fields**, **Vehicles**, **Pastures**, **Productions**, **Storage**, **Economy** or a specific RF/companion section rather than creating their own MODS page. Do not infer that a missing dedicated page means the integration failed. Use [Companion mods](COMPANION_MODS.md) to find each supported mod and its data location; use [Screenshots](SCREENSHOTS.md) for the shared-section pictures. If the chosen save has not loaded that mod, its data should not be invented or shown as live.

## What these pictures do not prove

Screenshots are examples of an installed candidate, not release acceptance or proof that every mod combination has been tested. In particular, a saved snapshot can be held after a game exits. Installer steps, a genuinely fresh dedicated-server pairing and an Ally first-run still require their own controlled capture and test conditions. Do not use a screenshot of a completed demo as evidence for those separate workflows.
