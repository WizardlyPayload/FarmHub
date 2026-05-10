# FarmHub — Tools

All scripts live under **`tools/`** at the repository root (**FarmHub**).

| Path | Purpose |
|------|---------|
| [**app/**](./app/) | Electron **npm** helpers (run from `FS25_FarmDashboard_App/FS25_FarmDashboard_App/`): `run-electron-builder.mjs`, `electron-builder-fresh-output.mjs`, `parity.js`, field CSV export, install-lock / clean-build **PowerShell**. |
| [**Export-ModStoreImages.ps1**](./Export-ModStoreImages.ps1) | Packaged into the Windows app (`extraResources`) for mod shop texture export. |
| [**Zip-FarmDashboardMod.ps1**](./Zip-FarmDashboardMod.ps1) | Build **`FS25_FarmDashboard.zip`** with **only** `modDesc.xml`, `icon.png`, and `src\` at archive root (from `FS25_FarmDashboard_Mod\FS25_FarmDashboard_Mod\`). |

**npm scripts** in `FS25_FarmDashboard_App/FS25_FarmDashboard_App/package.json` invoke **`../../tools/app/...`** — keep that relative path when adding scripts.

See also: [**docs/README.md**](../docs/README.md), [**docs/DEVELOPER_HANDOVER.md**](../docs/DEVELOPER_HANDOVER.md) §Build.
