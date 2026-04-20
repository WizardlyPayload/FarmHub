# FS25 Farm Dashboard — Security & network notes

**Authors:** **JoshWalki** (Josh) / Wizardlypayload and **WizardlyPayload** — see [AUTHORS.md](./AUTHORS.md).

This document describes how the **desktop app** exposes data, what is **optional** vs **default-locked**, and how that fits a **home / LAN** setup. It is written for **3.0.0**; review again after major upgrades.

---

## Network: browser access on your LAN (important)

The embedded HTTP server listens on **port `8766`**. **Binding and access control depend on Settings:**

- **LAN access disabled (default):** the server binds to **`127.0.0.1` only** — only processes on the same PC can open the dashboard (e.g. `http://localhost:8766`). Other devices on the network **cannot** connect.
- **LAN access enabled** (**Settings → Remote / LAN access**): the server binds to **`0.0.0.0`** so other devices on the LAN can reach the PC. In that mode you should treat the service as **exposed on your network**.

| Access | Typical URL |
|--------|-------------|
| Same PC | `http://localhost:8766` |
| Phone / tablet / another PC **on the same network** (only when LAN access is enabled) | `http://<this-PCs-LAN-IP>:8766` (e.g. `http://192.168.1.50:8766`) |

**When LAN access is enabled**, the app can enforce:

- **HTTP Basic Authentication** — username and password configured in **Settings** (stored locally). Browsers will prompt for credentials when opening the dashboard from another device.
- **Optional IP allowlist** — if you list allowed IPs (comma-separated), clients whose address does not match receive **403 Forbidden**. Empty allowlist means **no IP filtering** (only Basic Auth applies, if you rely on it).

**Loopback bypass:** requests from **`127.0.0.1`**, **`::1`**, and **`::ffff:127.0.0.1`** skip LAN auth middleware so the desktop app and local browser are not blocked.

**CORS** is enabled for the API routes so a normal browser can load the dashboard from that origin.

**Implications**

- With **LAN access on**, anyone who can reach **port 8766** and pass **Basic Auth / IP rules** sees the same farm data the app serves (merged JSON: animals, fields, money, vehicles, etc.). **Configure credentials and firewall** to match your trust model.
- LAN access is aimed at **home / trusted LAN** use (tablet, second monitor, teammate). It is **not** a substitute for a hardened **public internet** deployment — use a **VPN**, **reverse proxy with TLS + auth**, and **firewall rules** if you expose services beyond the LAN.

**Recommendations**

- Use **Windows Firewall** (or your OS firewall) to block **inbound** TCP **8766** from untrusted networks if the PC joins public Wi‑Fi.
- For **remote** access from outside the home, prefer a **VPN** into your network rather than port-forwarding 8766 to the world.
- **FTP passwords** for dedicated servers are stored in **electron-store** (local user profile). Treat the PC account as trusted; use a **strong Windows password** and disk encryption if the machine is portable.

### Sensitive HTTP action: mod shop image export

The **desktop app** runs mod image export via **Electron IPC** (same machine only).

The HTTP fallback **`POST /api/export-mod-store-images`** runs **PowerShell** and scans your FS25 mods folder — it is **blocked from LAN clients by default**. Only connections from **localhost** (`127.0.0.1` / `::1`) may call it unless you explicitly set:

`FARMDASH_ALLOW_LAN_EXPORT=1`

in the environment before starting the app (advanced / lab use only). **GET** routes, static files, and **WebSockets** stay available on the LAN so phones and other PCs can still open the dashboard at `http://<LAN-IP>:8766` as before.

---

## Electron & web stack (threat model)

The dashboard window loads **local** HTML/JS served by Express. **Phase 2 hardening** uses **`nodeIntegration: false`**, **`contextIsolation: true`**, and a **`preload.js`** script that exposes a narrow **`window.farmDashAPI`** bridge for IPC — the renderer does not get **`require('electron')`** or Node **`fs`**.

**`webSecurity`** may still be relaxed for local asset behaviour; treat the app as a **single-user, trusted local tool**. **Do not** point the Electron window at arbitrary remote sites. **Do not** load untrusted content in the same window.

---

## Dependencies & builds

- **`npm audit`** may report issues in **electron**, **electron-builder**, or transitive **dev** dependencies. Many affect **build-time** tooling (packaging archives), not the runtime server on a normal user install.
- After **`npm audit fix`**, remaining items often need **major** upgrades (`npm audit fix --force`) and full regression testing — plan those **after** a release, not the night before, unless a fix is critical.

---

## Mod (game) side

The FS25 mod only writes **`data.json`** under the user profile. It does not open a network port. Game and mod updates are outside this repo’s control; keep FS25 and mods updated per GIANTS’ guidance.

---

## Reporting security concerns

For **public** security issues (e.g. unintended remote code execution via the app), contact the maintainers via the GitHub repository’s channels (**JoshWalki** & **WizardlyPayload** — [AUTHORS.md](./AUTHORS.md)). Include app version **3.0.0** and platform **Windows**.
