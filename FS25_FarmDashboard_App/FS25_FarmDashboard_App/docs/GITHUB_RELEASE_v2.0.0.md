# FS25 Farm Dashboard — v2.0.0

**Real-time farm management for Farming Simulator 25** — Windows desktop app + Lua mod.  
**Authors:** JoshWalki, WizardlyPayload

---

## v2.0.0 — What’s new (installer & first run)

- **Windows installer (NSIS):** Language is chosen on the **first page** of the wizard. The choice is saved for the app and, if the installer **restarts for administrator rights** (e.g. install for all users), your language is **remembered** so you don’t have to pick it again from scratch.
- **ImageMagick setup** runs quietly in the background during install (**no blue PowerShell window**), so DDS→PNG conversion for mod images works when possible.
- **Server Manager** (`setup.html`): language is a **small dropdown in the top-right**; hover the dropdown for the full hint. Same locale list as the installer and dashboard **Theme & Color Settings**.
- **Dashboard & setup** use shared translations (`translations.json`) with **English fallback** per string where a locale is incomplete.

*Full maintainer-oriented notes: [`RELEASE_v2.0.0.md`](./RELEASE_v2.0.0.md).*

---

## Part A — The FS25 mod (`FS25_FarmDashboard.zip`)

### What it is

A **server-side / save-side Lua mod** for Farming Simulator 25. It does **not** add a big in-game HUD; it runs in the background while you play (or on a dedicated server), collects data from the game engine, and writes **`data.json`** (and optional **`config.xml`**) under your user profile.

### What it collects (modules)

| Area | Role |
|------|------|
| Animals | Husbandries, clusters, Realistic Livestock–style individuals where available |
| Vehicles | Fleet state, positions, fill levels, damage, ownership |
| Fields | Growth, soil, weeds, Precision Farming overlays where applicable |
| Finance | Money and related summary |
| Weather | Current conditions and forecast-oriented data |
| Economy | Sell points, market-style price discovery |
| Production | Production points / factories, chains, fill levels |

Data is refreshed on a **configurable interval** (default **10 seconds**; see `config.xml`).

### Where files go (typical Windows)

- **Output:** `Documents\My Games\FarmingSimulator2025\modSettings\FS25_FarmDashboard\<savegame folder>\data.json`
- **Config:** `Documents\My Games\FarmingSimulator2025\modSettings\FS25_FarmDashboard\config.xml`

### Multiplayer

Supported on **dedicated server**; the mod must be active on the server so it can write the same style of export for tools that read the profile (or FTP on hosted setups).

The mod has **no dedicated dashboard panel inside FS25**.

---

## Part B — The desktop app (Electron)

### What it is

A **Windows desktop program** that:

- Hosts a **local HTTP API** (default port **8766**) and **WebSocket** updates
- Reads **`data.json`** from disk **or** via **FTP** (hosted / GPortal-style servers)
- Merges **live Lua JSON** with **savegame XML** (fields, farmlands, economy, vehicles, etc.) when XML is available
- Opens an embedded or external **browser UI** at **`http://localhost:8766`**

First-time **Server Manager** screen: **`setup.html`** (local paths, FTP, multi-server).

### Screenshots — desktop app

![First Run / Server Manager — servers, FTP, paths](https://private-user-images.githubusercontent.com/189568661/570501055-92e75d3f-285f-4e5f-a1bf-47ab8fcc4ec2.png?jwt=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbSIsImtleSI6ImtleTUiLCJleHAiOjE3NzUwNzA2MjYsIm5iZiI6MTc3NTA3MDMyNiwicGF0aCI6Ii8xODk1Njg2NjEvNTcwNTAxMDU1LTkyZTc1ZDNmLTI4NWYtNGU1Zi1hMWJmLTQ3YWI4ZmNjNGVjMi5wbmc_WC1BbXotQWxnb3JpdGhtPUFXUzQtSE1BQy1TSEEyNTYmWC1BbXotQ3JlZGVudGlhbD1BS0lBVkNPRFlMU0E1M1BRSzRaQSUyRjIwMjYwNDAxJTJGdXMtZWFzdC0xJTJGczMlMkZhd3M0X3JlcXVlc3QmWC1BbXotRGF0ZT0yMDI2MDQwMVQxOTA1MjZaJlgtQW16LUV4cGlyZXM9MzAwJlgtQW16LVNpZ25hdHVyZT1jNjI2ZjUxMzlkOTQ1OTQxNzk2YzE2ZDU2NTYwZWY5NTA1OTYwZjlkZGUyZjYzMGEwMzJiOTJmODBlNzQ0NjIyJlgtQW16LVNpZ25lZEhlYWRlcnM9aG9zdCJ9.yWw_Np6vkMYCwb6hVUCCatLj3O7D-qDv1-pl4B8_dLg)

**Server Manager / Setup** — servers, FTP, paths | First launch or gear icon → setup

![Server setup](https://private-user-images.githubusercontent.com/189568661/570501248-dc2b33ef-8fa5-4e36-8b0c-9332b39b7757.png?jwt=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbSIsImtleSI6ImtleTUiLCJleHAiOjE3NzUwNzA2MjYsIm5iZiI6MTc3NTA3MDMyNiwicGF0aCI6Ii8xODk1Njg2NjEvNTcwNTAxMjQ4LWRjMmIzM2VmLThmYTUtNGUzNi04YjBjLTkzMzJiMzliNzc1Ny5wbmc_WC1BbXotQWxnb3JpdGhtPUFXUzQtSE1BQy1TSEEyNTYmWC1BbXotQ3JlZGVudGlhbD1BS0lBVkNPRFlMU0E1M1BRSzRaQSUyRjIwMjYwNDAxJTJGdXMtZWFzdC0xJTJGczMlMkZhd3M0X3JlcXVlc3QmWC1BbXotRGF0ZT0yMDI2MDQwMVQxOTA1MjZaJlgtQW16LUV4cGlyZXM9MzAwJlgtQW16LVNpZ25hdHVyZT03NzI4MzhkZTgzNTE2ODk3NjMxYjA5NDZlMmQwMThlZjJlYzQ5NWRiOTNmZWI1MGQ4MmVjMWFmZWEyYmE2MDc3JlgtQW16LVNpZ25lZEhlYWRlcnM9aG9zdCJ9.G6BbhExaSe-PqsKE3tOV2L_XUD3jyB5xq6batAO4WFY)

![Home — six section cards (Livestock, Vehicles, Fields, Economy, Pastures, Productions)](https://private-user-images.githubusercontent.com/189568661/570075815-6f9d54d1-e7f4-44be-b3b4-66465f4c5f00.png?jwt=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbSIsImtleSI6ImtleTUiLCJleHAiOjE3NzUwNzA2MjYsIm5iZiI6MTc3NTA3MDMyNiwicGF0aCI6Ii8xODk1Njg2NjEvNTcwMDc1ODE1LTZmOWQ1NGQxLWU3ZjQtNDRiZS1iM2I0LTY2NDY1ZjRjNWYwMC5wbmc_WC1BbXotQWxnb3JpdGhtPUFXUzQtSE1BQy1TSEEyNTYmWC1BbXotQ3JlZGVudGlhbD1BS0lBVkNPRFlMU0E1M1BRSzRaQSUyRjIwMjYwNDAxJTJGdXMtZWFzdC0xJTJGczMlMkZhd3M0X3JlcXVlc3QmWC1BbXotRGF0ZT0yMDI2MDQwMVQxOTA1MjZaJlgtQW16LUV4cGlyZXM9MzAwJlgtQW16LVNpZ25hdHVyZT1iNDg4NzRhMTEyODY5ZWY4ZmY0N2JmMzAwMjM2NTBiNGFiYTM2ODFjZmViOGU2MmE3YWI2MjkyNmI3NzRiZDNmJlgtQW16LVNpZ25lZEhlYWRlcnM9aG9zdCJ9.EVgq_JjOGtWWAXse3kW7bR2WFUkpIOIs7MBw_5SH5w4)

**Home** — six section cards (Livestock, Vehicles, Fields, Economy, Pastures, Productions); use **Home** in the navbar.

---

## Part C — Web dashboard pages (inside the app)

Open **`http://localhost:8766`** after the app is running and data is flowing.

### Livestock

![Livestock](https://private-user-images.githubusercontent.com/189568661/570076237-57e63a00-fe23-47e7-a3c7-d478d934ba01.png?jwt=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbSIsImtleSI6ImtleTUiLCJleHAiOjE3NzUwNzA2MjYsIm5iZiI6MTc3NTA3MDMyNiwicGF0aCI6Ii8xODk1Njg2NjEvNTcwMDc2MjM3LTU3ZTYzYTAwLWZlMjMtNDdlNy1hM2M3LWQ0NzhkOTM0YmEwMS5wbmc_WC1BbXotQWxnb3JpdGhtPUFXUzQtSE1BQy1TSEEyNTYmWC1BbXotQ3JlZGVudGlhbD1BS0lBVkNPRFlMU0E1M1BRSzRaQSUyRjIwMjYwNDAxJTJGdXMtZWFzdC0xJTJGczMlMkZhd3M0X3JlcXVlc3QmWC1BbXotRGF0ZT0yMDI2MDQwMVQxOTA1MjZaJlgtQW16LUV4cGlyZXM9MzAwJlgtQW16LVNpZ25hdHVyZT04Y2Y0NWIwNTQ4YWIyY2ZhZWRlYjA4M2NkMjFmNzQyYmJkNTZmYjcwYzMyYzE3YWFkODJjNTFmZmI2ZjE3OTgyJlgtQW16LVNpZ25lZEhlYWRlcnM9aG9zdCJ9.JEHXr8tRyiyaKoxqfaMx7Bu1o7peppnTC57X9uZR9kw)

Summary cards + animals **DataTable** (expand filters if you want a second shot).

### Vehicles

![Vehicles](https://private-user-images.githubusercontent.com/189568661/570076323-d9e6878d-7ce9-49de-927e-c5d8bc60bf2d.png?jwt=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbSIsImtleSI6ImtleTUiLCJleHAiOjE3NzUwNzA2MjYsIm5iZiI6MTc3NTA3MDMyNiwicGF0aCI6Ii8xODk1Njg2NjEvNTcwMDc2MzIzLWQ5ZTY4NzhkLTdjZTktNDlkZS05MjdlLWM1ZDhiYzYwYmYyZC5wbmc_WC1BbXotQWxnb3JpdGhtPUFXUzQtSE1BQy1TSEEyNTYmWC1BbXotQ3JlZGVudGlhbD1BS0lBVkNPRFlMU0E1M1BRSzRaQSUyRjIwMjYwNDAxJTJGdXMtZWFzdC0xJTJGczMlMkZhd3M0X3JlcXVlc3QmWC1BbXotRGF0ZT0yMDI2MDQwMVQxOTA1MjZaJlgtQW16LUV4cGlyZXM9MzAwJlgtQW16LVNpZ25hdHVyZT05ZDZkNjBmZjI1NWQ1ZTZjNWE2Y2QxMzUzYTQ3MDE3OWJhZWI4ZDEyMDFlYTU5NzkyMmY1NDBhNmY5ZjliOTY1JlgtQW16LVNpZ25lZEhlYWRlcnM9aG9zdCJ9.BLUcFdRNu8aJ7p36Y9JSmpw7wzy60jK_mVnPWDzSMUc)

Fleet cards / list for **active farm**.

### Fields

![Fields](https://private-user-images.githubusercontent.com/189568661/570076379-f490ada4-ea10-4d85-82c9-a3e470542a20.png?jwt=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbSIsImtleSI6ImtleTUiLCJleHAiOjE3NzUwNzA2MjYsIm5iZiI6MTc3NTA3MDMyNiwicGF0aCI6Ii8xODk1Njg2NjEvNTcwMDc2Mzc5LWY0OTBhZGE0LWVhMTAtNGQ4NS04MmM5LWEzZTQ3MDU0MmEyMC5wbmc_WC1BbXotQWxnb3JpdGhtPUFXUzQtSE1BQy1TSEEyNTYmWC1BbXotQ3JlZGVudGlhbD1BS0lBVkNPRFlMU0E1M1BRSzRaQSUyRjIwMjYwNDAxJTJGdXMtZWFzdC0xJTJGczMlMkZhd3M0X3JlcXVlc3QmWC1BbXotRGF0ZT0yMDI2MDQwMVQxOTA1MjZaJlgtQW16LUV4cGlyZXM9MzAwJlgtQW16LVNpZ25hdHVyZT1mMjVlYTNhNGZkNzZkZjE5NWI0YmM5NTc3MGNkZWRhZDA2OTc5MjAyYjM0MjgyMjQxNzJiOTZhZDRlNWQwNjViJlgtQW16LVNpZ25lZEhlYWRlcnM9aG9zdCJ9.k3QxocBcl-X8geONxqaUI3dpq3m9JJEjPIgoNkHxhzk)

Summary stats + field cards; optional second: **Needs Work** filter.

### Economy

![Economy](https://private-user-images.githubusercontent.com/189568661/570076416-a1db577a-390c-4d3a-99ab-c7a797196535.png?jwt=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbSIsImtleSI6ImtleTUiLCJleHAiOjE3NzUwNzA2MjYsIm5iZiI6MTc3NTA3MDMyNiwicGF0aCI6Ii8xODk1Njg2NjEvNTcwMDc2NDE2LWExZGI1NzdhLTM5MGMtNGQzYS05OWFiLWM3YTc5NzE5NjUzNS5wbmc_WC1BbXotQWxnb3JpdGhtPUFXUzQtSE1BQy1TSEEyNTYmWC1BbXotQ3JlZGVudGlhbD1BS0lBVkNPRFlMU0E1M1BRSzRaQSUyRjIwMjYwNDAxJTJGdXMtZWFzdC0xJTJGczMlMkZhd3M0X3JlcXVlc3QmWC1BbXotRGF0ZT0yMDI2MDQwMVQxOTA1MjZaJlgtQW16LUV4cGlyZXM9MzAwJlgtQW16LVNpZ25hdHVyZT0yZjBiZjcwODM5NWI0MmE4M2ZhNjQ2ODc5OWI3Mzc0NjZlMzhkNzRiMDI0MTY2OTYwMDM3MTJlNDJlMzYxNjY3JlgtQW16LVNpZ25lZEhlYWRlcnM9aG9zdCJ9.MJTcsSYb8F0PcaGKuIYTcFl6013eRsqW0DGLCRlZGFg)

Prices / finance view.

### Pastures

![Pastures](https://private-user-images.githubusercontent.com/189568661/570076482-f7d35075-8aaf-4512-a363-e217236e063b.png?jwt=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbSIsImtleSI6ImtleTUiLCJleHAiOjE3NzUwNzA2MjYsIm5iZiI6MTc3NTA3MDMyNiwicGF0aCI6Ii8xODk1Njg2NjEvNTcwMDc2NDgyLWY3ZDM1MDc1LThhYWYtNDUxMi1hMzYzLWUyMTcyMzZlMDYzYi5wbmc_WC1BbXotQWxnb3JpdGhtPUFXUzQtSE1BQy1TSEEyNTYmWC1BbXotQ3JlZGVudGlhbD1BS0lBVkNPRFlMU0E1M1BRSzRaQSUyRjIwMjYwNDAxJTJGdXMtZWFzdC0xJTJGczMlMkZhd3M0X3JlcXVlc3QmWC1BbXotRGF0ZT0yMDI2MDQwMVQxOTA1MjZaJlgtQW16LUV4cGlyZXM9MzAwJlgtQW16LVNpZ25hdHVyZT0zODBhMWEwMjVjNDI0ODg3ZmY0MDU3YWRkNmUzNWEyMjY3MmJkMzUxMjUzZWNjZjk3ZDA4NjRiYWUyNmEwMTc0JlgtQW16LVNpZ25lZEhlYWRlcnM9aG9zdCJ9.0PEJCY9U6Khmzf9ud-jY5dS2LLn9wvQVr7WOn8Vcek8)

Pasture / husbandry overview.

### Productions

![Productions](https://private-user-images.githubusercontent.com/189568661/570076535-01123539-f794-4f15-9857-d4eb61102f7b.png?jwt=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbSIsImtleSI6ImtleTUiLCJleHAiOjE3NzUwNzA2MjYsIm5iZiI6MTc3NTA3MDMyNiwicGF0aCI6Ii8xODk1Njg2NjEvNTcwMDc2NTM1LTAxMTIzNTM5LWY3OTQtNGYxNS05ODU3LWQ0ZWI2MTEwMmY3Yi5wbmc_WC1BbXotQWxnb3JpdGhtPUFXUzQtSE1BQy1TSEEyNTYmWC1BbXotQ3JlZGVudGlhbD1BS0lBVkNPRFlMU0E1M1BRSzRaQSUyRjIwMjYwNDAxJTJGdXMtZWFzdC0xJTJGczMlMkZhd3M0X3JlcXVlc3QmWC1BbXotRGF0ZT0yMDI2MDQwMVQxOTA1MjZaJlgtQW16LUV4cGlyZXM9MzAwJlgtQW16LVNpZ25hdHVyZT00NjIzMzEwNzhmYTE4MTFmOGUzOGViZDE0NjY0ZjlhYTA0M2ZmMGUwYWQyZWE3MzNmMWFlMGY1ZjQ3ZGE4MTk3JlgtQW16LVNpZ25lZEhlYWRlcnM9aG9zdCJ9.xyeaRiUQAV8PiP6_IjUFiBWEvzlDAKb4k_4POE7v6YA)

Production chains for **selected farm**.

---

### Note on screenshot URLs

Embedded images use GitHub **user-attachment** URLs (some include time-limited `jwt` query parameters). If they ever fail to load, **drag the PNGs into the release description** again in the GitHub editor (GitHub will re-host them), or add files under `docs/` in the repo and link to the **raw** URLs.

---

## Install summary (v2.0.0)

1. Install the **FS25 Farm Dashboard** Windows app (`FS25 Farm Dashboard Setup 2.0.0.exe`).
2. Enable the **FS25_FarmDashboard** mod in FS25 (and on dedicated server if used).
3. Complete **Server Manager** on first run; then open **`http://localhost:8766`** for the dashboard.

---

## Licence / credits

Bundled third-party components (Electron, Chromium, ImageMagick when installed, etc.) are subject to their respective licences. Game content and mod data remain property of Giants Software and respective mod authors.
