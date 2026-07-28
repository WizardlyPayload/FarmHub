# GitHub Release — FS25 Farm Dashboard 4.2.1 (copy/paste)

Use the markdown **below the line** as the **Release description** on GitHub for tag **`v4.2.1`**.

**Attach to this release:**

| File | Required |
|------|----------|
| `FS25-Farm-Dashboard-Setup-4.2.1.exe` | Yes — **exact name** must match `latest.yml` |
| `FS25-Farm-Dashboard-Setup-4.2.1.exe.blockmap` | Yes (auto-update delta) |
| `latest.yml` | **Yes** — auto-update will not work without it |
| `FS25_FarmDashboard.zip` | Yes (mod **3.4.0.7**) |

Build output (default): `%USERPROFILE%\Documents\FarmDash Final Output\` when using `npm run build:all`.

This is the **classic 4.x** channel (`latest.yml`). It is **not** the Realistic Farming 5.x edition (`latest-rf.yml`).

---

<!-- ========== COPY FROM HERE (GitHub Release description) ========== -->

# FS25 Farm Dashboard 4.2.1

**App 4.2.1** · **Mod 3.4.0.7** · Windows 10/11 · **Classic 4.x line**

**Download on this page:** `FS25-Farm-Dashboard-Setup-4.2.1.exe` + `FS25_FarmDashboard.zip` (+ `latest.yml` for auto-update)

---

## Hotfix — Farming Simulator 1.21 log spam

After Farming Simulator’s **1.21** update, the dashboard mod could fill the game log with repeated `copyFile` errors while trying to save a map overview image for the fleet map.

**What we fixed:** that copy now uses the correct yes/no flag the game expects, and it will not keep retrying forever if the overview image cannot be copied.

This does **not** mean the game is broken — it was noisy logs and a possible map-overview hiccup, not a crash of Farming Simulator itself.

---

## How to update (from App 4.2 / Mod 3.4.0.6)

1. Close the **Farm Dashboard** app.
2. Close **Farming Simulator** (and stop the dedicated server if you host one).
3. Download the new **app installer** and the new **`FS25_FarmDashboard.zip`** from this release (or itch.io).
4. Install / replace the Windows app. Replace the mod zip in  
   `Documents\My Games\FarmingSimulator2025\mods\`  
   (delete the old zip and any unpacked `FS25_FarmDashboard` folder if present).
5. Start the game → load your save with the mod enabled → start the Farm Dashboard app.
6. **Dedicated server:** upload/replace the mod on the host, restart the server, then reconnect clients (and replace the mod on any join-as-client PC too).

**In-game tip:** ESC → Settings → **Farm Dashboard** — enable **Production collector** and **Economy collector** if those sections stay empty.

**Guide:** [USER_MANUAL.md](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/USER_MANUAL.md)

---

## Also in 4.2.1

### Dedicated join-as-client (no FTP required)
- When someone joins the dedicated server with the same mod, the host can mirror live data to that PC’s local folder.
- The desktop app can watch that local folder — **no FTP** needed while a client is connected.
- **FTP remains Advanced** for headless / empty dedicated servers.

### Setup & stability
- Clearer Setup guidance for join-as-client / mirror export.
- Extra merge and test hardening on the 4.2.1 line.

### UI default
- **Classic dashboard remains the default.** The newer UI stays optional.

**Full history:** [CHANGELOG.md](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/CHANGELOG.md)

---

## Classic vs Realistic Farming edition

This release is **classic 4.x** only. Realistic Farming edition builds use a separate installer and `latest-rf.yml` — they do **not** replace this classic update channel.

---

## Third-party mods

Farm Dashboard works with **base-game FS25** on its own. Optional mods add extra panels or data when installed on the save. None are required. See the 4.2.0 release notes for the integrated list.
