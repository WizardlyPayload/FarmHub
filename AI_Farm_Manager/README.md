# AI Farm Manager (FS25)

Unified **FastAPI** backend for **Farming Simulator 25** dedicated servers (e.g. **G-Portal**): chat API, optional LLM, farm snapshot (FTP or local HTTP), admin UI, and a simple **web dashboard** at `GET /`.

**Cloud-first:** deploy with **Docker** on [Koyeb](https://www.koyeb.com) (free tier, no credit card required for signup). The in-game Lua mod uses **direct HTTPS** to your API (`POST /api/chat/receive`, `GET /api/chat/poll`). Relay mode has been removed.

```
AI_Farm_Manager/
├── README.md                          ← this file
├── Dockerfile                         ← container image (Koyeb, etc.)
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

## Deploy to Koyeb (recommended — free tier, no card for signup)

[![Deploy to Koyeb](https://www.koyeb.com/static/images/deploy/button.svg)](https://app.koyeb.com/deploy?type=git)

Follow these steps **in order**. You need a **GitHub** account (Koyeb can connect to your repository without you typing server code by hand).

### A) Start from GitHub

1. Push this project to a **GitHub** repository (the folder that contains `AI_Farm_Manager`, or only `AI_Farm_Manager` if that is the repo root).
2. Click the **Deploy to Koyeb** button above (or open [Koyeb deploy](https://app.koyeb.com/deploy?type=git) and choose **GitHub**).

### B) Sign up (no credit card)

1. Create a Koyeb account. Choosing **Sign in with GitHub** is the simplest option.
2. You can use the **free** tier — you should **not** need to add a credit card just to sign up and deploy a small app (always confirm on Koyeb’s current pricing page).

### C) Configure environment variables

In the deployment screen, open **Environment variables** and add at least the following. Use **Generate** or a password manager for secrets; **copy and save** `SERVER_TOKEN` and `ADMIN_PASSWORD` somewhere safe — you will need them for the game and the web UI.

| Variable | What to put |
|----------|-------------|
| `ADMIN_PASSWORD` | Password for the **Admin** web panel (`/admin`). |
| `SERVER_TOKEN` | Long random secret — must match the value you put in the FS25 **`ai_farm_manager_config.xml`** on the game server (`<serverToken>`). |
| `ENABLE_AI_BOT` | `true` to enable `!bot` AI replies, or `false` to turn the LLM off. |
| `LLM_API_KEY` | Your **OpenAI** API key (only if `ENABLE_AI_BOT` is `true` and you use the default OpenAI provider). Leave empty if the bot is off. |
| `GPORTAL_FTP_HOST` | FTP hostname from your G-Portal (or host) file manager. |
| `GPORTAL_FTP_USER` | FTP username. |
| `GPORTAL_FTP_PASS` | FTP password. |
| `GPORTAL_FTP_PATH` | Full path to **`data.json`** on the FTP server (as shown in the host’s file browser). |

**Strongly recommended** after you know your public URL (step E):

| Variable | What to put |
|----------|-------------|
| `PUBLIC_BASE_URL` | Your live app URL, e.g. `https://your-app-name.koyeb.app` — **no trailing slash**. This makes **Download config** / generated XML use the correct `backendUrl` for the Lua mod. |

Optional: `ADMIN_USERNAME` (defaults to `admin`), `TRIGGER_PREFIX` (default `!bot`), and other keys from `backend/.env.example`.

### D) Instance size

Under **Instance** or **Resources**, choose the **Free** tier (**Eco** / **Micro** or the smallest free option Koyeb shows). That is enough for light API traffic and polling.

### E) Deploy and connect the game

1. Click **Deploy** and wait until the service is **running** and shows a public URL (ends with **`.koyeb.app`** unless you added a custom domain).
2. Open `https://YOUR-APP.koyeb.app/health` in a browser — you should see JSON with `"status":"ok"`.
3. Set **`PUBLIC_BASE_URL`** to exactly that base URL (if you did not already), redeploy if required, then download or generate **`ai_farm_manager_config.xml`** from `/admin` so **`backendUrl`** matches your Koyeb HTTPS URL.
4. Put the XML on the dedicated server’s **modsSettings** folder (see below). **`serverToken`** in XML must equal **`SERVER_TOKEN`** in Koyeb.

**Repository layout tip:** If your GitHub repo root is a **parent** folder (e.g. it contains `FarmHub/` and other projects), set Koyeb’s **Root directory** / **Docker context** to the folder that contains this **`Dockerfile`** — usually **`AI_Farm_Manager`**. Koyeb should detect the `Dockerfile` at that level.

---

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

### Docker (local smoke test)

From the `AI_Farm_Manager` folder (where the `Dockerfile` lives):

```bash
docker build -t ai-farm-manager .
docker run --rm -p 8000:8000 -e ADMIN_PASSWORD=test -e SERVER_TOKEN=test ai-farm-manager
```

Then open `http://127.0.0.1:8000/health`.

## Module 2 — Admin panel

1. Open `https://YOUR_HOST/admin` (HTTP Basic: `ADMIN_USERNAME` / `ADMIN_PASSWORD`).
2. Toggle the bot, set dashboard URL (local), API keys, models, and the system prompt.

## Module 3 — FS25 Lua mod (G-Portal)

1. Add **256×256** `icon.png` next to `modDesc.xml`.
2. Zip the **contents** of `fs25_ai_farm_manager_mod` (so `modDesc.xml` is at the zip root).
3. Upload and activate on the host.
4. Copy **`ai_farm_manager_config.xml`** into **modsSettings**. Set:
   - **`backendUrl`** — your public FastAPI base URL (HTTPS on Koyeb), no trailing slash.
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
