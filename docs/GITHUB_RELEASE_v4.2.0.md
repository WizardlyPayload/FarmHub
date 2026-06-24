# GitHub Release — FS25 Farm Dashboard 4.2.0 (copy/paste)

Use the markdown **below the line** as the **Release description** on GitHub for tag **`v4.2.0`**.

**Attach to this release:**

| File | Required |
|------|----------|
| `FS25-Farm-Dashboard-Setup-4.2.0.exe` | Yes — **exact name** must match `latest.yml` |
| `latest.yml` | **Yes** — auto-update will not work without it |
| `FS25_FarmDashboard.zip` | Yes (mod **3.4.0.0**) |

Build output (default): `%USERPROFILE%\Documents\FarmDash Final Output\` when using `npm run build:all`.

---

<!-- ========== COPY FROM HERE (GitHub Release description) ========== -->

# FS25 Farm Dashboard 4.2.0

**App 4.2.0** · **Mod 3.4.0.0** · Windows 10/11

**Download on this page:** `FS25 Farm Dashboard Setup 4.2.0.exe` + `FS25_FarmDashboard.zip` (+ `latest.yml` for auto-update)

---

## Install order (required)

1. **`FS25_FarmDashboard.zip` (3.4.0.0)** → FS25 `mods\` → enable on each save → **load save once**.
2. **`FS25 Farm Dashboard Setup 4.2.0.exe`** → launch → **Settings → Servers & saves** (local path or FTP).
3. Open **[http://localhost:8766](http://localhost:8766)**.

**Guide:** [USER_MANUAL.md](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/USER_MANUAL.md)

---

## Updating

- **From 4.0.x – 4.1.x:** **Settings → Check for updates** → **Restart and install** (needs **`latest.yml`** on this release).
- **Always replace the mod zip** on every FS25 host / dedicated server when updating the app.

---

## What's new in 4.2.0

### Storage (Economy tab)
- **Map-specific crops named correctly** — e.g. Witcombe **Linseed** no longer shows as “Fill type #190”.
- **Silo moisture & grade** — per-location moisture % and quality grade export for silos scanned via loading stations (was always “—” before).

### Equipment & fleet (from 4.1.5 line)
- **Correct store images** — mod exports authoritative `storeImage`; app matches exactly before fuzzy fallback.
- **No duplicate vehicles** on dedicated servers — merge pairs by config + farm; fleet scoped to active farm.

### Stability & integrations (4.1.4 – 4.1.1)
- Courseplay combine-unloader menu crash fix after buying vehicles.
- RealisticLivestock counts and table/total agreement.
- Mown grass field status; mod-config save preservation; CORS hardening; offline last-known moisture.

**Full history:** [CHANGELOG.md](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/CHANGELOG.md)

---

## Dedicated server

Install mod on the **host**, restart server, load save once. For FTP: confirm `data.json` updates. Fleet map offset? Delete `%APPDATA%\fs25-farm-dashboard\map_overviews\` and reopen Fleet map.

---

## Authors

[JoshWalki](https://github.com/JoshWalki) — original Farm Dashboard · **WizardlyPayload** — app, mod maintenance, releases. [AUTHORS.md](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/AUTHORS.md)

**Issues:** FS25 version, SP vs dedicated, **app 4.2.0**, **mod 3.4.0.0**, local vs FTP — [Open an issue](https://github.com/WizardlyPayload/FarmHub/issues).
