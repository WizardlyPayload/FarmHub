# AI Farm Manager (FS25)

Centralized **FastAPI** SaaS for **Farming Simulator 25** dedicated servers (e.g. **G-Portal**): chat API, optional LLM, farm snapshot over FTP, admin UI, and a **Jinja2** dashboard at `GET /`.

**Production target:** **Docker** on a **Hetzner VPS** (or any Linux host) with **[Coolify](https://coolify.io)** or plain **Docker Compose**. The in-game Lua mod uses **direct HTTPS** (`POST /api/chat/receive`, `GET /api/chat/poll`). Relay mode is not used.

```
AI_Farm_Manager/
├── README.md
├── Dockerfile                 ← production image (port 8000)
├── docker-compose.yml         ← persistent ./data → /app/data
├── data/                      ← host volume (bot_servers.json); gitignored
├── backend/
│   ├── .env.example
│   ├── requirements.txt
│   ├── prompts/
│   └── app/
│       ├── main.py            ← lifespan: FTP poller + encryption init
│       ├── services/
│       │   ├── encryption.py
│       │   ├── bot_registry.py   → /app/data/bot_servers.json (encrypted secrets)
│       │   ├── ftp_service.py
│       │   └── dashboard_service.py
│       └── templates/
│           └── dashboard.html
└── fs25_ai_farm_manager_mod/
    └── src/                   ← Lua bridge for G-Portal
```

## Deploy with Docker Compose (VPS)

1. **Server:** Ubuntu 22.04+ (e.g. Hetzner Cloud). Open **port 8000** (or put **Caddy/Traefik** in front on **443**).

2. **Copy environment:** From `backend/.env.example`, create a **`.env` file in the same directory as `docker-compose.yml`** (the `AI_Farm_Manager` folder) **or** inject the same variables via your host (TrueNAS, Coolify, Docker UI — a file is not required). Set at minimum:
   - **`ENCRYPTION_KEY`** — Fernet key (see `.env.example`); required so tenant secrets are never stored plaintext.
   - **`ADMIN_PASSWORD`** — `/admin` login.
   - **`SERVER_TOKEN`** — must match `<serverToken>` in the Lua mod XML.
   - **`PUBLIC_BASE_URL`** — `https://your-domain-or-ip` **without trailing slash** — this becomes **`backendUrl`** in generated `ai_farm_manager_config.xml` so the mod points at your VPS or reverse proxy.
   - LLM / FTP variables as needed. For a **local OpenAI-compatible** server (e.g. **Ollama** on the same LAN), set **`LLM_PROVIDER=openai`**, **`OPENAI_BASE_URL`** or **`OLLAMA_BASE_URL`** (same effect — e.g. `http://192.168.1.10:11434`; the backend normalizes `/v1`), **`LLM_MODEL`** to your pulled model name, and **`LLM_API_KEY`** to a placeholder such as **`ollama`** if the server does not require auth. See **[../docs/LLM_OPENAI_COMPATIBLE.md](../docs/LLM_OPENAI_COMPATIBLE.md)**.

3. **Data volume:** The compose file mounts **`./data:/app/data`**. All customer registry data (`bot_servers.json` with encrypted `ftp_pass` / `llm_api_key` per tenant) lives under **`./data` on the host**. **Back up this directory.**

4. **Run:**

   ```bash
   cd AI_Farm_Manager
   docker compose up -d --build
   ```

5. **Verify:** `curl -s https://YOUR_HOST/health` (or `http://SERVER_IP:8000/health` if no TLS yet) — expect `"status":"ok"`. With default **`HEALTH_RESPONSE_DETAIL=full`**, the JSON also includes **`data_dir`** and registry metadata; with **`HEALTH_RESPONSE_DETAIL=minimal`**, only **`status`** and **`service`** are returned (see [../docs/AI_SERVER_SECURITY.md](../docs/AI_SERVER_SECURITY.md)).

6. **Admin “Save” and `.env`:** Compose’s `env_file` injects variables but does not always create a file **inside** the container. Saving settings from **`/admin`** will **create `/app/.env`** if needed. To persist those edits across image rebuilds, optionally mount a host file, e.g. **`- ./backend/.env:/app/.env`** (adjust paths to match your host layout).

7. **Lua mod:** Set **`backendUrl`** in `ai_farm_manager_config.xml` to your public API base URL (same idea as **`PUBLIC_BASE_URL`**). Use HTTPS once a certificate is in front of the app.

## Deploy with Portainer (Docker Compose stack)

Use the **`AI_Farm_Manager`** folder as the **build context** (where **`Dockerfile`** and **`docker-compose.yml`** live). In **Stacks → Add stack → Web editor** (or Git), paste or reference the same `docker-compose.yml`.

**Minimum environment (Stack → Environment variables)** — without these the container often **exits on startup** and **nothing answers on the host port**:

| Variable | Notes |
|----------|--------|
| **`ENCRYPTION_KEY`** | **Required.** Fernet key: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| **`ADMIN_PASSWORD`** | Password for `/admin` |
| **`SERVER_TOKEN`** | Same value as `<serverToken>` in the Lua mod XML (if you use the mod) |
| **`FARMDASH_INTEGRATION_KEY`** | Farm Dashboard “link key” (or generate after first run per your workflow) |

Optional: **`APP_PORT`** (default **8081**) maps the **host** side; the **container always listens on 8000** (`8081:8000`).

**If port 8081 is dead:** open **Containers → your service → Logs**. If you see `ENCRYPTION_KEY is not set`, add the variable and redeploy. **Published ports** appear on the container row when the container is running; a restart loop can make the UI look empty.

**Quick check:** `curl -s http://YOUR_SERVER_IP:8081/health`

## Deploy with Coolify (Hetzner)

1. Install **Coolify** on the VPS (see [Coolify docs](https://coolify.io/docs)).

2. **New resource → Docker Compose** (or **Dockerfile** build from Git).

3. Point the repository / build context to the **`AI_Farm_Manager`** folder (where **`Dockerfile`** lives).

4. **Persistent storage:** In Coolify, add a volume mapping **`/app/data`** to a host path (e.g. `/var/lib/coolify/.../data`) — equivalent to `./data:/app/data` in the sample compose file.

5. **Environment variables:** Add the same variables as in **`backend/.env.example`**, especially **`ENCRYPTION_KEY`**, **`ADMIN_PASSWORD`**, **`SERVER_TOKEN`**, **`PUBLIC_BASE_URL`**, **`ENABLE_AI_BOT`**, **`LLM_API_KEY`**, and **`GPORTAL_FTP_*`** as needed.

6. **Domain / SSL:** Assign your domain in Coolify and enable HTTPS. Set **`PUBLIC_BASE_URL`** to that **`https://` URL** so downloaded mod XML is correct.

7. **Port:** The container listens on **8000**; Coolify’s reverse proxy should forward HTTPS → container **8000**.

## Security (encryption & registry)

- **`app/services/encryption.py`** uses **`cryptography.fernet.Fernet`**. If **`ENCRYPTION_KEY`** is missing, the app **fails at startup** (lifespan).

- **`app/services/bot_registry.py`** reads/writes **`bot_servers.json`** under **`get_data_dir()`** (default **`/app/data`** in Docker). Fields **`ftp_pass`** and **`llm_api_key`** are **encrypted on disk** and **decrypted in memory** only.

- Optional **`DATA_DIR`** env forces the data directory (e.g. **`/app/data`**).

- **Public / internet-facing API:** Optional **`REQUIRE_AUTH_FOR_ROOT_HTML`**, **`HEALTH_RESPONSE_DETAIL`**, and **CORS** rules are documented in **[../docs/AI_SERVER_SECURITY.md](../docs/AI_SERVER_SECURITY.md)** (protect **`GET /`**, slim **`/health`**, spec-correct wildcard CORS).

## Farm snapshot & dashboard

- With **`GPORTAL_FTP_*`** set, **`ftp_service`** polls FTP into memory; **`GET /`** (Jinja **`dashboard.html`**) reads **`ftp_service.get_dashboard_dict()`**. On a **public** host, set **`REQUIRE_AUTH_FOR_ROOT_HTML=1`** so this page requires the Farm Dashboard integration key or admin Basic (see security doc). Set **`GPORTAL_FTP_PORT`** when the host does not use port **21** (many G-Portal FTP endpoints use a custom port).

- **`lifespan`** in **`app/main.py`** starts the FTP background loop when FTP is configured.

## Local development (without Docker)

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt
copy .env.example .env
python -m uvicorn app.main:app --host 0.0.0.0 --port 8080
```

## In-game Hank chat (`fs25_ai_farm_manager_mod`)

The **Lua mod** forwards `!hank` (or your `triggerPrefix`) from **multiplayer** chat to **`POST /api/chat/receive`** and polls **`GET /api/chat/poll`** for replies.

| Topic | Detail |
|--------|--------|
| **Single-player career** | **Not supported** — the mod does not activate the chat bridge in solo. Use **Farm Dashboard** + AI Farm Manager for AI on your own PC. |
| **Multiplayer** | Supported for **host**, **dedicated server**, **G-Portal** (and similar): the machine that runs the authoritative game needs **`modSettings/ai_farm_manager_config.xml`**. |
| **Joining clients** | Cannot trigger the bridge; only the **server / host** runs it. |

Full matrix and config paths: **[../docs/AI_IN_GAME_CHAT.md](../docs/AI_IN_GAME_CHAT.md)**.

---

## API summary

| Method | Path | Notes |
|--------|------|-------|
| GET | `/` | Farm snapshot (FTP) |
| POST | `/api/chat/receive` | Lua mod — **multiplayer sessions only** (see above) |
| GET | `/api/chat/poll` | Lua mod — **multiplayer sessions only** |
| GET | `/api/v1/consultant/insights` | Proactive “Smart Suggestions” (Farm Dashboard) |
| GET | `/admin` | Basic auth |
| GET | `/health` | Liveness + `data_dir` path |

## Bring your own API key (BYOK)

Farm Dashboard can send **`X-AI-API-Key`** (and optional **`X-AI-Provider`**: `gemini` / `openai`, plus optional **`X-AI-OpenAI-Base-URL`** for OpenAI-compatible LAN servers) so players use their own Google/OpenAI/local credentials. Step-by-step setup (including a free Gemini key and **Ollama** / compatible URLs) is in **[../docs/AI_FARM_MANAGER_BYOK.md](../docs/AI_FARM_MANAGER_BYOK.md)** and **[../docs/LLM_OPENAI_COMPATIBLE.md](../docs/LLM_OPENAI_COMPATIBLE.md)**.

**Gemini (server-side behaviour):** For each request, the backend walks the **`GEMINI_MODEL_ROLLOVER`** list **top to bottom** (best model first) on **your** key when Google returns **429** or **503**; only **multi-key server pools** rotate **which key is tried first** (strict round-robin per new request). BYOK uses a **single** key — no key rotation, but the same **model stack** applies. Details: **[../docs/LLM_GEMINI_ROUTING.md](../docs/LLM_GEMINI_ROUTING.md)**. Set **`GEMINI_MODEL_ROLLOVER=0`** (or `off`) to use only **`GEMINI_MODEL`** with no fallback models.

## Proactive Consultant API

The AI Farm Manager exposes a **Smart Suggestions** layer for the **Farm Dashboard (Electron)**: the dashboard calls the backend with the same integration key you use for other Farm Dashboard features.

### Performance (server + client)

- **Server-side LLM cache:** Identical pruned snapshot + scope (`serverId`, `farmId`, `view`, `context`, `fieldRef`, system prompt hash) hits an in-memory **TTL** cache (~10 minutes) so repeated requests avoid another Gemini call when the farm state has not changed.
- **Farm Dashboard polling:** The embedded UI compares a stable fingerprint of **`/api/data`** (excluding volatile `timestamp`) plus farm/server scope before re-running DOM updates, so unchanged JSON does not stutter the UI every poll.

### V3 agronomy prompt

Smart suggestions and field-map modes use the **FS25 mentor / agronomy** prompt stack in **`app/services/consultant.py`** (NPC voices, FS25 mechanics block, section **`VIEW MODE`** prompts). That content is the current “V3” agronomy/consultant behaviour shipped with this repo.

### Endpoint: `GET /api/v1/consultant/insights`

- **Authentication:** Header **`X-FarmDash-Key`** — must match **`FARMDASH_INTEGRATION_KEY`** in `backend/.env` (same value as “Farm Dashboard link key” in the Electron app’s AI Farm Manager panel).
- **LLM keys:** Optional header **`X-AI-API-Key`** (and **`X-AI-Provider`**: `openai` or `gemini`; optional **`X-AI-OpenAI-Base-URL`**) for BYOK from the Farm Dashboard app. If the header is missing or empty, the server uses **`LLM_API_KEY` / `GEMINI_API_KEY`** / **`OPENAI_BASE_URL`** from the environment (**`LLM_PROVIDER`**) — the same keys as in-game **`!hank`** (Hank) and **`/admin`**. Keys are forwarded to the provider and are not stored by the app beyond `.env` / your host env.
- **Behaviour:**
  - **Heuristics:** Flags production outputs or storage levels at or above ~**90%** capacity (high-priority alerts even when the LLM is slow, rate-limited, or disabled).
  - **LLM analysis:** Field-focused rotation and next-step advice; other areas when relevant. Field-specific rows may include **`field_ref`** (farmland id string) for per-parcel UI in the Electron app.
- **Response:** JSON with **`insights`** (category, priority, message, reasoning, optional **`field_ref`**) and **`llm_used`** so the client can show whether items are heuristic-only or LLM-augmented.
- **Client:** The Electron app loads **`web/assests/js/ai-farm-consultant-insights.js`** — priority-based cards, periodic refresh, and debounced reload when the livestock dashboard becomes visible.

OpenAPI: this route lives under the **consultant** tag in **`/docs`**.

## Behaviour summary

- **Rate limit:** 5 LLM-bound triggers per minute per player name.
- **LLM / FTP failures:** See `llm_service.py` / `dashboard_service.py`.
- **`PUBLIC_BASE_URL`:** Keep aligned with the URL players and the Lua mod use for HTTPS.
