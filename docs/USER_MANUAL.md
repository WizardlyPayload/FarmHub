# FS25 Farm Dashboard — User manual (v3.9)

**Farm Dashboard** is the Windows desktop app that reads live farm data from **Farming Simulator 25** (via the in-game **FS25 Farm Dashboard** mod) and renders it in your browser at **[http://localhost:8766](http://localhost:8766)**. **App version 3.9.0**, **mod version 2.3.0.0**.

This manual walks every setting, every section, and every modal, and points to a labelled screenshot for each. The screenshot manifest with filenames, captions, and capture recipes is in [`SCREENSHOT_MANIFEST.md`](./SCREENSHOT_MANIFEST.md).

**Companion docs:** [`INSTALL.md`](./INSTALL.md) · [`USER_GUIDE.md`](./USER_GUIDE.md) (short reference) · [`SECURITY.md`](./SECURITY.md) · [`CHANGELOG.md`](./CHANGELOG.md) · [`SCREENSHOT_MANIFEST.md`](./SCREENSHOT_MANIFEST.md)

---

## Table of contents

1. [What you need](#1-what-you-need)
2. [Install order (Stages A–E)](#2-install-order-stages-ae)
3. [First-run Setup](#3-first-run-setup)
4. [Main screen map](#4-main-screen-map)
5. [Settings modal — every tab and control](#5-settings-modal--every-tab-and-control)
6. [Dashboard sections](#6-dashboard-sections)
7. [Modals](#7-modals)
8. [LAN access and tablets](#8-lan-access-and-tablets)
9. [In-game mod settings (`config.xml`)](#9-in-game-mod-settings-configxml)
10. [Troubleshooting](#10-troubleshooting)
11. [Screenshot index](#11-screenshot-index)

> Screenshot tags: **[auto]** = captured against the running web UI; **[manual]** = you supply (Windows installer, in-game screens, file-explorer / editor views, tablet photo).

---

## 1. What you need

| Item | Purpose |
| ---- | ------- |
| **Farming Simulator 25** | Game must run with the mod for live data to exist |
| **FS25 Farm Dashboard mod** | **`FS25_FarmDashboard.zip`** or folder **`FS25_FarmDashboard`** in your FS25 `mods` folder |
| **FS25 Farm Dashboard app (Windows)** | Installer `FS25 Farm Dashboard Setup 3.9.0.exe` |
| **Browser** | Edge, Chrome, Firefox — opens [http://localhost:8766](http://localhost:8766) |
| **(Optional) FTP credentials** | If FS25 runs on a dedicated / rented server you do not own locally |
| **(Optional) LAN network** | If you want the dashboard on a tablet or second screen |

---

## 2. Install order (Stages A–E)

Do these **in order**. Skipping a stage is the most common reason the dashboard shows "waiting for field data".

### Stage A — Install the mod

1. Copy **`FS25_FarmDashboard.zip`** into **`Documents\My Games\FarmingSimulator2025\mods\`** (recommended), **or** copy/extract so you have **`mods\FS25_FarmDashboard\`** with **`modDesc.xml`** at that folder root (same layout as the release zip from **`tools\Zip-FarmDashboardMod.ps1`**).
2. Start FS25 once so it sees the mod.

> Screenshot: `fd-install-010-mod-folder.png` — **`FS25_FarmDashboard`** visible under FS25 **`mods\`** (folder **or** `.zip`). **[manual]**

### Stage B — Enable per save

For **every** savegame where you want the dashboard:

1. Enable **FS25 Farm Dashboard** in the save's mod list.
2. Load the save and enter the world (the main menu alone does not start collectors).

> Screenshot: `fd-install-020-fs25-mod-enabled.png` — Mod ticked in the save's mod list. **[manual]**

### Stage C — Confirm the mod is writing data

After a minute, look in:

```
%USERPROFILE%\Documents\My Games\FarmingSimulator2025\modSettings\FS25_FarmDashboard\<savegame>\data.json
```

`data.json` should be present and have a recent **modified** timestamp.

> Screenshot: `fd-install-030-datajson-explorer.png` — `data.json` shown in File Explorer with a fresh timestamp. **[manual]**

### Stage D — Install the Windows app

1. Run **`FS25 Farm Dashboard Setup 3.9.0.exe`**.
2. Pick installer language on the welcome page; complete the installer.
3. Launch **Farm Dashboard** from the Start menu.

> Screenshot: `fd-install-040-installer-welcome.png` — NSIS welcome page (language pick). **[manual]**
> Screenshot: `fd-install-045-installer-finished.png` — Installer "Finished" page. **[manual]**

### Stage E — First launch

The app starts the Express server on `127.0.0.1:8766`, opens its window, and walks you through Setup if no servers are configured (see §3). After Setup completes you land on the **dashboard home** (§4).

> Screenshot: `fd-install-050-app-first-launch.png` — App window on first launch, before Setup. **[manual]**

---

## 3. First-run Setup

The Setup page (`setup.html`) is a **left/right split**:

- **Left** — server list, FTP polling, the **Launch** button.
- **Right** — Auto-detect saves, mod images scan, Add server form.

### 3.1 Language corner

Top-right of the Setup page. Picking a language switches the page (and persists `farmdash_locale` for the main app too).

> Screenshot: `fd-setup-010-language-corner.png` — Language dropdown highlighted. **[manual]**

### 3.2 Server list

Each row shows the server name, source type, and a **Remove** button. The list is empty on first run.

> Screenshot: `fd-setup-020-empty-server-list.png` — Empty list, ready for first add. **[manual]**

### 3.3 Auto-detect saves

Right-side button. Scans `Documents\My Games\FarmingSimulator2025\modSettings\FS25_FarmDashboard\` and proposes one **Local** server per save it finds. Accept to add them to the list.

> Screenshot: `fd-setup-030-auto-detect.png` — Auto-detect result with two saves found. **[manual]**

### 3.4 Add server (Local)

| Field | What to enter |
| ----- | ------------- |
| Display name | Friendly label, e.g. "PC main save" |
| Mode | **Local** |
| Local path | Full path to the folder containing `data.json`, e.g. `…\modSettings\FS25_FarmDashboard\savegame1` |
| (Optional) HTTP feed | Only when your host documents an extra XML/HTTP source |

> Screenshot: `fd-setup-040-add-local.png` — Add-server form filled in for Local. **[manual]**

### 3.5 Add server (FTP)

For a dedicated / rented FS25 server you do **not** play on locally.

| Field | Notes |
| ----- | ----- |
| Display name | e.g. "Rented dedi" |
| Mode | **FTP** |
| Host, port | Your provider's values |
| User, password | FTP credentials |
| Remote dir | The folder containing the savegame's `data.json` (often `modSettings/FS25_FarmDashboard/<savegame>/`) |
| Save slot | Slot number / folder name when needed |
| (Optional) HTTP feed | Only when your host documents one |

> Screenshot: `fd-setup-050-add-ftp.png` — Add-server form filled in for FTP (blur secrets). **[manual]**

### 3.6 FTP polling

Polling settings apply to **all FTP servers** at once.

| Control | Range | Default | Effect |
| ------- | ----- | ------- | ------ |
| Initial delay (seconds) | 0 – 600 | 0 | Wait before the first poll fires |
| Interval (minutes) | 1 – 25 | 5 | Time between polls per server |
| Schedule | **Sync** / **Staggered** | Sync | Sync = all servers fire on the boundary; Staggered = offset each server by `interval / number of servers` |

> Screenshot: `fd-setup-060-ftp-polling.png` — FTP polling block. **[manual]**

### 3.7 Mod images scan

Right-side button. Runs a background PowerShell helper to extract vehicle thumbnails from your installed mods. Has a progress overlay and can take a long time (capped at 90 minutes).

> Screenshot: `fd-setup-070-mod-images.png` — Mod images progress overlay. **[manual]**

### 3.8 Launch

Saves the config and reloads to the dashboard home.

> Screenshot: `fd-setup-080-launch-button.png` — Setup ready to launch with one server. **[manual]**

---

## 4. Main screen map

After Setup, the dashboard shell loads at [http://localhost:8766](http://localhost:8766). The top bar from left to right:

| Area | What it is |
| ---- | ---------- |
| **Server tabs** | One per configured server. Click to switch source. |
| **Farm dropdown** | Visible when the active server has more than one farm. |
| **Game time** | Live game day / hour from the mod. |
| **Data-source badge** | Combined "XML + Live + API" health pill. |
| **Weather pill** | Click to open the **Weather forecast** modal. |
| **Notification bell** | Count of recent notifications; click for history modal. |
| **Settings (gear)** | Opens the unified Settings modal (§5). Hidden in viewer mode. |
| **Home** | Returns to the landing page. |

> Screenshot: `fd-shell-010-navbar.png` — Full top bar with badges. **[auto]**
> Screenshot: `fd-shell-020-landing.png` — Landing page with all six section cards. **[auto]**
> Screenshot: `fd-shell-030-game-time-weather.png` — Close-up of the game time and weather pills. **[auto]**

The **landing page** shows up to six cards: Livestock, Vehicles, Fields, Economy, Pastures, Productions. Each card has a count badge using the localised pluralised string (`{{count}} animal/animals`, etc.).

> Screenshot: `fd-shell-040-landing-badges.png` — Cards with counts visible. **[auto]**

There is also an **Import mod images** action on the landing page when running locally with API access.

> Screenshot: `fd-shell-050-import-mod-images.png` — Import button on landing. **[auto]**

---

## 5. Settings modal — every tab and control

Open with the gear icon. The modal has a left-hand sidebar with four tabs, plus footer buttons:

- **Save** — saves the current tab's controls.
- **Save theme** — only on Appearance; saves theme colours.

> Screenshot: `fd-settings-000-modal-overview.png` — Settings modal open on the first tab. **[auto]**

### 5.1 Tab — Dashboard

| Control | What it does | Persisted as |
| ------- | ------------ | ------------ |
| **Section toggles (6)** | Show / hide Livestock, Vehicles, Fields, Economy, Pastures, Productions cards on the landing page | `uiPreferences.sections` |
| **Desktop version** | Read-only build version (e.g. `3.9.0`) | — |
| **Check for updates** | Triggers `electron-updater` against GitHub Releases | — |
| **Update status** | Live status line during checks | — |
| **Field exclusions** | Per-server, per-farmland checkboxes; un-tick to hide that parcel from the Fields page | `uiPreferences.excludedFarmlandIdsByServer` |
| **Field clusters** | Group several parcels into one **field card** — Auto (heuristic) or Manual (paste comma-separated ids) | `uiPreferences.fieldClusterPrefsByServer` |
| **SimHub view** | Cluster ids, pasture ids, production keys, plus a help text — feeds the optional `simhub.html` overlay page | `uiPreferences.simHubView` |

> Screenshot: `fd-settings-010-dashboard-toggles.png` — Section toggles + version. **[auto]**
> Screenshot: `fd-settings-015-dashboard-exclusions.png` — Field exclusions list. **[auto]**
> Screenshot: `fd-settings-016-dashboard-clusters.png` — Field clusters block. **[auto]**
> Screenshot: `fd-settings-017-dashboard-simhub.png` — SimHub view block. **[auto]**

### 5.2 Tab — Servers & saves

| Control | What it does | Persisted as |
| ------- | ------------ | ------------ |
| **Enable LAN access** | Switches the HTTP/WS bind from `127.0.0.1` to `0.0.0.0` so other devices can connect | `lanAccessEnabled` |
| **LAN user** / **LAN password** | HTTP Basic credentials applied to non-loopback requests. v3.9: weak/default passwords are rejected when LAN access is enabled. | `lanUsername`, `lanPassword` |
| **IP allowlist** | Comma-separated CIDRs / IPs that may connect; empty = any LAN IP | `lanAllowlist` |
| **Require auth even from loopback** | Optional, for shared desktops | `lanRequireAuthForLoopback` |
| **Open full setup** | Opens `setup.html` in a separate window for power users | — |
| **Auto-detect saves** | Same as Setup §3.3 | — |
| **Mod images scan** | Same as Setup §3.7 | — |
| **FTP polling** | Initial delay, interval (minutes), schedule (Sync / Staggered) | `config.ftpPolling` |
| **Server list** | Current servers; **Remove** per row | `config.servers` |
| **Add server form** | Same fields as Setup §3.4 / §3.5 | `config.servers` |

> Screenshot: `fd-settings-020-servers-list.png` — Servers tab top-half (LAN + servers list). **[auto]**
> Screenshot: `fd-settings-021-servers-lan.png` — LAN block close-up. **[auto]**
> Screenshot: `fd-settings-022-servers-ftp-polling.png` — FTP polling block. **[auto]**
> Screenshot: `fd-settings-023-servers-add-server.png` — Add-server form expanded. **[auto]**

### 5.3 Tab — FS25 mod

Settings written here become `config.xml` on disk (see §9 for the file path).

| Control | What it does | Persisted as |
| ------- | ------------ | ------------ |
| **Config path** | Read-only label showing the actual `config.xml` path | — |
| **Update interval (ms)** | Legacy key; only used if `collectionCycleMs` missing | XML attr `updateInterval` |
| **Collection cycle (ms)** | Master cycle. Clamped 5 000 – 1 800 000 by the mod | XML attr `collectionCycleMs` |
| **Module checkboxes (7)** | Animals, Vehicles, Fields, Weather, Finance, Economy, Production | XML attrs `farmDashboard.modules#…` |

> Screenshot: `fd-settings-030-mod-tab.png` — FS25 mod tab with all controls. **[auto]**

> **Note (audit gap #2):** the `debugBaleScan` flag in `config.xml` is **not** writable from this tab; if you need it, hand-edit `config.xml` (§9).

### 5.4 Tab — Appearance

| Control | What it does | Persisted as |
| ------- | ------------ | ------------ |
| **Language** | Picks the UI language; reloads the page on change | `localStorage` `farmdash_locale` + `electron-store` `locale` |
| **Tab selector** | Pick which themed area you are editing (Global / Dashboard / Sections / etc.) | — |
| **Background colour** | Page background | `localStorage` `dashboard_themes` |
| **Surface colour** | Cards, panels | same |
| **Text colour** | Primary text | same |
| **Accent colour** | Buttons, badges, highlights | same |
| **Copy to all** | Copy the current 4 colours to every tab | same |
| **Reset** | Reset the current tab to defaults | same |
| **Save theme** (footer) | Persists colour set | same |

> Screenshot: `fd-settings-040-appearance-language.png` — Language picker. **[auto]**
> Screenshot: `fd-settings-041-appearance-theme.png` — Theme editor with colour pickers. **[auto]**

The language picker triggers a full page reload so the freshly-loaded `translations.json` is applied everywhere (toasts, modals, splash, setup wizard).

---

## 6. Dashboard sections

Every section section header has a back-to-home button. Sections live under `web/assests/js/modules/`.

### 6.1 Landing (home)

Already covered in §4. The six cards are populated by `navigation.js` `updateLandingPageCounts()`. Card visibility follows the toggles in Settings → Dashboard.

> Screenshot: `fd-section-000-landing.png` — Full landing with all six cards. **[auto]**

### 6.2 Livestock

| Control | What it does |
| ------- | ------------ |
| **Total animals** card | Click for an unfiltered list |
| **Lactating** card | Filter to lactating animals |
| **Pregnant** card | Filter to pregnant animals |
| **Average health** card | Read-only summary |
| **Show / hide filters** | Toggle the filter panel |
| **Reset filters** | Clear all filter controls |
| **Age / weight** numeric ranges | Numeric inputs |
| **Health, metabolism, fertility, quality, productivity** | Dual-handle sliders for min/max |
| **Animal type** | Filter to one type at a time |
| **Apply filters** | Apply the panel values |
| **Active filters** | Summary chips when something is active |
| **Animals table** | Sortable / paginated DataTable |
| **Export** | Opens the export modal (§7.2) |
| **Row "View" button** | Opens **Animal details** modal (§7.6) |

> Screenshot: `fd-section-livestock-010-summary.png` — Summary cards row. **[auto]**
> Screenshot: `fd-section-livestock-020-filters.png` — Filter panel expanded. **[auto]**
> Screenshot: `fd-section-livestock-030-table.png` — Animals table. **[auto]**

> **Note (audit gap #1):** the **Statistics** and **Genetics** panes exist in the markup (`#statistics-tab`, `#genetics-tab`) but no tab buttons switch to them in the current build. They are not exposed yet.

### 6.3 Vehicles

| Control | What it does |
| ------- | ------------ |
| **Total vehicles** card | Click to clear filter and show all |
| **Low fuel** card | Click to filter `< 25%` fuel |
| **High damage** card | Click to filter `> 20%` damage |
| **Show / hide filters** | Toggle filter panel |
| **Vehicle type** select | All / Tractors / All motorized / Trailers / Implements / Cultivators / Pallets & others |
| **Fuel level** select | All / Empty (0%) / Low (<25%) / Medium (25–75%) / Full (>75%) |
| **Status** select | All / Engine running / Engine off / Damaged |
| **Apply filters** | Apply the panel values |
| **Vehicle grid** | Card per vehicle with image, name, fuel, damage, location |
| **Vehicle image click** | Opens **Vehicle image** modal (§7.8) |

> Screenshot: `fd-section-vehicles-010-summary.png` — Summary cards. **[auto]**
> Screenshot: `fd-section-vehicles-020-filters.png` — Filters panel. **[auto]**
> Screenshot: `fd-section-vehicles-030-grid.png` — Vehicle grid. **[auto]**

### 6.4 Fields

The most feature-rich section.

| Control | What it does |
| ------- | ------------ |
| **Total fields** card | Read-only count |
| **Total area** card | Sum across non-excluded fields |
| **Needs work** card | Fields where the rules engine wants action |
| **Harvest ready** card | Fields the rules engine flags ready |
| **Refresh field rules** | Re-runs `rules-engine.js` against the current data |
| **All / Harvest ready / Needs work / Growing / Empty** | Filter buttons |
| **Search field** | Filter by name or id |
| **Field card** | Per parcel; see badges below |
| **Status badges** on a card | Withered / Harvested / Mulched / Ready / Needs work / Growing / Empty |
| **PF Soil badge** | Shown when Precision Farming is mapping nitrogen and pH |
| **Growth bar** | Animated bar showing current stage |
| **Forage / bale / windrow volume badge** | Loose straw / grass / hay, bale count, or windrow litres when present |
| **N mini-bar** | Current vs target nitrogen |
| **pH mini-bar** | Current pH vs target |
| **Suggested next step** | One-line recommendation; **Rules** badge if the rules engine produced it |
| **Tools & shop** | "From your fleet" / "Not in your fleet" / shop hints |
| **Waiting state** | Rendered when no merge data has arrived yet |
| **API error strip** | Rendered when the fetch fails. Background polling auto-retries every 5 seconds (no explicit retry button) |

> Screenshot: `fd-section-fields-010-summary.png` — Summary row. **[auto]**
> Screenshot: `fd-section-fields-020-filter-bar.png` — Filter buttons + search. **[auto]**
> Screenshot: `fd-section-fields-030-card-rules.png` — One field card with the rules suggestion. **[auto]**
> Screenshot: `fd-section-fields-040-card-windrow.png` — Field card with windrow volume badge. **[auto]**
> Screenshot: `fd-section-fields-050-card-soil.png` — Field card with N + pH mini-bars. **[auto]**
> Screenshot: `fd-section-fields-060-tools-shop.png` — Tools & shop block. **[auto]**
> Screenshot: `fd-section-fields-070-waiting.png` — Waiting state. **[auto]**
> Screenshot: `fd-section-fields-080-api-error.png` — API error strip. **[auto]**

### 6.5 Economy

| Control | What it does |
| ------- | ------------ |
| **Current money** card | Live cash on hand |
| **Total purchases** card | Equipment value |
| **Outstanding loan** card | Current debt |
| **Net worth** card | Assets minus debt |
| **Equipment Purchases** tab | Shows the Purchases sub-page |
| **Market Prices** tab | Shows the Market sub-page (placeholder when no API) |
| **Filter — All equipment** | Show everything |
| **Filter — Vehicles** | Limit to vehicles |
| **Filter — Implements** | Limit to implements |
| **Sort — Price / Age / Name** | Sort buttons |
| **Market search** | Filter by crop or location |

> Screenshot: `fd-section-economy-010-summary.png` — Summary row. **[auto]**
> Screenshot: `fd-section-economy-020-purchases.png` — Purchases tab with filters and sort. **[auto]**
> Screenshot: `fd-section-economy-030-market.png` — Market tab (or placeholder). **[auto]**

### 6.6 Pastures

| Control | What it does |
| ------- | ------------ |
| **Total pastures** card | Count |
| **Active livestock** card | Sum of animals across pastures |
| **Birth warnings** card | Count of pending birth events |
| **Avg health** card | Pasture-weighted health |
| **View all livestock** button | Opens combined livestock modal across pastures |
| **Pasture cards** | Click to open per-pasture details modal (§7.7) |
| **Warning badges** | Click to open warning details modal (§7.5) |

> Screenshot: `fd-section-pastures-010-summary.png` — Summary row. **[auto]**
> Screenshot: `fd-section-pastures-020-cards.png` — Pasture cards grid. **[auto]**

### 6.7 Productions

| Control | What it does |
| ------- | ------------ |
| **Empty state** | Shown when no chains are reported |
| **Chain card** | Per chain — running / stopped, input storage, output storage, fill levels, recipe, slots |
| **Slot row** | One per production slot in the chain |

Productions has no user filters; it is read-only.

> Screenshot: `fd-section-productions-010-list.png` — Chains list. **[auto]**
> Screenshot: `fd-section-productions-020-empty.png` — Empty state. **[auto]**

---

## 7. Modals

### 7.1 Notification history

Bell → opens the modal. Lists up to 10 most recent notifications with a **Clear all** button.

> Screenshot: `fd-modal-010-notifications.png` — Notification history modal. **[auto]**

### 7.2 Export livestock

Livestock section → **Export**. Format options + download.

> Screenshot: `fd-modal-020-export-livestock.png` — Export modal. **[auto]**

### 7.3 Refresh data

Optional confirmation when forcing a refresh from the navbar.

> Screenshot: `fd-modal-030-refresh-data.png` — Refresh modal. **[auto]**

### 7.4 Data changes

Lists recent change deltas in three sub-tabs (added / removed / updated).

> Screenshot: `fd-modal-040-data-changes.png` — Data changes modal. **[auto]**

### 7.5 Warning details

Opened from a warning badge (e.g. on a pasture).

> Screenshot: `fd-modal-050-warning-details.png` — Warning modal. **[auto]**

### 7.6 Animal details

Opened from a row on the Livestock table.

> Screenshot: `fd-modal-060-animal-details.png` — Animal details modal. **[auto]**

### 7.7 Pasture livestock / details

Opened from pasture cards or **View all livestock**.

> Screenshot: `fd-modal-070-pasture-livestock.png` — Pasture livestock modal. **[auto]**

### 7.8 Vehicle image

Opened by clicking a vehicle image.

> Screenshot: `fd-modal-080-vehicle-image.png` — Vehicle image modal. **[auto]**

### 7.9 Weather forecast

Opened by clicking the navbar weather pill.

> Screenshot: `fd-modal-090-weather.png` — Weather forecast modal. **[auto]**

### 7.10 Mod export progress

Shown while the mod-image scan is running.

> Screenshot: `fd-modal-100-mod-export.png` — Mod export progress modal. **[auto]**

### 7.11 Farm selection

Shown when more than one farm is found and the dashboard wants you to pick one explicitly.

> Screenshot: `fd-modal-110-farm-selection.png` — Farm selection modal. **[auto]**

---

## 8. LAN access and tablets

The dashboard can serve a tablet on your LAN. Always set both **a username and a password** before enabling LAN.

1. Open Settings → **Servers & saves**.
2. Enable **LAN access** and fill **LAN user** + **LAN password**.
3. (Optional) **IP allowlist** — comma-separated IPs / CIDRs allowed to connect.
4. (Optional) tick **Require auth even from loopback** if other people use this PC.
5. Save. The HTTP server now binds `0.0.0.0:8766`.
6. On the tablet, open `http://<PC-LAN-IP>:8766`. The browser prompts for the credentials you set.
7. (Optional) append `?viewer=1` for read-only viewer mode on the tablet (hides the gear and any destructive buttons).

> Screenshot: `fd-lan-010-toggle-on.png` — LAN access toggle on with credentials. **[auto]**
> Screenshot: `fd-lan-020-tablet-prompt.png` — Tablet showing the Basic auth prompt. **[manual]**
> Screenshot: `fd-lan-030-tablet-dashboard.png` — Tablet showing the dashboard home. **[manual]**

See [`SECURITY.md`](./SECURITY.md) for the trust assumptions and what LAN exposure does and does not protect.

---

## 9. In-game mod settings (`config.xml`)

The mod uses one config file at:

```
%USERPROFILE%\Documents\My Games\FarmingSimulator2025\modSettings\FS25_FarmDashboard\config.xml
```

Settings → **FS25 mod** edits this file directly (see §5.3). The file looks like:

```xml
<farmDashboard>
  <settings updateInterval="60000" collectionCycleMs="60000" debugBaleScan="false" />
  <modules animals="true" vehicles="true" fields="true" weather="true"
           finance="true" economy="true" production="true" />
</farmDashboard>
```

| Attribute | Range | Effect |
| --------- | ----- | ------ |
| `updateInterval` | int (ms) | Legacy fallback; only used when `collectionCycleMs` is missing |
| `collectionCycleMs` | 5 000 – 1 800 000 | Master cycle; the mod splits this into one slot per enabled module |
| `debugBaleScan` | `true` / `false` | Throttled bale-scan logging into FS25's `log.txt`. **Hand-edit only** — see audit gap #2 |
| `modules.animals` … `modules.production` | bool | Per-collector enable; disabling one shortens the slot for the others |

> Screenshot: `fd-mod-010-config-xml-explorer.png` — `config.xml` in File Explorer. **[manual]**
> Screenshot: `fd-mod-020-config-xml-editor.png` — `config.xml` open in a text editor. **[manual]**

The mod has **no in-game console command** and **no Giants settings menu entry**; the file above is the only configuration surface.

---

## 10. Troubleshooting

| Symptom | What to check |
| ------- | ------------- |
| **Blank dashboard / "waiting for field data"** | Stage B — mod enabled and save **loaded into the world**, not just the main menu. Stage C — `data.json` exists and the **modified** time is moving. Settings → Servers & saves — path or FTP credentials match the file you confirmed. |
| **API error strip** ("retrying every 5 s") | Background polling re-arms automatically. If it persists, confirm the path is correct or the FTP credentials are valid. There is no manual retry button (audit gap #3). |
| **Wrong farm shown** | Top-bar farm dropdown picks the active farm. Settings → Dashboard exclusions might also be hiding fields you expected. |
| **FTP not ticking** | Settings → Servers & saves: interval must be 1 – 25 minutes. Sync vs Staggered does **not** disable polling. |
| **Notifications empty after upgrade** | History is capped at 10 and stored in browser `localStorage`; reinstalling the desktop app does not clear the bell, but clearing browser data will. |
| **Language picker did not change everything** | The page reloads on language change — wait for the reload. If a string still falls back to English, the key is missing for that language; see [`I18N.md`](./I18N.md). |
| **Build / install said `app.asar` is locked** | Run `npm run unlock-install` then re-install. The default `npm run dist` writes the build to `%LOCALAPPDATA%\fs25-farm-dashboard-electron-out\` to avoid IDE locks. |
| **Uninstall asked to wipe user data** | Yes deletes settings, caches, and the registry entry. No keeps your config so a reinstall picks up where you left off. Cancel aborts the uninstall. |
| **Tablet says 401 / 403** | LAN credentials wrong, or your tablet is outside the IP allowlist. Loopback always bypasses auth unless you ticked "Require auth even from loopback". |
| **`debugBaleScan` in Settings → FS25 mod has no effect** | Audit gap #2 — hand-edit `config.xml` (§9). |

---

## 11. Screenshot index

The full list of filenames, captions, and capture recipes (auto vs manual) lives in [`SCREENSHOT_MANIFEST.md`](./SCREENSHOT_MANIFEST.md). All images sit under [`docs/screenshots/`](./screenshots/).

**Document version:** aligned with app **3.9.0** and mod **2.3.0.0**. **Authors:** [`AUTHORS.md`](./AUTHORS.md).
