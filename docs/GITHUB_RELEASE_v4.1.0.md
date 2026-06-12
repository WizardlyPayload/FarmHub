# GitHub Release — FS25 Farm Dashboard 4.1.0 (copy/paste)

Use the markdown **below the line** as the **Release description** on GitHub for tag **`v4.1.0`**.

**Attach to this release:**

| File | Required |
|------|----------|
| `FS25-Farm-Dashboard-Setup-4.1.0.exe` | Yes — **exact name** must match `latest.yml` |
| `latest.yml` | **Yes** — auto-update will not work without it |
| `FS25_FarmDashboard.zip` | Yes (mod **3.1.0.0**) |

Build output (default): `%LOCALAPPDATA%\fs25-farm-dashboard-electron-out\`

---

<!-- ========== COPY FROM HERE (GitHub Release description) ========== -->

# FS25 Farm Dashboard 4.1.0

**App 4.1.0** · **Mod 3.1.0.0** · Windows 10/11

**Download on this page:** `FS25 Farm Dashboard Setup 4.1.0.exe` + `FS25_FarmDashboard.zip` (+ `latest.yml` for auto-update)

---

## Install order (required)

1. **`FS25_FarmDashboard.zip` (3.1.0.0)** → FS25 `mods\` → enable on each save → **load save once**.
2. **`FS25 Farm Dashboard Setup 4.1.0.exe`** → launch → **Settings → Servers & saves** (local path or FTP).
3. Open **[http://localhost:8766](http://localhost:8766)**.

**Illustrated guide:** [USER_MANUAL.md](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/USER_MANUAL.md)

---

## Updating from 4.0.0

Packaged **4.0.0** clients: **Settings → Check for updates** → **Restart and install**. You still need the **new mod zip** on every FS25 host / dedicated server.

---

## What's new in 4.1.0

### Fleet map
- Live vehicle pins on your map's PDA overview texture.
- Clips decorative desk borders so pins match in-game coordinates.
- Pan, zoom, fit-all-pins, multi-farm legend.

### Economy → Storage
- **Silo & bunker stock** table with sell hints and optional moisture/grade.
- **Bale stock** — separate **on-field** vs **yard/shed/storage** totals with fill-type breakdown.
- **Pallets & big bags** grid.

### Mod 3.1.0.0
- Unified bale inventory pipeline (world scan + object storage sheds).
- Separate **`baleInventory`** collector from **`stock`**.
- Fill-type names fixed (incl. Triticale); dedicated-server double-count fixes.
- **`redTape`** compliance export when Red Tape mod is active.

### Integrations (optional third-party mods)
- **Advanced Damage System** — workshop, inspection, breakdown parts on vehicle cards.
- **Moisture System** — moisture % badge on field cards.
- **Red Tape** — Compliance tab under Economy.

### Quality
- **279** Jest + **17** `.mjs` tests; CI runs full suite.
- Docs + user manual updated with new screenshots.

---

## Dedicated server note

Replace the mod on the server, restart, then restart the Farm Dashboard app. If fleet map pins look offset, delete `%APPDATA%\fs25-farm-dashboard\map_overviews\` and reopen Fleet map.

---

## Documentation

| Doc | Purpose |
|-----|---------|
| [USER_MANUAL.md](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/USER_MANUAL.md) | Full how-to with screenshots |
| [CHANGELOG.md](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/CHANGELOG.md) | Version history |
| [INSTALL.md](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/INSTALL.md) | Detailed install |

**Issues:** FS25 version, SP vs dedicated, **app 4.1.0**, **mod 3.1.0.0**, local vs FTP — [Open an issue](https://github.com/WizardlyPayload/FarmHub/issues).

---

<!-- ========== END COPY ========== -->
