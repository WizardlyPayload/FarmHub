# AI Farm Manager — API security & hardening

This document applies to the **FastAPI** backend under `AI_Farm_Manager/backend/` (Docker, Coolify, or `uvicorn`). It does **not** replace [SECURITY.md](./SECURITY.md) for the **Farm Dashboard desktop app** on port **8766**.

---

## Threat model

| Deployment | Typical posture |
|------------|-----------------|
| **Same PC / trusted LAN** | Default settings (open `GET /`, verbose `/health`) are acceptable if the host firewall limits who can reach the API. |
| **VPS on the public internet** | Use **HTTPS** (reverse proxy), **firewall** (only 443 from the world), **rotate secrets**, and enable the **hardening env vars** below. |

---

## Environment variables (hardening)

| Variable | Default | Purpose |
|----------|---------|---------|
| **`REQUIRE_AUTH_FOR_ROOT_HTML`** | `0` / unset | When `1` / `true`, **`GET /`** (Jinja farm snapshot HTML) requires the same credentials as **`/api/integration/*`**: header **`X-FarmDash-Key`** (same value as **`FARMDASH_INTEGRATION_KEY`**), optional query **`?farmdash_key=`** for bookmarked GET requests, or **admin HTTP Basic** when **`ADMIN_PASSWORD`** is set. Prevents unauthenticated browsers from reading the in-memory snapshot page on a public URL. |
| **`HEALTH_RESPONSE_DETAIL`** | `full` | Set to **`minimal`** (or `min` / `slim`) to return only `{"status":"ok","service":"ai-farm-manager"}` from **`/health`** and **`/healthz`**, hiding paths, registry paths, and mode flags from anonymous scanners. **Docker / Coolify health checks** that only look for HTTP 200 and `"status":"ok"` keep working. |
| **`CORS_ORIGINS`** | `*` | Comma-separated list of allowed **browser** origins (e.g. `https://dash.example.com`). When set to **`*`**, the app uses **`allow_credentials=false`** (browser specification: wildcard origin cannot send cookies / credentialed CORS). To use **credentialed** cross-origin fetches, set **explicit** origins here — never `*` with credentials. |

**Tokens:** Generate unique random values for **`SERVER_TOKEN`**, **`FARMDASH_INTEGRATION_KEY`**, and **`ADMIN_PASSWORD`**. Do not copy example strings from `.env.example` into production.

---

## Behaviour details

### `GET /` (dashboard HTML)

- **Default:** Renders **`dashboard.html`** with the current in-memory farm snapshot (FTP or push), same as before.
- **With `REQUIRE_AUTH_FOR_ROOT_HTML=1`:** Unauthenticated requests receive **401** with a **Basic** challenge (and can supply **`X-FarmDash-Key`** or **`?farmdash_key=`** instead). Aligns exposure with integration routes that already require the Farm Dashboard key.

### CORS

- **`CORS_ORIGINS=*`:** Any origin allowed; **credentials disabled** (fixes the invalid `*` + `Access-Control-Allow-Credentials: true` combination).
- **Explicit origins:** Credentials may be enabled for browser clients that need them (Farm Dashboard on another origin).

### Consultant / chat / integration

- Unchanged: **`X-FarmDash-Key`**, **`server_token`**, and subscription tiers behave as documented in [DEVELOPER_HANDOVER.md](../DEVELOPER_HANDOVER.md) and [BYOK_GUIDE.md](../AI_Farm_Manager/docs/BYOK_GUIDE.md).

---

## Related code

| File | Role |
|------|------|
| `backend/app/main.py` | CORS middleware, **`GET /`**, **`/health`** |
| `backend/app/deps/integration_auth.py` | Shared **`require_integration_or_admin`** and **`resolve_root_html_auth`** |

---

## If the API is on the public internet

1. Terminate **TLS** at Caddy / Traefik / nginx; forward to the container on port **8000**.
2. Set **`REQUIRE_AUTH_FOR_ROOT_HTML=1`** unless you have a separate reason to keep `GET /` public.
3. Set **`HEALTH_RESPONSE_DETAIL=minimal`** (or rely on the proxy to restrict **`/health`**).
4. Set **`CORS_ORIGINS`** to the real browser origins that must call the API; avoid `*` unless you understand the no-credentials rule above.
5. Keep **`ADMIN_PASSWORD`** strong; treat **`/admin`** like any other sensitive panel.

Further Gemini-specific behaviour: [LLM_GEMINI_ROUTING.md](./LLM_GEMINI_ROUTING.md).
