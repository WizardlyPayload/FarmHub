# Farm Dashboard V5 — tester guide

Use this document to exercise **the new Farm Dashboard screens** end to end. Tick every row that applies. File bugs with the **report template** at the bottom.

**Manual:** [`USER_MANUAL.md`](./USER_MANUAL.md) · **Install:** [`INSTALL.md`](./INSTALL.md) · **Security:** [`SECURITY.md`](./SECURITY.md)

This is **Farm Dashboard**, the out-of-game Windows companion. It is **not** Realistic Farming and **not** Farm Tablet. Suite mods are optional: extra sidebar items appear only when those mods export.

---

## 0. What you are testing

| | Farm Dashboard V4 | Farm Dashboard V5 (this pack) |
| --- | --- | --- |
| Screens | Classic landing cards | Sidebar + Save overview |
| Installer | `FS25-Farm-Dashboard-Setup-4.x.exe` | `FS25-Farm-Dashboard-V5-Setup-5.0.3.exe` |
| Auto-update | `latest.yml` | `latest-rf.yml` only — **never** V4 |
| HTTP port | **8766** | **8768** (installed) |
| In-game mod | Same `FS25_FarmDashboard.zip` | Same zip |

**Keep V4 if you prefer it.** Installing V5 is not “replace everyone via Check for updates.”

This drop: Start Menu **Farm Dashboard V5** · app **5.0.3** · mod **5.0.0.3**. Older 5.0.x disks may still say “RF” — treat as V5. Do **not** call it RF edition in reports.

---

## 1. Before you start

### 1.1 You need

- Farming Simulator 25
- **`FS25_FarmDashboard.zip`** in `mods\`
- Mod **enabled**, save **in the world**
- V5 installer — Start Menu **Farm Dashboard V5**
- Optional: V4 still installed (coexistence)

Confirm:

```
%USERPROFILE%\Documents\My Games\FarmingSimulator2025\modSettings\FS25_FarmDashboard\<save slot>\data.json
```

**Modified** time should move while you play.

### 1.2 Suggested farms

Do **not** mix maps in one pass when checking crop names.

| Save | Why |
| --- | --- |
| Vanilla Giants map | Baseline names/icons |
| **Witcombe** | Map extras (e.g. linseed) — no Montana names on the same index |
| **Montana** | Montana extras only on this save |
| Dedicated + join as client | Local mirror, no FTP |
| Dedicated FTP | Headless |
| Multi-farm MP | Farm switcher |

### 1.3 Install without replacing classic

1. Leave V4 installed.
2. Install the V5 EXE (different app id).
3. Do **not** Check for updates on **V4** expecting V5.
4. Launch **V4** and **V5** as two apps; both may read the same `data.json`.

If V4 vanished — **fail**.

---

## 2. Setup wizard

| # | Check | Pass? |
| --- | --- | --- |
| 2.1 | Language changes Setup text and sticks | |
| 2.2 | Auto-detect finds `modSettings\FS25_FarmDashboard\` slots | |
| 2.3 | Add Local: folder that contains `data.json` | |
| 2.4 | Launch opens **Save overview** (sidebar), not a blank window or classic six cards | |
| 2.5 | Second Local save; Remove works | |
| 2.6 | FTP (if you have it): first poll brings data | |
| 2.7 | No FTP secrets in shared screenshots | |
| 2.8 | Mod images scan (optional) | |
| 2.9 | Join-as-client: local `mirror_*` (or documented folder) updates; path is **this PC** | |

---

## 3. Shell

| # | Check | Pass? |
| --- | --- | --- |
| 3.1 | Sidebar: Save overview, Fields, Vehicles, Pastures, Productions, Storage, Economy, Fleet map | |
| 3.2 | Top bar: Saves, game time, weather, bell, Settings, live/stale badge | |
| 3.3 | Data **live** (time/money move) | |
| 3.4 | Honest waiting/stale if the game is closed | |
| 3.5 | Farm control only when >1 farm; switch changes money/fields/fleet/storage | |
| 3.6 | Other farms’ stuff is not yours | |
| 3.7 | Save switch in **Saves** works **without restarting** the app | |
| 3.8 | Weather modal opens/closes | |
| 3.9 | Bell: history or empty; no raw i18n keys | |
| 3.10 | Language in Settings | |
| 3.11 | Resize/maximise usable | |
| 3.12 | Settings panel is **opaque** (readable over the photo) | |
| 3.13 | `#/livestock` lands on **Pastures** | |
| 3.14 | No Moisture item in the sidebar | |

---

## 4. Overview

| # | Check | Pass? |
| --- | --- | --- |
| 4.1 | Money / time match the save | |
| 4.2 | Counts in the right ballpark | |
| 4.3 | Click-through to the matching section | |
| 4.4 | No suite chips with **zero** RF mods | |
| 4.5 | With RF: chips appear; dashboard is **not** Farm Tablet | |

---

## 5. Fields

| # | Check | Pass? |
| --- | --- | --- |
| 5.1 | Owned fields; sizes/crops like the PDA | |
| 5.2 | Filters All / harvest / work / growing / empty | |
| 5.3 | Search | |
| 5.4 | Card has growth, fruit, work — not blank | |
| 5.5 | Unowned toggle does not dump the map by default | |
| 5.6 | Settings exclusions hide parcels | |
| 5.7 | Merge **only** GPS-painted same field (+ optional manual groups). Adjacent **same crop** stays **two cards** | |
| 5.8 | **Order** menu: Field number (default), Crop, Size, Work needed, Soil urgency. Soil Fertilizer must **not** force urgency | |
| 5.9 | Crop names are words, not `147` | |
| 5.10 | Witcombe extras stay Witcombe | |
| 5.11 | Montana extras stay Montana | |
| 5.12 | Soil / crop-stress only if those mods are on; PF stand-down copy is readable | |

---

## 6. Vehicles

| # | Check | Pass? |
| --- | --- | --- |
| 6.1 | Fleet count plausible | |
| 6.2 | Fuel / damage / running | |
| 6.3 | Filters | |
| 6.4 | Image placeholder or shop pic | |
| 6.5 | Implements vs motorized | |
| 6.6 | ADS chips **only** if ADS is installed; full workshop on **ADS** sidebar | |
| 6.7 | Years / mileage if exported | |
| 6.8 | Farm switch hides others | |

---

## 7. Pastures (animals)

| # | Check | Pass? |
| --- | --- | --- |
| 7.1 | Pens for **your** farm | |
| 7.2 | Food/water not empty if stocked | |
| 7.3 | Details / pen detail / livestock table — no crash | |
| 7.4 | Dairy Core **only** with DairyCore | |
| 7.5 | Farm switch | |

---

## 8. Productions

| # | Check | Pass? |
| --- | --- | --- |
| 8.1 | Your chains listed | |
| 8.2 | Named fill types | |
| 8.3 | Running / idle looks right | |
| 8.4 | Other farms hidden | |
| 8.5 | Empty state, not a forever spinner | |

---

## 9. Storage

High-value. Witcombe and Montana as **separate** saves.

| # | Check | Pass? |
| --- | --- | --- |
| 9.1 | Silo rows for your farm | |
| 9.2 | Litres / value sane | |
| 9.3 | Names, not `190` | |
| 9.4 | Icons after first minute (huge maps may wait) | |
| 9.5–9.6 | Map-scoped extras (Witcombe vs Montana) | |
| 9.7 | Expand locations add up | |
| 9.8 | Bales / pallets if present | |
| 9.9 | Fertilizer Depot **hall bins**, not 50k shop book; hide if mod off | |
| 9.10 | Moisture columns only when exported | |

---

## 10. Economy

| # | Check | Pass? |
| --- | --- | --- |
| 10.1 | Money matches | |
| 10.2 | Market names, not indexes | |
| 10.3 | Purchases tab cards | |
| 10.4 | RF tax/wages/fuel **only** if those mods exist | |
| 10.5 | Global RF money repeating per farm is **not** a fail if the companion is global | |

---

## 11. Fleet map

| # | Check | Pass? |
| --- | --- | --- |
| 11.1 | PDA image loads | |
| 11.2 | Pins on farmland | |
| 11.3 | Type filters | |
| 11.4 | Overlay dropdown | |
| 11.5 | Map switch uses **this** save’s overview | |

---

## 12. Settings

| # | Check | Pass? |
| --- | --- | --- |
| 12.1 | Section toggles hide sidebar items | |
| 12.2 | Add/remove servers; **Save** updates the Saves list **without restart** | |
| 12.3 | Theme / language | |
| 12.4 | About: app 5.x + mod 5.0.0.x | |
| 12.5–12.6 | Not Farm Tablet; V4 not replaced by this updater | |
| 12.7 | Check for updates on V5 does not replace V4 | |
| 12.8 | Zero RF mods: no crash, no ghost suite table errors | |
| 12.9 | Health tab: last export honest | |
| 12.10 | LAN: §15 | |

---

## 13. Mod-gated tabs

If the mod is **off**, the item must **not** ghost in the sidebar.

| Tab | When | Check |
| --- | --- | --- |
| Red Tape | Red Tape | Your farm; hide when off |
| ADS | ADS | Workshop; hide when off |
| Invoices | Invoices companion | List / totals |
| Hire purchase | Hire purchase | Deals |
| NPC Favor | NPCFavor | Relationships |
| World Events | Random World Events | Active event |
| Pro Staff | Pro Staff | Level / discounts |
| Fertilizer Depot | Fertilizer Depot | Hall stock |

---

## 14. Connection modes

### 14.1 Local SP / listen host

Data within ~1–2 minutes; pause still cycles; quit to menu goes stale.

### 14.2 Join as client

Mod on server **and** client; local file moves; empty server stops mirror.

### 14.3 FTP

Interval respected; bad password is a **clear** error.

### 14.4 V4 + V5

Classic still classic; V5 still new screens; same `data.json`; settings files do not brick the other app.

---

## 15. LAN

Off → phone cannot connect. On + password → tablet on **:8768**. No passwords in public reports. Setup from tablet blocked.

---

## 16. Stability / honesty

20+ minutes playable; restart reconnects; **no** AI vendor credit in the UI; no leftover `some.key.name`.

---

## 17. What “pass” does not require

- Classic users were not auto-updated.
- Farm Tablet / RF in-game UI.
- Letter glyph for a rare extra with no HUD in the map zip (vanilla crops should still icon).
- Global RF tax repeating on every farm.
- First Montana Storage icon cache wait.

---

## 18. Bug report template

```
Farm Dashboard V5 tester report
- App (About):
- Classic still installed? (yes/no, version):
- Mod version:
- Map / save:
- Mode: SP / MP host / dedi+client / FTP
- Farm selected:
- RF suite (or none):
- Other mods (ADS, Red Tape, PF, …):
- Section:
- What you did:
- What you expected:
- What happened:
- Screenshot (no passwords):
- data.json modified time vs UI:
```

---

## 19. First session (90 minutes)

1. `data.json` moving.  
2. V5 beside V4.  
3. Setup Local + Launch.  
4. Shell + Overview + save/farm switch (no restart).  
5. Fields (Order + GPS merge) + Storage names.  
6. Vehicles + fleet map.  
7. Pastures + productions + economy.  
8. Settings About + opaque panel.  
9. Second map names if you have Witcombe **and** Montana.  
10. Optional RF tabs, ADS, FTP, LAN.

Minimum deep pass: **Setup, Overview, Fields, Storage, Vehicles, Fleet map, Settings About, V4 still launches.**
