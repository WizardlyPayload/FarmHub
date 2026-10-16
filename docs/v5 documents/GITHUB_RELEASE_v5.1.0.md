# FS25 Farm Dashboard V5 5.1.0

**App 5.1.0** · **Mod 5.1.0.0** · Windows 10/11 · **new screens (V5)**

This is **Farm Dashboard**, rebuilt. It is **not** Realistic Farming and **not** Farm Tablet.

**Download:** itch.io is the public download (tips / support live there). This GitHub release is the fallback and the V5 auto-update source (`latest-rf.yml` only).

- itch: https://wizardlypayload.itch.io/farm-dashobaord-fs25
- Site: https://www.farmdashboard.co.uk/
- Discord: https://discord.gg/ZCG9C7h7aT
- Classic V4: https://www.farmdashboard.co.uk/legacy.html · tag [v4.2.1](https://github.com/WizardlyPayload/FarmHub/releases/tag/v4.2.1)

Classic **V4** (4.2.1) stays available. Installing V5 does **not** remove V4. V4 auto-update will **not** replace your classic app with V5.

---

## How to install

1. Leave **Farm Dashboard V4** installed if you already have it.
2. Close Farming Simulator (and the dedicated server if you host).
3. Put **`FS25_FarmDashboard.zip`** in `Documents\My Games\FarmingSimulator2025\mods\` (replace the old zip **and** any unpacked folder).
4. Run **`FS25-Farm-Dashboard-V5-Setup-5.1.0.exe`**. Start Menu: **Farm Dashboard V5**.
5. Load a save with the mod enabled, then launch V5 and complete Setup.

**URL:** `http://localhost:8768` (V4 stays on **8766**).

Installer is unsigned — Windows SmartScreen may warn. Guide: https://www.farmdashboard.co.uk/install.html

---

## What changed since 5.0.3

- V5 always opens the **new screens**. Classic HTML is not packed and is not a fallback.
- Map-load crash guard: missing unpacked extras no longer take the whole mod down.
- Fields / economy / production export restored after a bad in-game `config.xml`.
- Dairy Core barn names use the placeable name.
- Pack writes a complete unpacked mod folder so Giants SP does not load a stale folder over the zip.

---

## Auto-update (optional)

- **V5** apps use `latest-rf.yml` on this release.
- **V4** apps keep using `latest.yml` (classic 4.2.1). They are **not** offered this V5 Setup.

One in-game mod zip works with both apps.

---

## Dedicated

Join-as-client (Local watch, no FTP) or FTP Advanced. Update the **mod** on the server and on any join-as-client PC.

---

## Files

| File | Notes |
| --- | --- |
| `FS25-Farm-Dashboard-V5-Setup-5.1.0.exe` | V5 app |
| `FS25_FarmDashboard.zip` | Mod **5.1.0.0** |
| `latest-rf.yml` | V5 auto-update only — never attach this as V4 `latest.yml` |

Setup SHA256: `690887BEE5AE42AD57607B6031320420BBCB8078FCCC4D908450286F6A7C1256`

Mod ZIP SHA256: `8CA1601AC8AD0385F54845D1A01E69CDE5C9B2671538343F12E1B04748D25C55`
