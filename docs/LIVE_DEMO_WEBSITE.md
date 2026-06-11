# Live “Try now” demo — farmdashboard.co.uk → your running app

Use this when you want **Try now** on [farmdashboard.co.uk](https://www.farmdashboard.co.uk) to open your **real** dashboard while you play (fields, vehicles, fleet map, economy updating from the mod).

Visitors get a **read-only** view: Settings, server manager, and local-only tools are already hidden when the hostname is not `localhost` (see `viewer-mode.js`).

---

## What you need running

| Piece | Role |
| ----- | ---- |
| **FS25** with **Farm Dashboard mod** on the save you want to show | Writes `data.json` every export cycle (~60s default) |
| **Farm Dashboard Windows app** on a PC that can reach that data | Merges JSON + serves the UI on port **8766** |
| **Public HTTPS URL** (recommended: `demo.farmdashboard.co.uk`) | So the marketing site can link without mixed-content errors |
| **Optional: FTP server** in the app | Only if the live save is on a **dedicated** host you do not play on locally |

**While you are playing on the same PC as the app:** add a **Local** server pointing at  
`Documents\My Games\FarmingSimulator2025\modSettings\FS25_FarmDashboard\<savegame>\`  
and keep the app open — file watch picks up changes quickly.

**Dedicated / rented server:** add **FTP** in Settings, poll every **2–5 minutes** for a snappier demo.

---

## Recommended setup: Cloudflare Tunnel (no router port-forward)

Best fit when the domain is already on **Cloudflare** (`farmdashboard.co.uk`).

### 1. App on your gaming PC

1. Install mod + app; configure the save (local path or FTP).
2. **Settings → Remote / LAN access**
   - Enable LAN access (binds `0.0.0.0:8766`).
   - Set a **strong password** (not `admin` / `farmhub` — the app rejects weak defaults).
3. Leave the app running while you play (or run it whenever the demo should be live).

### 2. Cloudflare Tunnel to port 8766

On the **same PC** as the app:

1. Install [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/).
2. In Cloudflare Zero Trust / dashboard: **Networks → Tunnels → Create tunnel**.
3. Add a **Public hostname**:
   - Subdomain: `demo` → `demo.farmdashboard.co.uk`
   - Service: `http://127.0.0.1:8766`
4. Run the tunnel (or install as a Windows service so it starts with the PC).

Result: `https://demo.farmdashboard.co.uk` serves the same UI as `http://localhost:8766`.

### 3. Protect the demo (choose one)

| Method | Who sees the farm |
| ------ | ----------------- |
| **Cloudflare Access** (email OTP or one shared password) | Only people you allow; farm password stays private |
| **HTTP Basic** (app LAN username/password) | Browser prompts once; password is the one in Farm Dashboard Settings |
| **Open demo** | Anyone with the link — only use if you are happy exposing live money, names, positions |

For a public marketing **Try now**, **Cloudflare Access** with a simple shared gate, or a dedicated **demo** Basic password you publish on the site, is usually enough.

### 4. “Try now” on the website

Point the button at the tunnel URL (new tab):

```html
<a
  class="btn btn-primary"
  href="https://demo.farmdashboard.co.uk"
  target="_blank"
  rel="noopener noreferrer"
>
  Try now — live farm
</a>
```

Optional subtitle on the page:

> Live data from our multiplayer server. Updates every minute while we are in-game. Read-only view.

---

## What visitors experience

1. Click **Try now** → `https://demo.farmdashboard.co.uk` opens.
2. Pass Cloudflare Access or HTTP Basic if configured.
3. Full dashboard: home cards, fields, vehicles, **fleet map**, economy, etc.
4. Data refreshes via the app’s normal **HTTP + WebSocket** pipeline (same as LAN tablet).
5. They **cannot** open Settings or change servers (remote viewer mode).

---

## Making it feel “live” while you play

- Stay on the save with the mod enabled; export cycle drives freshness.
- **Local server:** updates within seconds of each `data.json` write.
- **FTP server:** lower **Poll every** in Settings (minimum 1 minute).
- Show **game time** and **last updated** on the landing hero so visitors see movement.

When you are **offline**, either:

- Turn off the tunnel / show “Demo offline” on the site, or  
- Keep FTP polling a dedicated server that runs 24/7.

---

## What not to do

- Do **not** embed `http://YOUR-HOME-IP:8766` in the HTTPS marketing site (blocked by browsers).
- Do **not** put FTP credentials in website JavaScript.
- Do **not** port-forward **8766** to the open internet without TLS and strong auth — use a **tunnel** or reverse proxy instead.

---

## Checklist before going public

- [ ] Mod enabled on the save shown in the demo  
- [ ] App running with correct Local or FTP server selected  
- [ ] LAN access on + strong password (or Cloudflare Access in front)  
- [ ] Tunnel `demo.farmdashboard.co.uk` → `127.0.0.1:8766` healthy  
- [ ] Test from phone on **mobile data** (not home Wi‑Fi) to confirm public access  
- [ ] Deploy updated `Website/` folder to farmdashboard.co.uk (see `Website/README.md`)  
- [ ] `Website/js/site-config.js` `demoAppUrl` matches your tunnel hostname  
- [ ] **Try now** button on the live site opens the demo dashboard  

---

## Website source in this repo

Marketing site files live in **`Website/`** — hero **Try now**, `demo.html`, and live status badges. Deploy that folder to your nginx host after pulling updates.

---

## Optional later: homepage widget

If you later want **live stats embedded on the homepage** (counts only, not the full app), add a sanitized JSON upload — see discussion in repo issues / `DEVELOPER_HANDOVER.md`. The **Try now** full-app link above is the fastest path.
