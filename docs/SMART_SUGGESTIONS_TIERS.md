# Smart suggestions — three tiers (Farm Dashboard)

Smart suggestions (consultant insights) can run in three modes. The dashboard shows which one is active via the badge next to **Smart suggestions** and in the **Top 3 farm priorities** line on Home.

| Tier | Badge | When it runs |
|------|--------|----------------|
| **Premium · Hosted AI** | `Hosted` (warning/gold) | You saved **AI server URL** + **link key** and **Send farm data** is on. The **AI Farm Manager** backend on your host runs the LLM. |
| **Mid · BYOK** | `BYOK` (info/cyan) | You saved your own **OpenAI or Gemini** key, or **Local / OpenAI-compatible** (e.g. **Ollama** on your LAN), under **Settings → AI Farm Manager** (BYOK card). On **this PC**, the LLM runs **locally** — no hosted round-trip for those requests. See [LLM_OPENAI_COMPATIBLE.md](./LLM_OPENAI_COMPATIBLE.md). |
| **Basic · Rules** | `Rules` (grey) | The LLM did not produce the insight (quota, offline, or host returned heuristics). Tips come from **rules / heuristics**, especially on **Fields** per-field lines. |

## Precedence on the PC running the dashboard

If **both** hosted connection and **BYOK** are configured, **localhost** prefers **BYOK** for Smart suggestions (see `main.js` `/api/farmdash-ai/consultant/insights`). LAN viewers may see **cached** results from the host PC instead of calling an LLM themselves.

## API: `suggestion_tier`

Successful JSON responses may include:

- `suggestion_tier`: `"hosted"` | `"byok"` | `"rules"`
- `farmdash_byok_local`: `true` when the response was generated on-device (BYOK path)
- `llm_used`: `true` when an LLM produced the insights; `false` for pure heuristics

The desktop app injects `suggestion_tier` for hosted proxy responses when the upstream body omits it.
