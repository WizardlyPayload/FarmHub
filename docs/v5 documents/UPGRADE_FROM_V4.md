# Upgrade — keep Farm Dashboard V4, add V5

You do **not** replace classic to try the new screens. V5 is a **second** Windows app.

Older public 2.0.0 → 4.x steps remain in [`../UPGRADE_FROM_FS25-Farm-Dashboard.md`](../UPGRADE_FROM_FS25-Farm-Dashboard.md). This page is **V4 already installed → add V5**.

---

## What stays

| Keep | Notes |
| ---- | ----- |
| Farm Dashboard **V4** | Start Menu classic app, port **8766**, `latest.yml` |
| Your V4 settings | Different app id — V5 does not steal this profile |
| **`FS25_FarmDashboard.zip`** | One mod for both apps |

---

## What you add

1. Close V4 if you like (not required).
2. Install **`FS25-Farm-Dashboard-V5-Setup-5.0.3.exe`**.
3. Launch **Farm Dashboard V5**.
4. Run Setup (Auto-detect can point at the **same** `data.json` folders V4 already uses).
5. Confirm the window is the **sidebar** UI, URL **8768**.

---

## What you must not do

- Do **not** use **V4 → Check for updates** expecting V5. That feed is classic only.
- Do **not** delete V4 “to make room” unless you decided to leave classic.
- Do **not** port-forward either dashboard to the internet.

If V4 disappeared after the V5 EXE — that is a **fail**. Report it ([`TESTERS.md`](./TESTERS.md)).

---

## Dedicated servers

Replace the **mod zip** on the host once (same zip both apps use). Then:

- **Join as client** + Local watch on V5, or
- **FTP** as today.

Details: [`INSTALL.md`](./INSTALL.md) · [`USER_MANUAL.md`](./USER_MANUAL.md) §3.4a.

---

## Going back to classic

Uninstall V5 (keep user data if you might return). Launch V4. The in-game mod can stay; V4 still reads `data.json`.
