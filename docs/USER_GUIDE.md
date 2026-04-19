# FS25 Farm Dashboard — User guide

Short reference for **Smart suggestions**, **field workflows**, and **advanced crops** in the dashboard and optional AI features.

**Full illustrated manual (installation stages, where to click, screenshot filenames):** **[USER_MANUAL.md](./USER_MANUAL.md)**

---

## Smart suggestions and AI

The dashboard can show **Smart suggestions** on the home grid and field views. Depending on your setup, suggestions come from different **tiers**:


| Tier                            | What it means                                                                                                                                                                          |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hosted**                      | Your **AI Farm Manager** server (URL + link key in **AI Farm Manager**) runs the heavy LLM when the response includes real model output. Premium path when the host provides cloud AI. |
| **BYOK** (“Bring your own key”) | You paste an **OpenAI** or **Gemini** API key in the app; mid-tier **on-device** LLM runs on **this PC** for eligible requests. Optional alongside Hosted.                             |
| **Rules**                       | **No LLM** — local heuristics only (e.g. swaths, bales, basic next steps). Still useful offline or when AI is unavailable.                                                             |


You can use **Hosted**, **BYOK**, both, or rely on **Rules** alone. In **Settings → AI Farm Manager** there are two **sub-tabs**:


| Sub-tab                                  | Use it when…                                                                                                                                                                                                                                                     |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **BYOK — Smart suggestions on this PC**  | You only need **OpenAI / Gemini** keys for dashboard tips. **No server URL or link key** here.                                                                                                                                                                   |
| **Hosted AI — server, paid tier & chat** | Your plan includes the **hosted AI Farm Manager**: enter **server URL** + **link key**, **Send farm data**, **Save hosted connection**, refresh status, test LLM, and (below that) **In-game chat (!hank)** — bot profiles and `**ai_farm_manager_config.xml`**. |


### In-game chat (!hank) vs Smart suggestions

**In-game chat** (the **!hank** bot in multiplayer) is **not** the same as BYOK. **BYOK alone does not enable** chat — use the **Hosted AI** sub-tab for server linking and the **In-game chat** block for profiles and the mod XML token.

---

## Field workflows — swaths and bales

The dashboard **tracks physical work on the field**, not abstract “task lists”:

- **Swaths / windrows** — Unfinished harvesting or baling may show as loose material that **needs baling** or follow-up work.
- **Bales** — The UI counts **bales still on the field**. Until they are **removed** (picked up, sold, or moved off the field), the field may show **“Needs work”** or similar warnings.

**Practical tip:** Finish **baling** and **clear bales from the field** to satisfy those warnings. The mod and merger report what the game actually sees (windrow volume, bale counts, etc.).

---

## Advanced crops (FS25)

Smart suggestions and the consultant layer are aware of **FS25-specific crop behaviour**, for example:

- **Spinach** — Regrowth and repeat harvest patterns differ from standard cereals.
- **Grass** — Silage vs hay stages and grass management are reflected in context sent to the AI and in local rules where applicable.

Exact wording on screen comes from the **AI Farm Manager** prompts and local **rules** layer; keep the game and mod updated for best accuracy.

---

**More detail:** [README.md](../README.md) · [SECURITY.md](./SECURITY.md) · [DEVELOPER_HANDOVER.md](./DEVELOPER_HANDOVER.md)