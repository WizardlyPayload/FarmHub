# Farm Dashboard V5 — Security & network notes

**Authors:** JoshWalki (Josh) / Wizardlypayload and WizardlyPayload — see [`../AUTHORS.md`](../AUTHORS.md).

This document is the **V5** copy of the classic security notes. Same trust model; **listen port differs**.

Classic V4: [`../SECURITY.md`](../SECURITY.md) (port **8766**).

---

## Network: browser access on your LAN

The V5 embedded HTTP server listens on:

| How you run it | Port |
| -------------- | ---- |
| Installed **Farm Dashboard V5** | **8768** |
| Repo `npm run dev:new-ui` | **8767** |
| Classic V4 | **8766** (unchanged) |

**Binding and access control depend on Settings → Servers & saves:**

- **LAN access disabled (default):** bind **`127.0.0.1` only** — only this PC. Example: `http://localhost:8768`.
- **LAN access enabled:** bind **`0.0.0.0`**. Other devices on the LAN can reach `http://<this-PCs-LAN-IP>:8768`.

Some Settings help strings may still mention **:8766**. Trust the port **this process** is using (About / Health / the URL in the window).

**When LAN is on**, the app can enforce:

- **HTTP Basic Authentication** — username and password in Settings (stored locally).
- **Optional IP allowlist** — non-matching clients get **403**. Empty list = no IP filter (auth still applies).

**Loopback:** the desktop app on this PC is trusted. Hostile Origins are still rejected on WebSocket and local writes. `/api/status` stays public; mixed-case `/API/` follows the same LAN Basic rules as `/api/`.

**CORS (v3.9+ lineage):** Origins on localhost, or **any host on this app’s listen port**, are allowed so a tablet using `http://<LAN-IP>:8768` works. Other cross-origin callers get no CORS allowance.

**LAN credentials:** when LAN is enabled, the app **rejects** historic **`admin` / `farmhub`**, passwords **shorter than 10 characters**, and a small weak-password list. Credentials stay in electron-store. **HTTP Basic is cleartext on the wire** — trusted home LAN only, or put TLS in front.

**Setup is local-first.** Phones can view the dashboard; they cannot load or save Setup unless `FARMDASH_ALLOW_REMOTE_SETUP=1` (lab only).

### Implications

Anyone who can reach the V5 port and pass Basic / IP rules sees the same merged farm JSON (animals, fields, money, vehicles). Configure credentials and firewall to match your trust.

LAN is for **home / trusted LAN** (tablet, second monitor). It is **not** a public-internet product. Prefer VPN + reverse proxy with TLS if you go beyond the house.

### Recommendations

- Tablet will not connect: LAN **on**, URL uses the PC **LAN IP** and **8768** (not `localhost`, not V4’s 8766 unless you meant classic).
- Windows Firewall: allow inbound TCP **8768** on the **Private** profile for V5 (and **8766** only if you still share classic).
- On public Wi‑Fi, block inbound 8768.
- Do not port-forward 8768 to the world.
- Prefer **join as client** + Local over storing FTP passwords when someone can stay joined.

### Sensitive HTTP: mod shop image export

Export runs via **Electron IPC** on this PC. HTTP `POST /api/export-mod-store-images` is **blocked from LAN clients** unless `FARMDASH_ALLOW_LAN_EXPORT=1`. GET, static files, and WebSockets stay available so phones can open the dashboard.

### Setup wizard is local-first

| Route | Loopback / same PC | Other LAN device |
|-------|--------------------|------------------|
| `GET /` dashboard | yes | yes (LAN Basic) |
| `GET /api/status` | yes | yes (no Basic) |
| `GET /setup.html` | yes | **302** / **403** — no token |
| `GET /api/setup-config` | yes | **403** `E_SETUP_LOCAL_ONLY` |
| `POST /api/setup-config` | yes, with `X-Setup-Token` | **403** |

Same-machine access via this PC’s LAN IP is treated as local. Change servers on the **PC**.

**Lab override:** `FARMDASH_ALLOW_REMOTE_SETUP=1` — do not use on untrusted networks.

**Troubleshooting**

- Tablet sees the farm but `/setup.html` bounces → expected.
- `403` + `E_SETUP_LOCAL_ONLY` → same policy.
- `E_LAN_TIMEOUT` → Wi‑Fi / app not reachable, not a wrong password.
- Stale LAN password → overlay again.

---

## Electron & web stack

`nodeIntegration: false`, `contextIsolation: true`, narrow `preload.js` (`window.farmDashAPI`). Treat as a **single-user, trusted local tool**. Do not point the window at arbitrary remote sites.

V5 packages the **NEW APP** UI (`ui-v2/`). Classic `web/` is the V4 screens.

---

## Dependencies & builds

`npm audit` noise in electron-builder / dev tooling is often build-time. Plan major upgrades off the night-before-release.

---

## Mod (game) side

The FS25 mod only writes **`data.json`** under the user profile. It does not open a network port.

---

## Reporting

Public security issues: GitHub maintainers (**JoshWalki** & **WizardlyPayload**). Include **Farm Dashboard V5**, app **5.0.2**, platform **Windows**, and whether LAN was on.
