# V5 screenshots (manifest + capture checklist)

Committed V5 UI PNGs for [USER_MANUAL.md](./USER_MANUAL.md) and [INSTALL.md](./INSTALL.md) live in [`doc-screenshots/`](./doc-screenshots/). Shared install/mod/PDA shots are not duplicated here — they live in [`../doc-screenshots/`](../doc-screenshots/).

This pack is **NEW APP / V5 only**. Do not promote classic `docs/doc-screenshots/fd-shell-*` landing-card shots here.

Shared **non-UI** shots (mod folder, in-game enable, `data.json`, `config.xml`, PDA reference) keep the classic `fd-*` names so one capture serves both manuals.

---

## Conventions

- **V5 UI filename:** `v5-<area>-<3-digit-order>-<kebab-slug>.png` (or a short `v5-section-*` / `v5-settings-*` name when the shot is a whole page).
- **Shared install / disk shots:** `fd-install-*`, `fd-mod-*`, `fd-reference-*`.
- **Format:** PNG.
  - **Desktop V5 UI (`[auto]`):** **1920 × 1080** landscape.
  - **Tablet LAN only:** **1080 × 1920** portrait — **[manual]**, not captured in this batch.
- **Privacy:** blur FTP passwords. Save **display names** appear in the Saves control (this batch: Riverbend Springs / other local slots). Redact if you publish elsewhere.
- **Tag:**
  - **[auto]** — captured 2026-09-09 against `http://127.0.0.1:8767/` (`npm run dev:new-ui`, Riverbend Springs savegame2, live merge).
  - **[manual]** — Windows installer, in-game FS25, File Explorer, tablet photos, or still missing.

## Capture preconditions (repeat)

1. FS25 running with the mod; `data.json` current.
2. V5 app or `npm run dev:new-ui`; at least one Local server.
3. Viewport **1920 × 1080**.
4. Prefer a save with animals **and** fields (this batch used **Riverbend Springs (savegame2)** — 2314 animals, 46 fields, RF suite + ADS + Red Tape).

Installed testers should recapture against **port 8768** if they want chrome that shows the packaged URL; layout is the same.

---

## Manifest

| # | Filename | Section | Tag | Recipe / notes |
| - | -------- | ------- | --- | -------------- |
| 1 | `fd-install-010-mod-folder.png` | Install A | manual | Explorer: `mods\` with `FS25_FarmDashboard` |
| 2 | `fd-install-020-fs25-mod-enabled.png` | Install B | manual | In-game mod list, Farm Dashboard ticked |
| 3 | `fd-install-030-datajson-explorer.png` | Install C | manual | Explorer: `data.json` timestamp |
| 4 | `v5-install-040-installer-welcome.png` | Install D | **manual still** | **V5** NSIS welcome (language). Do not use V4 Setup.exe |
| 5 | `v5-install-045-installer-finished.png` | Install D | **manual still** | V5 installer Finished |
| 6 | `v5-install-050-app-first-launch.png` | Install E | **manual still** | First launch, empty server list |
| 7 | `v5-setup-080-launch.png` | Setup §3 | auto | `setup.html` — Auto-detect, Launch, save list |
| 8 | `v5-shell-020-overview.png` | §4 / §6.1 | auto | Save overview — sidebar, top bar, status cards, activity, field tiles |
| 9 | `v5-fields-010-page.png` | §6.4 | auto | Field Management — summary, filters, **Order**, soil cards |
| 10 | `v5-fields-020-order-menu.png` | §6.4 | auto | Same page; Order combobox focused (native option list may not paint in capture) |
| 11 | `v5-section-vehicles-010.png` | §6.3 | auto | Vehicle Fleet Management — cards view |
| 12 | `v5-section-pastures-010.png` | §6.2 | auto | Pasture Management — barn list + detail + Dairy Core |
| 13 | `v5-section-productions-010.png` | §6.7 | auto | Productions chains |
| 14 | `v5-section-storage-010.png` | §6.6 | auto | Storage — Fertilizer Depot hall stock + silo summary |
| 15 | `v5-section-economy-010.png` | §6.5 | auto | Economy — money + RF tax/fuel/income + market dynamics |
| 16 | `v5-section-economy-020-purchases.png` | §6.5 | auto | Economy mid-scroll (market movers / futures) |
| 17 | `v5-section-economy-021-purchases-cards.png` | §6.5 | auto | Equipment Purchases cards |
| 18 | `v5-section-fleet-map-010.png` | §6.8 | auto | Fleet map with field overlay colours and Riverbend pins |
| 18b | `v5-section-fleet-map-020-layers-dropdown.png` | §6.8 | auto | Overlay dropdown open (crops, growth, soil, PF / Soil Fertilizer) |
| 19 | `v5-section-redtape-010.png` | §6.9 | auto | Red Tape policies (mod-gated) |
| 20 | `v5-section-ads-010.png` | §6.10 | auto | ADS list |
| 21 | `v5-section-ads-020-detail.png` | §6.10 | auto | ADS vehicle detail pane (8R 410) |
| 22 | `v5-section-hirepurchase-010.png` | §6.11 | auto | Hire purchase deals |
| 23 | `v5-section-npcfavor-010.png` | §6.12 | auto | NPC Favor relationships |
| 24 | `v5-section-worldevents-010.png` | §6.13 | auto | World Events current event |
| 25 | `v5-section-prostaff-010.png` | §6.14 | auto | Pro Staff discounts |
| 26 | `v5-section-fertilizerdepot-010.png` | §6.15 | auto | Fertilizer Depot hall bins (not shop book) |
| 27 | `v5-settings-010-dashboard.png` | §5.1 | auto | Settings → Dashboard |
| 28 | `v5-settings-020-servers.png` | §5.2 / §8 | auto | Settings → Servers & saves (LAN + join-as-client) |
| 29 | `v5-settings-030-mod.png` | §5.3 | auto | Settings → FS25 mod |
| 30 | `v5-settings-040-appearance.png` | §5.4 | auto | Settings → Appearance |
| 31 | `v5-settings-050-health.png` | §5.5 | auto | Settings → Health |
| 32 | `v5-settings-060-about.png` | §5.6 | auto | Settings → About |
| 33 | `v5-modal-090-weather.png` | §7.9 | auto | Weather Forecast modal |
| 34 | `v5-modal-010-notifications.png` | §7.1 | auto | Notification History (empty state this session) |
| 35 | `v5-modal-071-pen-information.png` | §7.7 | auto | Pasture **Details** modal (Cow Barn Lower Farm) |
| 36 | `fd-mod-010-config-xml-explorer.png` | §9 | manual | Explorer: `config.xml` |
| 37 | `fd-mod-020-config-xml-editor.png` | §9 | manual | `config.xml` in an editor |
| 38 | `fd-reference-pda-map.png` | §6.8 | manual | In-game PDA (reference, not dashboard) |
| 39 | `v5-lan-020-tablet-prompt.png` | §8 | **manual still** | Tablet Basic auth — 1080×1920 |
| 40 | `v5-lan-030-tablet-dashboard.png` | §8 | **manual still** | Tablet V5 shell |
| 41 | `v5-modal-080-vehicle-image.png` | §7.8 | **manual still** | Click a vehicle shop image |
| 42 | `v5-modal-065-pen-detail.png` | §7.6 | **manual still** | Animals table **Pen detail** |
| 43 | `v5-section-invoices-010.png` | §6.11 | **manual still** | Invoices tab when that companion is on the save (not on this capture save’s sidebar) |

---

## Capture status (2026-09-09)

**Source:** `npm run dev:new-ui` → `http://127.0.0.1:8767/` · save **Riverbend Springs (savegame2)** · mod **5.0.0.2**.

| File | Shows |
| ---- | ----- |
| `v5-shell-020-overview.png` | Save overview — 46 fields, 2314 animals, RF chips, activity list |
| `v5-fields-010-page.png` | Field 2 soil bars + merged 3·4 GPS card; Order = Field number |
| `v5-section-vehicles-010.png` | 157 vehicles, ADS summary, cards |
| `v5-section-pastures-010.png` | 9 pastures / Dairy Core / livestock table |
| `v5-section-productions-010.png` | Bakery + Canning Factory chains |
| `v5-section-storage-010.png` | Hall depot 6800k L + silo value |
| `v5-section-economy-010.png` | $805,021 cash, RF economy blocks |
| `v5-section-fleet-map-010.png` | Riverbend PDA + growth overlay + pins |
| `v5-settings-*` | All six Settings tabs, opaque panel |
| `v5-setup-080-launch.png` | Server Manager with multiple Local rows |

**Still to capture (Wizard / testers):** V5 NSIS welcome + Finished; empty first launch; tablet LAN pair; vehicle image zoom; native Order dropdown list if you need a crop of the five sort modes; Invoices if that mod is present.

---

## Scrolled pack (2026-09-09, same Riverbend save)

Captured with [`capture-v5-shots.mjs`](./capture-v5-shots.mjs) against `http://127.0.0.1:8767/` (viewport **1920 × 1080**, scroll inside `.fd-main__content`).

| Filename | Shows |
| -------- | ----- |
| `v5-shell-030-activity-scroll.png` | Overview mid — activity + field tiles + pasture row |
| `v5-shell-040-field-tiles-scroll.png` | Overview lower — productions grid |
| `v5-fields-030-cards-scroll.png` | Fields aligned to card 3 (sticky toolbar may clip titles) |
| `v5-fields-040-more-cards-scroll.png` | Fields card 9 |
| `v5-fields-050-lower-cards-scroll.png` | Fields later parcels |
| `v5-section-vehicles-020-filters-scroll.png` | Vehicle grid (implements) |
| `v5-section-vehicles-030-grid-scroll.png` | Vehicle grid (tractors / tools) |
| `v5-section-vehicles-040-more-grid-scroll.png` | Vehicle grid further down |
| `v5-section-pastures-020-list-scroll.png` | Barn selected + start of animal table |
| `v5-section-pastures-030-herd-scroll.png` | Animal table rows |
| `v5-section-storage-020-silos-scroll.png` | Silo & bunker table |
| `v5-section-storage-030-bales-scroll.png` | Bales + pallets |
| `v5-section-economy-030-lower-scroll.png` | Optional RF tax/fuel/market-dynamics (this save) |
| `v5-section-productions-020-chains-scroll.png` | Greenhouse chain detail |

Re-run: `node "docs/v5 documents/capture-v5-shots.mjs" --pack suite`

---

## Vanilla / base-game pack (tomorrow)

**Not captured yet.** Current marketing shots (including scrolled) are **Riverbend Springs (savegame2)** with the Realistic Farming suite and other companions, so the sidebar shows ADS, Red Tape, Fertilizer Depot, and so on.

Need a second pack named `v5-base-*` from **vanilla FS25 + Farm Dashboard only**.

### Wizard setup

1. In the FS25 mod list, enable **only** `FS25_FarmDashboard` (base maps / Giants DLC are fine).
2. Disable Realistic Farming companions, ADS, Red Tape, Hire Purchase, NPC Favor, World Events, Pro Staff, Fertilizer Depot, and similar.
3. Load a **base-game map** save (Riverbend Springs or similar — not a heavy map pack if you can avoid it). New save is fine if no vanilla slot exists.
4. Sit in-world until `modSettings/FS25_FarmDashboard/<slot>/data.json` is fresh.
5. Open Farm Dashboard V5 (`npm run dev:new-ui` → `:8767` or installed V5 → `:8768`).
6. Select that save in the top bar.

### Capture

```bash
node "docs/v5 documents/capture-v5-shots.mjs" --pack base
```

Optional: `FARMDASH_CAPTURE_URL=http://127.0.0.1:8768/` and `FARMDASH_CAPTURE_SAVE_ID=<that save id>`.

Expected files: `v5-base-shell-020-overview.png`, `v5-base-fields-010-page.png`, `v5-base-section-vehicles-010.png`, `v5-base-section-pastures-010.png`, `v5-base-section-storage-010.png`, `v5-base-section-economy-010.png`, `v5-base-section-productions-010.png`, `v5-base-section-fleet-map-010.png`, plus the matching `*-scroll` names from the script.

The site already has a **Base game is enough** note. After these PNGs exist, swap them into that section (and keep the suite shots on the optional-mods gallery).

---

## Honest capture notes

- Native `<select>` **Order** options often do **not** appear in browser screenshots. The combobox still lists Field number / Crop / Size / Work needed / Soil urgency in the accessibility tree.
- Settings **Appearance** may still show classic “Use new dashboard UI” copy on a V5 process — V5 **is** the new UI. Treat the toggle as leftover on this line.
- Some LAN help strings still mention **:8766**. Installed V5 listens on **8768**; this capture used **8767**. Use the port shown in Settings / About for your build.
- Fertilizer Depot litres are **production hall bins**, not the 50k walk-in shop book.
- Field cards merge **only** GPS-painted blobs (plus optional manual groups). Adjacent same-crop parcels stay separate unless they are one painted field.
