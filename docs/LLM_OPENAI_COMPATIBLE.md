# AI Farm Manager & Farm Dashboard — OpenAI-compatible / local LLM (Ollama, vLLM, LAN)

This document describes **OpenAI-compatible HTTP APIs** used when you point the stack at a **local or LAN server** (e.g. **Ollama** on TrueNAS) instead of **OpenAI’s cloud** or **Google Gemini**. It complements:

- **[LLM_GEMINI_ROUTING.md](./LLM_GEMINI_ROUTING.md)** — Gemini-only key/model rotation (unchanged).
- **[AI_FARM_MANAGER_BYOK.md](./AI_FARM_MANAGER_BYOK.md)** — BYOK concepts; now includes **Local / OpenAI-compatible** in the desktop app.

Gemini routing and quotas **do not** apply to these paths. `LLM_PROVIDER` stays **`openai`** for the OpenAI SDK path; the **base URL** selects cloud vs compatible server.

---

## 1. Environment (AI Farm Manager backend)

| Variable | Purpose |
|----------|---------|
| `OPENAI_BASE_URL` | Optional. Base URL for an OpenAI-compatible API. **Empty** = default OpenAI cloud (`api.openai.com`). Examples: `http://192.168.1.10:11434` (Ollama), `http://localhost:11434`. |
| `OLLAMA_BASE_URL` | Optional **alias** for `OPENAI_BASE_URL` (same behaviour). Useful in Portainer/TrueNAS stacks where you want the variable name to say “Ollama”. If both are set, `OPENAI_BASE_URL` wins. |
| `LLM_API_KEY` | OpenAI API key **or** placeholder when using a local server that ignores auth (e.g. `ollama`). If `OPENAI_BASE_URL` (or `OLLAMA_BASE_URL`) is set and this is empty, the backend uses an internal placeholder for the SDK. |
| `LLM_MODEL` | Model id as understood by the **compatible server** (e.g. Ollama model name). |
| `LLM_PROVIDER` | Use **`openai`** for the OpenAI-compatible path (not `gemini`). |

**Normalization:** `app/config.py` → `normalize_openai_base_url_for_sdk()` appends **`/v1`** when the path does not already contain **`/v1`**, matching **Ollama’s** OpenAI bridge (`…/v1/chat/completions`).

**Configuration source:** Set variables in **your host’s environment** (Docker, TrueNAS app settings, Coolify, systemd, etc.). The optional **`/admin`** form can write **`OPENAI_BASE_URL`** into **`backend/.env`** only if you use that workflow; many deployments inject env **without** any `.env` file.

---

## 2. HTTP headers (hosted BYOK → AI server)

When the Farm Dashboard **proxies** to AI Farm Manager with a user key, it may send:

| Header | Purpose |
|--------|---------|
| `X-FarmDash-Key` | Integration / link key (`FARMDASH_INTEGRATION_KEY`). |
| `X-AI-API-Key` | User’s API key (or `ollama` when using local-only auth). |
| `X-AI-Provider` | `openai` or `gemini` (Gemini unchanged). |
| `X-AI-OpenAI-Base-URL` | Optional. OpenAI-compatible base URL for **this** request (LAN Ollama). Normalized server-side like `OPENAI_BASE_URL`. |

**Note:** `openai_compat` in the **Electron store** is stored as a UI/provider label; proxied requests use **`X-AI-Provider: openai`** plus **`X-AI-OpenAI-Base-URL`** when a base URL is configured.

---

## 3. Code paths

### 3.1 Backend (Python)

| File | Role |
|------|------|
| `AI_Farm_Manager/backend/app/config.py` | `normalize_openai_base_url_for_sdk()`, `get_settings()` includes `openai_base_url`; `llm_configured` true if `LLM_API_KEY` **or** `OPENAI_BASE_URL` is set (with `ENABLE_AI_BOT`). |
| `AI_Farm_Manager/backend/app/services/llm_service.py` | `effective_openai_api_key()`, `async_openai_client()`; in-game Hank chat (`_openai`) and `test_llm_connectivity` (OpenAI branch). |
| `AI_Farm_Manager/backend/app/services/consultant.py` | `_openai_consultant` via `async_openai_client`; `resolve_consultant_llm_settings(..., user_openai_base_url)`; BYOK clears server `openai_base_url` unless header overrides. |
| `AI_Farm_Manager/backend/app/routers/consultant.py` | Reads `X-AI-OpenAI-Base-URL`, passes `user_openai_base_url` into `compute_consultant_insights`. |
| `AI_Farm_Manager/backend/app/routers/integration.py` | `GET /llm-ping` and `GET /gemini-models` merge resolve settings with optional `X-AI-OpenAI-Base-URL`. |
| `AI_Farm_Manager/backend/app/routers/admin_routes.py` | Admin context `openai_base_url`; form field persists `OPENAI_BASE_URL` when using admin save. |
| `AI_Farm_Manager/backend/app/templates/admin.html` | Optional **OpenAI-compatible base URL** input. |

### 3.2 Farm Dashboard (Electron / Node)

| File | Role |
|------|------|
| `FS25_FarmDashboard_App/FS25_FarmDashboard_App/main.js` | `listByokProviderModelsInternal` — `GET {base}/v1/models` for local lists; BYOK store `openaiBaseUrl`; `getConsultantByokHeadersForProxy` adds `X-AI-OpenAI-Base-URL`; `save-consultant-byok-credentials` accepts base-only BYOK (`ollama` placeholder). |
| `FS25_FarmDashboard_App/FS25_FarmDashboard_App/localConsultantLlm.js` | On-device Smart suggestions: optional `openaiBaseUrl`; `callOpenAiChat` targets `{base}/v1/chat/completions`; retries without `response_format` on 400/422 for strict local models. |
| `FS25_FarmDashboard_App/FS25_FarmDashboard_App/web/index.html` | BYOK provider option **Local / OpenAI-compatible**; base URL field. |
| `FS25_FarmDashboard_App/FS25_FarmDashboard_App/web/assests/js/ai-farm-bot-panel.js` | UI wiring, model refresh, LLM ping headers, `syncByokOpenaiCompatRow`. |

### 3.3 Template / env example

| File | Role |
|------|------|
| `AI_Farm_Manager/backend/.env.example` | Documents `OPENAI_BASE_URL` (add locally if your clone omits it). |

---

## 4. Behaviour notes

- **Consultant JSON:** OpenAI path requests `response_format: json_object` when supported; **BadRequest** triggers retry without it (same idea as cloud).
- **BYOK + cloud OpenAI:** Stored BYOK does **not** inherit the server’s `OPENAI_BASE_URL` unless you send **`X-AI-OpenAI-Base-URL`** (hosted proxy) or use on-device local with base URL in the app.
- **Security:** Treat LAN URLs like any internal HTTP API — firewall, trusted networks, optional reverse proxy with TLS for multi-machine setups.

---

## 5. Related errors (snapshots)

Smart suggestions require **dashboard JSON** on the server. If you see messages about **no snapshot** or **push mode**, see **DEVELOPER_HANDOVER §5** and ensure **`DASHBOARD_PUSH_MODE=1`** on the AI server and **Push snapshots** enabled in the Farm Dashboard when using PC → server push. That pipeline is **independent** of which LLM provider you use.

---

*Maintenance: update this file when adding env vars, headers, or new OpenAI-compatible integrations.*
