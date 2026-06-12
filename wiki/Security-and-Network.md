<<<<<<< Updated upstream
# Security & Network Guide

This document covers how **FarmHub** handles network access, security, and data protection.

## Network: Browser Access on Your LAN

The HTTP server runs on **port 8766**. How it's accessible depends on your settings.

### Default: Localhost Only

- **Binding**: `127.0.0.1:8766` (same PC only)
- **Access**: `http://localhost:8766` or `http://127.0.0.1:8766`
- **Other PCs on network**: ❌ Cannot connect
- **Security**: ✅ No network exposure

### LAN Mode: All Devices

When you enable **Settings → Servers & saves → Enable LAN access**:

- **Binding**: `0.0.0.0:8766` (all network interfaces)
- **Access from same PC**: `http://localhost:8766` or `http://127.0.0.1:8766`
- **Access from LAN devices**: `http://<this-PC-LAN-IP>:8766` (e.g., `http://192.168.1.50:8766`)
- **Authentication**: HTTP Basic Auth (username + password required)
- **Encryption**: ⚠️ Not encrypted (HTTP, not HTTPS)

### When to Use LAN Access

- **Tablet on your home network** — Monitor your farm on an iPad/Android tablet
- **Second monitor PC** — Watch the dashboard on another computer at home
- **Multiplayer LAN** — Other players on the same home network

### When NOT to Use LAN Access

- **Internet-facing** — Do NOT port-forward port 8766 to the internet
- **Public Wi-Fi** — Do NOT enable on a shared network
- **Remote access** — Use a **VPN** instead of LAN access

## LAN Authentication

When LAN access is enabled, you must set credentials:

### Username & Password

- **Minimum**: 10 characters (v3.9+)
- **Not allowed**: Default pair `admin` / `farmhub`, common weak passwords
- **Stored**: `electron-store` (local user profile; encrypted by Windows)
- **Sent over network**: HTTP Basic Auth (Base64 encoded, not encrypted)

⚠️ **Important**: HTTP Basic Auth is **not secure over untrusted networks**. Use only on trusted home networks.

### IP Allowlist

Optional. Restrict LAN access to specific IP addresses:

```
192.168.1.50, 192.168.1.51, 192.168.1.0/24
```

- **Empty**: Allow any LAN IP (only HTTP Basic Auth required)
- **Populated**: Only listed IPs can connect

### Loopback Bypass

Requests from `127.0.0.1`, `::1`, or IPv6-mapped `::ffff:127.0.0.1` **bypass** auth:
- Same PC (localhost) always works
- No password needed for local browser

**Optional**: Tick **"Require auth even from loopback"** to force auth from localhost too (e.g., shared desktop).

## Tablet Setup

To use the dashboard on a tablet:

1. **On the PC**:
   - **Settings → Servers & saves → Enable LAN access**
   - Set username (e.g., `farmhub`) and password (≥10 chars)
   - (Optional) IP allowlist if needed
   - Click **Save**

2. **Find your PC's LAN IP**:
   - Open Command Prompt on the PC
   - Run `ipconfig`
   - Look for "IPv4 Address" (e.g., `192.168.1.50`)

3. **On the tablet**:
   - Open a browser
   - Go to `http://<PC-LAN-IP>:8766` (e.g., `http://192.168.1.50:8766`)
   - Browser prompts for username + password
   - Enter the credentials you set
   - ✅ Dashboard loads

### Read-Only Viewer Mode

For tablets or shared desktops, hide the Settings gear and lock the interface:

```
http://192.168.1.50:8766?viewer=1
```

This prevents accidental clicks on destructive buttons.

## CORS & Cross-Origin Requests

The Express server restricts CORS (Cross-Origin Resource Sharing):

- **Allowed origins**: 
  - `http://localhost:*`
  - `http://127.0.0.1:*`
  - Any host on port 8766 (so `http://192.168.1.50:8766` is allowed)

- **Effect**: Only browsers on your local network or same PC can reach the dashboard
- **Fails**: Requests from other domains or ports are blocked

## Data on the Network

### What is Shared

When LAN access is enabled, **anyone with credentials and valid IP** sees:
- Live farm data (animals, fields, vehicles, money, etc.)
- Merged JSON payload
- Weather, forecasts, game time
- Production data

### What is NOT Shared

- **Game files** — Only the JSON data feed
- **Chat or messages** — Not transmitted
- **Account credentials** — Not exposed

### Implications

- **Trusted network only** — Enable LAN on home networks you control
- **Shared data** — Everyone with credentials sees the same farm (no per-user permissions)
- **Not encrypted** — Use a VPN for sensitive data over untrusted networks

## Firewall Recommendations

### Windows Firewall

By default, Windows will ask to allow the app. Choose your network type:

- **Private network** — Home or trusted network. Allow.
- **Public network** — Coffee shop or open Wi-Fi. Block.

### Manual Firewall Rule

If you need to explicitly allow or block port 8766:

**Allow (private network only)**:
```
netsh advfirewall firewall add rule name="FarmHub" dir=in action=allow protocol=tcp localport=8766 profile=private
```

**Block (public networks)**:
```
netsh advfirewall firewall add rule name="FarmHub-Block-Public" dir=in action=block protocol=tcp localport=8766 profile=public
```

## Remote Access (VPN)

For access **outside your home network**, use a **VPN**:

1. Install a VPN server on your home network (or use a commercial VPN service)
2. Connect your remote device to the VPN
3. Open `http://localhost:8766` — your device appears local to the dashboard app
4. ✅ All traffic is encrypted

**Do NOT** port-forward port 8766 to the internet.

## FTP Credentials

If you use a **dedicated or rented FS25 server**, you configure FTP credentials in **Settings → Servers & saves**:

- **Stored**: `electron-store` (Windows user profile)
- **At rest**: Protected by Windows user account security
- **Transmission**: FTP (v3.9 does not use SFTP; FTP credentials are cleartext over the network)

**Recommendation**: On trusted home networks only. Use a VPN for remote access.

## Sensitive HTTP Endpoints

### `POST /api/export-mod-store-images`

Runs a PowerShell script to extract vehicle/mod images from your FS25 mods folder.

- **Default**: ❌ Blocked from LAN clients
- **Same PC**: ✅ Always allowed
- **Override** (lab use):
  ```
  set FARMDASH_ALLOW_LAN_EXPORT=1
  npm start
  ```

### `GET /api/data`

Returns the merged farm data (JSON). Same as:
- **Same PC**: ✅ Allowed
- **LAN with auth**: ✅ Allowed
- **Public internet**: ❌ Blocked by firewall / no forwarding

## Electron & App Hardening

The Electron app uses:
- **`nodeIntegration: false`** — No direct Node.js access in renderer
- **`contextIsolation: true`** — Sandboxed web process
- **`preload.js`** — Fixed IPC bridge (not ad-hoc)
- **CSP headers** — Restrict inline scripts

**Treat the app as a trusted local tool**. Do not navigate the window to arbitrary remote websites.

## Dependencies & Audit

The project uses:
- **npm audit** — Checks for known vulnerabilities
- **electron-builder** — Bundles the app securely
- **electron-updater** — Secure updates from GitHub Releases (SHA256 verified)

**After `npm audit fix`**: Full regression testing recommended before release.

## Mod (Game Side)

The **FS25 mod** itself:
- Does NOT open a network port
- Only writes `data.json` to disk
- Does not transmit data online
- Updates handled by FS25 / GIANTS

Keep FS25 and mods updated per GIANTS' guidelines.

## Reporting Security Issues

If you find a **security vulnerability**:

1. **Do NOT** post it publicly
2. Contact the maintainers privately via GitHub
3. Authors: **JoshWalki** & **WizardlyPayload**

---

**Summary**:
- ✅ Use localhost by default (no network exposure)
- ✅ Use LAN mode only on trusted home networks
- ✅ Set strong LAN credentials (≥10 chars)
- ✅ Use a VPN for remote access
- ❌ Do NOT port-forward to the internet
- ❌ Do NOT use on public Wi-Fi
=======
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
>>>>>>> Stashed changes
