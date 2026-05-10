# FarmHub v3.0 audit

**App version:** `3.0.0` (`FS25_FarmDashboard_App/FS25_FarmDashboard_App/package.json`)
**Mod version:** `2.0.0.0` (`FS25_FarmDashboard_Mod/FS25_FarmDashboard_Mod/modDesc.xml`)
**Audit cut:** April 2026
**Companions:** [`DEVELOPER_HANDOVER.md`](./DEVELOPER_HANDOVER.md) · [`USER_MANUAL.md`](./USER_MANUAL.md) · [`SCREENSHOT_MANIFEST.md`](./SCREENSHOT_MANIFEST.md)

This is a read-only gap analysis comparing what the code actually does (web client, Electron host, Lua mod, build/i18n pipeline) to what the previous v3.0 docs claimed. It feeds the v3.0 rewrites of the developer handover and the user manual. **Nothing in this document changes code; every "gap" entry is something the rewrite either documents accurately or marks as a known limitation.**

---

## 1. Method

For each surface, the audit looked at:

1. The actual file (e.g. `web/assests/js/modules/fields.js`) and the controls it renders.
2. Where its values are persisted (`localStorage` key, `electron-store` key, IPC channel, file on disk).
3. Whether the previous `USER_MANUAL.md` or `DEVELOPER_HANDOVER.md` mentioned the surface, named the right control, and pointed at the right path.

Findings are grouped by **surface** and tagged:

- **OK** — code matches docs.
- **DOC GAP** — code exists but the docs miss it or describe it wrongly.
- **CODE GAP** — there is something visible to the user but the implementation is incomplete or inconsistent. The rewrite documents it honestly; fixing it is a future task.

---

## 2. Top-level findings

| # | Surface | Tag | Summary |
| - | ------- | --- | ------- |
| 1 | Livestock — Statistics / Genetics panes | CODE GAP | Markup exists in `index.html` but no tab buttons or JS wiring switch to those panes. Manual must say "not exposed yet". |
| 2 | Mod config parity (`debugBaleScan`) | CODE GAP | `FarmDashboardDataCollector:loadConfig` reads `farmDashboard.settings#debugBaleScan` from `config.xml`, but the Electron `parseModConfigXml` regex does not. Editing it from **Settings → FS25 mod** has no effect; the user must hand-edit `config.xml`. |
| 3 | Fields error strip — retry | DOC GAP | `showFieldsApiError` says "retrying every 5 seconds" but renders no retry button. Background polling is what re-tries; manual must reflect that. |
| 4 | Settings modal layout | DOC GAP | Real layout has four tabs (Dashboard / Servers & saves / FS25 mod / Appearance). The previous user manual described only Servers & saves, LAN, Theme, Notifications. Rewrite documents all four tabs and every control. |
| 5 | First-run Setup (`setup.html`) | DOC GAP | Previous manual referred to "first-run Setup" abstractly. Real setup page has a left/right split with language corner, server list + remove, FTP polling (delay / interval / sync vs staggered), auto-detect saves, mod images, and Add server form. |
| 6 | i18n pipeline | DOC GAP | Two flows coexist: the `messages/<code>.json` flow (`build-translations.mjs`) and the **segment line-pack** flow added recently (`segment-key-list.json` + `line-packs/<lang>.txt` + `emit-locale-packs.mjs` + `locale-packs/<lang>.json`). Only `de.json` is wired in the segment flow today; the other seven languages still fall back to English for segment keys. The dev handover documents both flows. |
| 7 | LAN export env flag | DOC GAP | `FARMDASH_ALLOW_LAN_EXPORT=1` opens `POST /api/export-mod-store-images` to non-loopback clients; not previously documented. |
| 8 | Mod export PowerShell timeout | DOC GAP | `MOD_EXPORT_POWERSHELL_MAX_MS = 90 * 60 * 1000` (90 minutes). Worth documenting because slow runs sometimes look hung. |
| 9 | Field clusters and exclusions | DOC GAP | The Settings → Dashboard tab persists `excludedFarmlandIdsByServer` and `fieldClusterPrefsByServer` via `farmDashAPI.saveUiPreferences`. Not previously surfaced. |
| 10 | SimHub view config | DOC GAP | Settings → Dashboard tab includes a SimHub view block (cluster ids, pasture ids, production keys) writing `simHubView` via UI prefs. The companion page is `web/simhub.html`, separate from `index.html`. |
| 11 | Notification history empty state | CODE GAP | `displayNotificationHistory` overwrites the i18n-translated `notif.none` empty body with a hard-coded English "No notifications yet" (`notifications.js`). Cosmetic, but breaks localisation in that one place. |
| 12 | Folder/error fallback | DOC GAP | The "Back to Home" button on the API error card opens **Settings → Servers & saves** (`openUnifiedSettingsModal('servers')`), not the legacy full-screen Setup. Manual must reflect the unified flow. |
| 13 | Auto-detect saves | DOC GAP | Available in **both** Setup and Settings → Servers & saves; previously only mentioned for first run. |
| 14 | LAN write-token | DOC GAP | `setup.html` over LAN can persist via `POST /api/setup-config` with `X-Setup-Token`. Documented now in the dev handover under "setup-token path". |
| 15 | Server live cache | DOC GAP | `serverLiveCache/*.json` under `app.getPath('userData')`, debounced 600 ms; explains why the dashboard can come up showing the previous payload before a fresh tick lands. |

---

## 3. Settings modal — coverage matrix

| Tab | Controls in code | Previously documented? | After rewrite |
| --- | ---------------- | ---------------------- | ------------- |
| **Dashboard** | 6 section toggles, desktop version, Check for updates, update status line, **Field exclusions** (per farmland, per server), **Field clusters** (auto / manual), **SimHub view** (cluster ids, pasture ids, production keys, help text) | Partial (only section toggles and update check) | Full table, every control, persistence via `saveUiPreferences` |
| **Servers & saves** | LAN enable, user, password, IP allowlist, optional auth, Open full setup, Auto-detect saves, Mod images scan, FTP polling (initial delay, interval, sync vs staggered), Server list + Remove, Add server form (Local vs FTP, paths, optional HTTP feed) | Partial | Full table, including the LAN bind difference (loopback vs `0.0.0.0`) and the optional HTTP feed |
| **FS25 mod** | Read-only `config.xml` path, update interval (ms), collection cycle (ms), 7 module checkboxes (animals, vehicles, fields, weather, finance, economy, production) | Not documented as a tab | Full table; flagged: `debugBaleScan` is **Lua-only** (CODE GAP #2) |
| **Appearance** | Language select (`farmdash_locale`), theme tab picker, 4 colour pickers (bg / surface / text / accent), Copy to all, Reset, Save theme | Mentioned briefly | Full table; full reload on language change is documented |

---

## 4. Per-section coverage matrix

| Section | Controls in code | Previously documented? | After rewrite |
| ------- | ---------------- | ---------------------- | ------------- |
| **Landing (home)** | 6 cards (Livestock, Vehicles, Fields, Economy, Pastures, Productions), Game time pill, Import mod images, splash | High level | Per-card description with badge counts (`fmtLandingBadge` keys) and the visibility rules |
| **Livestock** | 4 summary cards, filter panel (toggle, age/weight numbers, dual sliders for health / metabolism / fertility / quality / productivity, animal-type filter), Apply, animals table, Export, animal-details modal. **Statistics / Genetics** panes present in markup but **no tab switcher wired** | Brief | Full controls + CODE GAP #1 surfaced |
| **Vehicles** | Title, 3 summary cards (Total, Low fuel, High damage), filter panel (vehicle type / fuel level / status / Apply), grid of cards, vehicle image modal | Brief | Full controls and what each summary-card click does (`filterVehiclesBySummaryCard`) |
| **Fields** | 4 summary cards, **Refresh field rules**, filter buttons (All / Harvest ready / Needs work / Growing / Empty), search box, cards (status badges, PF soil badge, growth bar, forage / bale / windrow volume badge, N + pH mini-bars, **Suggested next step** with **Rules** badge, **Tools & shop**), waiting + error states (no retry button) | Mentioned | Full breakdown of each badge, plus DOC GAP #3 |
| **Economy** | 4 summary cards, **Purchases / Market** tabs, filter group (All equipment / Vehicles / Implements), sort buttons (Price / Age / Name), market search, market placeholder when no API | Brief | Full controls; market placeholder is hard-coded English (minor cosmetic) |
| **Pastures** | 4 summary cards, **View all livestock** button, per-pasture detail and warning modals built dynamically | Brief | Full controls; landing badge counts come from same data |
| **Productions** | Per-chain cards (input / output storage, fill levels, recipe, slots), empty state with hint | Brief | Full breakdown; productions has no user filters |

---

## 5. Mod surface — coverage matrix

| Item | In code | Previously documented? | After rewrite |
| ---- | ------- | ---------------------- | ------------- |
| `modDesc.xml` version, multiplayer, no in-game settings UI | Yes | Partial | Documented; explicitly states there is **no in-game console command** and **no Giants settings menu entry** |
| Authority gate | `FarmDashboard:isAuthority()` (SP + server/host only) | Mentioned | Documented with code reference |
| Staggered collectors | `FarmDashboardDataCollector:update` + `runOneStaggeredSlice` + `assembleDataFromModuleCache` + `writeDataToFile` | Mentioned | Per-collector table + slot timing formula |
| `data.json` shape | top-level keys `timestamp`, `status`, `gameTime`, `farmInfo`, `animals`, `vehicles`, `fields`, `production`, `finance`, `weather`, `economy`, `money`, `serverInfo` | Not enumerated | Documented as a table |
| Timing | `collectionCycleMs` 5 s – 30 min, default 60 s; `updateInterval` legacy fallback; production internal 1 s collect throttle; `NUTRIENT_CLOSE_FRAC = 0.05` | Partial | Full timing knob list |
| Output path | `getUserProfileAppPath() .. "modSettings/FS25_FarmDashboard/" .. <save> .. "/data.json"` | Mentioned | Documented with fallback `_G.saveFile` path |
| `debugBaleScan` | Lua reads it, Electron does not write it (CODE GAP #2) | Not documented | Documented + flagged |

---

## 6. Electron host — coverage matrix

| Item | In code (`main.js` unless noted) | Previously documented? | After rewrite |
| ---- | -------------------------------- | ---------------------- | ------------- |
| HTTP/WS port `8766` | `const PORT = 8766` | Yes | Documented |
| LAN bind | `getLanBindAddress`: `127.0.0.1` vs `0.0.0.0` | Yes | Documented |
| Basic auth + IP allowlist | `requireLanAuth`, IPv4-mapped IPv6 handling | Yes (high level) | Documented in detail |
| Setup write token | `ensureSetupWriteToken`, `X-Setup-Token` on `POST /api/setup-config` | Not documented | Documented |
| FTP polling | `getFtpPollingOptions` (1–25 min, 0–600 s delay, sync vs staggered), `startFtpPollingCoordinator` | Partial | Documented with bounds |
| Local XML re-poll | `setInterval(60000)` in `startLocalWatching` | Not documented | Documented |
| `data.json` 5 s retry | `setTimeout(5000)` when missing or watch error | Not documented | Documented |
| Mod export PowerShell cap | `MOD_EXPORT_POWERSHELL_MAX_MS = 90 * 60 * 1000` | Not documented | Documented |
| `serverLiveCache` debounce | `schedulePersistServerCache` 600 ms | Not documented | Documented |
| `electron-store` keys | `config`, `uiPreferences`, `locale`, `lan*`, `farmdashSetupWriteToken`, `lanWsSecret`, `simHubLiveContext` | Not enumerated | Documented as a table |
| `FARMDASH_ALLOW_LAN_EXPORT` | env flag for LAN mod-export POST | Not documented | Documented |
| `USERPROFILE` fallback | `collectFarmDashboardModSettingsRoots` | Not documented | Documented |

---

## 7. Web client — coverage matrix

| File | Role | Previously listed? | After rewrite |
| ---- | ---- | ------------------ | ------------- |
| `dashboard.js` | Top-level controller, server/farm switching, section show | Mentioned | Documented |
| `navigation.js` | Sidebar, landing badges, alerts, splash | Partial | Full landing badge keys (`fmtLandingBadge`, `card.badge*One/Many`, `fields.fieldCountOne/Many`) |
| `apiStorage.js` | Server tabs, farm dropdown, auto-detect → setup config | Mentioned | Documented |
| `modules/livestock.js` | Livestock section + filters + table + export | Mentioned | Full controls + CODE GAP #1 |
| `modules/vehicles.js` | Vehicles section, filters, image modal | Mentioned | Full controls |
| `modules/fields.js` | Fields section, badges, rules badge, windrow badge, soil mini-bars | Yes | Full coverage incl. waiting/error states |
| `modules/economy.js` | Economy section, Purchases / Market tabs | Mentioned | Full controls |
| `modules/pastures.js` | Pastures section + livestock modal | Mentioned | Full controls + landing pasture badge keys |
| `modules/productions.js` | Productions chains | Mentioned | Full controls |
| `notifications.js` | Bell, history modal, `localStorage` `farmdashboard_notifications` | Mentioned | Documented + CODE GAP #11 |
| `theming.js` | 4-color theme editor, `localStorage` `dashboard_themes` | Mentioned | Documented |
| `i18n.js` | `t()`, `applyDom`, `setLocale` (reload), `farmdash_locale` | Mentioned | Documented |
| `rules-engine.js` | Field rules thresholds | Mentioned | All thresholds enumerated |
| `field-rules-cache.js` | In-memory rule results per field | Not listed | Documented |
| `field-suggestion-tools.js` | Tool labels for Tools & shop block | Not listed | Documented |
| `setup-i18n.js` | i18n for setup page (`data-setup-i18n`) | Not listed | Documented |

---

## 8. i18n pipeline — coverage matrix

The repo has two parallel pipelines that both feed `web/locales/translations.json`:

| Flow | Inputs | Tool | Output | Coverage today |
| ---- | ------ | ---- | ------ | -------------- |
| **Messages flow** (long-standing) | `web/locales/messages/<code>.json` (per-locale overrides) | `web/locales/build-translations.mjs` | `translations.json` | All shipped languages have `messages/<code>.json` files |
| **Segment flow** (added for badge fix) | `web/locales/segment-key-list.json` (198 keys), `web/locales/en-segment-strings.json`, `web/locales/line-packs/<lang>.txt` | `web/locales/emit-locale-packs.mjs` then `build-translations.mjs` | `web/locales/locale-packs/<lang>.json` then folded into `translations.json` | Only **`de`** is fully populated; `fr`, `es`, `it`, `pl`, `nl`, `pt`, `uk` are skipped at emit time and fall back to English for the 198 segment keys |

The dev handover documents both flows, the order to run them in, and lists the seven outstanding language line-packs as a tracked follow-up. The user manual sticks to the user-visible **language picker** behaviour and does not mention the build pipeline.

---

## 9. Build, packaging, runtime artifacts — coverage matrix

| Item | Where | Previously documented? | After rewrite |
| ---- | ----- | ---------------------- | ------------- |
| `npm run dist` default output | `tools/app/run-electron-builder.mjs` → `%LOCALAPPDATA%\fs25-farm-dashboard-electron-out` | Yes | Documented |
| `npm run pack` / `:fresh` / `:alt` / `:in-repo` | `package.json` scripts | Partial | Full script inventory |
| Auto-update | `electron-updater` against `WizardlyPayload/FarmHub` GitHub releases (`build.publish`) | Mentioned | Documented |
| NSIS hooks | `build/installer.nsh`: `customCheckAppRunning` (`taskkill /F /T`), `customWelcomePage` (language), `customInstall` (ImageMagick PS1), `customUnInit`, `customUnInstall` | Partial | Full hook list |
| Uninstall data wipe | `FarmDashWipeUserData` Yes/No/Cancel + `--delete-app-data` CLI | Yes | Documented incl. registry key removed (`HKCU\Software\fs25-farm-dashboard`) |
| `userData` artifacts | `%APPDATA%\fs25-farm-dashboard`: store JSON, `install-locale.txt`, `serverLiveCache/*.json`, `ftpXmlCache/<server>/<slot>/`, FTP temp downloads | Not documented | Documented |
| `%TEMP%` artifacts | `farmdash-mod-export-summary.json` | Not documented | Documented |
| NSIS `$TEMP` | `farmdash-install-locale.txt` | Not documented | Documented |
| ImageMagick / texconv | `extraResources` shipped with installer for mod-image export | Mentioned | Documented |

---

## 10. Known gaps that need fixing later (not in scope of this round)

The audit deliberately keeps these as code follow-ups so that the v3.0 docs can be honest without blocking on engineering work.

| # | Gap | Suggested fix |
| - | --- | ------------- |
| 1 | Livestock Statistics / Genetics panes have no tab switcher | Either wire `#statistics-tab` / `#genetics-tab` buttons in `index.html` and `livestock.js`, or remove the dead markup and update the manual |
| 2 | Electron `parseModConfigXml` ignores `debugBaleScan` | Extend regex / writer in `main.js` so the Settings → FS25 mod tab can flip the flag |
| 3 | Fields error strip has no retry button | Add a small "Retry now" link that re-arms the watcher / forces a fetch, matching the manual copy |
| 4 | Notification history empty state hard-codes English | Use the existing `notif.none` translation key in `notifications.js` `displayNotificationHistory` |
| 5 | Seven `line-packs/<lang>.txt` files outstanding | Author the 198-line files for `fr`, `es`, `it`, `pl`, `nl`, `pt`, `uk`, then re-run `emit-locale-packs.mjs` + `build-translations.mjs` |

---

## 11. Document map

- [`DEVELOPER_HANDOVER.md`](./DEVELOPER_HANDOVER.md) — paragraph-and-table dev reference; targets a new maintainer who needs to support v3.0.
- [`USER_MANUAL.md`](./USER_MANUAL.md) — illustrated end-user manual; one screenshot slot per setting and per feature.
- [`SCREENSHOT_MANIFEST.md`](./SCREENSHOT_MANIFEST.md) — image filenames, captions, `[auto]` / `[manual]` capture method, and exact recipe per shot.

**Authors:** [`AUTHORS.md`](./AUTHORS.md).
