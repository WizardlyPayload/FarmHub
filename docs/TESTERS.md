# Farm Dashboard — tester guide (new rebuild)

Use this document to exercise **the new Farm Dashboard screens** end to end. Tick every row that applies to your setup. File bugs with the **report template** at the bottom.

This is **Farm Dashboard**, the out-of-game Windows companion. It is **not** Realistic Farming and **not** Farm Tablet. Realistic Farming suite mods are optional: if they are in the save, extra panels appear; if they are not, those panels stay hidden.

---

## 0. What you are testing (read this first)

| | Farm Dashboard V4 (keep if you want) | Farm Dashboard V5 (this tester drop) |
| --- | --- | --- |
| What it is | The Farm Dashboard you already know (classic screens) | The **same product**, rebuilt screens |
| How you get it | Existing installer / GitHub V4 release | **Separate installer** you install on purpose |
| Auto-update | V4 feed (`latest.yml`) | **Not** pushed onto V4 auto-update |
| In-game mod | **`FS25_FarmDashboard.zip`** | **Same zip** — one mod for both apps |
| Realistic Farming | Optional; V4 is not built around the suite | Optional extra panels when those mods are present |

**Keep V4 if you prefer it.** Installing V5 must **not** be treated as “replace everyone’s V4 install via Check for updates.” Testers install the V5 EXE themselves. People who never install it stay on the old screens.

The Farming Simulator **mod works with both apps**. Point both at the same `data.json` if you want to compare.

This drop’s Start Menu shortcut and installer are labelled **Farm Dashboard V5** / version **5.0.4** (in-game mod **5.0.0.3**). GitHub Latest is still **5.0.3** until the next public publish. That is the side-by-side rebuild, not a Realistic Farming product. (Older local 5.0.x builds may still say “RF” on disk; treat those as V5 too.)

---

## 1. Before you start

### 1.1 You need

- Farming Simulator 25
- **`FS25_FarmDashboard.zip`** in `Documents\My Games\FarmingSimulator2025\mods\` (same zip for classic app and this rebuild)
- Mod **enabled on the save**, save **loaded into the world** (main menu is not enough)
- This rebuild’s Windows installer (tester drop) — Start Menu **Farm Dashboard V5**
- Optional: Farm Dashboard **V4** still installed, to prove coexistence and “same mod, both apps”

Confirm the mod is writing:

```
%USERPROFILE%\Documents\My Games\FarmingSimulator2025\modSettings\FS25_FarmDashboard\<save slot>\data.json
```

**Modified** time should move while you play (about once a minute).

### 1.2 Suggested test farms

Run as many of these as you can. **Do not mix maps in one pass** when checking crop names/icons.

| Save | Why it matters |
| --- | --- |
| Vanilla / Giants map, no extra fruit | Baseline names and icons |
| **Witcombe** (or another map with its own extras) | Map-only extras (e.g. linseed). Montana must **not** rename those numbers |
| **Montana** (Multifruit / 4X) | Large extra list (e.g. American Soybean). Only this save should show Montana extras |
| Dedicated + **join as client** | Local `data.json` mirror, no FTP |
| Dedicated **FTP** only | Headless / nobody joined |
| Multi-farm MP | Farm switcher; other farms’ stuff stays out of your view |

### 1.3 How to install without replacing classic

1. Leave Farm Dashboard V4 installed if you already have it.
2. Install the V5 EXE. It is a **different Windows app id** (Start Menu shortcut says **Farm Dashboard V5**).
3. Do **not** use **Settings → Check for updates** on **V4** expecting this rebuild.
4. After install, you should be able to launch **V4** and **V5** as two apps. They can both read the same save.

If V4 vanished or was overwritten, that is a **fail** — report it.

---

## 2. Setup wizard

Launch the rebuild. If no servers are configured, Setup opens.

| # | Check | Pass? |
| --- | --- | --- |
| 2.1 | Language dropdown (top right) changes Setup text and sticks after relaunch | |
| 2.2 | **Auto-detect saves** finds slots under `modSettings\FS25_FarmDashboard\` | |
| 2.3 | Add **Local** server: name, path to the folder that contains `data.json` | |
| 2.4 | **Launch** opens the dashboard (not a blank window) | |
| 2.5 | Add a second Local save (if you have one); both appear in the list; Remove works | |
| 2.6 | **FTP** (if you have a host): host, port, user, password, remote dir; poll interval; first poll brings data | |
| 2.7 | FTP secrets are not shown in screenshots you share | |
| 2.8 | **Mod images scan** (optional, slow): starts, shows progress, can finish or be left to run; vehicle photos appear later on Vehicles | |
| 2.9 | Join-as-client dedicated: client opted in, local `data.json` updates, Setup Local path points at **this PC’s** folder (not the server disk) | |

**Fail if:** Setup cannot find a save that has a fresh `data.json`; Launch does nothing; FTP never refreshes.

---

## 3. Shell (every screen)

After Launch, work through the chrome before deep-diving sections.

| # | Check | Pass? |
| --- | --- | --- |
| 3.1 | Sidebar lists core sections: Overview, Fields, Vehicles, Pastures, Productions, Storage, Economy, Fleet map | |
| 3.2 | Top bar: game time, weather control, notifications, Settings | |
| 3.3 | Data looks **live** (time/weather/money move as the game does; not stuck on one frozen snapshot for many minutes) | |
| 3.4 | Freshness / “waiting for data” copy is honest if the game is closed or `data.json` is stale | |
| 3.5 | **Farm dropdown** appears only when there is more than one farm; switching farm changes money, fields, vehicles, storage | |
| 3.6 | Other farms’ land, fleet, and silos **do not** show as yours | |
| 3.7 | Server tabs (if several sources configured) switch data without crashing | |
| 3.8 | Weather control opens a forecast / weather modal; close returns to the dashboard | |
| 3.9 | Notification bell opens history (or empty state); no raw keys like `pastures.card.foodLastsDaysEst` | |
| 3.10 | Language in Settings changes labels; restart if the UI tells you to | |
| 3.11 | Resize / maximise: layout usable, no overlapping unreadable panels | |

**Fail if:** farm switch does nothing; you see another player’s entire farm as your own; UI shows translation keys instead of words.

---

## 4. Overview

| # | Check | Pass? |
| --- | --- | --- |
| 4.1 | Farm name, money, game time match the save | |
| 4.2 | Mini boards / counts for fields, fleet, animals, production, storage are in the right ballpark (not all zero when the farm is busy) | |
| 4.3 | Click-through from overview chips/cards lands on the matching section | |
| 4.4 | No Realistic Farming suite chips when **no** RF mods are in the save | |
| 4.5 | With RF mods: suite chips appear; they do **not** claim the dashboard *is* Farm Tablet | |

---

## 5. Fields

| # | Check | Pass? |
| --- | --- | --- |
| 5.1 | Owned fields list; sizes and crop names look like the PDA | |
| 5.2 | Filters: All / harvest ready / needs work / growing / empty — each changes the list | |
| 5.3 | Search by field number or crop | |
| 5.4 | Open a field card: growth/stage, fruit, work needed, not a blank card | |
| 5.5 | Unowned-land toggle (if present) does not dump the whole map into “my farm” by default | |
| 5.6 | Field exclusions in Settings hide the parcels you un-tick | |
| 5.7 | Field clusters (auto/manual) group parcels without losing field ids | |
| 5.8 | Crop **names** are words, not `147` or `$l10n_…` | |
| 5.9 | **Witcombe (or similar):** extras such as linseed match **this map**. You must **not** see Montana-only names (e.g. American Soybean / Dry Corn) on the same fill-type **number** | |
| 5.10 | **Montana:** extras and names match Montana; index 190 is **not** Witcombe’s linseed | |
| 5.11 | Soil / crop-stress blocks appear **only** if those RF mods are on the save; if Precision Farming is on, soil stand-down copy is understandable, not a crash | |

---

## 6. Vehicles

| # | Check | Pass? |
| --- | --- | --- |
| 6.1 | Fleet list/grid matches what you own (approx. count) | |
| 6.2 | Fuel, damage, running/stopped look plausible | |
| 6.3 | Filters (type, fuel, status) narrow the list | |
| 6.4 | Vehicle image: placeholder or extracted shop pic; click/zoom if offered | |
| 6.5 | Implements vs motorized not all labelled the same | |
| 6.6 | **Advanced Damage System** (if installed): workshop / repair / overdue chips; card breakdown; hide those chips if ADS is **not** installed | |
| 6.7 | **Vehicle Years** (if exported): year/decade on cards | |
| 6.8 | **Mileage** (if exported): odo/trip; no nonsense units | |
| 6.9 | Farm switch hides other farms’ vehicles | |

---

## 7. Pastures (animals)

| # | Check | Pass? |
| --- | --- | --- |
| 7.1 | Pens/husbandries for **your** farm; head counts match the game roughly | |
| 7.2 | Open a pen: food/water/cleanliness or equivalent; not empty if the pen is stocked | |
| 7.3 | Animal details (if offered): type, age, health — no crash | |
| 7.4 | Dairy / milk extras appear **only** with DairyCore (or equivalent) on the save | |
| 7.5 | Farm switch does not show another farm’s herd as yours | |

---

## 8. Productions

| # | Check | Pass? |
| --- | --- | --- |
| 8.1 | Production points you own (bakery, greenhouse, etc.) listed | |
| 8.2 | Input/output fill types have **names**, not only numbers | |
| 8.3 | Active / idle / output stored looks in line with the placeable | |
| 8.4 | Other farms’ productions hidden | |
| 8.5 | Empty state if you own none — not a spinner forever | |

---

## 9. Storage

This is a high-value pass. Use **Witcombe** and **Montana** as two **separate** saves.

| # | Check | Pass? |
| --- | --- | --- |
| 9.1 | Silo / barn / production store rows for your farm | |
| 9.2 | Litres and value look sane vs the game | |
| 9.3 | **Names** are real crop/product titles (Wheat, Diesel, …), not `190` or empty | |
| 9.4 | **Icons** appear for those rows (not only a letter glyph) after the first minute on a map with HUD files. First load on a huge map zip can take a short wait | |
| 9.5 | **Witcombe:** names/icons from **Witcombe + vanilla only**. Montana extras must not appear just because Montana is also in `mods` | |
| 9.6 | **Montana:** Montana extras (e.g. American Soybean, Dry Corn) names **and** icons | |
| 9.7 | Expand a row: locations (which silo) add up to the total | |
| 9.8 | Great demand / price / best station if the economy export is present | |
| 9.9 | Bales / consumables panels if those exist on the farm | |
| 9.10 | **Fertilizer Depot** panel only if that RF mod is present | |
| 9.11 | Crop moisture columns only when moisture data exists; they must not invent irrigation the game does not export | |

---

## 10. Economy

| # | Check | Pass? |
| --- | --- | --- |
| 10.1 | Money matches the in-game farm | |
| 10.2 | Prices / market table: named fill types, not indexes | |
| 10.3 | Storage value / finance summary in the right order of magnitude | |
| 10.4 | RF tax / wages / fuel / income / workplaces **only** if those mods are on the save; otherwise no empty “broken” tax UI | |
| 10.5 | Honest limits: some RF money mods are **global**, copied per farm — do not fail the test because every farm shows the same tax totals if the mod itself is global | |

---

## 11. Fleet map

| # | Check | Pass? |
| --- | --- | --- |
| 11.1 | Map image loads (PDA overview), not a black square forever | |
| 11.2 | Vehicle pins sit on the farmland, not in the ocean / UI chrome | |
| 11.3 | Type filters (tractor, harvester, trailer, …) show/hide pins | |
| 11.4 | Click pin → that vehicle (or a sensible popup) | |
| 11.5 | Field outlines (if shown) follow field shapes; not a tiny blob in the corner | |
| 11.6 | Farm filter: only your fleet | |
| 11.7 | Switch map (vanilla vs Witcombe vs Montana): overview matches **that** map, not the previous save’s texture | |

---

## 12. Settings

Open the gear. Work every tab you have.

| # | Check | Pass? |
| --- | --- | --- |
| 12.1 | Section toggles hide/show sidebar items (core sections) | |
| 12.2 | Servers & saves: add / edit / remove; paths still valid | |
| 12.3 | Appearance / theme: colour change applies; Save theme works | |
| 12.4 | About: **desktop app** version and **in-game mod** version | |
| 12.5 | About copy: this is Farm Dashboard, **not** Realistic Farming / Farm Tablet | |
| 12.6 | About copy: this rebuild is **not** forced over the classic app via auto-update; one mod for both | |
| 12.7 | **Check for updates** on **this** rebuild must not install onto / replace the **classic** app | |
| 12.8 | RF compatibility table: missing suite mods = not detected; present mods = version + status. No crash with zero RF mods | |
| 12.9 | Field exclusions / clusters persist after restart | |
| 12.10 | LAN / security settings: see §15 | |

---

## 13. Mod-gated tabs (only if that mod is in the save)

If the mod is **off**, the tab must **not** sit in the sidebar as a dead “ghost.”

| Tab | When it should appear | What to check |
| --- | --- | --- |
| **Red Tape** | Red Tape / crop rotation companion | Rotation / tasks for **your** farm; hide when mod off |
| **Ads** | Advanced Damage System | Fleet condition / workshop; hide when ADS off |
| **Invoices** | Invoices companion | List / totals; farm scoped if the mod is |
| **Hire purchasing** | Hire purchase companion | Contracts / payments |
| **NPC Favor** | FS25_NPCFavor | Relationships; hide when mod off |
| **World Events** | Random World Events | Active event / cooldown; hide when mod off |
| **Pro Staff** | Pro Staff Co-Op | Staff / flags; hide when mod off |

Moisture is folded into **Fields** / Storage where exported — there is no separate moisture nav item in the new sidebar.

---

## 14. Connection modes (pick what you can run)

### 14.1 Single-player / listen host (Local)

| # | Check | Pass? |
| --- | --- | --- |
| 14.1.1 | Load save → data within ~1–2 minutes | |
| 14.1.2 | Pause / unpause: dashboard still updates on the export cycle | |
| 14.1.3 | Quit to menu: dashboard goes stale / waiting, does not keep inventing live fields | |

### 14.2 Dedicated — join as client (no FTP)

| # | Check | Pass? |
| --- | --- | --- |
| 14.2.1 | Mod on **server and client** | |
| 14.2.2 | Client opted in to mirror; local `data.json` timestamp moves | |
| 14.2.3 | Rebuild app on **Local** watch of that folder | |
| 14.2.4 | Empty server (you leave): mirror stops; dashboard does not pretend to be live forever | |

### 14.3 Dedicated — FTP

| # | Check | Pass? |
| --- | --- | --- |
| 14.3.1 | Poll interval respected | |
| 14.3.2 | After a field/vehicle change in-game, dashboard catches up on the next polls | |
| 14.3.3 | Wrong password / bad path: clear error, not a silent empty farm | |

### 14.4 Classic app + rebuild, same mod

| # | Check | Pass? |
| --- | --- | --- |
| 14.4.1 | Classic app still opens and shows the old screens | |
| 14.4.2 | Rebuild shows the new screens | |
| 14.4.3 | Both can read the **same** `data.json` | |
| 14.4.4 | Using one app does not corrupt the other’s settings so the other will not start | |

---

## 15. LAN / second device (optional)

| # | Check | Pass? |
| --- | --- | --- |
| 15.1 | LAN access off: phone on Wi‑Fi cannot open the dashboard | |
| 15.2 | LAN on + password (if you set one): tablet can view | |
| 15.3 | Viewer should not get full Settings / server-edit if that is locked down | |
| 15.4 | You did not paste FTP or LAN passwords into a public bug report | |

---

## 16. Stability / honesty

| # | Check | Pass? |
| --- | --- | --- |
| 16.1 | 20+ minutes in-game with dashboard open: no hitch pattern that clearly matches the export (game still playable) | |
| 16.2 | Restart Farm Dashboard: same server, data returns | |
| 16.3 | Restart the game, reload save: dashboard reconnects | |
| 16.4 | No “AI made this” / vendor credit in the UI | |
| 16.5 | English (or your language) — no leftover `some.key.name` labels | |

---

## 17. What “pass” does **not** require

Do **not** fail the rebuild for these:

- Classic users were **not** auto-updated (that is intended).
- Realistic Farming / Farm Tablet in-game UI — those are other mods.
- A map with no fill-type HUD in the zip still showing a **letter glyph** for a rare extra (vanilla crops should still icon).
- Global RF tax/wage numbers repeating on every farm when the companion mod itself is global.
- First Montana Storage load taking a short time while crop icons cache.

---

## 18. Bug report template (copy this)

```
Rebuild tester report
- App (rebuild version from About):
- Classic app still installed? (yes/no, version):
- Mod version (About or modDesc):
- Map / save:
- Mode: SP / MP host / dedi+client / FTP
- Farm count / farm you had selected:
- RF suite mods on this save (or “none”):
- Other relevant mods (ADS, Red Tape, PF, …):
- Section (Overview / Fields / Storage / …):
- What you did:
- What you expected:
- What happened:
- Screenshot (no passwords):
- data.json modified time vs what the UI showed:
```

Send that to Wizard with the screenshot. One issue per report if you can.

---

## 19. Suggested order for a first session (90 minutes)

1. Confirm `data.json` is updating (§1).
2. Install rebuild **beside** classic (§1.3, §14.4).
3. Setup Local + Launch (§2).
4. Shell + Overview + farm switch (§3–4).
5. Fields + Storage names/icons on **this** map (§5, §9).
6. Vehicles + map pins (§6, §11).
7. Pastures + productions + economy (§7–8, §10).
8. Settings About wording (§12.5–12.7).
9. If you have a second map (Witcombe **and** Montana), repeat Storage/Fields names only (§5.9–5.10, §9.5–9.6).
10. Optional: RF tabs, ADS, FTP, LAN.

If you only have time for one deep pass: **Setup, Overview, Fields, Storage (names + icons), Vehicles, Fleet map, Settings About, classic still launches.**
