# Bring your own API key (BYOK) — Farm Dashboard + AI Farm Manager

You can use **your** Google or OpenAI credentials in two ways:

1. **On-device BYOK (Farm Dashboard desktop)** — Save your key under **Settings → AI Farm Manager** (BYOK card). Smart suggestions then run **on your PC** against OpenAI/Gemini; the dashboard adds `suggestion_tier: byok` to responses. See **[SMART_SUGGESTIONS_TIERS.md](./SMART_SUGGESTIONS_TIERS.md)**. You can also choose **Local / OpenAI-compatible (Ollama, vLLM…)** and enter a **base URL** (LAN or localhost) so keys and traffic stay on your network — see **[LLM_OPENAI_COMPATIBLE.md](./LLM_OPENAI_COMPATIBLE.md)**.
2. **Hosted AI Farm Manager** — The FastAPI backend can still accept **BYOK via headers** (`X-AI-API-Key`, `X-AI-Provider`, optional **`X-AI-OpenAI-Base-URL`**) when the dashboard forwards requests to your host — Gemini quotas are documented below; OpenAI-compatible URLs are documented in **[LLM_OPENAI_COMPATIBLE.md](./LLM_OPENAI_COMPATIBLE.md)**.

This guide focuses on **Google Gemini** for the **hosted** stack when using cloud Gemini (recommended for that path; tested against this stack).

**Related:** Full Gemini routing rules (keys, models, 429/503) — [LLM_GEMINI_ROUTING.md](./LLM_GEMINI_ROUTING.md). **OpenAI cloud + compatible / Ollama** — [LLM_OPENAI_COMPATIBLE.md](./LLM_OPENAI_COMPATIBLE.md).

---

## 1. Get a Gemini API key (free tier)

1. Open **[Google AI Studio](https://aistudio.google.com/)** and sign in.
2. Use **Get API key** → create a key for a project.
3. Copy the key and store it like a password (do not commit it to git or share it publicly).

**Video walkthrough:** [YouTube — getting a Gemini API key](https://www.youtube.com/watch?v=BYBeQm_AsCI).

---

## 2. Enter the key in Farm Dashboard (on-device BYOK)

1. Open the **Farm Dashboard** desktop app.
2. Open **Settings** (gear) → **AI Farm Manager** tab (or the sidebar entry that opens the same panel).
3. Under **Optional: your OpenAI / Gemini key (BYOK)**, set **provider** to **Gemini** (or OpenAI).
4. Paste the key, optionally **Refresh models**, pick a model, then **Save BYOK**.

The key is stored in the app’s secure store (Electron). Smart suggestions on **localhost** call your provider **from this PC** — they do not require the hosted AI server URL for that path. Extra API keys and comma-separated extra models are supported for round-robin on free tiers.

For **hosted** AI Farm Manager (VPS), keys can still be sent on requests using the headers in **`AI_Farm_Manager/README.md`** (`X-AI-API-Key`, optional `X-AI-Provider`) when the dashboard proxies to your server.

---

## 3. What happens when Google rate-limits you (429 / 503)?

The **AI Farm Manager** backend (not the Electron app alone) implements:

1. **Model stack (`GEMINI_MODEL_ROLLOVER` on the server)**  
   Requests try models in **order** (best first). If the preferred model returns **429** or **503**, the server tries the **next** model in the list **on the same API key** before giving up on that key.

2. **No “stuck on a slow model” across sessions**  
   Each **new** request starts again from the **best** model in the list — earlier fallbacks are not remembered.

3. **BYOK keys**  
   **On-device Farm Dashboard BYOK** can store **multiple keys** (primary + extra lines) and **multiple models** (CSV) and round-robins locally to spread free-tier limits. On the **hosted** server, **multi-key round-robin** applies when the **server** has several `GEMINI_API_KEY_*` entries in its environment.

4. **Optional server-side budget**  
   Admins can enable **`GEMINI_BUDGET_*`** caps; see `gemini_budget.py` and `.env.example`.

5. **Local rules on the dashboard**  
   If the AI is unavailable, the **rules engine** (`rules-engine.js`) can still show **local** field suggestions — that is separate from Gemini routing.

**Pin a single model:** On the server, set **`GEMINI_MODEL_ROLLOVER=0`** (or `off`) and set **`GEMINI_MODEL`** to the model id you want — no automatic stepping to fallback models.

---

## 4. OpenAI BYOK

OpenAI keys work if your OpenAI project has **billing** enabled (no perpetual free API tier comparable to Gemini’s). Configure the same panel for provider **OpenAI (cloud)** and paste your key.

---

## 4a. Local / OpenAI-compatible BYOK (Ollama, vLLM, LAN)

1. In **Settings → AI Farm Manager → BYOK**, set provider to **Local / OpenAI-compatible (Ollama, vLLM…)**.
2. Enter the **base URL** of your server (e.g. `http://192.168.1.10:11434` for Ollama on your LAN). The app and backend normalize **`/v1`** when needed.
3. For servers that do not require authentication, leave the API key blank or enter **`ollama`** (common convention).
4. Click **Refresh models**, pick a model, then **Save BYOK**.

Hosted requests to AI Farm Manager can pass the same idea via **`X-AI-OpenAI-Base-URL`** (see [LLM_OPENAI_COMPATIBLE.md](./LLM_OPENAI_COMPATIBLE.md)).

---

## 5. Troubleshooting

| Symptom | What to check |
|--------|----------------|
| 429 / “quota” in logs | Shorter rollover list, fewer concurrent dashboard tabs, more server keys (hosting admin), or wait for Google’s reset window. |
| Wrong model errors (404) | **`GEMINI_REST_API_VERSION`** (`v1` vs `v1beta`) and model id — use **`GET /api/integration/gemini-models`** on your server with a valid key. |
| BYOK ignored | Integration auth: **`X-FarmDash-Key`** must match **`FARMDASH_INTEGRATION_KEY`**; consultant requires valid snapshot / push. |

---

## 6. Authors

See **[AUTHORS.md](./AUTHORS.md)** (JoshWalki, WizardlyPayload).
