# FarmHub — Tools

All scripts live under **`tools/`** at the repository root (**FarmHub**).

## Root npm scripts (recommended)

From the **repo root**, use **`package.json`** so you do not `cd` into the nested app folder:

| Command | What it does |
|---------|----------------|
| `npm run install:app` | `npm install` in `FS25_FarmDashboard_App/` |
| `npm run start` | Launch Electron dev (`electron .`) |
| `npm run test` | Jest |
| `npm run build:app` | Windows NSIS installer (`dist`) |
| `npm run pack:app` | Unpacked `--dir` build (`pack`) |
| `npm run package:mod` | `tools/Zip-FarmDashboardMod.ps1` → **`FS25_FarmDashboard.zip`** |
| `npm run build:all` | `package:mod` then `build:app` |
| `npm run verify` | `verify:electron-pack` + `i18n:verify` (CI parity) |

App-local scripts (`dist:fresh`, `i18n:fill`, …) still exist under `FS25_FarmDashboard_App/package.json` and can be run with `npm run <script> --prefix FS25_FarmDashboard_App` or from that directory.

| Path | Purpose |
|------|---------|
| [**app/**](./app/) | Electron **npm** helpers (run from `FS25_FarmDashboard_App/`): `run-electron-builder.mjs`, `electron-builder-fresh-output.mjs`, **`verify-electron-pack-files.mjs`** (`npm run verify:electron-pack`), `parity.js`, field CSV export, install-lock / clean-build **PowerShell**. |
| [**Export-ModStoreImages.ps1**](./Export-ModStoreImages.ps1) | Packaged into the Windows app (`extraResources`) for mod shop texture export. |
| [**Zip-FarmDashboardMod.ps1**](./Zip-FarmDashboardMod.ps1) | Build **`FS25_FarmDashboard.zip`** with **only** `modDesc.xml`, `icon.png`, and `src\` at archive root (from `FS25_FarmDashboard_Mod\`). |

**npm scripts** in `FS25_FarmDashboard_App/package.json` invoke **`../tools/app/...`** — keep that relative path when adding scripts.

See also: [**docs/README.md**](../docs/README.md), [**docs/DEVELOPER_HANDOVER.md**](../docs/DEVELOPER_HANDOVER.md) §Build.
