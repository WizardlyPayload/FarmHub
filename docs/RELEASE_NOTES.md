# FS25 Farm Dashboard — Release notes

Use this file for **short copy-paste text** on GitHub Releases. The **full history** is in [CHANGELOG.md](./CHANGELOG.md). **Security and LAN access** (Farm Dashboard): [SECURITY.md](./SECURITY.md). **AI Farm Manager API hardening** (optional VPS settings): [AI_SERVER_SECURITY.md](./AI_SERVER_SECURITY.md). **Authors:** [AUTHORS.md](./AUTHORS.md) — **JoshWalki** (Josh) & **WizardlyPayload**.

---

## Current shipping line: **3.1.0** (app) / **2.0.0.0** (mod — bump `modDesc.xml` when you ship a mod change)

### GitHub release title (example)

`FS25 Farm Dashboard 3.1.0`

### Description (copy-paste)

**FS25 Farm Dashboard 3.1.0** ships everything from **3.0.0** (see [RELEASE_v3.0.0.md](./RELEASE_v3.0.0.md) and [CHANGELOG.md](./CHANGELOG.md) §**3.0.0**) **plus**:

- **Local / OpenAI-compatible BYOK** — In **Settings → AI Farm Manager**, choose **Local / OpenAI-compatible (Ollama, vLLM…)** and enter your LAN base URL (e.g. Ollama on TrueNAS). Optional API key or **`ollama`** placeholder; **Refresh models** lists **`/v1/models`** on your server.
- **AI Farm Manager alignment** — Hosted stack accepts **`OPENAI_BASE_URL`** and HTTP header **`X-AI-OpenAI-Base-URL`** for the same idea on the server. Details: [LLM_OPENAI_COMPATIBLE.md](./LLM_OPENAI_COMPATIBLE.md).

1. **FS25 mod** (e.g. **2.0.0.0** in `modDesc.xml` unless you release a new mod build) — install into FS25 `mods`, enable on your save or server, and **run the game at least once** before relying on the desktop app.
2. **Windows desktop app** (version **3.1.0**) — NSIS installer; serves the dashboard at **http://localhost:8766**. **Optional LAN access** (Settings) binds on your network with **Basic Auth** + optional **IP allowlist**; default bind is **localhost-only**. See [SECURITY.md](./SECURITY.md).

**Install order:** mod → enable & load save → then install/run the desktop app. See [README.md](../README.md) and [INSTALL.md](./INSTALL.md).

### Where this release is documented (3.1.0)

| Topic | Document | What to read |
|--------|-----------|----------------|
| **3.1.0** — OpenAI-compatible / Ollama / LAN BYOK + server `OPENAI_BASE_URL` | [CHANGELOG.md §3.1.0](./CHANGELOG.md), [LLM_OPENAI_COMPATIBLE.md](./LLM_OPENAI_COMPATIBLE.md) | Feature list + technical reference |
| **3.0.0** — Full story (Settings, LAN, BYOK, build/install, AI hardening) | [RELEASE_v3.0.0.md](./RELEASE_v3.0.0.md) | Narrative + transcript-informed |
| **3.0.0 app** — Settings UX, modals, Smart suggestions, tablet | [CHANGELOG.md §3.0.0](./CHANGELOG.md) | Bullet list |
| **Mod: staggered collectors** — one module per time slice, `collectionCycleMs`, `config.xml` | [CHANGELOG §2.0.0 → **G**](./CHANGELOG.md) | How often `data.json` refreshes *inside the game* vs a single 10s “do everything” tick |
| **App: FTP polling** — interval, initial delay, **sync vs staggered** multi-server | [CHANGELOG §2.0.0 → **H**](./CHANGELOG.md) | How often the app pulls remote `data.json` and how multiple FTP servers are scheduled |
| **Farm switcher** — FTP and multi-farm local saves | [CHANGELOG §2.0.0 → **I**](./CHANGELOG.md) | When the navbar farm dropdown appears |
| **LAN / browser / optional auth** | [SECURITY.md](./SECURITY.md) | Bind modes, Basic Auth, IP allowlist |
| **Product + setup screenshot ideas** | [DESCRIPTION_AND_SCREENSHOTS.md](./DESCRIPTION_AND_SCREENSHOTS.md) | Long description, screenshot checklist |
| **Everything since 1.0.0** | [CHANGELOG.md](./CHANGELOG.md) | Full version history |
| **AI Farm Manager (Gemini keys / BYOK)** | [LLM_GEMINI_ROUTING.md](./LLM_GEMINI_ROUTING.md) | Server-side Gemini routing and env vars |
| **AI Farm Manager (OpenAI + Ollama / compatible)** | [LLM_OPENAI_COMPATIBLE.md](./LLM_OPENAI_COMPATIBLE.md) | `OPENAI_BASE_URL`, headers, file manifest |
| **FarmHub developer handover** | [DEVELOPER_HANDOVER.md](./DEVELOPER_HANDOVER.md) | Full stack architecture |
| **Authors** | [AUTHORS.md](./AUTHORS.md) | **JoshWalki** (Josh) & **WizardlyPayload** |

### Attach to this release (recommended)

- `FS25 Farm Dashboard Setup x.x.x.exe` — default build output: `%LOCALAPPDATA%\fs25-farm-dashboard-electron-out\` (see [CHANGELOG.md](./CHANGELOG.md) §3.0.0); or `FS25_FarmDashboard_App/FS25_FarmDashboard_App/release/` if you build in-repo.
- `FS25_FarmDashboard_Mod.zip` — zip the **`FS25_FarmDashboard_Mod`** folder so users extract it into `Documents\My Games\FarmingSimulator2025\mods\`

### Reporting issues

Include: FS25 version, single-player vs dedicated, mod and app **versions**, local vs FTP, and what you expected vs what happened.

---

## Earlier releases (summary)

| Version | Notes |
|---------|--------|
| **1.1.2** | Mod shop image export, `items_mod_extract` thumbnails, vehicle image matching improvements. |
| **1.0.0** | First public release — see [CHANGELOG.md](./CHANGELOG.md). |

Full detail for every line: [CHANGELOG.md](./CHANGELOG.md).
