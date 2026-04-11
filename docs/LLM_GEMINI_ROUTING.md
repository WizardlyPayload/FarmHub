# AI Farm Manager — Gemini LLM routing

This document describes how **Google Gemini** requests choose **API keys** and **models** in `AI_Farm_Manager/backend/app/services/llm_service.py`. OpenAI (`LLM_PROVIDER=openai`) does not use this logic.

---

## 1. What uses this routing?

| Path | Function |
|------|----------|
| In-game chat (`POST /api/chat/receive`, Gemini) | `_gemini_post_with_quota_fallback` |
| Consultant / Smart suggestions (`gemini_consultant_post_with_quota_fallback`) | Same pattern |
| Admin / startup connectivity probe | `test_llm_connectivity` (Gemini branch) |

All of these share: **round-robin key starts** (multi-key only), **top-down model list per key**, and **429/503** handling as below.

---

## 2. API key pool (configuration)

- Keys come from **`GEMINI_API_KEY`**, **`GEMINI_API_KEYS`** (comma/newline list), and **`GEMINI_API_KEY_2` … `GEMINI_API_KEY_16`**, merged and **deduplicated** in order (`config.py` + `_gemini_deduped_pool` in `llm_service.py`).
- **BYOK** (Farm Dashboard sends `X-AI-API-Key`): settings resolve to a **single** key — there is no multi-key pool for that request, so **key round-robin does not apply** (nothing to rotate).

---

## 3. Per-request key order (round-robin)

For **two or more** distinct keys in the pool:

1. A **global counter** (thread-safe) advances on **each new LLM request** that needs the pool.
2. The **starting key** is `counter % N` into the deduped list; keys are tried in **rotated order** from there (wrap-around).

So concurrent bursts spread across keys instead of all piling onto a single “sticky” key.

**Single-key deployments** (including BYOK): the list has length **1** — every request uses that key; the counter is **not** advanced for `N ≤ 1` (no fake rotation).

---

## 4. Model stack (top-down, every request)

- **`GEMINI_MODEL_ROLLOVER`**
  - **Unset:** uses the built-in default ordered list (best-first stable models; previews later — see `_DEFAULT_GEMINI_MODEL_ROLLOVER` in `llm_service.py`).
  - **Explicit:** comma-separated model IDs; **first = preferred** for every request.
  - **`0` / `false` / `off`:** rollover disabled — only **`GEMINI_MODEL`** is used (no stepping down).

**Important:** There is **no** memory of “last time we had to use a cheaper model.” Each **new** request starts again from **index 0** of the rollover list (or from `GEMINI_MODEL` when rollover is off).

For **each API key** tried in the request, the service walks the **full** model list top → bottom before moving to the **next** key.

---

## 5. HTTP 429 / 503 handling (tiered)

On **429** (rate limit) or **503** (overloaded):

1. **Same key:** try the **next model** in `GEMINI_MODEL_ROLLOVER` (or the single `GEMINI_MODEL` if rollover is off — then there is no second model on that key).
2. **Models exhausted for this key:** take the **next API key** in the **current request’s** rotated order and start the model list again from the **best** model (index 0).
3. **Last key, still 429:** optional **one** retry after **`Retry-After`** sleep (`GEMINI_429_SLEEP_RETRY`, `GEMINI_429_MAX_SLEEP_SEC`) — only when no other keys remain.

Other **4xx/5xx** (e.g. 400, 404) are **not** treated as quota rotation; they fail or follow specialist paths (e.g. consultant JSON MIME retry on 400).

---

## 6. Budget caps (`gemini_budget.py`)

Optional per-key **RPM/RPD**-style limits can **skip** a key for the current request (`wait_gemini_budget_or_skip`). If a key is skipped, the loop moves to the **next** key in the same rotated order.

---

## 7. Different: time-based “active” key (`active_gemini_api_key`)

`app/config.py` defines **`active_gemini_api_key(settings)`**: when **multiple** keys exist, it picks **one** key from the list using **wall-clock time** and **`GEMINI_ROTATION_WINDOW_SEC`** (default 900s). That is used for:

- **`GET /api/integration/gemini-models`** (Google ListModels — which key to query)
- **`_gemini_generate_url()`** helper (diagnostics / single-URL helpers)

It does **not** replace per-request **round-robin** for **`generateContent`** traffic in `llm_service.py`. Both behaviours can coexist: **ListModels** follows time slots; **chat/consultant** follow round-robin + model stack.

---

## 8. Environment quick reference

| Variable | Role |
|----------|------|
| `GEMINI_API_KEY`, `GEMINI_API_KEY_2`…, `GEMINI_API_KEYS` | Key pool |
| `GEMINI_MODEL` | Default model when **`GEMINI_MODEL_ROLLOVER`** is off |
| `GEMINI_MODEL_ROLLOVER` | Comma list, **first = best**; `0`/`off` = single `GEMINI_MODEL` only |
| `GEMINI_ROTATION_WINDOW_SEC` | Time window for **`active_gemini_api_key`** (ListModels / helpers), not for RR counter |
| `GEMINI_429_SLEEP_RETRY`, `GEMINI_429_MAX_SLEEP_SEC` | Last-resort sleep + one retry on 429 |
| `GEMINI_BUDGET_*` | Optional client-side daily/RPM style caps per key |

---

## 9. Source files

- `app/services/llm_service.py` — round-robin, model lists, POST + fallback
- `app/config.py` — merged env, `active_gemini_api_key`, key list parsing
- `app/services/gemini_budget.py` — budget waits
- `app/services/gemini_http_client.py` — shared `httpx.AsyncClient`
