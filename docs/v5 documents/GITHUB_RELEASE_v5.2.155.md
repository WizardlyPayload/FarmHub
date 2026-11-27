# Farm Dashboard V5 5.2.155

**Windows app 5.2.155 · in-game mod 5.1.0.140 · Farming Simulator 25**

Farm Dashboard shows your save's fields, vehicles, animals, productions, storage and economy on a second screen. The base dashboard needs only its own game mod. Optional readings appear when their supporting mods are loaded for the selected save and export data tied to your farm.

## What's new

- **Field plans and jobs:** bounded, read-only crop plans, field tasks, contractor bookings and claims from selected optional mods. These are recorded plans or commitments, not proof that fieldwork finished or a final payment was made.
- **Vehicles and equipment:** selected owned-machine harvesting settings and capacity configurations. They do not prove performance or fuel use.
- **Finance and planning:** a pending Agricultural Financial System obligation and voucher, one Investment System deposit with stated rate and term, and named Crop Rotation Planner template steps. Pending amounts and rates do not prove settlement or earned interest; a template is not a field assignment.
- **Staff wording:** temporary Employees hours are labelled as elapsed contract time, including unassigned time. Personnel specialization keys have readable labels. The exact Efficient Use specialization did not appear in the latest natural applicant set, so that label remains a limited check.
- **Display corrections:** Seasonal Milk no longer shows a false zero farm rate when no pen baseline was captured, Factory Profit Calculator rounds its hypothetical whole-currency projections to the nearest unit, and fields with RF Soil retain their separate base-game weed-cover badge.
- **Local save identity:** when a save slot is reused for a different map, the app rejects the previous map's export and relabels the discovered save. It waits for a new export rather than showing the old map or mod list as current.

## Compatibility limits

Production Control and Distribution Redux have no bound adapter in the reviewed normal StockGuard build. A StockGuard-off reading does not establish normal-set coexistence. Production Supply Manager's latest test stopped before world load because a saved material provider was absent from the selected test set; no automatic purchase-history result is claimed here. Realistic Diesel Price changes the game's native price; the dashboard does not attribute that price to a particular mod or provide a dedicated Realistic Diesel Price page.

These are bounded readings, not evidence that every vault mod, mod combination, map, multiplayer path, or gameplay lifecycle works. See the [optional-mod guide](https://github.com/WizardlyPayload/FarmHub/blob/v5.2.155/docs/v5%20documents/COMPANION_MODS.md) and [compatibility guide](https://github.com/WizardlyPayload/FarmHub/blob/v5.2.155/docs/v5%20documents/COMPATIBILITY.md).

The final-pair normal-StockGuard smoke loaded the recorded 23-mod set and checked an owned field's separate native weed cover and RF Soil pressure against the installed card. A nonempty cow pasture and farm balance were also checked in bounded game/export/app observations. That smoke did not obtain a named machine reading in the game or nonempty production/storage in its disposable save; it does not extend earlier readings to every combination.

## Install or upgrade

1. Close Farming Simulator 25. Put exactly one file named `FS25_FarmDashboard.zip` in its `mods` folder; do not rename or unpack it. Enable it for the save. A dedicated server and joining clients need matching mod ZIPs.
2. Run `FS25-Farm-Dashboard-V5-Setup-5.2.155.exe` and launch **Farm Dashboard V5**.
3. Select your save or linked server. For a new local save, first save it in-game, then use **Settings > Servers & saves > Auto-Detect Local Saves**, followed by **Save**.
4. Wait for a completed export. A held snapshot is the last received farm picture, not proof the game is still exporting.

Read the [installation guide](https://github.com/WizardlyPayload/FarmHub/blob/v5.2.155/docs/v5%20documents/INSTALL.md) and [user manual](https://github.com/WizardlyPayload/FarmHub/blob/v5.2.155/docs/v5%20documents/USER_MANUAL.md).

## Release files

- `FS25-Farm-Dashboard-V5-Setup-5.2.155.exe` — Windows app, 384,515,661 bytes, SHA-256 `2782D9360AA03DE3DE25AE9E06FE93808A88FEFCFDF9E3969384745017FEF482`.
- `FS25-Farm-Dashboard-V5-Setup-5.2.155.exe.blockmap` — matching V5 updater blockmap, SHA-256 `811A47C0B4A98DC8BD2B5F162264E6D0AC157849007EF0FC242EECF6414721A0`.
- `FS25_FarmDashboard.zip` — game mod, 713,605 bytes, SHA-256 `2402E851019C699429D42635DAE814DD2FFA16E1D1CD6958A9AB84B567D2ECC8`.
- `latest-rf.yml` — matching V5 updater metadata, SHA-256 `501284E7885CB3461F20194005850D03FE8C09241A0DF470A3B26033172B0C73`. Classic V4 uses a separate `latest.yml` feed.

The installer is unsigned, so Windows may show an Unknown publisher or SmartScreen warning. Keep Windows security protections enabled. Please report issues with the app and mod versions, map/save type, freshness or coverage label, and a relevant screenshot or log excerpt; remove passwords and pairing tokens before posting.
