# Screenshots for the V5 documentation

The 53 core and companion PNGs in [`doc-screenshots/current-526/`](doc-screenshots/current-526/) were captured from the **installed V5 5.2.6 app** in a headless 1920 × 1080 viewport on 29 October 2026. No desktop chrome is in these screenshots. They show **held** demo exports, not live gameplay at capture time. `capture-index.json` records 44 core/top-page jobs; `detail-capture-index.json` records 29 companion top/lower jobs, including replacement top images. The twelve Settings PNGs remain from the installed 5.1.17 Electron app on the Ally because the browser capture does not expose the Electron settings bridge. Those older Settings images were maximized at 1920 × 1080 and had sensitive values hidden.

Four Catuaí captures in [`doc-screenshots/current-527/`](doc-screenshots/current-527/) show Save overview, Orchards, Productions and Fleet map from the **installed V5 5.2.7 app** at 1920 × 1080. The source is a registered local save with recorded data; the game was left untouched for these browser captures. `dlc-capture-index.json` records their source slot, route and capture time. The Fleet map image decoded successfully before capture.

Older PNGs directly under `doc-screenshots/` remain as **older V5 illustrations** only where a current image is not available. A V4 installer image is never presented as V5.

## Current image groups

- `base-*.png`: eight core pages on Riverbend with no optional RF suite.
- `suite-*.png`: Witcombe RF and companion demo core pages, plus seven mod-gated pages.
- `pf-fields.png`: Montana Precision Farming field example.
- `mod-<id>.png`: all 20 dedicated third-party companion pages for which a demo source exists. The [optional-mod guide](COMPANION_MODS.md) links the relevant image next to the mod.

![Current base overview](doc-screenshots/current-526/base-overview.png)

`capture-current-help.cjs` uses a headless browser against port 8768. It does **not** launch FS25, change saves, expose credentials, or take over the visible PC screen. The chosen slots are `savegame4` (base), `savegame10` (RF plus companions), `savegame18` (PF plus companions), `savegame19` (RF plus ADS), and `savegame3` (fluctuating diesel). If a required source is absent, the script stops instead of substituting another save.

## Manual images still needed before publication

- Genuine **5.2.6 installer welcome and finished** screens suitable for public use; the private Ally acceptance evidence includes the installer flow, but those desktop captures have not been added to this guide.
- Full-screen **Orchards and new DLC cards** on a suitable loaded save. The private PC/Ally acceptance evidence verifies their function, but the public demo sources used by this capture set do not expose all of them.
- A **clean first launch** with no old sources or visible passwords.
- The **new multiplayer link/re-pair** prompt and selected MP source, with private details redacted.
- **Tablet LAN** sign-in and portrait dashboard, without a visible password.
- An **Invoices** page on a save where that mod is genuinely loaded; current demo saves lack it.

These are honest capture gaps. The manuals use real available images and label older examples. Do not describe the missing shots as completed acceptance.
