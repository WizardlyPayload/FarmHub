# Screenshots still to capture

Use this checklist after you add new PNGs under [`docs/screenshots/`](./screenshots/). Drop files with the **exact filename** shown (1920×1080 desktop unless noted). Then ask a maintainer to run:

```bash
python tools/embed-manual-screenshots.py
```

That embeds any new images into [`USER_MANUAL.md`](./USER_MANUAL.md) and [`INSTALL.md`](./INSTALL.md).

**Already in the folder (31 dashboard shots + 1 reference):** see [`SCREENSHOT_MANIFEST.md`](./SCREENSHOT_MANIFEST.md) § Capture status.

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

### `fd-section-fields-070-waiting.png`
- **Steps:** Temporarily break data — rename `data.json` to `data.json.bak` for ~10s, open Fields, capture **waiting** state, restore file.
- **Show:** “Waiting for field data” (or equivalent) on Fields.

### `fd-section-fields-080-api-error.png`
- **Steps:** Stop app data source (wrong FTP path or rename `data.json` longer) until red **API error** strip appears.
- **Show:** Error strip on Fields (“retrying every 5 s”).

### `fd-section-productions-020-empty.png`
- **Steps:** Use a save with **no** production chains, or disable production module in mod `config.xml` briefly.
- **Show:** Productions empty state message.

---

## 6. Modals (auto — open each from UI, screenshot, close)

None of the standard modals are captured yet except mod import (`fd-modal-100`).

| Filename | How to open |
| -------- | ------------- |
| `fd-modal-010-notifications.png` | Click **bell** → notification history |
| `fd-modal-020-export-livestock.png` | Livestock → **Export Data** (or export flow) |
| `fd-modal-030-refresh-data.png` | Trigger **Refresh data** if exposed in UI |
| `fd-modal-040-data-changes.png` | Open **Data changes** modal (any sub-tab) |
| `fd-modal-050-warning-details.png` | Pastures/fields **warning** → Details |
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
4. Update [`SCREENSHOT_MANIFEST.md`](./SCREENSHOT_MANIFEST.md) capture status if you add new filenames.

**Authors:** [`AUTHORS.md`](./AUTHORS.md)
