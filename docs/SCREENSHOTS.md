# Screenshots (manifest + capture checklist)

PNG files for [USER_MANUAL.md](./USER_MANUAL.md) and [INSTALL.md](./INSTALL.md) live in [screenshots/](./screenshots/). After adding images, run python tools/embed-manual-screenshots.py from the repo root.

---

This is the canonical list of every screenshot referenced from [`USER_MANUAL.md`](./USER_MANUAL.md) and [`DEVELOPER_HANDOVER.md`](./DEVELOPER_HANDOVER.md). All images live under [`docs/screenshots/`](./screenshots/).

## Conventions

- **Filename:** `fd-<area>-<3-digit-order>-<kebab-slug>.png`. The 3-digit order keeps lexical order = doc order.
- **Format:** PNG.
  - **Desktop browser / app UI (`[auto]` and most `[manual]` shots):** **1920 × 1080** — landscape Full HD so the full dashboard fits without letterboxing.
  - **Tablet LAN only (`fd-lan-020-tablet-prompt.png`, `fd-lan-030-tablet-dashboard.png`):** **1080 × 1920** — portrait (typical tablet in hand). Do **not** use portrait size for desktop captures.
- **Privacy:** blur or redact server hostnames, IPs, FTP credentials, save names if sensitive.
- **Tag:**
  - **[auto]** — captured by Cursor against the running Farm Dashboard at `http://localhost:8766` via the browser MCP.
  - **[manual]** — you supply (Windows installer, in-game FS25 screens, file-explorer / editor views, tablet photos).

## Capture preconditions

For **[auto]** capture in one go:

1. Run FS25 with the mod for at least one save, so `data.json` is current.
2. Launch the desktop app (`npm start` or the installed shortcut) and complete first-run Setup with at least **one Local server**, ideally with two farms so the farm dropdown is visible.
3. Generate at least one notification (e.g. start the app while a field is in `Needs work`) so the bell modal has content.
4. Open `http://localhost:8766` in a browser viewport sized **1920 × 1080** (landscape). Stop other browser tabs that might steal focus.
5. Tell me you are ready; I will drive the captures via the `cursor-ide-browser` MCP.

For **[manual]** captures, follow the recipe in each row below and drop the PNG into [`docs/screenshots/`](./screenshots/) using the exact filename.

---

## Manifest

| # | Filename | Section in manual | Tag | Capture recipe |
| - | -------- | ----------------- | --- | -------------- |
| 1 | `fd-install-010-mod-folder.png` | §2 Stage A | manual | File Explorer at `Documents\My Games\FarmingSimulator2025\mods\` showing **`FS25_FarmDashboard`** (folder or `.zip`) |
| 2 | `fd-install-020-fs25-mod-enabled.png` | §2 Stage B | manual | FS25 in-game savegame's mod list with **FS25 Farm Dashboard** ticked |
| 3 | `fd-install-030-datajson-explorer.png` | §2 Stage C | manual | File Explorer at `…\modSettings\FS25_FarmDashboard\<savegame>\` showing `data.json` with a recent timestamp |
| 4 | `fd-install-040-installer-welcome.png` | §2 Stage D | manual | NSIS welcome page (language pick) |
| 5 | `fd-install-045-installer-finished.png` | §2 Stage D | manual | NSIS "Installation complete" page |
| 6 | `fd-install-050-app-first-launch.png` | §2 Stage E | manual | App window on first launch, before Setup runs |
| 7 | `fd-setup-010-language-corner.png` | §3.1 | manual | `setup.html` open with the top-right language dropdown highlighted |
| 8 | `fd-setup-020-empty-server-list.png` | §3.2 | manual | `setup.html` left side with empty server list |
| 9 | `fd-setup-030-auto-detect.png` | §3.3 | manual | `setup.html` after clicking **Auto-detect saves** with results |
| 10 | `fd-setup-040-add-local.png` | §3.4 | manual | `setup.html` Add server form, mode = Local, fields filled |
| 11 | `fd-setup-050-add-ftp.png` | §3.5 | manual | `setup.html` Add server form, mode = FTP (blur secrets) |
| 12 | `fd-setup-060-ftp-polling.png` | §3.6 | manual | `setup.html` FTP polling block (delay, interval, schedule) |
| 13 | `fd-setup-070-mod-images.png` | §3.7 | manual | `setup.html` mod-images progress overlay |
| 14 | `fd-setup-080-launch-button.png` | §3.8 | manual | `setup.html` ready to launch with one server |
| 15 | `fd-shell-010-navbar.png` | §4 | auto | Top bar visible (server tabs, farm dropdown, time, data-source, weather, bell, gear, home) |
| 16 | `fd-shell-020-landing.png` | §4 | auto | Landing page with all six section cards |
| 17 | `fd-shell-030-game-time-weather.png` | §4 | auto | Close-up (cropped) of the game time + weather pills |
| 18 | `fd-shell-040-landing-badges.png` | §4 | auto | Landing cards with their count badges |
| 19 | `fd-shell-050-import-mod-images.png` | §4 | auto | Landing page **Import mod images** button visible |
| 20 | `fd-settings-000-modal-overview.png` | §5 | auto | Settings modal open on the first tab |
| 21 | `fd-settings-010-dashboard-toggles.png` | §5.1 | auto | Settings → Dashboard, top half (toggles + version) |
| 22 | `fd-settings-015-dashboard-exclusions.png` | §5.1 | auto | Settings → Dashboard, field exclusions list |
| 23 | `fd-settings-016-dashboard-clusters.png` | §5.1 | auto | Settings → Dashboard, field clusters block |
| 24 | `fd-settings-017-dashboard-simhub.png` | §5.1 | auto | Settings → Dashboard, SimHub view block |
| 25 | `fd-settings-020-servers-list.png` | §5.2 | auto | Settings → Servers & saves, top half (LAN + servers list) |
| 26 | `fd-settings-021-servers-lan.png` | §5.2 | auto | Settings → Servers & saves, LAN block close-up |
| 27 | `fd-settings-022-servers-ftp-polling.png` | §5.2 | auto | Settings → Servers & saves, FTP polling block |
| 28 | `fd-settings-023-servers-add-server.png` | §5.2 | auto | Settings → Servers & saves, Add server form expanded |
| 29 | `fd-settings-030-mod-tab.png` | §5.3 | auto | Settings → FS25 mod tab with all controls |
| 30 | `fd-settings-040-appearance-language.png` | §5.4 | auto | Settings → Appearance, language picker open |
| 31 | `fd-settings-041-appearance-theme.png` | §5.4 | auto | Settings → Appearance, theme editor with colour pickers |
| 32 | `fd-section-000-landing.png` | §6.1 | auto | Landing page (re-shot if the navbar changed) |
| 33 | `fd-section-livestock-010-summary.png` | §6.2 | auto | Livestock section summary cards |
| 34 | `fd-section-livestock-020-filters.png` | §6.2 | auto | Livestock filter panel expanded |
| 35 | `fd-section-livestock-030-table.png` | §6.2 | auto | Livestock animals table |
| 36 | `fd-section-vehicles-010-summary.png` | §6.3 | auto | Vehicles summary cards |
| 37 | `fd-section-vehicles-020-filters.png` | §6.3 | auto | Vehicles filter panel expanded |
| 38 | `fd-section-vehicles-030-grid.png` | §6.3 | auto | Vehicles grid |
| 39 | `fd-section-fields-010-summary.png` | §6.4 | auto | Fields summary row |
| 40 | `fd-section-fields-020-filter-bar.png` | §6.4 | auto | Fields filter buttons + search |
| 41 | `fd-section-fields-030-card-rules.png` | §6.4 | auto | Field card showing rules suggestion |
| 42 | `fd-section-fields-040-card-windrow.png` | §6.4 | auto | Field card showing windrow volume badge |
| 43 | `fd-section-fields-050-card-soil.png` | §6.4 | auto | Field card with N + pH mini-bars |
| 44 | `fd-section-fields-060-tools-shop.png` | §6.4 | auto | Tools & shop block on a field card |
| 45 | `fd-section-economy-010-summary.png` | §6.5 | auto | Economy summary row |
| 46 | `fd-section-economy-020-purchases.png` | §6.5 | auto | Economy purchases tab with filters / sort |
| 47 | `fd-section-economy-030-market.png` | §6.5 | auto | Economy market tab (or placeholder) |
| 48 | `fd-section-pastures-010-summary.png` | §6.6 | auto | Pastures summary row |
| 49 | `fd-section-pastures-020-cards.png` | §6.6 | auto | Pastures grid |
| 50 | `fd-section-productions-010-list.png` | §6.7 | auto | Productions chains list |
| 51 | `fd-modal-010-notifications.png` | §7.1 | auto | Notification history modal |
| 52 | `fd-modal-020-export-livestock.png` | §7.2 | auto | Export livestock modal |
| 53 | `fd-modal-060-animal-details.png` | §7.6 | auto | Animal details modal |
| 54 | `fd-modal-070-pasture-livestock.png` | §7.7 | auto | Pasture livestock modal |
| 55 | `fd-modal-080-vehicle-image.png` | §7.8 | auto | Vehicle image modal |
| 56 | `fd-modal-090-weather.png` | §7.9 | auto | Weather forecast modal |
| 57 | `fd-modal-100-mod-export.png` | §7.10 | auto | Mod export progress modal |
| 58 | `fd-modal-110-farm-selection.png` | §7.11 | auto | Farm selection modal |
| 59 | `fd-lan-010-toggle-on.png` | §8 | auto | LAN access on with credentials filled |
| 60 | `fd-lan-020-tablet-prompt.png` | LAN guide (planned) | manual | Tablet Basic auth prompt — **separate LAN doc**, not USER_MANUAL |
| 61 | `fd-lan-030-tablet-dashboard.png` | LAN guide (planned) | manual | Tablet dashboard home — **separate LAN doc**, not USER_MANUAL |
| 62 | `fd-mod-010-config-xml-explorer.png` | §9 | manual | File Explorer showing `config.xml` |
| 63 | `fd-mod-020-config-xml-editor.png` | §9 | manual | `config.xml` open in a text editor |
| 64 | `fd-section-fleet-map-010-overview.png` | §6.8 | manual | Fleet map with pins on playable area (Witcombe) |
| 65 | `fd-section-economy-040-storage-tab.png` | §6.5 | manual | Economy → Storage — silo table + bale stock |
| 66 | `fd-section-economy-041-bale-storage-breakdown.png` | §6.5 | manual | Bale storage card breakdown by fill type |
| 67 | `fd-section-redtape-010-compliance.png` | §6.5 | manual | Red Tape compliance tab — policies & tier |
| 68 | `fd-section-redtape-020-events.png` | §6.5 | manual | Red Tape recent events log |
| 69 | `fd-section-vehicles-040-ads-summary.png` | §6.3 | manual | Vehicles summary with ADS workshop cards |
| 70 | `fd-section-vehicles-050-ads-breakdown.png` | §6.3 | manual | Vehicle card — ADS breakdown parts table |
| 71 | `fd-section-fields-045-moisture-weeds.png` | §6.4 | manual | Field card — moisture badge + weed alert + rules |
| 72 | `fd-section-fields-046-monitor-harvest.png` | §6.4 | manual | Field card — monitor toward harvest |
| 73 | `fd-reference-pda-map.png` | §6.8 | manual | In-game PDA map (reference only) |

**Not in the user manual** (edge / empty / failure UI — users should not see these if setup is correct): `fd-section-fields-070-waiting`, `fd-section-fields-080-api-error`, `fd-section-productions-020-empty`, `fd-modal-030-refresh-data`, `fd-modal-040-data-changes`, `fd-modal-050-warning-details`.

---

## Capture status (last run)

**Batch rename (2026-05-22 screen grabs):** 32 PNGs in [`docs/screenshots/`](./screenshots/) were renamed from `Screenshot …` timestamps to manifest-style `fd-*` names (see table below). Most captures use **Ballam Road Dairy Farming (savegame11)** with live data (1054 animals, 102 vehicles, 48 fields, 15 pastures, 1 production chain). `reference-home-network-topology.png` is unrelated to the dashboard UI.

| File | Shows |
| ---- | ----- |
| `fd-shell-020-landing.png` | Landing page — six section cards, counts, Import mod shop images |
| `fd-shell-050-import-mod-images.png` | Import mod shop images modal (early zip progress) |
| `fd-section-fields-010-summary.png` | Fields — summary row + Growing filter + field cards |
| `fd-section-fields-030-card-rules.png` | Fields — cards with suggested next step / fleet / buy-lease |
| `fd-section-fields-040-card-windrow.png` | Fields — windrows, bales on field, tedder/baler hints |
| `fd-section-fields-050-card-soil.png` | Fields — N / pH targets, lime, cultivate suggestions |
| `fd-section-fields-060-tools-shop.png` | Fields — Carpathian save; needs-scan + PF sensor suggestions |
| `fd-section-vehicles-010-summary.png` | Vehicles — summary cards (total / low fuel / damage) |
| `fd-section-vehicles-030-grid.png` | Vehicles — equipment grid |
| `fd-section-livestock-010-summary.png` | Livestock — summary cards + animals table header |
| `fd-section-livestock-020-filters.png` | Livestock — table pagination + Export Data |
| `fd-section-livestock-030-table.png` | Livestock — animals list rows |
| `fd-section-economy-010-summary.png` | Economy — financial summary + Consumables tab |
| `fd-section-economy-020-purchases.png` | Economy — All Equipment purchase cards |
| `fd-section-economy-021-consumables-inventory.png` | Economy — bale stock + lime big bags *(extra; add to manifest row if desired)* |
| `fd-section-economy-030-market.png` | Economy — market prices by crop |
| `fd-section-pastures-010-summary.png` | Pastures — summary row + first pasture cards |
| `fd-section-pastures-020-cards.png` | Pastures — additional shed cards + warnings |
| `fd-section-productions-010-list.png` | Productions — input/output storage + inactive slots |
| `fd-modal-100-mod-export.png` | Import mod images — skip-heavy conversion log |
| `fd-modal-101-mod-import-progress.png` | Import mod images — mid-batch progress *(extra)* |
| `fd-settings-010-dashboard-toggles.png` | Settings → Dashboard — sections, updates, hide parcels |
| `fd-settings-016-dashboard-clusters.png` | Settings → Dashboard — merged field cards |
| `fd-settings-017-dashboard-simhub.png` | Settings → Dashboard — SimHub block |
| `fd-settings-020-servers-list.png` | Settings → Servers — FTP polling + server list |
| `fd-settings-023-servers-add-server.png` | Settings → Servers — Add dedicated FTP server form |
| `fd-settings-030-mod-tab.png` | Settings → FS25 mod — config.xml intervals + modules |
| `fd-settings-041-appearance-theme.png` | Settings → Appearance — language + theme colours |
| `fd-lan-010-toggle-on.png` | Settings → Servers — LAN access enabled + credentials |
| `fd-setup-080-launch-button.png` | Setup / Server Manager — servers list + Launch Dashboard |
| `fd-setup-050-add-ftp.png` | Setup — Add dedicated server (FTP + HTTP feed) |
| `reference-home-network-topology.png` | Home network diagram (pfSense / switches / APs) |

**On disk (2026-05-28 audit):** **56** manifest `fd-*` PNGs + **13** extra `Screenshot …` files (installer steps, errors, spare field cards — not wired into the manual) + `reference-home-network-topology.png`.

**Embedded in [`USER_MANUAL.md`](./USER_MANUAL.md) / [`INSTALL.md`](./INSTALL.md):** **69** inline images (2026-06-12, v4.1 feature pass).

**Not in this manual:** edge/failure UI (waiting, API error, empty productions, refresh/data-changes/warning modals); **farm selection** modal (multi-farm edge case); **tablet LAN** shots (`fd-lan-020`, `fd-lan-030`) — planned for a separate **LAN & tablet** guide; see [`SECURITY.md`](./SECURITY.md) until then.

Workflow: drop PNGs with exact names → `python tools/map-all-screenshots.py` (if still named `Screenshot …`) → `python tools/embed-manual-screenshots.py`.

**Resolution:** confirm desktop shots are **1920 × 1080** before release; re-capture any that are not.

## How auto capture runs

When you tell me you are ready, I drive the `cursor-ide-browser` MCP through the following walk-through. Each step ends with a `browser_take_screenshot` saved as the manifest filename above:

1. **Navbar / landing** — `browser_navigate http://localhost:8766` → snapshot → screenshots `fd-shell-*` and `fd-section-000-landing.png` / `fd-shell-040-landing-badges.png`.
2. **Settings tabs** — click gear → screenshots for each pane (`fd-settings-*`).
3. **Sections** — for each section, click the matching landing card, screenshot the summary, expand filters, screenshot again, drill into a card / open a modal.
4. **Modals** — open each illustrated modal in turn, screenshot, close.
5. **LAN toggle** — Settings → Servers & saves → LAN → `fd-lan-010-toggle-on.png`. Do **not** save unless you really intend to enable LAN.

If the app is not running when capture starts, the MCP step fails fast and I leave placeholder rows untouched so you can fill them later.

---

## Adding a new screenshot to the docs

1. Append a row to the table above with a fresh `fd-<area>-<n>-<slug>.png` filename and a one-line capture recipe.
2. Reference the same filename from the relevant manual / handover section.
3. Drop the PNG into [`docs/screenshots/`](./screenshots/).
4. If the image is auto-capturable, also update the walk-through steps in §"How auto capture runs" above so a fresh run captures it next time.

---

## Still to capture

Use this checklist after you add new PNGs under [`docs/screenshots/`](./screenshots/). Drop files with the **exact filename** shown (1920×1080 desktop unless noted). Then ask a maintainer to run:

```bash
python tools/embed-manual-screenshots.py
```

That embeds any new images into [`USER_MANUAL.md`](./USER_MANUAL.md) and [`INSTALL.md`](./INSTALL.md).

**On disk:** see [Capture status](#capture-status) below. After adding PNGs, run `python tools/rename-new-screenshots.py` (if they are still named `Screenshot …`) then `python tools/embed-manual-screenshots.py`.

---

## Before you start

| Rule | Detail |
| ---- | ------ |
| **Resolution** | **1920 × 1080** for all desktop / in-game UI captures |
| **Tablet LAN only** | **1080 × 1920** portrait for `fd-lan-020` and `fd-lan-030` |
| **Format** | PNG |
| **Privacy** | Blur or crop FTP passwords, LAN passwords, server IPs, and personal save names if publishing publicly |
| **Game state** | For dashboard **[auto]** shots: FS25 running with mod on **authority** (SP or host), app on `http://localhost:8766`, at least one server configured, save loaded so `data.json` is fresh |
| **Naming** | Save as `fd-<area>-<nnn>-<slug>.png` — do not use Windows “Screenshot yyyy-mm-dd” names |

**Recommended test save:** one with animals, several fields, vehicles, at least one production chain, and (optional) Precision Farming so field cards show N/pH. Your Ballam Road save already produced most section shots.

---

## 1. Installation (manual — File Explorer, installer, first app window)

These support [`INSTALL.md`](./INSTALL.md) Stages A–E.

### `fd-install-010-mod-folder.png`
- **Where:** File Explorer.
- **Path:** `Documents\My Games\FarmingSimulator2025\mods\`
- **Show:** `FS25_FarmDashboard.zip` **or** folder `FS25_FarmDashboard` with `modDesc.xml` visible.
- **Tip:** Highlight the mod row; avoid unrelated mods if the window is crowded.

### `fd-install-020-fs25-mod-enabled.png`
- **Where:** FS25 — savegame mod selection (before or while loading save).
- **Show:** **Farm Dashboard** / **FS25 Farm Dashboard** **checked** for the save you use in docs.
- **Tip:** Full-screen game capture at 1920×1080; use the same save name across all install shots.

### `fd-install-030-datajson-explorer.png`
- **Where:** File Explorer.
- **Path:** `Documents\My Games\FarmingSimulator2025\modSettings\FS25_FarmDashboard\<savegame>\`
- **Show:** `data.json` with **Date modified** column visible (recent time).
- **Tip:** Play 1–2 minutes in that save first so the timestamp is clearly “today”.

### `fd-install-040-installer-welcome.png`
- **Where:** NSIS installer — first page.
- **Show:** Welcome + **language** dropdown/list.
- **Tip:** Run `FS25 Farm Dashboard Setup 4.0.0.exe` from Releases; capture before clicking Next.

### `fd-install-045-installer-finished.png`
- **Where:** NSIS installer — last page.
- **Show:** “Installation complete” / Finished with **Launch** or **Finish** visible.

### `fd-install-050-app-first-launch.png`
- **Where:** Farm Dashboard desktop window — **first** open after install (or after wiping `%APPDATA%\fs25-farm-dashboard\` for a clean test).
- **Show:** Setup / Server Manager **before** you add a server (or empty list), **not** the six-card landing yet.
- **Tip:** Uninstall → reinstall, or delete store JSON, for a true first-run look.

---

## 2. First-run Setup (manual — `setup.html`)

Partially done: `fd-setup-050-add-ftp.png`, `fd-setup-080-launch-button.png` exist.

### `fd-setup-010-language-corner.png`
- **Show:** Setup page with **language dropdown** top-right **open** or clearly highlighted.

### `fd-setup-020-empty-server-list.png`
- **Show:** Left panel **server list empty** (no rows), before Auto-detect or Add.

### `fd-setup-030-auto-detect.png`
- **Show:** Right side after **Auto-detect saves** — list of proposed local saves (e.g. two `savegame` folders).

### `fd-setup-040-add-local.png`
- **Show:** Add server form — **Local PC** selected, display name + path filled (can use your real `modSettings` path).

### `fd-setup-060-ftp-polling.png`
- **Show:** FTP polling block: delay, interval, **Each cycle: poll all** vs **Staggered** (either is fine; show numbers).

### `fd-setup-070-mod-images.png`
- **Show:** Progress overlay while **Scan FS25 mods for dashboard images** runs (log lines or progress bar).

---

## 3. Main shell (auto — browser at localhost:8766)

Partially done: `fd-shell-020-landing.png`, `fd-shell-050-import-mod-images.png`.

### `fd-shell-010-navbar.png`
- **Show:** Full **top bar**: server tabs, farm dropdown, **time**, **XML + Live + API** badge, **weather**, bell, gear, **Home**.
- **Tip:** Crop tight if needed, but all controls readable.

### `fd-shell-030-game-time-weather.png`
- **Show:** **Close-up** of only the **game time** pill and **weather** pill (snow/sun icon + °C).
- **Tip:** Can be a cropped 1920×1080 region exported as PNG.

### `fd-shell-040-landing-badges.png`
- **Show:** Landing page emphasizing **count badges** on each card (e.g. “1054 animals”, “48 fields”).
- **Note:** Similar to `fd-shell-020-landing.png` but framed so badges are the focus; OK to crop bottom row of cards.

---

## 4. Settings modal (auto)

Partially done: Dashboard toggles, clusters, SimHub, servers list, add FTP form, mod tab, appearance theme, LAN toggle.

### `fd-settings-000-modal-overview.png`
- **Steps:** Gear → Settings opens → **Dashboard** tab selected, modal fully visible over landing.
- **Show:** Sidebar (4 tabs) + top of Dashboard content + **Save** footer.

### `fd-settings-015-dashboard-exclusions.png`
- **Steps:** Settings → Dashboard → scroll to **Fields — hide parcels**.
- **Show:** Scrollable checklist of fields with hide toggles (multiple rows visible).

### `fd-settings-021-servers-lan.png`
- **Steps:** Settings → **Servers & saves** → scroll to **Remote / LAN access** only.
- **Show:** Enable LAN checkbox, username/password fields, allowlist, troubleshooting box (blur password).
- **Note:** `fd-lan-010-toggle-on.png` is similar but wider; this is a **LAN block close-up**.

### `fd-settings-022-servers-ftp-polling.png`
- **Steps:** Settings → Servers → **FTP polling** section only (delay, interval, sync/stagger).
- **Show:** Same block as Setup but inside Settings modal.

### `fd-settings-040-appearance-language.png`
- **Steps:** Settings → **Appearance** → open **Language** dropdown.
- **Show:** Language list open (English + several others).

---

## 5. Dashboard sections (auto)

Many section shots exist. Still needed:

### `fd-section-000-landing.png`
- **Show:** Full landing (six cards). Optional if `fd-shell-020-landing.png` is enough for §6.1 — capture only if manual layout differs.

### `fd-section-vehicles-020-filters.png`
- **Steps:** Vehicles → expand **Vehicle Filters** / **Show Filters**.
- **Show:** Filter panel open above the grid.

### `fd-section-fields-020-filter-bar.png`
- **Steps:** Fields section.
- **Show:** **All / Harvest ready / Needs work / Growing / Empty** buttons + **Search fields…** box (one filter selected is fine).

---

## 6. Modals (auto — open each from UI, screenshot, close)

None of the standard modals are captured yet except mod import (`fd-modal-100`).

| Filename | How to open |
| -------- | ------------- |
| `fd-modal-010-notifications.png` | Click **bell** → notification history |
| `fd-modal-020-export-livestock.png` | Livestock → **Export Data** (or export flow) |
| `fd-modal-060-animal-details.png` | Livestock row → **Details** |
| `fd-modal-070-pasture-livestock.png` | Pastures card → **Livestock** |
| `fd-modal-080-vehicle-image.png` | Vehicles → open vehicle image / enlarge |
| `fd-modal-090-weather.png` | Click **weather** pill → forecast modal |
| `fd-modal-110-farm-selection.png` | Farm dropdown / farm selection when multiple farms |

**Already captured:** `fd-modal-100-mod-export.png` (import mod images). `fd-modal-101-mod-import-progress.png` is an extra mid-progress shot (optional for docs).

---

## 7. LAN / tablet (manual)

### `fd-lan-010-toggle-on.png` — **done**

### `fd-lan-020-tablet-prompt.png`
- **Device:** Phone or tablet on **same Wi‑Fi** as PC.
- **URL:** `http://<PC-LAN-IP>:8766` (enable LAN in Settings first).
- **Show:** Browser **HTTP Basic auth** prompt.
- **Size:** **1080 × 1920** portrait.

### `fd-lan-030-tablet-dashboard.png`
- **After** entering LAN credentials on tablet.
- **Show:** Dashboard **landing** (home cards) on tablet.
- **Size:** **1080 × 1920** portrait.

---

## 8. Mod configuration (manual)

### `fd-mod-010-config-xml-explorer.png`
- **Path:** `Documents\My Games\FarmingSimulator2025\modSettings\FS25_FarmDashboard\config.xml`
- **Show:** File Explorer with `config.xml` selected.

### `fd-mod-020-config-xml-editor.png`
- **Show:** `config.xml` open in Notepad / VS Code — `updateInterval`, `collectionCycle`, `<modules>` visible.

---

## Quick count

| Group | Still needed |
| ----- | ------------- |
| Install | 6 |
| Setup | 5 (2 done) |
| Shell | 3 (2 done) |
| Settings | 5 (8 done) |
| Sections | 5 (many done) |
| Modals | 10 (1–2 done) |
| LAN tablet | 2 (1 done) |
| Mod XML | 2 |
| **≈ Total** | **~38–40** |

---

## After you finish

1. Copy all PNGs into `docs/screenshots/`.
2. Run `python tools/embed-manual-screenshots.py` (or ask in Cursor to scan and rename any stragglers still named `Screenshot …`).
3. Skim [`USER_MANUAL.md`](./USER_MANUAL.md) in GitHub preview — search for **Screenshot pending**; there should be none left.
4. Update [`SCREENSHOTS.md`](./SCREENSHOTS.md) capture status if you add new filenames.

**Authors:** [`AUTHORS.md`](./AUTHORS.md)
