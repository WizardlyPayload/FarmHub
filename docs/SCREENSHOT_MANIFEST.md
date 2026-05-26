# Screenshot manifest (v3.9)

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
| 45 | `fd-section-fields-070-waiting.png` | §6.4 | auto | Fields waiting state (drop the data source briefly) |
| 46 | `fd-section-fields-080-api-error.png` | §6.4 | auto | Fields API error strip (kill the data source) |
| 47 | `fd-section-economy-010-summary.png` | §6.5 | auto | Economy summary row |
| 48 | `fd-section-economy-020-purchases.png` | §6.5 | auto | Economy purchases tab with filters / sort |
| 49 | `fd-section-economy-030-market.png` | §6.5 | auto | Economy market tab (or placeholder) |
| 50 | `fd-section-pastures-010-summary.png` | §6.6 | auto | Pastures summary row |
| 51 | `fd-section-pastures-020-cards.png` | §6.6 | auto | Pastures grid |
| 52 | `fd-section-productions-010-list.png` | §6.7 | auto | Productions chains list |
| 53 | `fd-section-productions-020-empty.png` | §6.7 | auto | Productions empty state (use a save with no chains, or temporarily stop the production module) |
| 54 | `fd-modal-010-notifications.png` | §7.1 | auto | Notification history modal |
| 55 | `fd-modal-020-export-livestock.png` | §7.2 | auto | Export livestock modal |
| 56 | `fd-modal-030-refresh-data.png` | §7.3 | auto | Refresh data modal |
| 57 | `fd-modal-040-data-changes.png` | §7.4 | auto | Data changes modal (any sub-tab) |
| 58 | `fd-modal-050-warning-details.png` | §7.5 | auto | Warning details modal |
| 59 | `fd-modal-060-animal-details.png` | §7.6 | auto | Animal details modal |
| 60 | `fd-modal-070-pasture-livestock.png` | §7.7 | auto | Pasture livestock modal |
| 61 | `fd-modal-080-vehicle-image.png` | §7.8 | auto | Vehicle image modal |
| 62 | `fd-modal-090-weather.png` | §7.9 | auto | Weather forecast modal |
| 63 | `fd-modal-100-mod-export.png` | §7.10 | auto | Mod export progress modal |
| 64 | `fd-modal-110-farm-selection.png` | §7.11 | auto | Farm selection modal |
| 65 | `fd-lan-010-toggle-on.png` | §8 | auto | LAN access on with credentials filled |
| 66 | `fd-lan-020-tablet-prompt.png` | §8 | manual | Tablet showing Basic auth prompt at `http://<PC-LAN-IP>:8766` |
| 67 | `fd-lan-030-tablet-dashboard.png` | §8 | manual | Tablet showing dashboard home over LAN |
| 68 | `fd-mod-010-config-xml-explorer.png` | §9 | manual | File Explorer showing `config.xml` |
| 69 | `fd-mod-020-config-xml-editor.png` | §9 | manual | `config.xml` open in a text editor |

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

**Still missing** from the manifest table above (capture when ready): all `fd-install-*`, most `fd-setup-*` (except 050/080), `fd-shell-010/030/040`, `fd-settings-000/015/021/022/040`, `fd-section-fields-020/070/080`, `fd-section-vehicles-020`, `fd-section-productions-020-empty`, most `fd-modal-*` (notifications, weather, animal details, etc.), `fd-lan-020/030` tablet shots, `fd-mod-*` config.xml explorer/editor.

**Resolution:** confirm desktop shots are **1920 × 1080** before release; re-capture any that are not.

## How auto capture runs

When you tell me you are ready, I drive the `cursor-ide-browser` MCP through the following walk-through. Each step ends with a `browser_take_screenshot` saved as the manifest filename above:

1. **Navbar / landing** — `browser_navigate http://localhost:8766` → snapshot → screenshots `fd-shell-*` and `fd-section-000-landing.png` / `fd-shell-040-landing-badges.png`.
2. **Settings tabs** — click gear → screenshots for each pane (`fd-settings-*`).
3. **Sections** — for each section, click the matching landing card, screenshot the summary, expand filters, screenshot again, drill into a card / open a modal.
4. **Fields edge cases** — `fd-section-fields-070-waiting.png` and `-080-api-error.png` need the data source temporarily disabled (rename the local server's `data.json` for ~10 seconds, capture, restore).
5. **Modals** — open each one in turn, screenshot, close.
6. **LAN toggle** — Settings → Servers & saves → LAN → `fd-lan-010-toggle-on.png`. Do **not** save unless you really intend to enable LAN.

If the app is not running when capture starts, the MCP step fails fast and I leave placeholder rows untouched so you can fill them later.

---

## Adding a new screenshot to the docs

1. Append a row to the table above with a fresh `fd-<area>-<n>-<slug>.png` filename and a one-line capture recipe.
2. Reference the same filename from the relevant manual / handover section.
3. Drop the PNG into [`docs/screenshots/`](./screenshots/).
4. If the image is auto-capturable, also update the walk-through steps in §"How auto capture runs" above so a fresh run captures it next time.
