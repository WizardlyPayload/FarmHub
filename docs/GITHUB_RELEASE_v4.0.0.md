# GitHub Release — FS25 Farm Dashboard 4.0.0 (copy/paste)

Use the markdown **below the line** as the **Release description** on GitHub for tag **`v4.0.0`**.

**Attach to this release:**

| File | Required |
|------|----------|
| `FS25-Farm-Dashboard-Setup-4.0.0.exe` | Yes — **exact name** must match `latest.yml` |
| `latest.yml` | **Yes** — auto-update will not work without it |
| `FS25_FarmDashboard.zip` | Yes (mod **3.0.0.0**) |

Build output (default): `%LOCALAPPDATA%\fs25-farm-dashboard-electron-out\`

---

<!-- ========== COPY FROM HERE (GitHub Release description) ========== -->

# FS25 Farm Dashboard 4.0.0

**App 4.0.0** · **Mod 3.0.0.0** · Windows 10/11

**Download on this page:** `FS25 Farm Dashboard Setup 4.0.0.exe` + `FS25_FarmDashboard.zip` (+ `latest.yml` for auto-update)

---

## About this project (fork & lineage)

**FarmHub** is the **current home** for FS25 Farm Dashboard — continued development of Josh Walki’s original idea, packaged as a Windows app with a maintained FS25 mod.

| Project | Role | Link |
|---------|------|------|
| **JoshWalki / FarmDashboard** | Original mod + web dashboard concept (Josh Walki) | [github.com/JoshWalki/FarmDashboard](https://github.com/JoshWalki/FarmDashboard) |
| **WizardlyPayload / FS25-Farm-Dashboard** | Public **2.0.0** line — Electron desktop app fork of Josh’s work | [github.com/WizardlyPayload/FS25-Farm-Dashboard](https://github.com/WizardlyPayload/FS25-Farm-Dashboard/releases) |
| **WizardlyPayload / FarmHub** *(this repo)* | **4.0.0** stable line — further development, security hardening, FTP/multi-server, rules engine, auto-update | [github.com/WizardlyPayload/FarmHub](https://github.com/WizardlyPayload/FarmHub/releases) |

If you used the **public 2.0.0** release or Josh’s original repo, you do **not** need to uninstall first — install the **mod** and **app** from this release and follow the steps below. Full delta: [Upgrade from 2.0.0](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/UPGRADE_FROM_FS25-Farm-Dashboard.md).

**Authors:** [JoshWalki](https://github.com/JoshWalki) (Josh) — original Farm Dashboard & FS25 mod · **WizardlyPayload** — Electron app, maintenance, releases, documentation. See [AUTHORS.md](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/AUTHORS.md).

---

## How to install & use (read this first)

**Install order matters.** The Windows app cannot read your farm until the **game mod** has created `data.json` for each save.

### Step 1 — Install the mod (FS25)

1. Download **`FS25_FarmDashboard.zip`** from **this release**.
2. Copy it into your FS25 mods folder:

   `Documents\My Games\FarmingSimulator2025\mods\`

3. In FS25: **Mod selection** → enable **Farm Dashboard** on **each save** you want on the dashboard.
4. **Load that save once** in the world (single-player, host, or dedicated). This creates:

   `Documents\My Games\FarmingSimulator2025\modSettings\FS25_FarmDashboard\<savegame>\data.json`

### Step 2 — Install the Windows app

1. Download and run **`FS25 Farm Dashboard Setup 4.0.0.exe`** from **this release**.
2. Launch **Farm Dashboard** from the Start menu.
3. Open **Settings (gear) → Servers & saves**:
   - **Local save:** pick the folder that matches your game save (often auto-detected).
   - **Dedicated server:** enter FTP host, credentials, and save slot.

### Step 3 — Open the dashboard

| Where | URL |
|-------|-----|
| **This PC** | [http://localhost:8766](http://localhost:8766) |
| **Phone / tablet (same Wi‑Fi)** | `http://<your-PC-LAN-IP>:8766` |

For LAN access: **Settings → LAN access** → enable, set a **strong password** (not `admin` / `farmhub`). See [SECURITY.md](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/SECURITY.md).

**Full illustrated guide:** [USER_MANUAL.md](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/USER_MANUAL.md) · **Quick install:** [INSTALL.md](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/INSTALL.md)

---

## Updating from Farm Dashboard 3.9.0

If you already have **3.9.0** installed:

1. Launch the **packaged** app (not a dev `npm start` build).
2. Wait ~10 seconds **or** open **Settings → Check for updates**.
3. When the download finishes, choose **Restart and install**.

You still need **`latest.yml`** attached to **this** published release (not a Draft).

---

## What’s new in 4.0.0 (this release)

- **Stable auto-update** — packaged **3.9 → 4.0** via GitHub Releases + `latest.yml`.
- **Mod version badge** — unobtrusive navbar hint when the in-game mod is older than the app expects (update `FS25_FarmDashboard.zip` from Releases).
- **Mod 3.0.0.0** — exports `modVersion` in live `data.json` for version checks.
- **230 automated tests**, CI, and full docs/wiki refresh for the **4.0** line.

---

## What’s new since public 2.0.0 (cumulative)

Everything below is included in **4.0.0** compared to [WizardlyPayload/FS25-Farm-Dashboard **2.0.0**](https://github.com/WizardlyPayload/FS25-Farm-Dashboard/releases) and Josh’s earlier [FarmDashboard](https://github.com/JoshWalki/FarmDashboard) line.

### Look & feel

- **Section background art** — full-screen crossfade per tab (Home, Livestock, Vehicles, Fields, Economy, Pastures, Productions).
- **Themes** — Settings → Theme.
- **27 languages** — full UI i18n with English fallback per string.

### Fields & farm workflow

- **Offline rules engine** — local “Suggested next step” on field cards (harvest, lime, fertiliser, weeds, rolling, mulch → cultivate before seed, post-harvest pipeline). **No cloud / subscription.**
- **Windrows & forage** — `windrowLiters`, windrow type, loose straw/grass/hay probes, **bale count on field**, card badges; **2000 L** noise floor so tiny patches don’t block workflow.
- **Field clusters & exclusions** — merge adjacent same-crop fields; hide farmland IDs per server.
- **Precision Farming** — N/pH overlays when the save exports PF data.
- **Realtime scoped to active server** — no cross-server field overwrites on multi-server setups.

### Livestock, vehicles, economy

- **Livestock detail API** — on-demand pen detail for large herds; LOD fan-out for browser safety.
- **Pasture warnings** — telemetry missing (info) vs critical low stock (warning).
- **Vehicle thumbnails** — mod shop image export + PNG matching on cards.
- **Lua + XML merge** — live mod data + savegame XML; staggered mod collectors; **FTP** multi-server polling.

### Settings, security & desktop app

- **Unified Settings** — servers, FTP, LAN, section toggles, SimHub second-screen page.
- **LAN security** — rejects default credentials and weak passwords when LAN is enabled.
- **Offline cache** — local saves restore last merged data on app restart (FTP always pulls fresh).
- **NSIS installer** — clean upgrades; optional wipe on uninstall.
- **DOM XSS hardening** across major dashboard sections.

**Version-by-version history:** [CHANGELOG.md](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/CHANGELOG.md)

---

## Upgrade checklist (from 2.0.0 or Josh’s original)

1. Replace the mod with **`FS25_FarmDashboard.zip` (3.0.0.0)** → load **each save once**.
2. Install **`Setup 4.0.0.exe`** → open **http://localhost:8766**.
3. Re-check **Settings → Servers & saves** (especially **FTP** credentials and save slots).

---

## Documentation & support

| Doc | Purpose |
|-----|---------|
| [Releases](https://github.com/WizardlyPayload/FarmHub/releases) | Download latest app + mod |
| [Wiki](https://github.com/WizardlyPayload/FarmHub/wiki) | Install, troubleshooting, security |
| [USER_MANUAL.md](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/USER_MANUAL.md) | Full how-to with screenshots |
| [UPGRADE_FROM_FS25-Farm-Dashboard.md](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/UPGRADE_FROM_FS25-Farm-Dashboard.md) | Detailed delta from public **2.0.0** |

**Reporting issues:** include FS25 version, SP vs dedicated, **app 4.0.0**, **mod 3.0.0.0**, local vs FTP, and steps to reproduce. [Open an issue](https://github.com/WizardlyPayload/FarmHub/issues).

---

<!-- ========== END COPY ========== -->
