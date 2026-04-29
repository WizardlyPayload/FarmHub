# Screenshot manifest (v3.0)

This is the canonical list of every screenshot referenced from [`USER_MANUAL.md`](./USER_MANUAL.md) and [`DEVELOPER_HANDOVER.md`](./DEVELOPER_HANDOVER.md). All images live under [`docs/screenshots/`](./screenshots/).

## Conventions

- **Filename:** `fd-<area>-<3-digit-order>-<kebab-slug>.png`. The 3-digit order keeps lexical order = doc order.
- **Format:** PNG, **1920 x 1080** for desktop UI shots, **1280 x 800** acceptable for tablet shots.
- **Privacy:** blur or redact server hostnames, IPs, FTP credentials, save names if sensitive.
- **Tag:**
  - **[auto]** — captured by Cursor against the running Farm Dashboard at `http://localhost:8766` via the browser MCP.
  - **[manual]** — you supply (Windows installer, in-game FS25 screens, file-explorer / editor views, tablet photos).

## Capture preconditions

For **[auto]** capture in one go:

1. Run FS25 with the mod for at least one save, so `data.json` is current.
2. Launch the desktop app (`npm start` or the installed shortcut) and complete first-run Setup with at least **one Local server**, ideally with two farms so the farm dropdown is visible.
3. Generate at least one notification (e.g. start the app while a field is in `Needs work`) so the bell modal has content.
4. Open `http://localhost:8766` in a 1920 x 1080 browser window. Stop other browser tabs that might steal focus.
5. Tell me you are ready; I will drive the captures via the `cursor-ide-browser` MCP.

For **[manual]** captures, follow the recipe in each row below and drop the PNG into [`docs/screenshots/`](./screenshots/) using the exact filename.

---

## Manifest

| # | Filename | Section in manual | Tag | Capture recipe |
| - | -------- | ----------------- | --- | -------------- |
| 1 | `fd-install-010-mod-folder.png` | §2 Stage A | manual | File Explorer at `Documents\My Games\FarmingSimulator2025\mods\` showing the `FS25_FarmDashboard_Mod` folder |
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

The first auto-capture pass landed the following 16 PNGs into [`docs/screenshots/`](./screenshots/):

| File | Slot |
| ---- | ---- |
| `fd-install-050-app-first-launch.png` | §2 Stage E |
| `fd-shell-020-landing.png` | §4 |
| `fd-shell-040-landing-badges.png` | §4 |
| `fd-settings-000-modal-overview.png` | §5 |
| `fd-settings-010-dashboard-toggles.png` | §5.1 |
| `fd-settings-020-servers-list.png` | §5.2 |
| `fd-settings-030-mod-tab.png` | §5.3 |
| `fd-settings-041-appearance-theme.png` | §5.4 |
| `fd-section-livestock-010-summary.png` | §6.2 |
| `fd-section-vehicles-010-summary.png` | §6.3 |
| `fd-section-fields-010-summary.png` | §6.4 |
| `fd-section-fields-030-card-rules.png` | §6.4 |
| `fd-section-fields-080-api-error.png` | §6.4 (API error / first launch state) |
| `fd-section-economy-010-summary.png` | §6.5 |
| `fd-section-pastures-010-summary.png` | §6.6 |
| `fd-section-productions-010-list.png` | §6.7 |

Notes:

- Because the MCP-driven browser is mounted in the IDE, the actual image width is roughly **800 px**, not 1920. Content is sharp and readable but a re-shoot in a 1920 px standalone browser is recommended for a polished release.
- The screenshots were captured against a real save (`Carpathian Countryside / savegame1`) with live data: 38 animals, 57 vehicles, 10 fields, 4 pastures, 1 production chain.
- Screenshots **not yet captured** (still listed `[auto]` above, awaiting a re-run): `fd-shell-010-navbar.png`, `fd-shell-030-game-time-weather.png`, `fd-shell-050-import-mod-images.png`, `fd-settings-015/016/017-*.png` (Dashboard exclusions / clusters / SimHub blocks), `fd-settings-021/022/023-servers-*.png` (LAN / FTP polling / Add server zoom-ins), `fd-settings-040-appearance-language.png` (language picker zoom-in), `fd-section-livestock-020-filters.png`, `fd-section-livestock-030-table.png`, `fd-section-vehicles-020-filters.png`, `fd-section-vehicles-030-grid.png`, `fd-section-fields-020-filter-bar.png`, `fd-section-fields-040-card-windrow.png`, `fd-section-fields-050-card-soil.png`, `fd-section-fields-060-tools-shop.png`, `fd-section-fields-070-waiting.png`, `fd-section-economy-020/030-*.png`, `fd-section-pastures-020-cards.png`, `fd-section-productions-020-empty.png`, all `fd-modal-*` entries, `fd-lan-010-toggle-on.png`, `fd-section-000-landing.png`. These either need additional click steps in the walk-through or are easier to re-capture once the docs are reviewed.

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
