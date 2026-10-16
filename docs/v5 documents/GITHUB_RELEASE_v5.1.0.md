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
- Companion pages follow mods active in the current save. Removing a mod hides its page without deleting its retained dashboard data.

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

Setup SHA256: `FD0EC73DFD86E4D5BC60D9849D92C3B41E6A27585AF498F407C9C46050E88501`

Mod ZIP SHA256: `CC6EC9FABF45830F9E3B16E9EAA728A99AFF345F4C5E909FA531A221E158245E`
