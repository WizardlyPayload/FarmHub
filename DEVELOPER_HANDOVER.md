# FarmHub — Developer handover

This document describes the **FarmHub** workspace: the **FS25 Farm Dashboard** (Electron/desktop + embedded web UI) and the **AI Farm Manager** backend (FastAPI on a VPS or local machine). It is intended for onboarding, audits, and maintenance.

**Deep dive (Gemini):** [docs/LLM_GEMINI_ROUTING.md](docs/LLM_GEMINI_ROUTING.md)

| § | Topic |
|---|--------|
| [1](#1-high-level-architecture) | Architecture diagram |
| [2](#2-repository-layout-farmhub) | Repository layout |
| [3](#3-fs25-farm-dashboard-frontend) | Farm Dashboard (Electron + web) |
| [4](#4-ai-farm-manager-backend) | AI Farm Manager backend, routers, consultant, **LLM** |
| [5](#5-cross-system-data-flow-consultant) | Consultant data flow |
| [6](#6-deployment-notes) | Deployment |
| [7](#7-performance-changes-audit) | Performance audit table |
| [8](#8-debugging-checklist) | Debugging |
| [9](#9-key-files-quick-reference) | Key files |
| [10](#10-ownership--conventions) | Conventions |

---

## 1. High-level architecture

```mermaid
flowchart LR
  subgraph game [FS25 Game]
    Mod[FarmDashboard Mod / Lua]
  end
  subgraph pc [Gaming PC]
    DashHTTP[Local HTTP API e.g. :8766]
    Electron[Electron App]
  end
  subgraph vps [VPS / Coolify]
    AI[AI Farm Manager FastAPI :8000]
    FTP[FTP / JSON ingest optional]
  end
  Mod --> DashHTTP
  Electron --> DashHTTP
  Electron -->|push snapshot + key| AI
  AI -->|fetch dashboard JSON| FTP
  AI -->|Gemini / OpenAI| LLM[LLM APIs]
```

- **Game → mod** exposes farm state over HTTP (fields, vehicles, animals, economy, etc.).
- **Electron** loads the web UI (`web/index.html`), talks to the **local** dashboard API, and optionally **POSTs** merged snapshots to **AI Farm Manager** (`/api/integration/push-snapshot` or similar) so the AI server does not need inbound access to the gaming PC.
- **AI Farm Manager** stores the latest JSON in RAM (per `serverId`), runs **consultant insights**, **in-game chat** (**Hank** — default trigger `!hank` via `TRIGGER_PREFIX` / mod XML), and admin tools.

---

## 2. Repository layout (`FarmHub/`)

| Path | Role |
|------|------|
| `FS25_FarmDashboard_App/FS25_FarmDashboard_App/` | Electron shell, `main.js`, `package.json`, preload, **web UI** under `web/` |
| `FS25_FarmDashboard_Mod/FS25_FarmDashboard_Mod/` | In-game Lua: `FieldDataCollector.lua` (fields + windrow/bale hints for JSON) |
| `FS25_FarmDashboard_App/.../web/assests/js/` | Dashboard JS (note historic typo **assests**) |
| `FS25_FarmDashboard_App/.../web/index.html` | Main SPA shell: landing, navbar, **Smart suggestions** row, section containers |
| `AI_Farm_Manager/backend/` | FastAPI app (`app/main.py`, `app/routers/`, `app/services/`) |
| `AI_Farm_Manager/docker-compose.yml` | Typical VPS deploy for the AI server |

Supporting / integration:

- `dataMerger.js` — merges streams for the dashboard (referenced from Electron flows as applicable).
- `branding.example.json` — white-label defaults for the Electron app.

---

## 3. FS25 Farm Dashboard (frontend)

### 3.1 Entry and modules

- **`web/assests/js/app.js`** (ES module) imports feature modules and attaches behaviour to `LivestockDashboard` / `window.dashboard`.
- **`navigation.js`** — section routing (`showLanding`, `showSection`), hash sync, **Smart suggestions row visibility** (`updateSmartSuggestionsRowVisibility`).
- **`realtime-connector.js`** — polls local dashboard API on an interval (default **5s** for `/api/data`-style updates) and updates `window.dashboard` state.
- **`apiStorage.js`** — farm folder / legacy file flows; also toggles visibility of landing vs dashboard sections.

### 3.2 AI / consultant (browser)

| File | Purpose |
|------|---------|
| `ai-farm-consultant-insights.js` | **Smart suggestions** panel: `GET {AI}/api/v1/consultant/insights` with `serverId`, `farmId`, `view=…`. Handles **stale response** discard when the user changes section mid-flight, **Fields tab** special case (no second LLM call — uses per-field map), **in-flight guard** to avoid overlapping GETs, **Refresh** forces a new run. |
| `field-consultant-bridge.js` | ES module: **field map** consultant (`context=fields`), throttling (`MIN_INTERVAL_MS` 8 min), farm cache, `window.__fieldConsultantByRef`, events `field-consultant-updated` / `field-consultant-loading`. |
| `ai-farm-bot-panel.js` | Robot panel: AI server URL, integration key, BYOK, instance enablement. |
| `dash-ai-debug.js` | Debug logging hooks. |
| `modules/fields.js` | Fields section UI; **5s** refresh for `/api/fields`; renders per-field AI lines via bridge. |
| `rules-engine.js` | **Layer 1** local suggestions (`getLocalFieldSuggestion`) — swath/bale priority pipeline; used by `fields.js`. |

**Script load order (see `index.html`):** pipeline helpers → realtime → **ai-farm-bot-panel** → **`app.js` (module)** → **deferred** `ai-farm-consultant-insights.js` so `window.pickDoThisFirstFromFieldInsights` exists after the bridge module loads.

### 3.3 Smart suggestions `view` mapping

- Home / dashboard → `view=home` (top 3 farm priorities).
- Fields, vehicles, pastures, livestock, productions, economy → matching `view`.
- Fields tab panel uses **client-side ranking** from `__fieldConsultantByRef` (no duplicate `GET` for that tab).

### 3.4 Layer 1 rules (`rules-engine.js`) — offline field heuristics

- **`getLocalFieldSuggestion(field)`** — single “Suggested next step” string for the Fields UI when the AI layer is unavailable. Evaluates in **fixed priority order** (see file header): withered → **harvest** → **swath/windrow** (cereal straw vs grass copy) → **bale removal** (strict integer `baleCountOnField` / `baleCount` / `bales.length`, no thresholding) → PF soil scan → mulched stubble → lime → post-harvest / fallow tillage → seed → roll → weed → fertiliser → generic `needsWork`.
- **Windrow / swath:** `aggregateWindrowDetected(field)` treats any of `hasWindrow`, `windrowLiters` / `windrowArea` &gt; 0, or positive entries in `windrowSamples` / `windrowPerStrip` as whole-field evidence (not a single-point check).
- **Bales on field:** **`getBaleCountStrict`**; optional **`countBalesIntersectingFieldPolygon(field, balesWorld)`** if the payload exposes world bales plus a `polygon` / `boundary` on the field.
- **Cereal straw copy** uses **`xmlFruitTypeHint`** (from merged `fields.xml` fruit) when the live Lua fruit is empty after harvest so wheat/barley/oat straw is still recognised.
- **Lua mod** (`FS25_FarmDashboard_Mod/.../FieldDataCollector.lua`) exports per-field **`windrowLiters`**, **`windrowArea`**, **`windrowSamples`**, **`hasWindrow`**, **`baleCountOnField`** (bales counted via `g_farmlandManager` + `g_baleManager` when present). **`dataMerger.js`** merges these from Lua into the field row and adds **`xmlFruitTypeHint`** from XML.

### 3.5 Performance characteristics (UI)

| Area | Default | Tuning / notes |
|------|---------|----------------|
| Realtime poll | 5s | `realtime-connector.js` — increasing interval reduces CPU/network feel on weak machines. |
| Fields section poll | 5s | `fields.js` — same trade-off. |
| **Payload dedupe** | On | HTTP poll skips `handleRealtimeData` when `JSON.stringify` of `/api/data` (minus `timestamp`) + farm + server id matches the previous poll — avoids DOM churn when nothing changed. **`RealtimeConnector.refreshHttpDataNow()`** or **`clearPayloadDedupeCache()`** forces the next fetch to apply (manual refresh / farm switch). |
| Smart suggestions interval | 5 min | `REFRESH_MS` in `ai-farm-consultant-insights.js` (background polls omit the skeleton). |
| Field consultant throttle | 8 min | `MIN_INTERVAL_MS` in `field-consultant-bridge.js`. |
| Insight row MutationObserver | ~950ms debounce | Reduces duplicate refreshes when the row is shown/hidden quickly. |
| Overlapping insight GETs | Blocked | `insightsFetchInFlight` unless **Refresh** (`forceRefresh=true`). Navigation calls **`refreshFarmDashConsultantInsights(true)`** so the panel shows loading immediately. |

**Sluggishness** is often (a) **LLM latency** on the server, (b) **many parallel** insight triggers before guards, (c) **large** dashboard JSON over slow links — the in-flight guard, debounce, and payload dedupe address (b) and idle DOM work.

---

## 4. AI Farm Manager (backend)

### 4.1 Entry

- **`app/main.py`** — FastAPI app, **lifespan**: encryption/bootstrap, optional **FTP poll**, **startup LLM probe**, **shutdown** closes shared Gemini HTTP client.
- **CORS** from `CORS_ORIGINS` in settings.
- **GZip** middleware compresses responses **≥800 bytes** (helps large JSON from admin/integration).

### 4.2 Routers (high level)

| Router | Prefix | Notes |
|--------|--------|------|
| `chat` | `/api/chat/...` | In-game **Hank** (`!hank`): **multiplayer only** (host/dedicated/rented server). Not used in single-player career — see `AI_Farm_Manager/docs/IN_GAME_CHAT_BOT.md` |
| `admin_routes` | `/admin` | HTML admin, env, LLM test |
| `integration` | `/api/integration` | Push snapshot, instances, keys, **`GET /gemini-models`** (Google ListModels) |
| `consultant` | `/api/v1/consultant` | **GET /insights** — Smart suggestions / farm insights |
| `mod_config_download` | `/api/mod/...` | Mod XML download when configured |

### 4.3 Consultant pipeline

1. **Load snapshot** — from in-memory push buffer (preferred) or FTP/`DASHBOARD_JSON_URL` (`consultant.py` + `dashboard_service.py`).
2. **Resolve farm** — `prune_snapshot_to_active_farm`, `farmId` query vs `activeFarmId`.
3. **Prune by `view`** — `snapshot_pruner.prune_snapshot_for_dashboard_view`:
   - `home` → `prune_snapshot_home_overview` (multi-domain compact JSON for “top 3”).
   - `fields`, `vehicles`, etc. → section-specific slices.
4. **`generate_farm_insights`** (`consultant.py`) — optional **production-fill heuristics** (scoped/skipped per view), then **Gemini** JSON response, merge/dedupe, cap **3** for `VIEW MODE — home`. **LLM result cache:** `cachetools.TTLCache` (~10 min, bounded size) keys on SHA-256 of pruned snapshot + `serverId` / `farmId` / `view` / `context` / `fieldRef` + system-prompt hash — avoids repeat Gemini calls when the farm JSON is unchanged (see `_consultant_llm_cache_key`).
5. **LLM** — `llm_service.gemini_consultant_post_with_quota_fallback` (Gemini) or OpenAI path when `LLM_PROVIDER=openai`.

### 4.4 LLM / Gemini (`app/services/llm_service.py`)

**Authoritative detail:** [docs/LLM_GEMINI_ROUTING.md](docs/LLM_GEMINI_ROUTING.md) — key order, model stack, 429/503, BYOK, and how this differs from `active_gemini_api_key()` in `config.py`.

Summary:

| Topic | Behaviour |
|--------|-----------|
| **Key pool** | `GEMINI_API_KEY`, `GEMINI_API_KEYS`, `GEMINI_API_KEY_2`… merged and **deduplicated** in `config.py`. |
| **Per-request key order (multi-key)** | **Strict round-robin:** a thread-safe counter rotates which key is tried **first** on each new `generateContent` request so concurrent bursts spread load. |
| **BYOK / single key** | Only one key in settings → no key rotation; that key still uses the **full model stack** on 429/503. |
| **Models** | **`GEMINI_MODEL_ROLLOVER`:** comma list, **first = best**. Unset → built-in default chain in code. **`0` / `off` →** only **`GEMINI_MODEL`**, no stepping down. **Each new request** starts from the best model again (no cross-request “sticky” downgrade). |
| **429 / 503** | Same key → next model in the rollover list; if exhausted → **next key** (wrapped order) and **restart models from best**. Last key, still 429 → optional `Retry-After` sleep + one retry. |
| **HTTP client** | Single shared **`httpx.AsyncClient`** (`gemini_http_client.py`) for keep-alive to Google. |
| **Budget** | Optional per-key caps via `gemini_budget.py` (`GEMINI_BUDGET_*`). |

**Separate mechanism:** `active_gemini_api_key(settings)` in `config.py` uses **wall-clock time** and **`GEMINI_ROTATION_WINDOW_SEC`** to pick one “active” key for **ListModels** (`GET /api/integration/gemini-models`) and helpers — it does **not** replace round-robin for chat/consultant `generateContent` calls.

### 4.5 Important environment variables (AI server)

| Variable | Purpose |
|----------|---------|
| `LLM_PROVIDER` | `gemini` or `openai` |
| `GEMINI_API_KEY`, `GEMINI_API_KEY_2`, … | Gemini key pool |
| `GEMINI_MODEL` | Single model when **`GEMINI_MODEL_ROLLOVER`** is off |
| `GEMINI_MODEL_ROLLOVER` | Comma-separated IDs (best first), or `0`/`off` for `GEMINI_MODEL` only |
| `GEMINI_ROTATION_WINDOW_SEC` | Time window for **`active_gemini_api_key`** (ListModels / diagnostics), not for per-request RR |
| `GEMINI_REST_API_VERSION` | `v1` / `v1beta` |
| `DASHBOARD_JSON_URL` / FTP | Ingest dashboard JSON if not using push |
| `FARMDASH_INTEGRATION_KEY` / `X-FarmDash-Key` | Farm Dashboard → AI auth |
| `CORS_ORIGINS` | Browser origins if not `*` |

See `app/config.py` for the full merged settings dict.

---

## 5. Cross-system data flow (consultant)

1. Electron stores **AI base URL** + **integration key** (localStorage / IPC).
2. `GET /api/v1/consultant/insights?serverId=…&farmId=…&view=…` with header `X-FarmDash-Key`.
3. Backend resolves **that PC’s** pushed JSON (or FTP) and runs one LLM call (after pruning).

**Performance:** LLM time dominates (often **2–30+ seconds** on free tiers). Server-side **insight cache** and client **payload dedupe** reduce repeat work; client guards prevent overlapping insight GETs.

### V3 agronomy / consultant prompts

The **Smart suggestions** and field-map consultant behaviour come from **`app/services/consultant.py`**: FS25 mentor voices, mechanics block, `VIEW MODE` section prompts, and field-map / single-field system strings. Treat this as the current **V3** agronomy prompt set for maintenance and audits.

---

## 6. Deployment notes

- **AI Farm Manager:** Docker/Coolify using `AI_Farm_Manager/docker-compose.yml`; set env vars there; expose HTTPS; health checks if configured.
- **Farm Dashboard app:** `npm` scripts in `FS25_FarmDashboard_App/FS25_FarmDashboard_App/package.json` (build Electron as per your pipeline).
- **Secrets:** Never commit real API keys; use host env or encrypted bot storage (`encryption.py`, `bot_servers.json` patterns).

---

## 7. Performance changes (audit)

| Layer | Change |
|-------|--------|
| **Backend** | Shared **`httpx.AsyncClient`** for all Gemini `generateContent` calls (keep-alive). |
| **Backend** | **GZip** middleware for compressible responses. |
| **Backend** | **Pre-create** HTTP client at startup (`get_gemini_async_client()` in lifespan). |
| **Backend** | **Consultant LLM cache** — `cachetools.TTLCache` (~10 min, max ~512 entries); keys hash pruned snapshot + scope; evicts by TTL and cap (**no** unbounded growth). |
| **Backend** | **Gemini routing** — multi-key: **round-robin** start index per request; **429/503:** step through **`GEMINI_MODEL_ROLLOVER`** (best→fallback) on each key before rotating keys; BYOK uses one key + same model stack ([docs/LLM_GEMINI_ROUTING.md](docs/LLM_GEMINI_ROUTING.md)). |
| **Frontend** | **`/api/data` dedupe** — skip `handleRealtimeData` when merged JSON (no `timestamp`) + farm/server unchanged; **`refreshHttpDataNow()`** bypasses dedupe for a forced refresh. |
| **Frontend** | **In-flight guard** + **`.then(done, done)`** cleanup for consultant GET. |
| **Frontend** | **Refresh** / **navigation** use **`forceRefresh`** on insights so loading state shows; background 5 min poll does not flash skeleton. |
| **Frontend** | **Observer debounce** ~**950ms** when showing the insights row. |

### 7.1 Further ideas (optional)

- Raise realtime/fields poll intervals on low-power PCs (trade freshness for CPU).
- CDN/cache for static assets in Electron (often already local).
- **v1beta** + JSON MIME for Gemini if stable for your models (consultant already has MIME retry logic).

End-user BYOK setup: **`AI_Farm_Manager/docs/BYOK_GUIDE.md`**.

---

## 8. Debugging checklist

| Symptom | Where to look |
|---------|----------------|
| 429 / rate limits | Server logs (`Gemini HTTP 429`), `gemini_budget.py`, add keys or shorten **`GEMINI_MODEL_ROLLOVER`** (drop heavy preview models). See [docs/LLM_GEMINI_ROUTING.md](docs/LLM_GEMINI_ROUTING.md). |
| Wrong farm data | `serverId` / `farmId` query mismatch vs push buffer (`push_resolve` logs). |
| Fields AI empty | `field-consultant-bridge` — `category` must be Field + `field_ref`; consultant `context=fields` filter. |
| Smart panel stale | `ai-farm-consultant-insights.js` stale-check vs `getCurrentDashboardSection()`. |
| Slow first LLM after restart | Cold start + Google latency — expected; HTTP reuse helps **subsequent** calls. |

---

## 9. Key files quick reference

| File | Responsibility |
|------|----------------|
| `AI_Farm_Manager/backend/app/main.py` | App factory, lifespan, gzip, routers |
| `AI_Farm_Manager/backend/app/services/llm_service.py` | Gemini POST, keys, models, chat |
| `AI_Farm_Manager/backend/app/services/gemini_http_client.py` | Shared async HTTP client |
| `AI_Farm_Manager/backend/app/services/consultant.py` | Prompts, `generate_farm_insights`, heuristics |
| `AI_Farm_Manager/backend/app/services/snapshot_pruner.py` | JSON size / view pruning |
| `AI_Farm_Manager/backend/app/routers/consultant.py` | `GET /insights` |
| `FS25_FarmDashboard_App/.../ai-farm-consultant-insights.js` | Smart panel client |
| `FS25_FarmDashboard_App/.../field-consultant-bridge.js` | Per-field consultant map |
| `FS25_FarmDashboard_App/.../modules/navigation.js` | Section + insights row visibility |
| `FS25_FarmDashboard_App/.../rules-engine.js` | Layer 1 local field suggestions (swath / bales / priority order) |
| `FS25_FarmDashboard_Mod/.../FieldDataCollector.lua` | Live field JSON + windrow/bale exports for rules |

---

## 10. Ownership / conventions

- **Python:** FastAPI, Pydantic schemas under `app/schemas/`.
- **JS:** Mix of ES modules (`app.js`, `field-consultant-bridge.js`) and IIFE scripts (`ai-farm-consultant-insights.js`) loaded from `index.html`.
- **Naming:** Dashboard asset path typo **assests** is entrenched; changing it would require updating every reference.

---

*Maintenance: update when you add routes, env vars, deployment steps, or change LLM routing (see [docs/LLM_GEMINI_ROUTING.md](docs/LLM_GEMINI_ROUTING.md)).*
