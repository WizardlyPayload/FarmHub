# FarmHub — Cursor session memory

**Purpose:** One file to **@-mention in new Cursor chats** (`@CURSOR_SESSION_MEMORY.md` or `@docs/CURSOR_SESSION_MEMORY.md`) so assistants start from **your** accumulated decisions—not from an empty thread.

**Important:** Cursor **cannot** automatically merge every old conversation into one chat. This document is the **manual** substitute: you (or a one-off export) paste **short summaries** or **key bullets** from important threads below. Keep it **brief** (facts, file paths, “do / don’t”, open bugs)—not full transcripts.

**Technical source of truth (already in repo):**

| Doc | Use |
|-----|-----|
| [DEVELOPER_HANDOVER.md](./DEVELOPER_HANDOVER.md) | Architecture, data flow, key files |
| [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md) | Full project overview for planning |
| [USER_MANUAL.md](./USER_MANUAL.md) | Supported **3.0.0** end-user behaviour |

**GitHub repo root:** `FarmHub` — [WizardlyPayload/FarmHub](https://github.com/WizardlyPayload/FarmHub). A parent folder named e.g. `MAIN CODEBASE` may **not** be the Git root; clone/work in **`FarmHub`**.

---

## Ground rules for assistants (read before editing)

1. **Shipping line:** Farm Dashboard **3.0.0** — field guidance is **offline rules** + mod **`suggestions`**; see [CHANGELOG.md](./CHANGELOG.md) §3.0.0.
2. **Prefer small diffs** tied to a reported symptom; do not “fix” unrelated subsystems.
3. **Web assets path** is `web/assests/` (historic typo—match existing imports).

---

## Pasted summaries from prior Cursor threads

_Add dated bullets after each session or when you export a chat. Replace this placeholder when you have content._

### Template (copy per thread)

- **Date:** YYYY-MM-DD  
- **Topic:** (e.g. windrow merge, LAN auth, FTP stagger)  
- **Decisions:** …  
- **Files touched:** …  
- **Still broken / TODO:** …  

### Thread log

- **Date:** _—_  
- **Topic:** _Paste next summary here_
