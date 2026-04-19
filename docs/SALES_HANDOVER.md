# FS25 Farm Dashboard + AI Farm Manager — Sales handover

**Purpose:** Equip sales, partnerships, and customer success to explain **what we sell**, **who it is for**, **how AI fits**, and **how to qualify deals**. For technical depth, point engineers to [DEVELOPER_HANDOVER.md](./DEVELOPER_HANDOVER.md). For **customer-facing step-by-step** and screenshot placeholders, use [USER_MANUAL.md](./USER_MANUAL.md).

**Authors / product:** JoshWalki, WizardlyPayload (see [AUTHORS.md](./AUTHORS.md)).

---

## 1. Product in one sentence

**Farm Dashboard** is a desktop app (+ optional web on LAN) that turns live **Farming Simulator 25** farm data into a **real-time command center** — animals, fleet, fields, economy, production, pastures — with optional **AI-powered Smart suggestions** that prioritize what to do next on the farm.

---

## 2. What the customer gets

| Layer | What it is | Buyer value |
|-------|------------|-------------|
| **FS25 mod** | Runs with the save; exports rich JSON (fields, vehicles, animals, weather, economy, …). | Accurate, frequent farm state without manual screenshots or spreadsheets. |
| **Farm Dashboard app** | Electron + embedded UI; reads local saves or FTP; **LAN** access for tablets/second screens. | One place to monitor the operation; works beside the game or on a wall-mounted tablet. |
| **Smart suggestions (optional)** | Ranked tips from the **live snapshot** (home: top priorities; sections: context-aware). | Reduces cognitive load — “what matters now” instead of raw tables. |
| **AI Farm Manager (hosted)** | Your **subscription** FastAPI service: ingest snapshot, run consultant LLM, optional in-game chat (multiplayer). | Recurring revenue for you; consistent quality and routing for customers who do not want to manage API keys. |
| **BYOK (bring your own key)** | User’s **OpenAI or Gemini** key stored in the app; Smart suggestions can run **on their PC**. | Appeals to privacy-conscious users and free-tier experimenters; reduces load on your hosted API if they self-serve. |

Nothing here **requires** AI for the dashboard to function. AI is a **clear upgrade path**, not a gate.

---

## 3. Smart suggestions — three tiers (messaging)

Use this language consistently on websites, decks, and support.

| Tier | Customer-facing name | What it means | Who pays |
|------|----------------------|---------------|----------|
| **Premium** | **Hosted AI** (AI Farm Manager) | Customer uses your **server URL + link key**; snapshot is sent per your integration; LLM runs on **your** infrastructure. | Your subscription / plan. |
| **Mid** | **BYOK** | Customer adds **their** Gemini/OpenAI key in **Settings → AI Farm Manager**. On **that PC**, suggestions use **their** provider quota; calls stay **off your hosted LLM** for that path. | Customer’s API bill (Google/OpenAI). |
| **Basic** | **Rules** | Heuristic tips (especially on **Fields**) when the LLM is unavailable or declined. Always free; less contextual. | N/A |

**Precedence (important for support):** If both **hosted** and **BYOK** are configured on the **same PC**, the desktop app typically uses **BYOK first** for localhost Smart suggestions. Hosted remains relevant for **sync**, **other devices**, and customers who only use your server.

**Detail doc:** [SMART_SUGGESTIONS_TIERS.md](./SMART_SUGGESTIONS_TIERS.md).

---

## 4. Ideal customer profiles (ICP)

| Segment | Why they buy | Talking points |
|---------|--------------|----------------|
| **Serious solo / co-op players** | Want oversight of a large farm without alt-tabbing blindly. | “See animals, fleet, fields, and money in one dashboard; optional AI nudges you on priorities.” |
| **Dedicated server / MP admins** | Need visibility outside the game client. | “FTP or HTTP feed into the app; LAN URL for crew on tablets (with password).” |
| **Creators / leagues** | Content and coaching. | “Top 3 farm priorities and section tips are great for streams and tutorials.” |
| **Hosts selling AI access** | Recurring revenue + differentiation. | “AI Farm Manager on your VPS: link key per customer, push snapshot, consultant + optional Hank chat.” |

---

## 5. Qualification checklist (B2B host / white-label)

- **Data path:** Will the customer use **push snapshot** from Farm Dashboard to your AI server, or **FTP / JSON URL** ingest?
- **Auth:** Confirm **`FARMDASH_INTEGRATION_KEY`** (or your naming) and HTTPS endpoints are understood.
- **AI tier:** Do they want **only hosted**, **only BYOK education**, or **both** in documentation?
- **LAN:** Will they expose the dashboard beyond localhost? If yes, review firewall + **LAN password** story ([SECURITY.md](./SECURITY.md)).
- **Support boundary:** Game/mod issues → Giants/mod author pipeline; **dashboard installer** → your release channel; **hosted AI** → your ops runbook.

---

## 6. Objections and short answers

| Objection | Response |
|-----------|----------|
| “I don’t want my data in the cloud.” | Smart suggestions are **optional**. Use **BYOK** so the LLM runs with **your** key on **your PC**, or disable AI and keep the dashboard. |
| “AI will cost too much.” | **Rules** tier is free. **Gemini** free tiers and **BYOK** round-robin (multiple keys/models) are documented for light use. |
| “Is this cheating?” | It’s **read-only coaching** from save/exported data — same information a diligent player could infer; it does not automate gameplay. |
| “Why not just spreadsheets?” | Live **merged** state (animals + fleet + fields + economy) updates on a timer; AI ranks **cross-domain** priorities (e.g. fleet + fields + pigs) in one view. |

---

## 7. Competitive framing (stay factual)

- **Depth:** Purpose-built for **FS25** farm JSON (including precision farming signals, production chains, pastures), not a generic notes app.
- **Deployment choice:** **Local-first** dashboard + optional **your** hosted AI — fits both privacy-focused and “I want turnkey AI” buyers.
- **Ecosystem:** Same FarmHub tree ships **mod + app + AI backend** documentation for integrators.

---

## 8. Assets and next steps for GTM

| Asset | Location / action |
|-------|-------------------|
| Screenshots & long description | [DESCRIPTION_AND_SCREENSHOTS.md](./DESCRIPTION_AND_SCREENSHOTS.md) |
| Hosted AI value prop + `!hank` examples (no VPS steps) | [USER_MANUAL.md §10](./USER_MANUAL.md#section-10-hosted-ai) |
| Changelog / version story | [CHANGELOG.md](./CHANGELOG.md) |
| Security & LAN | [SECURITY.md](./SECURITY.md) |
| Hosted AI hardening | [AI_SERVER_SECURITY.md](./AI_SERVER_SECURITY.md) |
| BYOK (hosted vs on-device) | [AI_FARM_MANAGER_BYOK.md](./AI_FARM_MANAGER_BYOK.md) |
| Release blurbs | [RELEASE_NOTES.md](./RELEASE_NOTES.md) |

**Suggested sales collateral to produce:** one PDF one-pager (three AI tiers + screenshot), a 2-minute screen recording (landing → Smart suggestions → Settings), and a **partner** one-page with integration steps (URL, link key, push snapshot).

---

## 9. Legal and positioning (non-legal advice)

- Do **not** promise specific LLM outputs or yield improvements — suggestions are **advisory**.
- **Giants Software** trademarks and game content remain theirs; mod complies with normal mod hub rules.
- For **enterprise** customers, attach your own DPA / subprocessors list for **your** hosted AI stack.

---

*Update this file when pricing, tier names, or integration steps change.*
