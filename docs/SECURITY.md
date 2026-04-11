# FS25 Farm Dashboard — Security & network notes

**Authors:** **JoshWalki** (Josh) / Wizardlypayload and **WizardlyPayload** — see [AUTHORS.md](../AUTHORS.md).

This document describes how the **desktop app** exposes data, what is **not** protected, and how that fits a **home / LAN** setup. It is written for **2.0.0**; review again after major upgrades.

---

## Network: browser access on your LAN (important)

The app binds the HTTP server to **`0.0.0.0` on port `8766`**, not only `127.0.0.1`.

| Access | Typical URL |
|--------|-------------|
| Same PC | `http://localhost:8766` |
| Phone / tablet / another PC **on the same network** | `http://<this-PCs-LAN-IP>:8766` (e.g. `http://192.168.1.50:8766`) |

**CORS** is enabled for the API routes so a normal browser can load the dashboard from that origin.

**Implications**

- Anyone who can reach **port 8766** on that machine (same Wi‑Fi, Ethernet, or routed LAN) can **read the same farm data** the app serves (merged JSON: animals, fields, money, vehicles, etc.). There is **no login** and **no per-client access control** in the app.
- This is **by design** for convenience (tablet on the sofa, second monitor, teammate on LAN). It is **not** suitable to expose directly to the **public internet** without extra layers (VPN, reverse proxy with auth, firewall rules).

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

The dashboard window loads **local** HTML/JS served by Express. Typical settings include **`nodeIntegration: true`**, relaxed **`webSecurity`**, and **no context isolation** — this matches a **single-user, trusted local tool**, not a website that loads third-party ads or untrusted URLs.

**Do not** point the Electron window at arbitrary remote sites with this configuration. **Do not** load untrusted content in the same window.

---

## Dependencies & builds

- **`npm audit`** may report issues in **electron**, **electron-builder**, or transitive **dev** dependencies. Many affect **build-time** tooling (packaging archives), not the runtime server on a normal user install.
- After **`npm audit fix`**, remaining items often need **major** upgrades (`npm audit fix --force`) and full regression testing — plan those **after** a release, not the night before, unless a fix is critical.

---

## Mod (game) side

The FS25 mod only writes **`data.json`** under the user profile. It does not open a network port. Game and mod updates are outside this repo’s control; keep FS25 and mods updated per GIANTS’ guidance.

---

## AI Farm Manager (optional FastAPI backend)

If you run the separate **AI Farm Manager** service (VPS/Docker) for Smart suggestions or in-game chat, treat its URL like any other API: **HTTPS**, firewall, and avoid exposing **`GET /`** (farm snapshot HTML) and **`/health`** to the public internet without need. Gemini **API key routing** and rate-limit behaviour are documented in **[LLM_GEMINI_ROUTING.md](./LLM_GEMINI_ROUTING.md)** — distinct from the desktop app’s LAN dashboard on port **8766**.

---

## Reporting security concerns

For **public** security issues (e.g. unintended remote code execution via the app), contact the maintainers via the GitHub repository’s channels (**JoshWalki** & **WizardlyPayload** — [AUTHORS.md](../AUTHORS.md)). Include app version **2.0.0** and platform **Windows**.
