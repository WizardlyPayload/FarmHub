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

2. **Copy environment:** From `backend/.env.example`, create a **`.env` file in the same directory as `docker-compose.yml`** (the `AI_Farm_Manager` folder). Set at minimum:
   - **`ENCRYPTION_KEY`** — Fernet key (see `.env.example`); required so tenant secrets are never stored plaintext.
   - **`ADMIN_PASSWORD`** — `/admin` login.
   - **`SERVER_TOKEN`** — must match `<serverToken>` in the Lua mod XML.
   - **`PUBLIC_BASE_URL`** — `https://your-domain-or-ip` **without trailing slash** — this becomes **`backendUrl`** in generated `ai_farm_manager_config.xml` so the mod points at your VPS or reverse proxy.
   - LLM / FTP variables as needed.

3. **Data volume:** The compose file mounts **`./data:/app/data`**. All customer registry data (`bot_servers.json` with encrypted `ftp_pass` / `llm_api_key` per tenant) lives under **`./data` on the host**. **Back up this directory.**

4. **Run:**

   ```bash
   cd AI_Farm_Manager
   docker compose up -d --build
   ```

5. **Verify:** `curl -s https://YOUR_HOST/health` (or `http://SERVER_IP:8000/health` if no TLS yet) — expect `"status":"ok"` and `"data_dir":".../app/data"`.

6. **Lua mod:** Set **`backendUrl`** in `ai_farm_manager_config.xml` to your public API base URL (same idea as **`PUBLIC_BASE_URL`**). Use HTTPS once a certificate is in front of the app.

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

## Farm snapshot & dashboard

- With **`GPORTAL_FTP_*`** set, **`ftp_service`** polls FTP into memory; **`GET /`** (Jinja **`dashboard.html`**) reads **`ftp_service.get_dashboard_dict()`**.

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

## API summary

| Method | Path | Notes |
|--------|------|-------|
| GET | `/` | Farm snapshot (FTP) |
| POST | `/api/chat/receive` | Lua bridge |
| GET | `/api/chat/poll` | Lua bridge |
| GET | `/admin` | Basic auth |
| GET | `/health` | Liveness + `data_dir` path |

## Behaviour summary

- **Rate limit:** 5 LLM-bound triggers per minute per player name.
- **LLM / FTP failures:** See `llm_service.py` / `dashboard_service.py`.
- **`PUBLIC_BASE_URL`:** Keep aligned with the URL players and the Lua mod use for HTTPS.
