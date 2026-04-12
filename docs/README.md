# Farm Dashboard — Documentation index

| Document | Description |
|----------|-------------|
| [CHANGELOG.md](./CHANGELOG.md) | **Full version history** from 1.0.0 through the current release. Sections **G** (mod stagger & `config.xml`), **H** (FTP polling & setup), **I** (farm switcher) under **2.0.0** explain timing and multi-farm behaviour. |
| [SECURITY.md](./SECURITY.md) | **LAN / browser access**, `0.0.0.0:8766`, no login, firewall guidance, Electron trust model, `npm audit` notes. |
| [AI_SERVER_SECURITY.md](./AI_SERVER_SECURITY.md) | **AI Farm Manager (FastAPI):** optional auth for **`GET /`**, minimal **`/health`**, **CORS** + credentials rules, public VPS checklist. |
| [LLM_GEMINI_ROUTING.md](./LLM_GEMINI_ROUTING.md) | **AI Farm Manager:** Gemini API key **round-robin**, **model rollover** (429/503), BYOK vs multi-key, env vars — for operators and developers. |
| [../AI_Farm_Manager/docs/IN_GAME_CHAT_BOT.md](../AI_Farm_Manager/docs/IN_GAME_CHAT_BOT.md) | **In-game Hank / !hank** — **multiplayer only** (host, dedicated, G-Portal); not single-player; where to put `ai_farm_manager_config.xml`. |
| [../DEVELOPER_HANDOVER.md](../DEVELOPER_HANDOVER.md) | **FarmHub** architecture: dashboard + backend, file map, consultant pipeline, performance notes. |
| [../RELEASE_NOTES.md](../RELEASE_NOTES.md) | GitHub **copy-paste** blurbs and a **table** linking to each 2.0.0 topic (G / H / I, SECURITY, screenshots). |
| [DESCRIPTION_AND_SCREENSHOTS.md](./DESCRIPTION_AND_SCREENSHOTS.md) | Long-form product description, UI surface list, screenshot filenames for GitHub / releases. |
| [../README.md](../README.md) | Install order, build, troubleshooting, repository layout (start here for users). |
| [../AUTHORS.md](../AUTHORS.md) | **JoshWalki** (Josh) and **WizardlyPayload** — project authors. |
| [../INSTALL.md](../INSTALL.md) | **Step-by-step install** (mod in every save first, then the app). |

The **authoritative version numbers** for the app and mod are in `FS25_FarmDashboard_App/FS25_FarmDashboard_App/package.json` and `FS25_FarmDashboard_Mod/FS25_FarmDashboard_Mod/modDesc.xml`, summarized in the changelog.

**AI Farm Manager** (FastAPI) lives under `AI_Farm_Manager/`; deploy notes in `AI_Farm_Manager/README.md`, env template `AI_Farm_Manager/backend/.env.example`.
