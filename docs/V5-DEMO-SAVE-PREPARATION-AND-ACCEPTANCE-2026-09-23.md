# Farm Dashboard V5: Graham's four-save preparation and acceptance playbook

**Use after:** Ash passes G7/B14 in [the complete engineering build brief](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/V5-COMPLETE-BUILD-BRIEF-2026-09-23.md). **Status:** preparation instructions, not tests already performed.

The application needs to work before you invest time arranging four showcases. Ash is responsible for the exporter, adapters, settings, build, installation, tests and safe demo publisher. Your part is then to create useful real game examples and compare them with the dashboard.

## 1. Before starting

1. Ash has passed B14 on one identifiable installed V5 candidate and its matching canonical FS25_FarmDashboard.zip. Do not spend time preparing showcase data on a known-broken exporter.
2. Ash provides a reversible backup of each original save, the relevant per-save exporter data/config and a map from original slot to working demo copy. Work on copies; never overwrite a personal save to get a cleaner screenshot.
3. Fully close the game when changing the mod ZIP or activation set. Leave third-party filenames and IDs unchanged; deploy Farm Dashboard once under its canonical name.
4. Verify the selected career name/map/provider on screen, not only the slot number. Slots 4/3/19/18 below are from the earlier audit and may have changed.
5. Use normal in-game actions or supported mod controls to create the demonstration states. Do not hand-edit export JSON, assign fabricated soil values or bypass a manager to change balances.
6. Keep private source screenshots/exports separate from the sanitized public demo. No server passwords, network paths or player identifiers belong in the public package.

## 2. The order to use

1. Riverbend Base (captured slot 4): Prove the dashboard is useful without PF, RF or any companion. Establish the reference for every optional integration.
2. Riverbend Precision Farming (captured slot 3): Show exactly what PF adds and prove unknown soil readings are not displayed as measured zero.
3. Montana RF and companions (captured slot 19): Demonstrate useful RF and companion information, not simply a large list of detected mods.
4. Montana PF and companions (captured slot 18): Show PF alongside useful independent companions, with real examples of the features that were previously empty.

These slots are the earlier audited locations. Use the actual prepared copy identified by Ash if its slot differs. Never overwrite a personal save merely to match these numbers.

## 3. Common check for every save

1. Record candidate build, mod version, game version, save/map, selected farm, active mod versions and current game date.
2. Open the dashboard for that same save/farm and wait for a completed export. The capture must show source identity and completed generation; file size need not increase.
3. Choose a specific field/vehicle/barn/production/loan and compare its in-game value to the dashboard after collection completes. Record the entity name/ID so later differences are traceable.
4. Take representative screenshots and retain the matching private export; do not compare data from different seasons, farms or delayed generations as if simultaneous.
5. Make one harmless display-only preference change and Save. The mod configuration must remain unchanged; an intentional collector opt-out must remain off.
6. Close the game and observe honest last-known/offline behavior. Restart or reload the save and confirm data resumes without duplicate mods or old-session contamination.
7. When a value is unknown, record why. A missing reader is an application issue; an empty bin or a loan never created is a demo-content issue. Neither should be fixed by inventing numbers.
8. Submit the completed feature checklist to Ash for sanitization and immutable snapshot publication. All four demos do not need four games running at once.

## 4. Riverbend Base

**Captured slot:** 4. **Intended public demo ID:** `base`. **Provider:** Base game, Farm Dashboard only.

**Why this save exists:** Prove the dashboard is useful without PF, RF or any companion. Establish the reference for every optional integration.

**What the earlier audit found:** Earlier manifest contained only Farm Dashboard, ten farm-1 vehicles, three Angus cows at zero health and no owned production point. This is a captured baseline, not a fresh check or a recommendation to keep animals unhealthy.

### Prepare the example

1. Load the preserved base demo copy and keep all optional companion packages inactive for this scenario. Mods may remain installed on disk so inactive-detection behavior is also exercised.
2. Choose owned fields that genuinely illustrate contrasting fertiliser and lime requirements. If those states already exist, preserve them; otherwise create only the necessary state through normal game actions.
3. Prepare one ordinary healthy vehicle and one controlled low-fuel or service-needed example. Avoid leaving every machine empty or damaged.
4. Supply the small animal group appropriately and allow the game to reflect healthy husbandry. A single clearly identified low-resource example can demonstrate an alert; do not use an entirely neglected farm as the product baseline.
5. Set up one simple production with real inputs and visible operation. Include some stored crop and, where convenient, bales so stock totals are meaningful.
6. Record a representative farm finance figure and verify native fields, animals, production, stock and fleet all render without Livestock Monitor or Production Watcher.

### Compare the game and dashboard

1. Vanilla fertiliser/lime text matches the same in-game field; no PF nitrogen/pH bars or RF-only values appear as active.
2. Low-fuel filtering selects the intended vehicle and leaves the healthy example out.
3. Animal counts/feed and production input/output agree with the game. Stored crops and bales are not duplicated.
4. Companion presence is empty/inactive despite unrelated ZIPs installed on disk. Display units follow the intended base preference.
5. A valid farm with no assets remains selected if intentionally chosen.

### Capture these views for the demo

- Fields and soil native view with two distinct real states.
- Fleet low-fuel/service example and a normal vehicle.
- Healthy livestock plus one meaningful production and stock view.
- An explicit recorded-demo/base-only identity and the completed capture timestamp.

**Do not do this:** Do not add PF or a companion merely to make a native page populate. If native data is missing, return that defect to Ash.

**Mark the save ready only when:** its advertised values exist, the correct farm/source is selected, the export is complete, the dashboard agrees with the same game state, and Ash can sanitize/publish the capture without leaking private data.

## 5. Riverbend Precision Farming

**Captured slot:** 3. **Intended public demo ID:** `precision-farming`. **Provider:** Farm Dashboard plus Precision Farming only.

**Why this save exists:** Show exactly what PF adds and prove unknown soil readings are not displayed as measured zero.

**What the earlier audit found:** Earlier manifest contained only Farm Dashboard and PF, nine farm-1 vehicles, three zero-health Angus cows and no owned production point. PF XML/files existed, but purchased scan coverage and correctly rendered measurements were not proven.

### Prepare the example

1. Load the preserved PF demo copy. Keep RF soil and unrelated companions off; maintain a comparable base layout where practical without overwriting the original careers.
2. Keep one genuinely unscanned field and one field with a valid purchased/available PF soil result. Use the game's supported sampling process; do not alter telemetry to simulate a scan.
3. Choose measured fields with useful nitrogen and pH differences. If a current measurement is unavailable but a target is known, keep that state as an intentional availability example.
4. Use normal fertilising/liming actions on a selected demonstration area where appropriate and capture the change after the provider and exporter update.
5. Include ordinary fleet, animals, production and storage activity so the demo is not just a soil screen; reuse the base checklist for those native areas.
6. Record the PF panel values and map/field identity at the same game time as the completed dashboard export.

### Compare the game and dashboard

1. Unscanned/unknown is visibly different from an actual measured zero. Missing pH is not shown as pH zero.
2. Current and target nitrogen remain separate and labelled with the provider's actual units.
3. Field card, detail, overview and relevant map display agree about the same field.
4. No RF soil module or unrelated companion is shown as active.
5. After a genuine in-game soil change, a fresh completed generation updates the correct field without retaining old provider data.

### Capture these views for the demo

- A scanned field with meaningful current/target readings.
- An unscanned or otherwise honestly unavailable field.
- A nitrogen/liming example compared to PF's own display.
- PF identity plus native feature views and completed capture metadata.

**Do not do this:** Do not buy another scan to hide a collector failure. First distinguish genuine unsampled ground from a read/merge/UI defect.

**Mark the save ready only when:** its advertised values exist, the correct farm/source is selected, the export is complete, the dashboard agrees with the same game state, and Ash can sanitize/publish the capture without leaking private data.

## 6. Montana RF and companions

**Captured slot:** 19. **Intended public demo ID:** `realistic-farming`. **Provider:** RF-led rich showcase; exact active capabilities must be recorded.

**Why this save exists:** Demonstrate useful RF and companion information, not simply a large list of detected mods.

**What the earlier audit found:** Earlier manifest contained 55 mods and 23 farm-1 vehicles. ELS had settings but no loans. RealSilo held nine entries with no configured/filled compartments. RCC selected vanilla with weather/yield off. Ritter had separate animal records that cannot be counted as the selected farm's livestock without correct ownership mapping.

### Prepare the example

1. Have Ash review effective price ownership before this session: the captured pack included RF Fuel Costs with Realistic Diesel Price and RF Market Dynamics with Dynamic Market. Resolve only proven conflicting enabled features; do not indiscriminately delete working mods.
2. Create one sensible, identifiable ELS loan through the mod's actual UI in the demo copy. Record outstanding balance, repayment/interest details and the selected farm. Keep a separate debt-free farm if practical for scope testing.
3. Configure at least two RealSilo compartments and fill them with representative crops using supported game actions. Record capacity, quantity and active compartment; capture transfer progress only if actually occurring.
4. Select a real intended RCC region rather than vanilla for the calendar showcase. Keep optional weather/yield toggles in the reviewed safe configuration and record them, instead of turning everything on for display.
5. Choose a clear restriction state for slurry/digestate/manure. Capture actual category-specific allowed/blocked status and its reason. Do not advance an unprotected save merely to force a ban.
6. Supply and operate the intended animal system. With Ritter, select the correct farm and use its own animal ownership/source mapping; never infer zero animals solely from missing vanilla clusters.
7. Prepare a producing livestock example and real production inputs/outputs. If seasonal milk/wool or pallet degradation are featured, capture their genuine current factors/conditions without double-applying them.
8. Prepare an RF soil example with known provider data and a deliberate fleet service/stock example. Each feature card needs a real value, reason and useful interpretation.

### Compare the game and dashboard

1. Selected-farm ELS totals and individual loans agree; a zero-loan farm never receives all-farm debt.
2. Compartment quantities reconcile with native storage once, not twice.
3. RCC region/calendar and spreading restrictions match the game; unknown state never becomes vanilla or allowed.
4. RF soil values come from the enabled RF provider and remain distinct from PF scales.
5. Ritter/vanilla animal ownership, effective seasonal output and production/storage totals agree without duplicated animals or rate multipliers.
6. The effective fuel/selling prices match the game's final values under the documented provider configuration.

### Capture these views for the demo

- RF field/soil example.
- A populated ELS loan and clearly scoped farm.
- Filled silo compartments and actual region/calendar/restriction information.
- Producing livestock/production and one fleet/condition example.
- Exact mod/version/configuration manifest and explicit limitations.

**Do not do this:** This rich save does not prove any adapter is independent. Ash must retain separate minimum-set and combination tests.

**Mark the save ready only when:** its advertised values exist, the correct farm/source is selected, the export is complete, the dashboard agrees with the same game state, and Ash can sanitize/publish the capture without leaking private data.

## 7. Montana PF and companions

**Captured slot:** 18. **Intended public demo ID:** `precision-companions`. **Provider:** PF-led rich showcase with the intended unit and companion configuration.

**Why this save exists:** Show PF alongside useful independent companions, with real examples of the features that were previously empty.

**What the earlier audit found:** Earlier manifest contained 33 mods and 23 farm-1 vehicles. Five farm-1 husbandries had no saved vanilla animal clusters. Vanilla debt was zero. Soil Work Yield Bonus had no worked-cell records. Owned production recipes were enabled without saved input stocks in their inspected blocks.

### Prepare the example

1. Load the preserved PF-companion demo copy and confirm the intended unit mod/profile and PF provider are active. Do not activate RF Soil merely to make a soil panel appear.
2. Prepare PF sampled/unsampled and nitrogen/pH cases as in the isolated PF save, then retain the richer pack for combination behavior.
3. Populate and supply the intended supported animal system; verify its actual ownership model. Do not assume empty vanilla clusters prove no animals under every custom animal system.
4. Create a controlled vanilla debt example for I Need A Loan/Automatic Loan Repay if those are the chosen active policies. Record the balance and repayment event; do not substitute ELS debt into the vanilla-credit demo.
5. Work a real field with a supported implement so Soil Work Yield Bonus has actual recorded coverage. Capture the resulting state only when the adapter reads the mod's own data.
6. Supply enabled production recipes with real inputs and allow meaningful output. Add a service-due vehicle through normal supported play and, where featured, a genuine scheduling/logistics state.
7. Check Imperial/British/profile behavior against the intended active configuration. Keep native quantities canonical and compare real displayed units rather than changing underlying stored values.
8. Do not omit Livestock Monitor or Production Watcher merely because the RF showcase uses them. Their availability depends on supported capabilities, not demo-pack exclusivity.

### Compare the game and dashboard

1. PF fields show correct measurements and no stale RF soil from the other save.
2. Vanilla debt/repayment is correctly scoped and distinguished from an ELS loan.
3. Worked-field coverage, recipe inputs/outputs and service state reflect actual game changes.
4. Livestock counts/needs and native totals remain correct with the chosen companion combination.
5. Units are consistent across storage, vehicle capacities and production; inactive unit settings from another save do not leak in.

### Capture these views for the demo

- PF soil plus the intended units.
- An actual debt/repayment example, not only a policy label.
- Worked-field bonus coverage and real production stock.
- Populated livestock and a service-needed machine.
- Completed snapshot identity, feature list and source versions.

**Do not do this:** Zero debt, empty barns and enabled-but-unsupplied factories are valid game states, but they cannot serve as evidence of populated live integration features.

**Mark the save ready only when:** its advertised values exist, the correct farm/source is selected, the export is complete, the dashboard agrees with the same game state, and Ash can sanitize/publish the capture without leaking private data.

## 8. What to do if something is wrong

1. Record the save, farm, entity, candidate build and export generation. A screenshot alone without source identity can hide a wrong-save or stale-data problem.
2. If the game itself has no loans, no stock or no configured compartment, prepare the missing content through normal game actions only if that feature is meant to be showcased.
3. If the game has the expected value but the export does not, send the case to Ash as a collector/provider issue; do not fabricate the data.
4. If the export has the correct value but the dashboard does not, send it as an ingestion/merge/scope/formatting/UI issue.
5. If old data appears after switching saves or turning a mod off, preserve the evidence and let Ash fix identity/retention; do not wipe all settings as the routine cure.
6. Continue preparing unaffected features on the protected copy if safe, but do not mark the affected feature or save as passed.
7. After Ash supplies a changed candidate, repeat the affected comparison and keep its new build identity separate from the old evidence.

## 9. What to give Ash for each finished save

- Candidate ID and exact mod ZIP version/hash.
- Original save and working-copy identifiers, map and selected farm.
- Feature checklist with PASS, FAIL, NOT TESTED or BLOCKED and an explanation.
- Game screenshot/reference, matching export generation and dashboard screenshot/reference.
- Expected value, observed value, units, source and whether live or last-known.
- Approved public display names and asset permissions; private source material stays private.
- Any defect sent back to Ash includes repeat steps and does not trigger a whole-profile reset.

### Simple acceptance note

```text
Demo / actual working-copy save slot:
Map / selected farm:
Installed candidate / mod version:
Feature and specific field/vehicle/barn/loan:
What the game shows:
What the dashboard shows:
Export generation and sample time:
Result: PASS | FAIL | NOT TESTED | BLOCKED
Screenshots/evidence:
Anything Ash must fix before publishing:
```

## 10. How the public demos should work

- Four clearly labelled recorded examples, each opening the real interactive dashboard with a different sanitized capture.
- Visitors can choose different examples without affecting one another or your live game/server selection.
- Each demo says when it was captured and which provider/mod features it demonstrates. Recorded data is not labelled live.
- An optional live farm is separate. You do not need all four saves running simultaneously.
- Only completed approved captures are published. Personal settings, private server details and third-party ZIPs are not bundled into the public demo.
- Preparing the saves does not itself authorize public release. Ash still completes G8/G9 and gives you the final evidence-based release recommendation.
