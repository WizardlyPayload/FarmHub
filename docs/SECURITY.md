# FS25 Farm Dashboard — Security & network notes

**Authors:** **JoshWalki** (Josh) / Wizardlypayload and **WizardlyPayload** — see [AUTHORS.md](./AUTHORS.md).

This document describes how the **desktop app** exposes data, what is **optional** vs **default-locked**, and how that fits a **home / LAN** setup. Review it again after major upgrades. The packaged Chromium/Node runtime is the Electron version in `FS25_FarmDashboard_App/package.json` (supported major line as of the 2026-09 audit remediation).

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

**Loopback:** the desktop app on this PC is trusted. Browser pages still need an allowed Origin; mixed-case `/API/` paths follow the same LAN Basic rules as `/api/`.

**CORS** is restricted in **v3.9+**: the Express server allows requests whose `Origin` header is **localhost/127.0.0.1**, or **any host on port 8766** (so phone/tablet browsers on the same LAN using `http://<PC-LAN-IP>:8766` still work). Other cross-origin callers receive **no CORS allowance**. This tightens the surface versus a blanket “allow everything” policy.

**LAN credentials (v3.9+):** when **LAN access is enabled**, the app **rejects** the historic default pair **`admin` / `farmhub`**, passwords **shorter than 10 characters**, and a small list of **known-weak passwords** (`lanCredentialPolicy.js`). Choose a strong password before exposing the bind on `0.0.0.0`. Stored credentials remain **local** (Electron Store) and **HTTP Basic** is still **cleartext on the wire** — use only on a **trusted home LAN**, or put a **reverse proxy with TLS** in front for remote access.

**Loopback is not a complete trust boundary.** Browser pages that can reach `http://127.0.0.1:8766` must present an allowed Origin (this app / port 8766). WebSocket upgrades and local writes reject hostile Origins even from loopback. `/api/status` stays public; mixed-case `/API/...` paths use the same authentication rules as lowercase `/api/...`.

**Setup is local-first.** Phones and tablets on the LAN can view the dashboard; they cannot load or save Setup unless `FARMDASH_ALLOW_REMOTE_SETUP=1` is set for a lab machine.

**Implications**

- With **LAN access on**, anyone who can reach **port 8766** and pass **Basic Auth / IP rules** sees the same farm data the app serves (merged JSON: animals, fields, money, vehicles, etc.). **Configure credentials and firewall** to match your trust model.
- LAN access is aimed at **home / trusted LAN** use (tablet, second monitor, teammate). It is **not** a substitute for a hardened **public internet** deployment — use a **VPN**, **reverse proxy with TLS + auth**, and **firewall rules** if you expose services beyond the LAN.

**Recommendations**

- **Same Wi‑Fi, tablet or phone will not connect:** LAN access must be **on**, the URL must use the PC’s **LAN IP** (e.g. `http://192.168.1.50:8766`), not `localhost`. Then allow **inbound TCP 8766** on the **Private** network profile — **Windows Defender Firewall with Advanced Security** → **Inbound Rules** → allow the Farm Dashboard app or a rule for port **8766**. Third-party antivirus suites often ship a separate host firewall; allow the same port there. Consumer routers rarely need changes for devices on the **same** subnet (no VLANs / port forwarding required for typical home Wi‑Fi).
- Use **Windows Firewall** (or your OS firewall) to block **inbound** TCP **8766** from untrusted networks if the PC joins public Wi‑Fi.
- For **remote** access from outside the home, prefer a **VPN** into your network rather than port-forwarding 8766 to the world.
- **FTP passwords** for dedicated servers (Advanced / headless path) are stored in **electron-store** (local user profile). Prefer **join as client** + Local mode when someone can stay connected — that path does not store FTP credentials. Treat the PC account as trusted; use a **strong Windows password** and disk encryption if the machine is portable.

### Sensitive HTTP action: mod shop image export

The **desktop app** runs mod image export via **Electron IPC** (same machine only).

The HTTP fallback **`POST /api/export-mod-store-images`** runs **PowerShell** and scans your FS25 mods folder — it is **blocked from LAN clients by default**. Only connections from **localhost** (`127.0.0.1` / `::1`) may call it unless you explicitly set:

`FARMDASH_ALLOW_LAN_EXPORT=1`

in the environment before starting the app (advanced / lab use only). **GET** routes, static files, and **WebSockets** stay available on the LAN so phones and other PCs can still open the dashboard at `http://<LAN-IP>:8766` as before.

### Setup wizard is local-first (binding)

**Default:** phones and tablets on the LAN can open the **dashboard**. They **cannot** open or save **Setup** (`/setup.html`, `GET`/`POST /api/setup-config`).

| Route | Loopback / same PC | Other LAN device |
|-------|--------------------|------------------|
| `GET /` dashboard | yes | yes (LAN Basic, see above) |
| `GET /api/status` | yes | yes (no Basic) |
| `GET /setup.html` | yes (injects write token) | **302** to `/` (or **403** JSON) — no token |
| `GET /api/setup-config` | yes (redacted, `Cache-Control: no-store`) | **403** `E_SETUP_LOCAL_ONLY` |
| `POST /api/setup-config` | yes, with `X-Setup-Token` | **403** even if a token is presented |

Same-machine access via this PC’s LAN IP (`http://192.168.x.x:8766/setup.html` on the host) is treated as local. Change servers and saves in **Settings on the PC**, or open Setup from the desktop app.

**Lab override (not recommended):** set `FARMDASH_ALLOW_REMOTE_SETUP=1` before starting the app. Remote clients then need a valid `X-Setup-Token` for writes. Do not use this on an untrusted network.

**Troubleshooting**

- Tablet can see the farm but `/setup.html` bounces to the dashboard → expected. Configure on the PC.
- `403` + `E_SETUP_LOCAL_ONLY` on `/api/setup-config` → same policy; not a wrong LAN password.
- `403` + `E_INVALID_TOKEN` on POST from localhost → reload Setup so a fresh token is injected.
- LAN overlay times out (`E_LAN_TIMEOUT`) → Wi‑Fi / PC app not reachable; distinct from a rejected password (`E_AUTH_MISSING`).
- Stale saved LAN password → overlay again with stale-login copy; token is cleared.

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

For **public** security issues (e.g. unintended remote code execution via the app), contact the maintainers via the GitHub repository’s channels (**JoshWalki** & **WizardlyPayload** — [AUTHORS.md](./AUTHORS.md)). Include app version **4.2.0** and platform **Windows**.
