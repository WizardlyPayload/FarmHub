# Security & Network

How **FarmHub** exposes the dashboard on your network and how to use it safely. Canonical detail: [SECURITY.md](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/SECURITY.md).

**App version:** 4.1.0

---

## Port and binding

The embedded server listens on **TCP 8766**.

| Mode | Bind address | Who can connect |
|------|--------------|-----------------|
| **LAN off (default)** | `127.0.0.1` | Same PC only |
| **LAN on** | `0.0.0.0` | Any device on your LAN that passes auth / allowlist |

| Access | URL |
|--------|-----|
| Same PC | `http://localhost:8766` |
| Tablet / other PC (LAN on) | `http://<PC-LAN-IP>:8766` |

---

## Enabling LAN access

1. **Settings → Servers & saves**
2. Toggle **Enable LAN access**
3. Set **LAN user** and **LAN password**
4. (Optional) **IP allowlist** — e.g. `192.168.1.50, 192.168.1.0/24`
5. (Optional) **Require auth even from loopback** — shared desktop PCs
6. **Save**

### Password rules (3.9+)

When LAN is enabled, the app **rejects**:

- Default pair **`admin` / `farmhub`**
- Passwords **shorter than 10 characters**
- Known **weak passwords** (see `lanCredentialPolicy.js`)

Choose a unique strong password before exposing the service on your LAN.

### Loopback bypass

`127.0.0.1`, `::1`, and IPv4-mapped loopback **skip** LAN auth so the local browser and Electron shell are not blocked — unless you enable **Require auth from loopback**.

---

## What LAN clients can see

Anyone who can reach port **8766** and authenticate sees the **same merged farm JSON** as your browser:

- Animals, vehicles, fields, economy, pastures, productions, weather

They **cannot**:

- Modify FS25 save files through the dashboard
- Run arbitrary commands on your PC (renderer has no Node integration)

**HTTP Basic Auth is not encrypted.** Use only on a **trusted home LAN**, or put **TLS** (reverse proxy / VPN) in front for remote access.

---

## CORS

Allowed origins include localhost/127.0.0.1 and **any host on port 8766** (so `http://192.168.1.50:8766` works). Other origins are blocked.

---

## Sensitive endpoint: mod image export

`POST /api/export-mod-store-images` runs PowerShell and scans your mods folder.

| Client | Allowed |
|--------|---------|
| Localhost | Yes |
| LAN | **No** (default) |

Override (lab only):

```bat
set FARMDASH_ALLOW_LAN_EXPORT=1
npm start
```

Prefer **Settings → Scan FS25 mods** from the desktop app (IPC) instead.

---

## FTP credentials

Stored in **electron-store** under your Windows user profile. Protect with:

- Strong Windows account password
- Disk encryption (BitLocker) on portable PCs
- Trusted network only for FTP (credentials are cleartext on the wire — standard FTP)

---

## Electron hardening

| Setting | Value |
|---------|--------|
| `nodeIntegration` | `false` |
| `contextIsolation` | `true` |
| IPC | Fixed surface via `preload.js` → `window.farmDashAPI` |

Treat the app as a **single-user trusted local tool**. Do not load untrusted remote sites in the same window.

---

## Firewall

### Windows

Allow on **Private** networks when prompted. Block on **Public** Wi‑Fi.

Example (private only):

```bat
netsh advfirewall firewall add rule name="FarmHub" dir=in action=allow protocol=tcp localport=8766 profile=private
```

### Router

**Do not port-forward 8766** to the internet.

---

## Remote access (outside home)

| Approach | Recommendation |
|----------|----------------|
| Port-forward 8766 | **Not recommended** |
| VPN into home network | **Recommended** (WireGuard, Tailscale, etc.) |
| Reverse proxy + TLS + auth | Advanced self-hosting |

---

## Mod (game side)

The Lua mod:

- Writes **`data.json` only** — no network port
- Does not send data to the cloud by itself

---

## Security checklist

- [ ] LAN **off** unless you need tablets
- [ ] LAN password **≥10 characters**, not defaults
- [ ] Optional IP allowlist for known devices
- [ ] Firewall blocks 8766 on public networks
- [ ] No router port-forward to 8766
- [ ] Strong Windows password + encryption

---

## Report security issues

**Do not** open public issues for exploitable vulnerabilities.

Contact **JoshWalki** or **WizardlyPayload** privately via GitHub with version **4.1.0** and platform **Windows**.

---

**Related:** [User Manual — LAN](User-Manual#lan--tablets) · [Troubleshooting — LAN](Troubleshooting#lan--tablet-issues)
