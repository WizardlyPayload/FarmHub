# AI Farm Manager (FS25)

Unified **FastAPI** backend for **Farming Simulator 25** dedicated servers (e.g. **G-Portal**): chat API, optional LLM, farm snapshot (FTP or local HTTP), admin UI, and a simple **web dashboard** at `GET /`.

**Cloud-first:** deploy to [Render](https://render.com) with one click (see below). The in-game Lua mod uses **direct HTTPS** to your API (`POST /api/chat/receive`, `GET /api/chat/poll`). Relay mode has been removed.

```
AI_Farm_Manager/
├── README.md                          ← this file
├── render.yaml                        ← Render Blueprint (web service)
├── backend/
│   ├── .env.example
│   ├── requirements.txt
│   ├── prompts/
│   │   └── system_prompt.txt
│   └── app/
│       ├── main.py
│       ├── config.py
│       ├── prompt_loader.py
│       ├── templates/
│       │   ├── admin.html
│       │   └── dashboard.html         ← GET / farm snapshot
│       ├── static/
│       ├── routers/
│       │   ├── chat.py                ← POST /api/chat/receive, GET /api/chat/poll
│       │   └── admin_routes.py
│       └── services/
│           ├── dashboard_service.py
│           ├── ftp_service.py         ← G-Portal FTP → in-memory data.json
│           ├── llm_service.py
│           └── ...
└── fs25_ai_farm_manager_mod/
    ├── modDesc.xml
    ├── icon.png
    ├── config/
    │   └── ai_farm_manager_config.xml
    └── src/
        ├── Config.lua
        ├── HttpClient.lua
        ├── ChatHooks.lua
        └── main.lua
```

## Deploy to Render (1-click)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

1. Push this repo to GitHub/GitLab/Bitbucket.
2. In Render, create a **Blueprint** from `AI_Farm_Manager/render.yaml`, or use the button above (point the service at the folder that contains `render.yaml`).
3. Set **Root Directory** to `AI_Farm_Manager` if your repository root is the parent `MAIN CODEBASE` folder.
4. When prompted, set **sync** (secret) variables: `ADMIN_PASSWORD`, `SERVER_TOKEN`, G-Portal FTP fields (`GPORTAL_FTP_HOST`, `GPORTAL_FTP_USER`, `GPORTAL_FTP_PASS`, `GPORTAL_FTP_PATH`), `ENABLE_AI_BOT`, `LLM_API_KEY`, and `PUBLIC_BASE_URL` (your Render URL, e.g. `https://ai-farm-manager.onrender.com`) so generated mod XML points at the right host.

After deploy: open `/` for the farm JSON snapshot, `/admin` for settings, `/docs` for Swagger.

## Farm snapshot: FTP (cloud) vs HTTP (local)

**G-Portal / cloud:** Configure `GPORTAL_FTP_*` in the environment. A background task downloads `data.json` (exported by the Farm Dashboard FS25 mod) over FTP into process memory. The LLM and the `GET /` page read that snapshot — no local Electron app required on the server.

**Local development:** Leave `GPORTAL_FTP_HOST` empty and set `DASHBOARD_JSON_URL` (e.g. `http://127.0.0.1:8766/api/data`) if you still run the Farm Dashboard desktop app.

If the game is not connected yet, JSON may contain `"error": "Waiting for data..."` — the bot is instructed not to invent numbers until live data exists.

### Multi-server (many dedis at once)

1. Set **`PUBLIC_BASE_URL`** to your public API URL so generated config files use the correct host.
2. In **`/admin` → Multi-server bot**, add one profile per dedicated server (label, Farm Dashboard server id, token).
3. Download **`ai_farm_manager_config.xml`** per profile (`/admin` or `GET /api/mod/config.xml?server_token=…`) and place it in the host **modsSettings** folder.
4. Chat + poll + LLM context are routed **per token**, with separate outgoing queues.

**Farm Dashboard ↔ integration:** `FARMDASH_INTEGRATION_KEY` matches the Electron app’s “Farm Dashboard link key” when you use that integration — not your OpenAI key and not `SERVER_TOKEN`.

## Module 1 — Run the Python backend locally

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # Linux
pip install -r requirements.txt
copy .env.example .env          # Windows
```

Edit `.env`:

- `SERVER_TOKEN` — must match the Lua mod XML.
- `ENABLE_AI_BOT` — `true` to enable `!bot` LLM replies (requires `LLM_API_KEY` or `GEMINI_API_KEY` depending on `LLM_PROVIDER`).
- `GPORTAL_FTP_*` — for cloud snapshot; optional locally.
- `DASHBOARD_JSON_URL` — optional local Farm Dashboard URL when FTP is not used.
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` — required for `/admin`.

### Uvicorn (development)

From the `backend` folder:

```bash
python -m uvicorn app.main:app --host 0.0.0.0 --port 8080
```

Health: `GET http://127.0.0.1:8080/health`

Production: put **Nginx** or **Caddy** in front for HTTPS if the mod talks to a public URL.

## Module 2 — Admin panel

1. Open `https://YOUR_HOST/admin` (HTTP Basic: `ADMIN_USERNAME` / `ADMIN_PASSWORD`).
2. Toggle the bot, set dashboard URL (local), API keys, models, and the system prompt.

## Module 3 — FS25 Lua mod (G-Portal)

1. Add **256×256** `icon.png` next to `modDesc.xml`.
2. Zip the **contents** of `fs25_ai_farm_manager_mod` (so `modDesc.xml` is at the zip root).
3. Upload and activate on the host.
4. Copy **`ai_farm_manager_config.xml`** into **modsSettings** (or download from `/admin`). Set:
   - **`backendUrl`** — your public FastAPI base URL (HTTPS on Render), no trailing slash.
   - **`serverToken`** — same as the bot profile / `SERVER_TOKEN`.
   - **`triggerPrefix`** — e.g. `!bot`.

The dedicated server sends chat triggers **directly** to your API; poll returns bot lines for in-game broadcast.

### HTTP notes (Giants may change APIs)

The bridge uses async HTTP (`HttpClient.lua`). If requests fail, verify `createHTTPRequest` / `Internet` signatures in your game build and adjust `HttpClient.lua`.

## API summary

| Method | Path | Notes |
|--------|------|-------|
| GET | `/` | HTML farm snapshot (FTP or empty) |
| POST | `/api/chat/receive` | JSON `player`, `message`, `server_token` — async; use poll |
| GET | `/api/chat/poll?server_token=…` | `{ "messages": [ { "sender", "text" } ] }` |
| GET | `/admin` | Basic-auth settings UI |
| GET | `/health` | Liveness |

## Behaviour summary

- **Rate limit**: max **5** LLM-bound trigger messages per **minute** per **player** name (in-memory).
- **LLM failure / timeout**: queued fallback reply (see `llm_service.py`).
- **Dashboard unavailable**: model is told data is offline (`dashboard_service.py`).
- **ENABLE_AI_BOT without API keys**: queued message explains that the bot is not configured.
