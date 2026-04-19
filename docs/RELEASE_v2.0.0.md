# FS25 Farm Dashboard — Release v2.0.0

**Product:** FS25 Farm Dashboard  
**Version:** 2.0.0  
**Platform:** Windows (Electron + NSIS installer)  
**Release date:** 2026 (use repository tags or build metadata for the exact date)

---

## Overview

Version **2.0.0** is a major release focused on **end-to-end language support** (installer → first-run Server Manager → dashboard), a **polished Windows setup experience**, and **automatic ImageMagick** setup for the mod image pipeline. It also refines FTP polling, HTTP feed configuration, and the first-run Server Manager workflow.

This document is suitable for **GitHub Releases**, **internal handoff**, and **changelog** archives. It includes everything from earlier v2.0.0 draft notes plus **shipping improvements** added during final QA.

---

## Highlights

### Language across the whole journey

- **Windows NSIS installer** opens on a **custom language page** (before licence and directory steps). The selected locale drives installer UI where applicable and seeds the app’s default language.
- **Persistence:** The installer writes a two-letter locale code to:
  - `%APPDATA%\fs25-farm-dashboard\install-locale.txt` (consumed on **first app launch**), and  
  - **`HKCU\Software\fs25-farm-dashboard\installer_locale`** and **`%TEMP%\farmdash-install-locale.txt`** so the choice **survives a UAC elevation restart** (for example when choosing **install for all users** / per-machine install). After restart, the language step **pre-selects** your earlier choice and explains that the wizard may have restarted for administrator rights—so you are not forced to hunt for the same language again.
- **Server Manager (`setup.html`)** loads strings from `web/locales/translations.json` via IPC; changing language reloads the page in the new locale. The language control is a **compact dropdown in the top-right corner**; the longer explanation is available as a **tooltip** on the control (hover the dropdown).
- **Dashboard** uses the shared catalog (`web/assests/js/i18n/i18n.js`, `web/locales/translations.json`) with **English fallback** for any missing per-locale string.

### Installation experience

- **ImageMagick helper:** After files are installed, NSIS runs `resources/install-imagemagick.ps1` so **`magick`** is available for DDS→PNG conversion in the mod image workflow. Resolution order is documented in the script (bundled/offline paths → existing install → **winget** → **Chocolatey** → official download, as applicable).
- **No flashing PowerShell window:** The installer invokes PowerShell with **`-WindowStyle Hidden`** and **`-NonInteractive`** so the ImageMagick step does not pop a visible blue console. (Separate tools invoked inside the script, such as **winget**, may still show their own UI or UAC prompts—that is independent of the main PowerShell host window.)

### App capabilities (summary)

- **Local saves** and **dedicated FTP** servers; optional **HTTP feed** fields for richer XML-related data when the server exposes Giants-style feeds.
- **FTP polling:** Configurable delay, interval (1–25 minutes), and **sync vs staggered** scheduling across servers.
- **Mod shop images:** Scan FS25 mods for dashboard images; DDS handling uses ImageMagick and/or bundled **texconv** when present.

---

## Detailed changes

### Windows installer (NSIS)

| Area | Description |
|------|-------------|
| Language first | Custom welcome page lists EU/EEA-oriented locales; choice is stored for the app and for restart-safe persistence (see above). |
| Per-user locale file | `%APPDATA%\fs25-farm-dashboard\install-locale.txt` — read on first launch so Server Manager and dashboard default match the installer. |
| Elevated restart | Registry + temp file keep locale when the wizard restarts after UAC for all-users install. |
| ImageMagick | `customInstall` runs `install-imagemagick.ps1` from installed `resources\`. |
| Console visibility | PowerShell execution uses hidden, non-interactive flags to avoid an unnecessary visible console during setup. |

Custom logic lives in **`build/installer.nsh`**. `package.json` may set `build.nsis.warningsAsErrors` to `false` when third-party NSIS integration emits benign warnings.

### First-run Server Manager

| Area | Description |
|------|-------------|
| i18n | `web/assests/js/setup-i18n.js`; strings keyed under `setup.*` in generated `translations.json`. |
| Language UI | Small **fixed top-right** label + dropdown; full hint text on **tooltip** (`data-setup-i18n-title` / `setup.langHint`). |
| Behaviour | Changing language notifies the main process (`set-stored-locale`) and reloads with `?lang=` so the UI matches immediately. |

### Dashboard

- Theme & Color Settings include a language selector; dashboard uses `data-i18n` and syncs with stored locale / `farmdash_locale` as implemented in `main.js` and `i18n.js`.

### Documentation shipped with the repo

- Root **`README.md`**: install, dev commands, project layout, i18n maintenance (`web/locales/build-translations.mjs`).
- **`docs/RELEASE_v2.0.0.md`**: this file — full v2.0.0 release description.

---

## Technical notes for maintainers

- Regenerate merged translations (do not edit `translations.json` by hand for routine changes):  
  `node web/locales/build-translations.mjs`
- **`electron-store`** holds `locale` (two-letter code) alongside server `config`.
- NSIS include: **`build/installer.nsh`** referenced from `package.json` → `build.nsis.include`.

---

## Upgrade from older builds

- There is **no automatic migration** of language beyond the new **`install-locale.txt`** / **`locale`** store behaviour. Existing users keep prior behaviour until they change language in **Theme & Color Settings** or reinstall with the new installer.
- If users previously installed without the new installer, the first run of **2.0.0** may still pick up **`install-locale.txt`** after a fresh install, or fall back to English until they set language in-app.

---

## Verification checklist (optional)

- [ ] Installer: language page → next steps → finish; confirm `install-locale.txt` exists under `%APPDATA%\fs25-farm-dashboard\`.
- [ ] **Install for all users:** after UAC, language page shows **pre-selected** locale and short restart explanation.
- [ ] Server Manager: language dropdown **top-right**; tooltip shows full hint; change language reloads UI.
- [ ] Dashboard: language in Theme settings matches stored locale.
- [ ] ImageMagick step: no **blue PowerShell** window during install (child processes may still prompt separately).

---

## Credits

**Authors:** JoshWalki, WizardlyPayload  

Bundled third-party components (Electron, Chromium, ImageMagick when installed, etc.) remain subject to their respective licences. Game and mod content are property of Giants Software and respective mod authors.
