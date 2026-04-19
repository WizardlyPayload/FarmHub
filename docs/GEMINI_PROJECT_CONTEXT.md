# FarmHub — Full project context for planning (Gemini / external AI)

**Purpose:** Single document to feed into Gemini (or any planner) so it can propose a roadmap, architecture changes, or debugging steps **without** prior chat history.

**Repository:** `FarmHub` — FS25 Farm Dashboard (Electron + web + Lua mod) + optional **AI Farm Manager** (FastAPI).  
**Current versions (typical):** App **3.1.0**, mod **2.0.0.0** (see root `README.md` / `package.json` / `modDesc.xml`).

**Deeper technical handover:** [DEVELOPER_HANDOVER.md](./DEVELOPER_HANDOVER.md) (architecture diagram, router list, performance, key files).  
**Doc index:** [README.md](./README.md).

---

## 1. Business / product intent

- **Farm Dashboard:** Real-time browser dashboard for **Farming Simulator 25**: fields, vehicles, animals, economy, weather, etc.
- **Data sources:** In-game **Lua mod** writes live JSON to disk; the **Electron app** reads it, optionally merges with **savegame XML** (local paths or **FTP** for dedicated servers).
- **Smart suggestions:** Optional **LLM-backed** tips (hosted server and/or **BYOK** OpenAI/Gemini and/or **Ollama** on LAN). Tiered: rules/heuristics (basic) → BYOK (mid) → hosted AI (premium).
- **AI Farm Manager (optional SaaS):** FastAPI backend on a VPS: receives **pushed snapshots** from the desktop app (no inbound ports on the gaming PC), runs consultant/insights, optional in-game chat (**Hank** / `!hank`), admin UI, per-tenant FTP polling of dashboard JSON.

---

## 2. Repository layout (high level)

| Path | Technology | Role |
|------|------------|------|
| `FS25_FarmDashboard_Mod/FS25_FarmDashboard_Mod/` | Lua (FS25) | In-game data collection; writes `data.json` under user profile |
| `FS25_FarmDashboard_App/FS25_FarmDashboard_App/` | Electron, Express, vanilla JS | Local HTTP API (~**8766**), web UI, file watchers, FTP sync, merge pipeline, IPC to renderer |
| `AI_Farm_Manager/backend/` | Python FastAPI | Integration API, consultant, chat, admin, snapshot RAM store, Docker deploy |
| `docs/` | Markdown | User manual, security, LLM routing, changelogs, **this file** |

**Note:** Web assets folder is spelled `web/assests/` (historic typo).

---

## 3. End-to-end data flows

### 3.1 Local single-player / LAN

1. FS25 runs with **FarmDashboard** mod enabled.
2. Mod periodically writes  
   `Documents/My Games/FarmingSimulator2025/modSettings/FS25_FarmDashboard/<savegameN>/data.json`.
3. Electron **watches** that file (and may read savegame XML from the same save folder).
4. **`dataMerger.js`** merges Lua JSON + XML (fields gain stable IDs, fruit hints, etc.).
5. Express serves **`/api/data`**, **`/api/fields`**, etc.; web UI polls (e.g. **5s**).
6. **Rules engine** (`rules-engine.js`) provides **Layer 1** “Suggested next step” on Fields from merged JSON (windrow, bales, harvest, etc.).

### 3.2 FTP / dedicated server

- App can sync remote savegame XML via **FTP** into a cache dir and merge the same way (multi-**serverId** / slot).

### 3.3 Hosted AI (outbound only from gaming PC)

1. User configures **Settings → AI Farm Manager → Hosted AI:** **base URL** (API **origin** only, no `/health` path), **link key** (`X-FarmDash-Key`), **Send farm data** (push).
2. Electron **`POST`** merged snapshot to AI server **`/api/integration/push-snapshot`** (throttled, e.g. min interval between pushes).
3. AI server stores snapshot in RAM keyed by **connection bucket** + **serverId**; consultant routes use the same identity.
4. Browser calls **local** Express proxy → AI **`GET`** consultant insights (same URL + key as main process).

**Auth model:** Server accepts header **`X-FarmDash-Key`** matching **`FARMDASH_INTEGRATION_KEY`** or **`SERVER_TOKEN`** env, or a key from **Admin → Client connections** (`connection_registry`). Push also requires server **`DASHBOARD_PUSH_MODE=1`** (otherwise **503**, not 401).

---

## 4. Major subsystems

### 4.1 Electron main process (`main.js`)

- Starts **Express** on `127.0.0.1:8766`, **WebSocket** for LAN tablets (optional).
- **electron-store** persistence: servers, FTP, AI connection, BYOK, UI prefs, locale.
- **Branding:** optional `branding.json` / installer embed: default AI URL, embedded integration key, push defaults.
- **Single resolver** `resolveAiManagerConnectionForHttp()` — must match proxy, snapshot push, and IPC (avoid UI showing one key while push sends another).
- **IPC** (`preload.js` → `window.farmDashAPI`): config, AI save/load, **test hosted connection** (GET `/api/integration/overview`), mod XML install, BYOK, etc.

### 4.2 Web UI (`web/`)

- SPA shell: `index.html`, modules under `web/assests/js/`.
- **Smart suggestions:** `ai-farm-consultant-insights.js` — calls local proxy, handles tiers, errors, Fields special case.
- **Hosted AI panel:** `ai-farm-bot-panel.js` — URL, key, push checkbox, **Test server & link key**, in-game chat install.
- **Fields:** `modules/fields.js` + **rules-engine.js** (local heuristics); `field-consultant-bridge.js` for map-level LLM context.

### 4.3 Merge layer (`dataMerger.js`)

- Combines **Lua field rows** with **XML** rows. Must match keys consistently (**`farmlandId`** vs internal **`id`**); dual lookup was added so live-only metrics (bales, windrows) are not dropped when IDs diverge.

### 4.4 Lua mod (`FieldDataCollector.lua`, etc.)

- Exports per-field: growth, weeds, **windrow** stats (`DensityMapHeightUtil` probes), **bale counts** (world scan + farmland mapping), suggestions array.
- **Config:** `modSettings/FS25_FarmDashboard/config.xml` (not `Documents/My Games/config.xml`).
- **Known subtlety:** `Field:getId()` vs **farmland parcel id** can differ on some maps; bale tallies must use the same id the UI uses (“Field N”). Windrow/bale detection can miss edge cases (grid sampling, boundary bales).

### 4.5 AI Farm Manager backend

- **FastAPI** `app/main.py`: CORS, gzip, lifespan (encryption, optional FTP poll).
- **Routers:** `integration.py` (overview, push-snapshot, config XML, instances), `consultant.py`, `chat.py`, `admin_routes.py`, etc.
- **`integration_auth.py`:** integration key + optional HTTP Basic admin; reads header from ASGI request; optional 401 diagnostic logging.
- **`connection_registry.py`:** multi-tenant client keys, optional per-client dashboard JSON URL / server id routing.
- **`snapshot_push_service.py`:** RAM store for pushed JSON; gated by env.
- **Deploy:** `docker-compose.yml`, needs **`ENCRYPTION_KEY`**, admin password, integration keys — see `AI_Farm_Manager/README.md`.

---

## 5. Tech stack summary

| Area | Stack |
|------|--------|
| Desktop app | Electron ~29, electron-store, express, ws, basic-ftp, electron-updater |
| Web UI | Vanilla JS (no React), Bootstrap, i18n JSON |
| Game mod | Lua FS25 API |
| AI backend | Python 3, FastAPI, Jinja2 admin, optional Gemini/OpenAI/Ollama |
| Data on disk | JSON, XML (savegame), optional encrypted `bot_servers.json` on server |

---

## 6. Common failure modes (from production debugging)

| Symptom | Typical cause |
|---------|----------------|
| **404** on hosted AI | Base URL included a **path** (`/health`, `/admin`). Must be **origin only** (`scheme://host:port`). |
| **401** on push or overview | **Link key** on client ≠ **`FARMDASH_INTEGRATION_KEY`** / **`SERVER_TOKEN`** / registered client key on server. Or wrong deployment (old env). |
| **503** on push | **`DASHBOARD_PUSH_MODE`** not enabled on server. |
| **Nothing on AI port / crash loop** | Missing **`ENCRYPTION_KEY`** or misconfigured Docker env (see AI README). |
| **Smart suggestions empty** | No local snapshot yet, BYOK misconfigured, hosted key wrong, or LLM error — app shows tier-specific fallbacks. |
| **Bales/windrows in JSON but not UI** | Farm filter (unowned fields hidden); merge key mismatch (mitigated by dual lookup); or Lua actually exported zeros (detection/position). |
| **Ollama / BYOK JSON errors** | Model output not valid JSON — user may fall back to hosted if configured. |

---

## 7. Security notes (short)

- Renderer: **no NodeIntegration**; **`preload.js`** exposes a **fixed IPC API** only.
- Public AI deploys: see [AI_SERVER_SECURITY.md](./AI_SERVER_SECURITY.md) — health detail leakage, CORS, etc.
- LAN access: optional Basic Auth + allowlist — [SECURITY.md](./SECURITY.md).

---

## 8. Open / evolving work (non-exhaustive)

- **Bale detection robustness:** Ensure all ground bales increment `baleCountOnField` for the correct farmland id across maps; optional extra enumeration paths; `debugBaleScan` in mod config for logs.
- **Hosted onboarding:** Reduce friction when installer embeds an outdated key (user must paste new key — UI supports override + test).
- **Multi-dashboard / isolation:** `connection_registry` + per-bucket snapshots — continue hardening routing and admin UX.
- **Ollama / local LLM:** Documented in [LLM_OPENAI_COMPATIBLE.md](./LLM_OPENAI_COMPATIBLE.md); consultant must handle malformed model output gracefully.

---

## 9. Suggested prompts for Gemini (after reading this doc)

Use variants of:

1. *“Given GEMINI_PROJECT_CONTEXT.md, list the top 5 risks when scaling hosted AI to many tenants and concrete mitigations in this codebase.”*
2. *“Propose a phased plan to harden bale/windrow detection in FieldDataCollector.lua and validate via data.json + dashboard rules-engine invariants.”*
3. *“Map every env var required for a minimal Docker deploy of AI_Farm_Manager and the matching Farm Dashboard settings fields.”*
4. *“Identify redundant or confusing code paths between BYOK, Ollama, and hosted consultant in the Electron app and suggest a single abstraction (no code yet).”*

---

## 10. Key file index (quick)

| File | Why it matters |
|------|----------------|
| `FS25_FarmDashboard_App/.../main.js` | Express routes, merge, FTP, AI proxy, push, IPC handlers |
| `FS25_FarmDashboard_App/.../preload.js` | `farmDashAPI` surface |
| `FS25_FarmDashboard_App/.../dataMerger.js` | Lua + XML merge |
| `FS25_FarmDashboard_App/.../web/assests/js/ai-farm-bot-panel.js` | Hosted AI UI + test connection |
| `FS25_FarmDashboard_App/.../web/assests/js/ai-farm-consultant-insights.js` | Smart suggestions client |
| `FS25_FarmDashboard_App/.../web/assests/js/rules-engine.js` | Local field suggestions |
| `FS25_FarmDashboard_Mod/.../FieldDataCollector.lua` | Field metrics, bales, windrows, Lua suggestions |
| `AI_Farm_Manager/backend/app/main.py` | FastAPI entry |
| `AI_Farm_Manager/backend/app/deps/integration_auth.py` | Farm Dashboard key auth |
| `AI_Farm_Manager/backend/app/routers/integration.py` | Push-snapshot, overview |
| `AI_Farm_Manager/backend/app/services/connection_registry.py` | Multi-client keys |

---

*Last updated: consolidated for external planning — align with `DEVELOPER_HANDOVER.md` if they diverge.*
