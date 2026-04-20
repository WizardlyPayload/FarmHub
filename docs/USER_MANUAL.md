# FS25 Farm Dashboard — User manual

**Farm Dashboard** is the Windows desktop app that reads live farm data from **Farming Simulator 25** (via the in-game **Farm Dashboard** mod) and shows it in your browser at **[http://localhost:8766](http://localhost:8766)**. **Version 3.0.0** focuses on **offline field suggestions** on cards from merged game data.

This manual covers **installation order**, **dashboard settings**, **local vs FTP** setups, **LAN tablets**, and **field rules + windrow badges**. Screenshot slots use `docs/screenshots/` filenames so you can ship a PDF or site.

**Related:** [INSTALL.md](./INSTALL.md) · [USER_GUIDE.md](./USER_GUIDE.md) · [SECURITY.md](./SECURITY.md) · [CHANGELOG.md](./CHANGELOG.md) · [SALES_HANDOVER.md](./SALES_HANDOVER.md)

---

## Table of contents

1. [What you need](#1-what-you-need)
2. [Installation — staged checklist](#2-installation--staged-checklist)
3. [First launch and Setup](#3-first-launch-and-setup)
4. [Setup paths — choose your combination](#4-setup-paths--choose-your-combination)
5. [Main screen map](#5-main-screen-map)
6. [Field rules and windrows](#6-field-rules-and-windrows)
7. [Settings — every option explained](#7-settings--every-option-explained)
8. [Dashboard sections](#8-dashboard-sections)
9. [Optional: LAN and tablets](#9-optional-lan-and-tablets)
10. [Troubleshooting](#10-troubleshooting)
11. [Screenshot assets](#11-screenshot-assets)

---

## 1. What you need

| Item | Purpose |
| ---- | ------- |
| **Farming Simulator 25** | Game must run with the mod enabled for data to exist. |
| **Farm Dashboard mod** | Shipped as **`FS25_FarmDashboard_Mod`** — copy into your FS25 `mods` folder. |
| **Farm Dashboard app (Windows)** | Installer `.exe` from project Releases (or your build). |
| **Browser** | Edge, Chrome, or Firefox — the app opens **[http://localhost:8766](http://localhost:8766)** by default. |

---

## 2. Installation — staged checklist

Follow **in order**. Do not rely on the dashboard until the mod has created **`data.json`** for each save you care about.

### Stage A — Install the mod (game files)

1. Copy the **`FS25_FarmDashboard`** mod folder into:  
   `Documents\My Games\FarmingSimulator2025\mods\`
2. Start **FS25**.

> **Screenshot — Stage A**  
> `fd-manual-010-mod-folder-in-mods.png` — Mod folder under FS25 `mods`.

### Stage B — Enable and load every save (required once per save)

For **each** savegame where you want the dashboard:

1. Enable **Farm Dashboard** in the save’s mod list.
2. **Load the save** and enter the world (not only the main menu).

> **Screenshot — Stage B**  
> `fd-manual-020-fs25-mod-enabled-for-save.png` — Mod enabled for the target save.

### Stage C — Confirm the mod is writing data (optional)

The mod writes **`data.json`** under your profile, for example:

`Documents\My Games\FarmingSimulator2025\modSettings\FS25_FarmDashboard\<savegame folder>\data.json`

> **Screenshot — Stage C**  
> `fd-manual-030-data-json-path.png` — Explorer showing `data.json` present and recently updated.

### Stage D — Install the Windows dashboard app

1. Run **`FS25 Farm Dashboard Setup 3.0.0.exe`** (version follows `package.json`).
2. Complete the installer.
3. Launch **Farm Dashboard** from the Start menu.

> **Screenshot — Stage D**  
> `fd-manual-040-windows-installer.png` — Installer welcome or completion.

### Stage E — First-time Setup in the app

On first run, **Setup** (Server Manager) asks for:

- **Local play:** path to your FS25 profile / mod output (defaults usually work on one PC).
- **FTP:** host, user, password, remote paths if the game runs on a **dedicated or rented server**.

Then open **[http://localhost:8766](http://localhost:8766)**.

> **Screenshot — Stage E**  
> `fd-manual-050-first-run-setup-server-manager.png` — First-run setup with servers and paths.

### Stage F — Live dashboard

You should see the **landing** view with section cards (Livestock, Vehicles, Fields, …) and live data after the game has updated **`data.json`**.

> **Screenshot — Stage F**  
> `fd-manual-060-landing-home-loaded.png` — Dashboard home with data loaded.

---

## 3. First launch and Setup

| If you… | Do this |
| ------- | ------- |
| Need to **add or edit servers / FTP** later | **Settings (gear) → Servers & saves**. |
| See **“waiting for data”** | Confirm Stage B; confirm paths or FTP point at the profile that contains **`data.json`**. |
| Use **multiple farms** in one save | Use the **farm selector** in the top bar when shown. |

> **Screenshot**  
> `fd-manual-070-settings-servers-and-saves.png` — Settings → Servers & saves.

---

## 4. Setup paths — choose your combination

| Your situation | Data source | LAN / second screen | Typical use |
| -------------- | ----------- | ------------------- | ----------- |
| **Solo on one PC** | Local path to `data.json` | Optional Wi‑Fi tablet | Everyday play beside the game |
| **Dedicated / rented server (FTP)** | FTP server + save slot | Often on the PC that runs Farm Dashboard | Admin monitors server farm |
| **Multiple FTP farms** | Several FTP entries; staggered or sync polling | LAN optional | Multi-save operators |
| **Tablet only** | Dashboard on **gaming PC**; tablet uses **LAN URL** | **LAN** enabled on host | Second screen |

**FTP polling:** In **Settings → Servers & saves**, set **first poll delay**, **interval** (minutes), and **sync** vs **staggered** polling. Match the interval to how often the host writes **`data.json`**.

> **Screenshot**  
> `fd-manual-065-ftp-polling-options.png` — FTP polling options when applicable.

---

## 5. Main screen map

| Area | What it is |
| ---- | ---------- |
| **Title / section** | Current section (e.g. Fields, Livestock). |
| **Farm selector** | Multiple farms or multiple FTP servers. |
| **Status badges** | XML, live Lua, and API health (wording may vary by build). |
| **Game time / weather** | When the payload includes them. |
| **Settings (gear)** | Servers, LAN, theme, notifications. |

The **landing page** shows **cards** for Livestock, Vehicles, Fields, Economy, Pastures, and Productions.

> **Screenshots**  
> `fd-manual-080-navbar-status-badges.png` · `fd-manual-090-landing-six-cards.png`

---

## 6. Field rules and windrows

- **Rules** — Each **field card** can show a short **suggested next step** from merged game data (harvest, baling, lime, soil scan gaps, fleet-aware tool hints, etc.). Everything runs **locally** in the browser bundle; no external model calls.
- **Windrows** — When the mod exports **`windrowLiters`** (and optional **`windrowType`**: straw / grass / hay), the card shows a **volume badge** so you can spot unfinished swath work at a glance.
- **Filters** — Use **Needs work** (and similar) when you want a short list of parcels that still need attention.

> **Screenshots**  
> `fd-manual-220-section-fields-overview.png` · `fd-manual-225-field-card-rules-suggestion.png` — Fields overview and one card with rules line + optional windrow badge.

---

## 7. Settings — every option explained

Open **Settings** from the **gear** icon. Labels may vary slightly by build.

### 7.1 Servers & saves

| Control | Purpose |
| ------- | ------- |
| **Add server** | One entry per **data source** (local profile or **FTP** host). |
| **Local path** | Folder containing **`data.json`** (often `modSettings\FS25_FarmDashboard\<savegame>\`). |
| **FTP** | Host, port, user, password, remote directory, save slot. |
| **Poll interval / first delay / sync vs staggered** | How and when remote files refresh. |
| **HTTP feed** (if shown) | Only when your host documents an extra XML/HTTP source. |
| **Mod shop images** | Optional pipeline for richer vehicle thumbnails. |

> **Screenshot**  
> `fd-manual-120-settings-overview.png`

### 7.2 Remote / LAN access

Optional exposure of **port 8766** on your LAN with **HTTP Basic** auth and optional **IP allowlist**. See **[SECURITY.md](./SECURITY.md)**.

> **Screenshot**  
> `fd-manual-130-settings-lan-access.png`

### 7.3 Theme & language

Dashboard appearance and locale.

> **Screenshot**  
> `fd-manual-135-theme-language.png`

### 7.4 Notifications

Review past alerts when your build exposes notification history.

---

## 8. Dashboard sections

### Home (landing)

Section cards; no global “smart strip” — priorities are **per field** on the Fields page.

### Livestock, Vehicles, Fields, Economy, Pastures, Productions

Standard summaries from merged **`data.json`** + XML. **Fields** is where **rules** and **windrow** badges appear.

### Notifications

Opens from the navbar or settings depending on build.

*(Section screenshots: same filenames as §6 and the checklist below.)*

---

## 9. Optional: LAN and tablets

1. **Settings** → LAN / remote access.
2. Enable **LAN**, set **username and password**, optional **IP allowlist**.
3. On the tablet, open **`http://<PC-LAN-IP>:8766`** and sign in when prompted.

See **[SECURITY.md](./SECURITY.md)**.

> **Screenshot**  
> `fd-manual-300-tablet-lan-dashboard.png`

---

## 10. Troubleshooting

| Symptom | Check |
| ------- | ----- |
| Blank or “waiting for data” | Stage B; **`data.json`** updating; Setup/FTP paths. |
| Wrong farm | **Farm selector**; correct **server** in Settings. |
| Windrow badge missing | Mod version and save loaded; field may have no detectable windrow volume. |
| Cannot delete / rebuild on dev PC | Default **`npm run dist`** output under `%LOCALAPPDATA%\fs25-farm-dashboard-electron-out` (see [CHANGELOG.md](./CHANGELOG.md) §3.0.0). |

---

## 11. Screenshot assets

Use **PNG**, **1920×1080** or similar, **no secrets**. Save under **`docs/screenshots/`**.

| # | Filename | What to capture |
| - | -------- | --------------- |
| 1 | `fd-manual-010-mod-folder-in-mods.png` | Mod in `mods`. |
| 2 | `fd-manual-020-fs25-mod-enabled-for-save.png` | Mod enabled for save. |
| 3 | `fd-manual-030-data-json-path.png` | `data.json` path. |
| 4 | `fd-manual-040-windows-installer.png` | Installer. |
| 5 | `fd-manual-050-first-run-setup-server-manager.png` | Server Manager. |
| 6 | `fd-manual-060-landing-home-loaded.png` | Home with data. |
| 7 | `fd-manual-070-settings-servers-and-saves.png` | Servers & saves. |
| 8 | `fd-manual-080-navbar-status-badges.png` | Top bar. |
| 9 | `fd-manual-090-landing-six-cards.png` | Landing cards. |
| 10 | `fd-manual-120-settings-overview.png` | Settings overview. |
| 11 | `fd-manual-130-settings-lan-access.png` | LAN + auth (blur secrets). |
| 12 | `fd-manual-065-ftp-polling-options.png` | FTP polling (if used). |
| 13 | `fd-manual-135-theme-language.png` | Theme & language. |
| 14 | `fd-manual-200-section-livestock.png` | Livestock. |
| 15 | `fd-manual-210-section-vehicles.png` | Vehicles. |
| 16 | `fd-manual-220-section-fields-overview.png` | Fields overview. |
| 17 | `fd-manual-225-field-card-rules-suggestion.png` | Field card: rules + windrow badge. |
| 18 | `fd-manual-230-section-economy.png` | Economy. |
| 19 | `fd-manual-240-section-pastures.png` | Pastures. |
| 20 | `fd-manual-250-section-productions.png` | Productions. |
| 21 | `fd-manual-260-notification-history-modal.png` | Notifications (if present). |
| 22 | `fd-manual-300-tablet-lan-dashboard.png` | Tablet on LAN. |

---

**Document version:** aligned with app **3.0.0** and mod **2.0.0.0**. **Authors:** [AUTHORS.md](./AUTHORS.md).
