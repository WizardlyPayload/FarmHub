# Farm Dashboard V5 5.3.0

**Windows app 5.3.0 · in-game mod 5.2.0.0 · Farming Simulator 25**

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

These are bounded readings, not evidence that every vault mod, mod combination, map, multiplayer path, or gameplay lifecycle works. See the [optional-mod guide](https://github.com/WizardlyPayload/FarmHub/blob/v5.3.0/docs/v5%20documents/COMPANION_MODS.md) and [compatibility guide](https://github.com/WizardlyPayload/FarmHub/blob/v5.3.0/docs/v5%20documents/COMPATIBILITY.md).

The preceding 5.2.155 / 5.1.0.140 normal-StockGuard smoke loaded the recorded 23-mod set and checked an owned field's separate native weed cover and RF Soil pressure against the installed card. A nonempty cow pasture and farm balance were also checked in bounded game/export/app observations. That smoke did not obtain a named machine reading in the game or nonempty production/storage in its disposable save; it does not extend earlier readings to every combination. The corrected 5.3.0 / 5.2.0.0 pair changes version stamps; the same gameplay was not repeated for these exact bytes.

## Install or upgrade

1. Close Farming Simulator 25. Put exactly one file named `FS25_FarmDashboard.zip` in its `mods` folder; do not rename or unpack it. Enable it for the save. A dedicated server and joining clients need matching mod ZIPs.
2. Run `FS25-Farm-Dashboard-V5-Setup-5.3.0.exe` and launch **Farm Dashboard V5**.
3. Select your save or linked server. For a new local save, first save it in-game, then use **Settings > Servers & saves > Auto-Detect Local Saves**, followed by **Save**.
4. Wait for a completed export. A held snapshot is the last received farm picture, not proof the game is still exporting.

Read the [installation guide](https://github.com/WizardlyPayload/FarmHub/blob/v5.3.0/docs/v5%20documents/INSTALL.md) and [user manual](https://github.com/WizardlyPayload/FarmHub/blob/v5.3.0/docs/v5%20documents/USER_MANUAL.md).

## Release files

- `FS25-Farm-Dashboard-V5-Setup-5.3.0.exe` — Windows app, 384,515,798 bytes, SHA-256 `2AD9B99588DC49407CF489394F96E6BA88B59AE8E8E8733ACAF64FDF9B6AED54`.
- `FS25-Farm-Dashboard-V5-Setup-5.3.0.exe.blockmap` — matching V5 updater blockmap, SHA-256 `23A88FE2CA5572892691387B381C8C6DEBB2F836E935CEA9EFCDBB4E6EA67D26`.
- `FS25_FarmDashboard.zip` — game mod, 713,532 bytes, SHA-256 `338E276C118E3A7A0B55108120CF43511ADCC89028AF3ABF9804B4DC896C2439`.
- `latest-rf.yml` — matching V5 updater metadata, SHA-256 `87BBA0255DC4D16DA482E1BEC14668E220FFD7B32B0AFE58271BFBB7F2003966`. Classic V4 uses a separate `latest.yml` feed.

This pair supersedes the public build briefly numbered app 5.2.155 / mod 5.1.0.140. The public middle numbers advance and the development revision numbers reset to zero; feature claims above are unchanged.
