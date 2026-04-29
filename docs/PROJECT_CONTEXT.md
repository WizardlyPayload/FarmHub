# FarmHub — Full project context for planning

**Purpose:** Single document to feed into an external planner so it can propose roadmaps, refactors, or debugging steps **without** prior chat history.

**Repository:** `FarmHub` — FS25 Farm Dashboard (Electron + web + Lua mod).  
**Current versions:** App **3.0.0** (`package.json`), mod **2.0.0.0** (`modDesc.xml`).

**Technical handover:** [DEVELOPER_HANDOVER.md](./DEVELOPER_HANDOVER.md) · **Doc index:** [README.md](./README.md)

---

## 1. Product intent

- **Farm Dashboard:** Real-time browser UI for **Farming Simulator 25**: livestock, vehicles, fields, economy, weather, productions, pastures, notifications.
- **Data sources:** Lua mod writes **`data.json`**; the app **merges** with **savegame XML** (local disk or **FTP** for dedicated servers).
- **Field guidance:** **Offline rules** on field cards + optional Lua **`suggestions`** list from the mod — no remote model or subscription service in this tree’s **3.0.0** baseline.

---

## 2. Repository layout

| Path | Technology | Role |
| ---- | ----------- | ---- |
| `FS25_FarmDashboard_Mod/.../` | Lua | Collectors; writes `data.json` |
| `FS25_FarmDashboard_App/.../` | Electron, Express, vanilla JS | Local HTTP API (~**8766**), merge, FTP, IPC |
| `docs/` | Markdown | Manuals, security, changelog |

**Note:** Web assets folder is spelled **`web/assests/`** (historic typo).

---

## 3. End-to-end data flows

### 3.1 Local single-player / LAN browser

1. FS25 + mod on **authority**.
2. `data.json` updated under `modSettings/FS25_FarmDashboard/<save>/`.
3. Electron watches / reads file; optional XML from save folder.
4. **`dataMerger.js`** produces merged structures.
5. Express serves **`/api/data`**, **`/api/fields`**, etc.; SPA polls.
6. **`rules-engine.js`** derives field-card hints from merged JSON.

### 3.2 FTP / dedicated server

Same merge, but XML and/or JSON may be **pulled on a schedule** (`sync` vs `staggered` multi-server polling in `main.js` / setup store).

### 3.3 LAN exposure

Optional **`0.0.0.0`** bind with **HTTP Basic** + **IP allowlist**; loopback requests bypass LAN auth so the desktop shell keeps working. See [SECURITY.md](./SECURITY.md).

---

## 4. Major subsystems

### 4.1 Electron (`main.js`)

- Starts Express + static **`web/`** hosting.
- **electron-store** — servers, FTP polling options, LAN prefs, locale, theme.
- **FTP coordinator** — interval, delay, stagger/sync across configured servers.

### 4.2 Web UI (`web/assests/js/`)

- SPA-style modules per section.
- **Fields** — `fields.js` + `rules-engine.js`; windrow badge builder; filters (`Needs work`, etc.).

### 4.3 Merge (`dataMerger.js`)

- Joins Lua field rows with XML rows; dual lookup when **`farmlandId`** vs internal **`id`** diverges so live-only metrics (bales, windrows) are not dropped.

### 4.4 Lua mod

- Staggered collectors reduce per-frame cost.
- Field collector exports **aggregates** (counts, liters, flags), not dense coordinate arrays.

---

## 5. Tech stack summary

| Area | Stack |
| ---- | ----- |
| Desktop | Electron, electron-store, express, ws, basic-ftp, electron-updater |
| Web | Vanilla JS, Bootstrap, JSON i18n |
| Game | Lua FS25 API |
| Data | JSON + XML on disk |

---

## 6. Common failure modes

| Symptom | Typical cause |
| ------- | ------------- |
| Blank dashboard | Save not loaded with mod; wrong profile path; FTP misconfigured |
| Bales/windrows missing on card | Farm filter hiding unowned fields; merge key mismatch; Lua exported zeros |
| LAN 403 | Allowlist / auth mismatch |

---

## 7. Security notes

- Renderer: **no NodeIntegration**; **`preload.js`** IPC whitelist.
- LAN: [SECURITY.md](./SECURITY.md).

---

## 8. Suggested review prompts

1. *Given this context, list the top five risks when enabling LAN on a home Wi‑Fi and mitigations in `main.js`.*
2. *Propose a test matrix for `dataMerger.js` windrow normalization across sample `data.json` fixtures.*
3. *Identify extension points for new field rules without growing `rules-engine.js` into a monolith.*

---

## 9. Key file index

| File | Why it matters |
| ---- | -------------- |
| `main.js` | Express, FTP, merge, LAN |
| `dataMerger.js` | Merge |
| `web/assests/js/modules/fields.js` | Field UI |
| `web/assests/js/rules-engine.js` | Offline parcel tips |
| `FieldDataCollector.lua` | Field metrics export |

---

*Align with `DEVELOPER_HANDOVER.md` if documents diverge.*
