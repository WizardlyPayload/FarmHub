# Screenshots for the V5 documentation

The 53 indexed core and companion PNGs in [`doc-screenshots/current-5057/`](doc-screenshots/current-5057/) were refreshed from the **installed V5 5.1.17 app** at 1920 x 1080. The directory keeps its historical name so existing links do not break. These pages use **held** demo exports, not live gameplay at capture time. `capture-index.json` records the 44 core/top-page captures; `detail-capture-index.json` records 29 companion top/lower captures, including the 20 top-page replacements. Twelve Settings PNGs were captured separately from the installed 5.1.17 Electron app on the Ally, maximized at 1920 x 1080. Sensitive values were redacted before copying into this guide.

Older PNGs directly under `doc-screenshots/` remain as **older V5 illustrations** only where a current image is not available. A V4 installer image is never presented as V5.

## Current image groups

- `base-*.png`: eight core pages on Riverbend with no optional RF suite.
- `suite-*.png`: Witcombe RF and companion demo core pages, plus seven mod-gated pages.
- `pf-fields.png`: Montana Precision Farming field example.
- `mod-<id>.png`: all 20 dedicated third-party companion pages for which a demo source exists. The [optional-mod guide](COMPANION_MODS.md) links the relevant image next to the mod.

![Current base overview](doc-screenshots/current-5057/base-overview.png)

`capture-current-help.cjs` uses a headless browser against port 8768. It does **not** launch FS25, change saves, expose credentials, or take over the visible PC screen. The chosen slots are `savegame4` (base), `savegame10` (RF plus companions), `savegame18` (PF plus companions), `savegame19` (RF plus ADS), and `savegame3` (fluctuating diesel). If a required source is absent, the script stops instead of substituting another save.

## Manual images still needed before publication

- Genuine **5.1.17 installer welcome and finished** screens; do not reuse V4 pictures.
- A **clean first launch** with no old sources or visible passwords.
- The **new multiplayer link/re-pair** prompt and selected MP source, with private details redacted.
- **Tablet LAN** sign-in and portrait dashboard, without a visible password.
- An **Invoices** page on a save where that mod is genuinely loaded; current demo saves lack it.

These are honest capture gaps. The manuals use real available images and label older examples. Do not describe the missing shots as completed acceptance.
