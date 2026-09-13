# Farm Dashboard V5 — Changelog

Player-facing history for the **V5 / new screens** line. Classic 4.x notes stay in [`../CHANGELOG.md`](../CHANGELOG.md).

**App 5.0.3** · **Mod 5.0.0.3** · Update feed **`latest-rf.yml` only**.

---

## 5.0.3 — current tree (2026-09-10)

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
- Appearance may still show classic “Use new dashboard UI” copy on a V5 process — you are already on the new screens. Use the **V4 app** if you want classic.
- V5 installer welcome / Finished PNGs in this folder are still **[manual]**.

Full classic history and audit remediation: [`../CHANGELOG.md`](../CHANGELOG.md).
