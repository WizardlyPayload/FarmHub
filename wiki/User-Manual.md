# User Manual

This is the comprehensive guide to using the **FS25 Farm Dashboard**. It covers every screen, setting, and feature.

## Quick Navigation

1. [Dashboard Overview](#dashboard-overview)
2. [Main Screen](#main-screen)
3. [Settings](#settings)
4. [Dashboard Sections](#dashboard-sections)
5. [Modals & Popups](#modals--popups)
6. [LAN Access (Tablets)](#lan-access--tablets)
7. [Mod Settings (`config.xml`)](#mod-settings-configxml)
8. [Troubleshooting](#troubleshooting)

## Dashboard Overview

After you complete Setup, you arrive at the **Dashboard Home** page. The dashboard consists of:

- **Top bar** — Server tabs, farm selector, game time, status badges, weather, settings
- **Left sidebar** — Navigation to sections (Livestock, Vehicles, Fields, etc.)
- **Main content area** — The currently selected section

## Main Screen

### Top Bar (Left to Right)

| Element | What it does |
|---------|--------------|
| **Server tabs** | Switch between configured servers (local saves or FTP) |
| **Farm dropdown** | Pick which farm to view (if the server has multiple farms) |
| **Game time** | Current day and hour in the game |
| **Data-source badge** | Shows if data is live, from XML, or from API — color indicates health |
| **Weather pill** | Click to see the forecast modal |
| **Notification bell** | Shows count of recent notifications; click to see history |
| **Settings gear** | Open the Settings modal |
| **Home button** | Return to the landing page |

### Landing Page

Shows up to six cards:
- **Livestock** — Total animals
- **Vehicles** — Total vehicles
- **Fields** — Total fields and area
- **Economy** — Money and assets
- **Pastures** — Active pastures
- **Production** — Active production chains

Click any card to open that section.

## Settings

Open the **Settings modal** by clicking the gear icon in the top bar.

### Dashboard Tab

| Control | What it does |
|---------|--------------|
| **Section toggles** | Show/hide cards on the landing page |
| **Desktop version** | Read-only; shows installed app version |
| **Check for updates** | Manually check for new app versions |
| **Field exclusions** | Tick/untick fields to show or hide them |
| **Field clusters** | Group multiple fields into one card (Auto or Manual) |
| **SimHub view** | Advanced: for overlay on stream/sim display |

### Servers & Saves Tab

| Control | What it does |
|---------|--------------|
| **Enable LAN access** | Allow tablets and other PCs on your network to connect |
| **LAN user / password** | Credentials for LAN clients |
| **IP allowlist** | (Optional) Restrict access to specific IP addresses |
| **Auto-detect saves** | Find all FS25 saves and add them automatically |
| **FTP polling** | Configure how often to check remote (FTP) servers |
| **Server list** | Current servers; click **Remove** to delete one |
| **Add server** | Add a new local folder or FTP server |

**FTP Polling Options:**
- **Initial delay**: 0–600 seconds (wait before first poll)
- **Interval**: 1–25 minutes (how often to check)
- **Schedule**: Sync (all at once) or Staggered (spread out)

### FS25 Mod Tab

| Control | What it does |
|---------|--------------|
| **Config path** | Shows where `config.xml` is stored (read-only) |
| **Collection cycle (ms)** | How often the mod collects data (5000–1800000 ms) |
| **Module checkboxes** | Enable/disable which data the mod collects (Animals, Vehicles, Fields, etc.) |

### Appearance Tab

| Control | What it does |
|---------|--------------|
| **Language** | Pick your UI language; the page reloads when you change it |
| **Tab selector** | Pick which area you want to customize (Dashboard, Vehicles, Fields, etc.) |
| **Color pickers** | Set Background, Surface, Text, and Accent colors |
| **Copy to all** | Apply the current color scheme to all tabs |
| **Reset** | Reset colors to defaults |

## Dashboard Sections

### Livestock

Track all animals on your farm. Features:
- **Summary cards** — Total animals, lactating, pregnant, average health
- **Filters** — By type, health, weight, age, productivity
- **Animal table** — Sortable, paginated list of all animals
- **Export** — Download animal data as CSV or JSON
- **Animal details** — Click a row to see full details for one animal

### Vehicles

Track your fleet. Features:
- **Summary cards** — Total vehicles, low fuel, high damage
- **Filters** — By type (tractors, trailers, implements), fuel level, status
- **Vehicle grid** — Card per vehicle showing fuel, damage, location
- **Image modal** — Click a vehicle image to see it full-size

### Fields

The most detailed section. Tracks crop growth, field work, and suggestions. Features:
- **Summary cards** — Total fields, total area, harvest ready, needs work
- **Filters** — All / Harvest ready / Needs work / Growing / Empty
- **Field cards** — Per parcel with status badges, growth bar, suggestions
- **Badges** — Withered, Ready, Needs work, Growing, Empty, etc.
- **Windrow badge** — Shows bale count or straw/hay volume
- **Soil info** — Nitrogen and pH levels (if using Precision Farming)
- **Tools & shop** — Suggested equipment from your fleet or available in shop
- **Rules suggestions** — AI-powered "what to do next" recommendations

### Economy

Your farm's finances. Features:
- **Summary cards** — Current money, total purchases, loan, net worth
- **Purchases tab** — Equipment and vehicles you own, sorted by price/age/name
- **Market tab** — Current crop prices (if available)
- **Filters** — By equipment type or location

### Pastures

Track animal pastures. Features:
- **Summary cards** — Total pastures, active livestock, birth warnings, average health
- **Pasture cards** — Click to see animals in that pasture
- **Warning badges** — Birth events or health alerts

### Production

Track production chains (if you use them). Features:
- **Chain cards** — Running status, input/output storage, fill levels
- **Slots** — Each production slot in the chain

## Modals & Popups

### Notifications

Click the bell icon to see recent notifications. Max 10 stored.

### Weather Forecast

Click the weather pill in the top bar to see a forecast.

### Export Livestock

In the **Livestock** section, click **Export** to download animal data as CSV or JSON.

### Animal Details

In the **Livestock** section, click a row's **View** button to see full details for one animal.

### Pasture Details

In the **Pastures** section, click a pasture card to see all animals in that pasture.

## LAN Access & Tablets

By default, the dashboard only works on the same PC (`http://localhost:8766`). To use it on a tablet or phone on your home network:

1. **Settings → Servers & saves**
2. **Enable LAN access**
3. Enter a **LAN user** and **LAN password** (required; must be at least 10 characters)
4. (Optional) Enter **IP allowlist** (comma-separated IP addresses or CIDRs; empty = any LAN IP)
5. Click **Save**

The app now binds to all network interfaces (`0.0.0.0:8766`).

### From a Tablet

1. On your PC, find your local LAN IP (run `ipconfig` in Command Prompt, look for IPv4 address like `192.168.1.x`)
2. On the tablet, open `http://<PC-LAN-IP>:8766` (e.g., `http://192.168.1.50:8766`)
3. Enter the LAN user and password you set
4. You see the dashboard

### Read-Only Viewer Mode

For tablets, you can hide the Settings gear and lock the interface read-only by appending `?viewer=1` to the URL:

```
http://192.168.1.50:8766?viewer=1
```

## Mod Settings (`config.xml`)

The in-game mod reads a config file here:

```
%USERPROFILE%\Documents\My Games\FarmingSimulator2025\modSettings\FS25_FarmDashboard\config.xml
```

You can edit this manually or use **Settings → FS25 Mod** in the app.

| Setting | What it does |
|---------|--------------|
| `collectionCycleMs` | How often the mod collects data (milliseconds; 5000–1800000) |
| Module toggles | Turn data collectors on/off (Animals, Vehicles, Fields, Weather, etc.) |
| `debugBaleScan` | Advanced logging (hand-edit only; must restart game) |

## Troubleshooting

| Problem | Solution |
|---------|----------|
| **Blank dashboard / "waiting for field data"** | Return to [Installation Guide](Installation-Guide). Confirm the mod is enabled and the save was loaded into the world. Check that `data.json` exists and has a recent timestamp. |
| **API error strip (retrying every 5 s)** | Check that **Settings → Servers & saves** points to the correct path or FTP credentials. The app auto-retries; no manual retry needed. |
| **Wrong farm shown** | Use the farm dropdown in the top bar to pick the correct farm. |
| **FTP not updating** | Check **Settings → Servers & saves → FTP polling**. Interval must be 1–25 minutes. |
| **Tablet says 401 / 403** | Wrong LAN credentials, or tablet IP is not in the allowlist. |
| **Port 8766 already in use** | Close other apps using that port, or restart the dashboard app. |
| **Language picker did not work** | The page reloads on language change. Wait for the reload to complete. |

---

Next: [Security & Network](Security-and-Network) for LAN and network details.
