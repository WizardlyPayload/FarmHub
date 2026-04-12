# FS25 Farm Dashboard — Release notes

Use this file for **short copy-paste text** on GitHub Releases. The **full history** is in [docs/CHANGELOG.md](docs/CHANGELOG.md). **Security and LAN access** (Farm Dashboard): [docs/SECURITY.md](docs/SECURITY.md). **AI Farm Manager API hardening** (optional VPS settings): [docs/AI_SERVER_SECURITY.md](docs/AI_SERVER_SECURITY.md). **Authors:** [AUTHORS.md](AUTHORS.md) — **JoshWalki** (Josh) & **WizardlyPayload**.

---

## Current shipping line: **3.0.0** (app) / **2.0.0.0** (mod — bump `modDesc.xml` when you ship a mod change)

### GitHub release title (example)

`FS25 Farm Dashboard 3.0.0`

### Description (copy-paste)

**FS25 Farm Dashboard 3.0.0** ships:

1. **FS25 mod** (e.g. **2.0.0.0** in `modDesc.xml` unless you release a new mod build) — install into FS25 `mods`, enable on your save or server, and **run the game at least once** before relying on the desktop app.
2. **Windows desktop app** (version **3.0.0**) — NSIS installer; serves the dashboard at **http://localhost:8766** and on your **LAN** (**no login** — see [docs/SECURITY.md](docs/SECURITY.md)).

**Highlights in 3.0.0:** **Unified Settings** — all server/save/FTP configuration lives under **Settings (gear) → Servers & saves** (removed duplicate navbar folder button). **Notification History** and other modals no longer freeze the UI (modal/backdrop stacking fixed). **Smart suggestions** collapse control on the home grid; optional **screen wake lock** for tablets; calmer AI-offline messaging; combined **XML + Live + API** status in the top bar; tablet farm dropdown and nav polish. See [docs/CHANGELOG.md](docs/CHANGELOG.md) §**3.0.0**.

**Install order:** mod → enable & load save → then install/run the desktop app. See [README](README.md) and [INSTALL.md](INSTALL.md).

### Where this release is documented (3.0.0)

| Topic | Document | What to read |
|--------|-----------|----------------|
| **3.0.0 app** — Settings UX, modals, Smart suggestions, tablet | [CHANGELOG §3.0.0](docs/CHANGELOG.md) | This release |
| **Mod: staggered collectors** — one module per time slice, `collectionCycleMs`, `config.xml` | [CHANGELOG §2.0.0 → **G**](docs/CHANGELOG.md) | How often `data.json` refreshes *inside the game* vs a single 10s “do everything” tick |
| **App: FTP polling** — interval, initial delay, **sync vs staggered** multi-server | [CHANGELOG §2.0.0 → **H**](docs/CHANGELOG.md) | How often the app pulls remote `data.json` and how multiple FTP servers are scheduled |
| **Farm switcher** — FTP and multi-farm local saves | [CHANGELOG §2.0.0 → **I**](docs/CHANGELOG.md) | When the navbar farm dropdown appears |
| **LAN / browser / no login** | [SECURITY.md](docs/SECURITY.md) | Trust model and firewall |
| **Product + setup screenshot ideas** | [docs/DESCRIPTION_AND_SCREENSHOTS.md](docs/DESCRIPTION_AND_SCREENSHOTS.md) | Long description, screenshot checklist |
| **Everything since 1.0.0** | [CHANGELOG.md](docs/CHANGELOG.md) | Full version history |
| **AI Farm Manager (Gemini keys / BYOK)** | [docs/LLM_GEMINI_ROUTING.md](docs/LLM_GEMINI_ROUTING.md) | Server-side routing and env vars |
| **FarmHub developer handover** | [DEVELOPER_HANDOVER.md](DEVELOPER_HANDOVER.md) | Full stack architecture |
| **Authors** | [AUTHORS.md](AUTHORS.md) | **JoshWalki** (Josh) & **WizardlyPayload** |

### Attach to this release (recommended)

- `FS25 Farm Dashboard Setup x.x.x.exe` (from `FS25_FarmDashboard_App/FS25_FarmDashboard_App/release/` after `npm run dist`, or `FS25_Dashboard APP/release/` in the GitHub clone layout)
- `FS25_FarmDashboard_Mod.zip` — zip the **`FS25_FarmDashboard_Mod`** folder (or **`FS25_Dashboard MOD`** from the clone) so users extract it into `Documents\My Games\FarmingSimulator2025\mods\`

### Reporting issues

Include: FS25 version, single-player vs dedicated, mod and app **versions**, local vs FTP, and what you expected vs what happened.

---

## Earlier releases (summary)

| Version | Notes |
|---------|--------|
| **1.1.2** | Mod shop image export, `items_mod_extract` thumbnails, vehicle image matching improvements. |
| **1.0.0** | First public release — see [docs/CHANGELOG.md](docs/CHANGELOG.md). |

Full detail for every line: [docs/CHANGELOG.md](docs/CHANGELOG.md).
