# Farm Dashboard V5 — Changelog

Player-facing history for the **V5 / new screens** line. Classic 4.x notes stay in [`../CHANGELOG.md`](../CHANGELOG.md).

**Prepared V5 candidate:** app **5.1.17**, mod **5.1.0.9**. Check the public download page for the version actually released. V5 uses **`latest-rf.yml` only**; the V4 feed remains separate.

---

## 5.1.17 / 5.1.0.9 — prepared candidate (2026-10-26, not a publication notice)

- Restored packaged V5 section photographs and splash logo by using the filenames' exact case. The installed PC app served the corrected images and visibly displayed them on Fields and companion pages.
- Native Windows Installed apps registration was repaired in the preceding 5.1.15 candidate; PC and Ally Keep/Full lifecycle tests passed there. Exact 5.1.17 Ally and uninstall acceptance is pending.
- The 5.1.0.9 game mod is byte-identical to the PC, Ally and dedicated-server tested canonical `FS25_FarmDashboard.zip`. Its heavy-save collector pacing and two-client multiplayer stream checks passed before this app-only image update.
- Current core and companion documentation images were captured at 1920 x 1080 from the installed 5.1.17 app with held demo saves. Older settings illustrations are retained and labelled; browser-only settings screenshots were rejected because they lack the Electron bridge.

---

## 5.0.57 / 5.0.0.31 — tested local candidate (2026-10-14, not a publication notice)

- Fresh PC and Ally installation paths, canonical mod ZIP distribution, local exports, and a two-client dedicated-server live phase were exercised. The server committed generations 12-16 with both clients present; both dashboards reached generation 16. The PC reached generation 17 and moved to held after exit.
- One Ally mirror timeout occurred on entry, but later generations arrived and no repeat was reported. An explicit Ally post-exit held receipt was **not** returned, so that narrow check remains unconfirmed.
- V5 documentation now separates live, limited, detection-only and direct/folded companion support. New screenshots use held demo snapshots from the installed candidate and must not be described as live tests of every optional mod.
- The website's public V5 5.0.3 and classic V4 4.2.1 download stories are intentionally unchanged. No installer, feed or website release was published by this documentation work.

---

## 5.0.5 — working tree (2026-09-13, not on GitHub yet)

Collector restore after a map-load crash, plus Dairy Core barn names. Next GitHub public release is **5.1.0** (PUBLIC +1, DEV reset).

- `loadMap` init is pcall-guarded so a missing unpacked extras folder cannot take the whole mod down.
- Pack always writes a complete unpacked `mods/FS25_FarmDashboard` folder (Giants SP prefers the folder over the zip).
- Fields / economy / production collectors can be turned back on after a bad `config.xml` (collectionSafetyV7). ESC settings clone no longer writes Off on setState.
- Dairy Core cards use placeable `getName()` instead of a truncated uniqueId.

### Product
- App **5.0.5** · installer `FS25-Farm-Dashboard-V5-Setup-5.0.5.exe` (local drop)
- Mod **5.0.0.4**

---

## 5.0.4 — working tree (2026-09-13, not on GitHub yet)

DEV bump after GitHub **5.0.3**. Next GitHub public release is **5.1.0** (PUBLIC +1, DEV reset).

- V5 always opens the **new screens**. Classic `web/index.html` / root `setup.html` are not packed and are not a fallback.
- If the new UI files are missing, V5 shows a reinstall message instead of the old layout.

### Product
- App **5.0.4** · installer `FS25-Farm-Dashboard-V5-Setup-5.0.4.exe`
- Mod **5.0.0.3** (no Lua change in this stamp)

---

## 5.0.3 — GitHub Latest (2026-09-10)

Replaces the **v5.0.2** GitHub/itch files, which were the **8 September** tester drop, not this working tree. Same V5 screens line; bump exists so already-installed 5.0.2 apps can auto-update.

### Product
- App **5.0.3** · installer `FS25-Farm-Dashboard-V5-Setup-5.0.3.exe`
- Mod **5.0.0.3** (`FS25_FarmDashboard.zip`)

---

## 5.0.2 — tester drop (2026-09-08)

### Product
- Side-by-side installer **Farm Dashboard V5**. Distinct app id from classic 4.x. Start Menu **Farm Dashboard V5**.
- Installed HTTP port **8768** so V4 can keep **8766**.
- NEW APP is the default UI (sidebar, Save overview). Not an “RF edition”.

### Screens (eyes-on)
- **Fields → Order:** Field number (default), Crop, Size, Work needed, Soil urgency. Soil Fertilizer does not force urgency sort. Preference `farmdash_fields_sort_v1`.
- **Field cards:** GPS painted-blob merge only, plus optional manual groups. Adjacent same-crop parcels stay separate.
- **Settings Save** on Servers refreshes the top-bar **Saves** list without restarting.
- **Settings** modal uses an **opaque** panel (readable over the farm photo).
- **Storage** is its own sidebar section (silos, bales, pallets). Economy keeps money / market / purchases.
- **Pastures** owns animals (`#/livestock` redirects).
- **Fertilizer Depot** dashboard stock = **production hall bins**, not the walk-in shop book.
- Soft-detect sidebar: Red Tape, ADS, Invoices, Hire purchase, NPC Favor, World Events, Pro Staff, Fertilizer Depot.

### Mod
- Working-tree stamp **5.0.0.2** (suite collectors stay inert without those mods). Same zip works with V4.

### Docs
- This folder: full V5 manual, install, screenshots, testers, security (port 8768).

---

## 5.0.0 — first V5 cut (2026-07)

- Rebuild screens (NEW APP) as a **separate** Windows app.
- Optional Realistic Farming **read** panels when companions are present.
- Must never publish onto V4 `latest.yml`.

---

## Honest leftovers (do not hide)

- Some Settings LAN strings may still mention **:8766**. Installed V5 listens on **8768**.
- From **5.0.4**, V5 does not offer a classic-UI toggle. Use the **V4 app** if you want the old screens.
- V5 installer welcome / Finished PNGs in this folder are still **[manual]**.

Full classic history and audit remediation: [`../CHANGELOG.md`](../CHANGELOG.md).
