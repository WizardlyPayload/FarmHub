# FS25 Farm Dashboard — Release v3.0.0 (FarmHub)

**Product:** FS25 Farm Dashboard + optional **AI Farm Manager** stack  
**Desktop app:** `3.0.0` (`package.json`)  
**In-game mod:** `2.0.0.0` (`modDesc.xml`) — unchanged in this line unless you ship a new mod build  
**Documentation cut-off:** April 2026  

---

## How this document was assembled

| Source | Role |
|--------|------|
| **Cursor agent transcripts** (workspace-linked chat history) | Primary timeline of *what you asked for* and what was implemented in-session (build locks, BYOK, installer, consultant UX, LAN security, caching, backend hardening, in-game chat, etc.). |
| **Current tree** (`FarmHub/…`) | Verification that features exist in code (e.g. `run-electron-builder.mjs`, `integration_auth.py`, `main.js` LAN middleware, `localConsultantLlm.js`). |
| **[CHANGELOG.md](./CHANGELOG.md)** | Baseline for **2.0.0** and the drafted **3.0.0** app bullets — merged and extended here. |

**Limitation:** This folder is **not a Git working copy** in the environment used to prepare this file, so there is **no `git log` / tag diff** between GitHub **2.0** and **HEAD**. For an authoritative commit list after you push, run `git log v2.0.0..HEAD` (or your actual tag) in your real clone and attach it as a supplement.

---

## Executive summary

Version **3.0.0** is a **major desktop-app and integration release**: unified **Settings → Servers & saves**, reliable **Windows install/upgrade/uninstall** (including optional **full user-data wipe**), **LAN access** secured with **Basic Auth + IP allowlist** (localhost bypass), **local BYOK** smart suggestions (keys go to Google/OpenAI from the PC, not necessarily through your VPS), **build output moved outside the repo** to avoid IDE/Search locks on `app.asar`, and substantial **AI Farm Manager** hardening for public deployments. The **FS25 mod** remains at **2.0.0.0** on this line unless you publish a new mod version.

---

## A. Baseline: what GitHub **2.0.0** already included

Everything in [CHANGELOG §2.0.0](./CHANGELOG.md) remains the foundation: mod **authority** and **staggered collectors**, **field merge** rules (`dataMerger.js` / `xmlCollector.js`), **multi-farm** UI, **FTP polling** (sync vs staggered), **payload normalization** for Lua object-shaped JSON, **security documentation** for LAN browser use, packaging hygiene, etc. **3.0.0 builds on top of that**; it does not replace those behaviours.

---

## B. Desktop app — dashboard UX and polish (v3.0.0)

Documented in CHANGELOG §3.0.0; condensed here:

- **Single Settings entry** — Duplicate navbar folder/“Servers” shortcut removed; server/save/FTP management lives under **Settings (gear) → Servers & saves** (`dashboard.openUnifiedSettingsModal('servers')` in `dashboard-settings.js`).
- **API error recovery** — “Back to Home” on the API error card opens unified Settings instead of only the legacy full-screen setup flow.
- **Notification History** — Global CSS fix: `.modal-backdrop` no longer stacks above `.modal` (clicks work without refresh) — `web/assests/css/styles.css`.
- **Smart suggestions** — Optional **collapse** (chevron) on the home grid; state in `localStorage`; neutral copy when optional AI is offline; optional **Screen Wake Lock** for tablets.
- **Top bar** — Combined **XML + Live + API** status; farm dropdown overflow fixes for tablet layouts.
- **Performance** — Consultant success `console.log` gated on `window.DASH_DEBUG`; skeleton pulse limited to placeholder bars.

---

## C. Windows build, packaging, and file locks (transcript-driven)

**Problem (sessions):** `electron-builder` failed with **“cannot access app.asar — used by another process”**; **NSIS** reported the app could not be closed; entire **`release/`** or **`electron-pack-out`** trees sometimes appeared **undeletable** (often **Cursor / Windows Search / Defender** indexing a project-local `app.asar`).

**Shipping mitigations in tree:**

- **`tools/run-electron-builder.mjs`** — Default **`npm run dist` / `pack`** writes to  
  `%LOCALAPPDATA%\fs25-farm-dashboard-electron-out` **outside** the repo so IDEs are less likely to lock the asar.
- **`package.json` scripts** — `dist`, `pack`, `dist:fresh`, `pack:fresh`, `dist:alt`, `clean:build-out`, `unlock-install`, etc., support repeatable builds and cleanup.
- **`tools/remove-build-output-folders.ps1`** — Cleans configured output dirs (with optional Search-index pause); fixes addressed **PowerShell parsing** issues seen during development.
- **`tools/stop-farmdash-install-lock.ps1`** — Helps release **installer** file locks from stuck processes.

**Developer note:** In-repo `electron-builder --win` / `dist:in-repo` may still output under `../electron-pack-out` per `package.json`; prefer the **default wrapper** for day-to-day builds if locks recur.

---

## D. NSIS installer and uninstaller

From `build/installer.nsh` and related NSIS macros:

- **`customCheckAppRunning`** — Uses **`taskkill /F /T`** on the app executable so **child processes** release locks (addresses “cannot be closed” during upgrade).
- **Language-first installer** — EU/EEA-oriented locales; persistence across **UAC elevation** via registry/temp + `%APPDATA%\fs25-farm-dashboard\install-locale.txt` (see existing v2.0.0 installer notes).
- **ImageMagick** — Post-install `install-imagemagick.ps1` for mod image pipeline (hidden PowerShell host where applicable).
- **Uninstall: optional wipe** — Variable **`FarmDashWipeUserData`**: user can choose to **remove all app profile data** (settings, caches, etc.) or keep it on uninstall (transcript request for complete removal option).

---

## E. Runtime assets and post-install UI

- **Landing card backgrounds / images** — Session work addressed **missing pictures on cards** after install (asset paths / packaging / `extraResources` visibility). Verify `web/` static assets and `GET /api/` image routes after a clean install.

---

## F. LAN access security (Express on `:8766`)

Implemented in **`main.js`** (see `lanAccessHttpMiddleware`, `lanAccessEnabled`, store defaults):

- **Toggle: Enable LAN access** — When off, bind **127.0.0.1**; when on, bind **0.0.0.0** so tablets on the same LAN can reach the dashboard.
- **HTTP Basic Auth** + **IP allowlist** for **non-loopback** clients; **localhost** requests bypass these checks so the desktop shell is unaffected.
- **WebSocket** compatibility — Opaque token query param for browsers that cannot send Basic auth on WS upgrade (see comments in `main.js`).

Full trust model: still documented in **[SECURITY.md](./SECURITY.md)**.

---

## G. Smart suggestions — hosted AI vs local BYOK

| Track | Description |
|-------|-------------|
| **Hosted AI Farm Manager** | Electron proxies to your VPS (`/api/farmdash-ai/...`); integration key, tiers, snapshot push — see `DEVELOPER_HANDOVER.md`. |
| **Local BYOK** | **`localConsultantLlm.js`** — Calls **Gemini or OpenAI directly from the Node side** with user-provided keys; keys are **not** sent to your server for those calls. Default Gemini model avoids deprecated **`gemini-1.5-flash`** (use current IDs such as **`gemini-2.0-flash`** or env overrides). |

**Transcript / product themes:**

- BYOK should **not force** use of your VPS when the player brings their own key.
- **503 / quota** issues drove **model list** UX (dropdown of models available to the key) and **Save** affordances in settings.
- **Payload size** — Requests use **pruned / view-scoped** snapshots (`consultantSnapshotPrune.js` on app side; mirrored logic in Python `snapshot_pruner.py` for AI server); field-map mode caps rows (`MAX_FIELD_MAP_ROWS` in `localConsultantLlm.js`).
- **Single line per field** — UI shows **only `message`** on field cards (not a second `reasoning` paragraph); **`consultant.py`** prompts instruct the model to put content in **`message`** and leave **`reasoning`** empty for field-map mode — saves tokens and avoids duplicate “Ben: … Ben: …” styling.
- **NPC names (Ben, Katie, …)** — Restored mentor **name list / personalization** in prompts after tightening duplicate lines (transcript: “characters like ben and katei”).
- **Insight caching** — In-browser and **disk** cache (`consultant-disk-cache.js`, TTL-aligned refresh in `ai-farm-consultant-insights.js`) to avoid redundant work.

**Gemini routing (server-side VPS):** Key pool, per-request rotation, model rollover, 429/503 handling — **[LLM_GEMINI_ROUTING.md](./LLM_GEMINI_ROUTING.md)**.

---

## H. AI Farm Manager backend (FastAPI) — security & ops

Documented in **[AI_SERVER_SECURITY.md](./AI_SERVER_SECURITY.md)** and reflected in code:

- **`GET /`** (farm snapshot HTML) — Optional **`REQUIRE_AUTH_FOR_ROOT_HTML`** aligning with integration routes.
- **`/health` / `/healthz`** — Optional **`HEALTH_RESPONSE_DETAIL=minimal`** for anonymous scanners; full detail available when authenticated as documented.
- **CORS** — **`CORS_ORIGINS=*`** pairs with **`allow_credentials=false`** (browser-safe).
- **Shared auth** — **`app/deps/integration_auth.py`**: `require_integration_or_admin`, `resolve_root_html_auth`; **query-string secrets** are **not** accepted for integration auth (header Basic / `X-FarmDash-Key` as implemented).

Other session work touched **strict dependency pins**, **health endpoint behaviour**, and **integration** hardening — confirm `backend/requirements.txt` and `app/main.py` in your deploy branch.

---

## I. Data freshness, FTP, and offline behaviour

Themes from transcripts and code:

- **FTP XML cache** under `%APPDATA%\fs25-farm-dashboard\ftpXmlCache\...` with logging when files are missing mid-save (retry behaviour).
- **Merged snapshot disk cache** — Log lines like *“Restored last merged snapshot from disk (use until live Lua/XML return)”* — show-last-good-data when the game/server is **paused** or offline; pairs with timestamps in the dashboard payload.
- **`DASHBOARD_SERVER_ID` / `serverId`** matching — Push/consultant logs warned when **server id** from the environment does not match RAM — configuration must stay consistent across Farm Dashboard and AI server.

---

## J. In-game chat (“Hank”) and multiplayer

Transcript themes: **Lua HTTP** to VPS (`!hank`), **`curl_tmp_open_failed`** / write-mode restrictions — fixes align **backend URL** (HTTPS, no trailing slash) and **Giants FS write rules** for temporary files. See **[AI_IN_GAME_CHAT.md](./AI_IN_GAME_CHAT.md)**.

---

## K. Field / forage / hay (`DRYGRASS_WINDROW`)

**No new mod feature is claimed for 3.0.0 from the hay discussion alone.** The existing mod already exports **`windrowByFillName`**, **`hasLooseHayWindrow`**, **`looseDryGrassWindrowLiters`**, etc., for **DRYGRASS_WINDROW** / **HAY** (see `FieldDataCollector.lua` and `rules-engine.js`). A dedicated “hay on field” dashboard feature was **deferred** in chat (“leave this for now”).

---

## L. Known limitations & follow-ups

- **Mod version** — Still **2.0.0.0** unless you bump `modDesc.xml` for a new mod release.
- **`npm audit`** — Transitive Electron/electron-builder advisories may remain; upgrade on a tested schedule.
- **FTP** — Hosted saves may still lack some XML files mid-write; polling and retries are best-effort.
- **Git history** — Attach **`git log` / file stats** from your real **FarmHub** repo when publishing on GitHub for machine-verifiable completeness.

---

## M. Files to attach on GitHub Release **3.0.0**

- **`FS25 Farm Dashboard Setup 3.0.0.exe`** (from `npm run dist` default output under `%LOCALAPPDATA%\fs25-farm-dashboard-electron-out` or your CI path).
- **`FS25_FarmDashboard_Mod.zip`** — If unchanged, you may **re-attach the 2.0.0.0 mod zip** or note “mod unchanged since 2.0.0.0”.

---

## N. Credits

**JoshWalki** / **WizardlyPayload** — see **[AUTHORS.md](./AUTHORS.md)**.

---

## Documentation map (3.0.0)

| Need | File |
|------|------|
| Short GitHub Release paste | [RELEASE_NOTES.md](./RELEASE_NOTES.md) |
| Full version history | [CHANGELOG.md](./CHANGELOG.md) |
| Stack architecture | [DEVELOPER_HANDOVER.md](./DEVELOPER_HANDOVER.md) |
| Desktop LAN trust | [SECURITY.md](./SECURITY.md) |
| VPS AI hardening | [AI_SERVER_SECURITY.md](./AI_SERVER_SECURITY.md) |
| Gemini routing | [LLM_GEMINI_ROUTING.md](./LLM_GEMINI_ROUTING.md) |

This file — **narrative + transcript-informed** release story for **3.0.0**.

---

## Follow-up: **3.1.0** (OpenAI-compatible / Ollama / LAN)

Subsequent work adds **local and LAN OpenAI-compatible** LLM support (e.g. **Ollama** on TrueNAS), **`OPENAI_BASE_URL`** on AI Farm Manager, BYOK provider **Local / OpenAI-compatible** in the desktop app, and HTTP header **`X-AI-OpenAI-Base-URL`**. It does **not** replace the **3.0.0** behaviours above.

| Need | File |
|------|------|
| **3.1.0** changelog + file manifest | [CHANGELOG.md §3.1.0](./CHANGELOG.md) |
| Technical reference | [LLM_OPENAI_COMPATIBLE.md](./LLM_OPENAI_COMPATIBLE.md) |
| Release notes paste | [RELEASE_NOTES.md](./RELEASE_NOTES.md) |
