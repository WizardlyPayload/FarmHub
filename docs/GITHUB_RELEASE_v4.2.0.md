# GitHub Release — FS25 Farm Dashboard 4.2.0 (copy/paste)

Use the markdown **below the line** as the **Release description** on GitHub for tag **`v4.2.0`**.

**Attach to this release:**

| File | Required |
|------|----------|
| `FS25-Farm-Dashboard-Setup-4.2.0.exe` | Yes — **exact name** must match `latest.yml` |
| `latest.yml` | **Yes** — auto-update will not work without it |
| `FS25_FarmDashboard.zip` | Yes (mod **3.4.0.6**) |

Build output (default): `%USERPROFILE%\Documents\FarmDash Final Output\` when using `npm run build:all`.

---

<!-- ========== COPY FROM HERE (GitHub Release description) ========== -->

# FS25 Farm Dashboard 4.2.0

**App 4.2.0** · **Mod 3.4.0.6** · Windows 10/11

**Download on this page:** `FS25 Farm Dashboard Setup 4.2.0.exe` + `FS25_FarmDashboard.zip` (+ `latest.yml` for auto-update)

---

## Install order (required)

1. **`FS25_FarmDashboard.zip` (3.4.0.6)** → FS25 `mods\` → enable on each save → **load save once**.
2. **`FS25 Farm Dashboard Setup 4.2.0.exe`** → launch → **Settings → Servers & saves** (local path or FTP).
3. Open **[http://localhost:8766](http://localhost:8766)**.

**In-game mod settings:** ESC → Settings → **Farm Dashboard** — enable **Production collector** and **Economy collector** if those sections stay empty (defaults can be off on existing saves).

**Guide:** [USER_MANUAL.md](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/USER_MANUAL.md)

---

## Updating

- **From 4.0.x – 4.1.x:** **Settings → Check for updates** → **Restart and install** (needs **`latest.yml`** on this release).
- **Always replace the mod zip** on every FS25 host / dedicated server when updating the app.

---

## What's new in 4.2.0

### Storage & economy
- **Map-specific crop names** — e.g. Witcombe **Linseed**, Riverbend **Honey** / **Water** (not “Fill type #N”) when Economy collector is on.
- **Silo moisture & grade** — per-location moisture % and quality in Economy → Storage.

### Livestock & pastures
- **Base-game cows** — breed labels, health, and value on vanilla pens.
- **Food duration hints** — estimated days until pasture food runs out.
- **Pen detail only** — no duplicate modal when opening synthetic animal rows.

### Productions & weather
- **Production chains on base maps** — improved collector for FS25 map-owned factories (bakery, mill, etc.).
- **Two-column productions layout** — denser grid on wide screens.
- **Weather forecast temps** — fixed `null°` and sparse XML merge.

### Notifications & fleet
- **Urgent notifications** — pastures, fuel/wear/breakdowns, high-priority field tasks.
- **Correct store images** and **no duplicate vehicles** on dedicated servers (4.1.5 line).
- **Courseplay**, RealisticLivestock, grass field status, security hardening (4.1.x).

**Full history:** [CHANGELOG.md](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/CHANGELOG.md)

---

## Dedicated server

Install mod on the **host**, restart server, load save once. For FTP: confirm `data.json` updates. Fleet map offset? Delete `%APPDATA%\fs25-farm-dashboard\map_overviews\` and reopen Fleet map.

---

## Authors

[JoshWalki](https://github.com/JoshWalki) — original Farm Dashboard · **WizardlyPayload** — app, mod maintenance, releases. [AUTHORS.md](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/AUTHORS.md)

**Issues:** FS25 version, SP vs dedicated, **app 4.2.0**, **mod 3.4.0.6**, local vs FTP — [Open an issue](https://github.com/WizardlyPayload/FarmHub/issues).

**Community:** [Discord](https://discord.gg/D4sEHM59)
