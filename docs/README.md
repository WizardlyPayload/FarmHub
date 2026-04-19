# Farm Dashboard — Documentation

All project documentation lives under **`docs/`** (repository root: **FarmHub** on GitHub).

| Document | Description |
|----------|-------------|
| [README.md](../README.md) | Repository landing — install summary, build, layout |
| [**USER_MANUAL.md**](./USER_MANUAL.md) | **Illustrated how-to:** installation stages, UI map, Smart suggestions tiers, screenshot checklist |
| [INSTALL.md](./INSTALL.md) | **Quick install:** mod first, then Windows app (every save) |
| [CHANGELOG.md](./CHANGELOG.md) | Full version history (1.x → **3.1.0**) |
| [RELEASE_NOTES.md](./RELEASE_NOTES.md) | Short copy for **GitHub Releases** |
| [RELEASE_v3.0.0.md](./RELEASE_v3.0.0.md) | Long-form **3.0.0** release narrative |
| [RELEASE_v2.0.0.md](./RELEASE_v2.0.0.md) | **2.0.0** installer / i18n / maintainer notes |
| [USER_GUIDE.md](./USER_GUIDE.md) | Short reference (tiers, fields, crops); full walkthrough → [USER_MANUAL.md](./USER_MANUAL.md) |
| [SMART_SUGGESTIONS_TIERS.md](./SMART_SUGGESTIONS_TIERS.md) | Hosted vs BYOK vs rules — badges and API fields |
| [SECURITY.md](./SECURITY.md) | LAN access, Basic Auth, IP allowlist, Electron hardening |
| [DESCRIPTION_AND_SCREENSHOTS.md](./DESCRIPTION_AND_SCREENSHOTS.md) | Product copy + screenshot checklist |
| [DEVELOPER_HANDOVER.md](./DEVELOPER_HANDOVER.md) | Architecture, consultant flow, file map, deployment |
| [SALES_HANDOVER.md](./SALES_HANDOVER.md) | **Sales & partnerships:** ICP, messaging, tiers, objections — not replaced by USER_MANUAL |
| [AI_SERVER_SECURITY.md](./AI_SERVER_SECURITY.md) | AI Farm Manager (FastAPI) — VPS hardening |
| [LLM_GEMINI_ROUTING.md](./LLM_GEMINI_ROUTING.md) | Gemini keys, model rollover, env vars |
| [LLM_OPENAI_COMPATIBLE.md](./LLM_OPENAI_COMPATIBLE.md) | OpenAI cloud + **OpenAI-compatible** / Ollama / LAN — `OPENAI_BASE_URL`, BYOK headers, file manifest |
| [AI_FARM_MANAGER_BYOK.md](./AI_FARM_MANAGER_BYOK.md) | Bring-your-own-key (on-device + hosted API path) |
| [AI_IN_GAME_CHAT.md](./AI_IN_GAME_CHAT.md) | In-game **Hank** (`!hank`) — **multiplayer only** |
| [AUTHORS.md](./AUTHORS.md) | **JoshWalki** & **WizardlyPayload** |

**AI Farm Manager** code: `AI_Farm_Manager/` — deploy notes: [AI_Farm_Manager/README.md](../AI_Farm_Manager/README.md) (env template: `AI_Farm_Manager/backend/.env.example`).

**Authoritative versions:** `FS25_FarmDashboard_App/FS25_FarmDashboard_App/package.json` (app), `FS25_FarmDashboard_Mod/FS25_FarmDashboard_Mod/modDesc.xml` (mod).

**Internal engine notes (maintainers, not end-user docs):** `FS25 Engine Interaction Modules.txt`, `Dynamic Ground Material Moisture & Transfor.txt`, `FS25 Chat System & Server Integration.txt` in this folder — referenced from Lua comments where applicable.
