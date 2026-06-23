# GitHub Release — FS25 Farm Dashboard 4.1.5 (copy/paste)

Use the markdown **below the line** as the **Release description** on GitHub for tag **`v4.1.5`**.

**Attach to this release:**

| File | Required |
|------|----------|
| `FS25-Farm-Dashboard-Setup-4.1.5.exe` | Yes — **exact name** must match `latest.yml` |
| `latest.yml` | **Yes** — auto-update will not work without it |
| `FS25_FarmDashboard.zip` | Yes (mod **3.3.21.2**) |

Build output (default): `%LOCALAPPDATA%\fs25-farm-dashboard-electron-out\` or `%USERPROFILE%\Documents\FarmDash Final Output\` when using `npm run build:all`.

**Before publishing:** run `npm run build:all` from the repo root and attach the three files above from your output folder.

---

<!-- ========== COPY FROM HERE (GitHub Release description) ========== -->

# FS25 Farm Dashboard 4.1.5

**App 4.1.5** · **Mod 3.3.21.2** · Windows 10/11

**Download on this page:** `FS25 Farm Dashboard Setup 4.1.5.exe` + `FS25_FarmDashboard.zip` (+ `latest.yml` for auto-update)

---

## Install order (required)

1. **`FS25_FarmDashboard.zip` (3.3.21.2)** → FS25 `mods\` → enable on each save → **load save once**.
2. **`FS25 Farm Dashboard Setup 4.1.5.exe`** → launch → **Settings → Servers & saves** (local path or FTP).
3. Open **[http://localhost:8766](http://localhost:8766)**.

**Illustrated guide:** [USER_MANUAL.md](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/USER_MANUAL.md)

---

## Updating from 4.1.0 – 4.1.4

Packaged clients on **4.1.x**: **Settings → Check for updates** → **Restart and install** (when this release includes **`latest.yml`**). You **must** replace the **mod zip on every FS25 host / dedicated server** — several fixes in this line require mod **3.3.21.1+** or **3.3.21.2**.

---

## What's new in 4.1.5

### Correct equipment pictures
- Some vehicles/implements showed a **similar-but-wrong** store icon because the dashboard guessed from the display name. The mod now exports the game's own store-icon basename per vehicle (`storeImage`), and the app matches it **exactly** before any fuzzy fallback. **Requires mod 3.3.21.2.**
- The **Scan mod images** tool names extracted `store_*` / `icon_*` textures by authoritative basename and migrates images from older display-name exports automatically.

### Duplicate vehicles fixed
- The fleet tab could list the **same physical vehicle twice** on dedicated servers (live Lua position vs saved XML) or briefly show other farms' equipment after a refresh. Vehicle merge now pairs by **config file + farm**; the fleet grid stays scoped to the active farm.

### Carried over from 4.1.4
- **Courseplay menu crash** after buying a vehicle (`CpAIJobCombineUnloader` `isa` error) — fixed in mod **3.3.21.1+**.
- **Livestock table matches totals** on RealisticLivestock multi-pen barns.
- **Mown grass fields** show **Harvested / Mown · regrowing** instead of a false "Growing" stage.

### Carried over from 4.1.3
- **Livestock counts match the game** when RealisticLivestock only exports a subset of animals per pen.

### Carried over from 4.1.2
- **Mod-config save** no longer wipes Red Tape, stock, diagnostics, or performance tuning in `config.xml`.

### Carried over from 4.1.1
- **CORS lockdown** — dashboard API readable only from loopback, your LAN IP, and official farmdashboard.co.uk domains.
- **`/api/status`** returns safe metadata only.
- **Offline last-known moisture** for fields, environment, and bales when the game/server is closed.

### From 4.1.0 (baseline)
- Fleet map, Economy → Storage, optional ADS / Moisture System / Red Tape integrations — see [4.1.0 release notes](https://github.com/WizardlyPayload/FarmHub/releases/tag/v4.1.0).

---

## Dedicated server note

Replace the mod on the server, restart, then restart the Farm Dashboard app. For FTP setups, confirm `data.json` updates after a save load. If fleet map pins look offset, delete `%APPDATA%\fs25-farm-dashboard\map_overviews\` and reopen Fleet map.

---

## Documentation

| Doc | Purpose |
|-----|---------|
| [USER_MANUAL.md](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/USER_MANUAL.md) | Full how-to with screenshots |
| [CHANGELOG.md](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/CHANGELOG.md) | Version history |
| [INSTALL.md](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/INSTALL.md) | Detailed install |

**Issues:** FS25 version, SP vs dedicated, **app 4.1.5**, **mod 3.3.21.2**, local vs FTP — [Open an issue](https://github.com/WizardlyPayload/FarmHub/issues).

---

<!-- ========== END COPY ========== -->
