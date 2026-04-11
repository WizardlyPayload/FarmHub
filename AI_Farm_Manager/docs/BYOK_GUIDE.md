# Bring your own API key (BYOK) — Farm Dashboard + AI Farm Manager

Farm Dashboard can call **AI Farm Manager** with **your** Google or OpenAI credentials so you are not limited to the server host’s API quota. This guide focuses on **Google Gemini** (recommended; tested against this stack).

**Related:** Full routing rules (keys, models, 429/503) — [LLM_GEMINI_ROUTING.md](../../docs/LLM_GEMINI_ROUTING.md).

---

## 1. Get a Gemini API key (free tier)

1. Open **[Google AI Studio](https://aistudio.google.com/)** and sign in.
2. Use **Get API key** → create a key for a project.
3. Copy the key and store it like a password (do not commit it to git or share it publicly).

**Video walkthrough:** [YouTube — getting a Gemini API key](https://www.youtube.com/watch?v=BYBeQm_AsCI).

---

## 2. Enter the key in Farm Dashboard

1. Open the **Farm Dashboard** desktop app.
2. Open the **Robot / AI** settings panel (wording may vary slightly by locale).
3. Set **AI provider** to **Gemini**.
4. Paste the key into the API key field and **Save**.

The app sends the key to AI Farm Manager on consultant / smart-suggestion requests using the headers documented in **`AI_Farm_Manager/README.md`** (`X-AI-API-Key`, optional `X-AI-Provider`).

---

## 3. What happens when Google rate-limits you (429 / 503)?

The **AI Farm Manager** backend (not the Electron app alone) implements:

1. **Model stack (`GEMINI_MODEL_ROLLOVER` on the server)**  
   Requests try models in **order** (best first). If the preferred model returns **429** or **503**, the server tries the **next** model in the list **on the same API key** before giving up on that key.

2. **No “stuck on a slow model” across sessions**  
   Each **new** request starts again from the **best** model in the list — earlier fallbacks are not remembered.

3. **BYOK = one key**  
   Your dashboard sends **one** key. The server does **not** round-robin multiple keys for BYOK (there is only one). **Multi-key round-robin** applies when the **server** has several `GEMINI_API_KEY_*` entries in its environment.

4. **Optional server-side budget**  
   Admins can enable **`GEMINI_BUDGET_*`** caps; see `gemini_budget.py` and `.env.example`.

5. **Local rules on the dashboard**  
   If the AI is unavailable, the **rules engine** (`rules-engine.js`) can still show **local** field suggestions — that is separate from Gemini routing.

**Pin a single model:** On the server, set **`GEMINI_MODEL_ROLLOVER=0`** (or `off`) and set **`GEMINI_MODEL`** to the model id you want — no automatic stepping to fallback models.

---

## 4. OpenAI BYOK

OpenAI keys work if your OpenAI project has **billing** enabled (no perpetual free API tier comparable to Gemini’s). Configure the same panel for provider **OpenAI** and paste your key.

---

## 5. Troubleshooting

| Symptom | What to check |
|--------|----------------|
| 429 / “quota” in logs | Shorter rollover list, fewer concurrent dashboard tabs, more server keys (hosting admin), or wait for Google’s reset window. |
| Wrong model errors (404) | **`GEMINI_REST_API_VERSION`** (`v1` vs `v1beta`) and model id — use **`GET /api/integration/gemini-models`** on your server with a valid key. |
| BYOK ignored | Integration auth: **`X-FarmDash-Key`** must match **`FARMDASH_INTEGRATION_KEY`**; consultant requires valid snapshot / push. |

---

## 6. Authors

See **[AUTHORS.md](../../AUTHORS.md)** (JoshWalki, WizardlyPayload).
