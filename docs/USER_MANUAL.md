# FS25 Farm Dashboard — Complete user manual

**Farm Dashboard** is the Windows desktop app that reads live farm data from **Farming Simulator 25** (via the in-game **Farm Dashboard** mod) and shows it in your browser at **[http://localhost:8766](http://localhost:8766)**. Optional **Smart suggestions** add AI-style priorities; they work in **three stages** (tiers): **Hosted**, **BYOK**, or **Rules**.

This manual explains **installation order**, **every dashboard setting**, **all common setup combinations** (solo, FTP, LAN, Rules/BYOK/Hosted), and **how Smart suggestions behave**. **§10** explains **why hosted Smart AI is a subscription**, how it differs from BYOK, and gives **multiplayer `!hank` chat examples** — **without** VPS or server-install steps (those stay with the operator). Screenshot slots use `**docs/screenshots/`** filenames so you can ship a polished PDF or site.

**Related:** [INSTALL.md](./INSTALL.md) (short install) · [USER_GUIDE.md](./USER_GUIDE.md) (AI + fields quick reference) · [SECURITY.md](./SECURITY.md) (LAN) · [SMART_SUGGESTIONS_TIERS.md](./SMART_SUGGESTIONS_TIERS.md) (tier details) · [SALES_HANDOVER.md](./SALES_HANDOVER.md) (sales & partner positioning)

---

## Table of contents

1. [What you need](#1-what-you-need)
2. [Installation — staged checklist](#2-installation--staged-checklist)
3. [First launch and Setup](#3-first-launch-and-setup)
4. [Every setup path — choose your combination](#4-every-setup-path--choose-your-combination)
5. [Main screen map](#5-main-screen-map)
6. [Smart suggestions — the three stages (tiers)](#6-smart-suggestions--the-three-stages-tiers)
7. [Settings — every option explained](#7-settings--every-option-explained)
8. [Dashboard sections — what each area shows](#8-dashboard-sections--what-each-area-shows)
9. [Optional: LAN and tablets](#9-optional-lan-and-tablets)
10. [Hosted Smart AI and multiplayer chat — why subscribe](#section-10-hosted-ai)
11. [Troubleshooting](#11-troubleshooting)
12. [Screenshot assets — filenames to create](#12-screenshot-assets--filenames-to-create)

---

## 1. What you need


| Item                             | Purpose                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Farming Simulator 25**         | Game must run with the mod enabled for data to exist.                                                   |
| **Farm Dashboard mod**           | Shipped as `**FS25_FarmDashboard_Mod`** — copy into your FS25 `mods` folder.                            |
| **Farm Dashboard app (Windows)** | Installer `.exe` from project Releases (or your build).                                                 |
| **Browser**                      | Edge, Chrome, or Firefox — the app opens **[http://localhost:8766](http://localhost:8766)** by default. |
| **Optional: AI**                 | For Smart suggestions beyond **Rules**, configure **Hosted** and/or **BYOK** (see §5).                  |


---

## 2. Installation — staged checklist

Follow **in order**. The dashboard app must **not** be relied on until the mod has created `**data.json`** for each save you care about.

### Stage A — Install the mod (game files)

1. Copy the `**FS25_FarmDashboard`** mod folder into:
  `Documents\My Games\FarmingSimulator2025\mods\`
2. Start **FS25**.

> **Screenshot — Stage A**  
> Placeholder: mod folder in Windows Explorer  
> `*fd-manual-010-mod-folder-in-mods.png` — Mod folder visible under the FS25 `mods` directory.*

### Stage B — Enable and load every save (required once per save)

For **each** savegame slot (single-player, multiplayer farm, or server save) where you want the dashboard:

1. Enable **Farm Dashboard** in the save’s mod list.
2. **Load the save** and enter the world (not only the main menu).

> **Screenshot — Stage B**  
> Placeholder: FS25 mod activation UI for the save  
> `*fd-manual-020-fs25-mod-enabled-for-save.png` — Mod enabled for the target save (blur personal names if needed).*

### Stage C — Confirm the mod is writing data (optional but useful)

The mod writes `**data.json`** under your profile, for example:

`Documents\My Games\FarmingSimulator2025\modSettings\FS25_FarmDashboard\<savegame folder>\data.json`

> **Screenshot — Stage C**  
> Placeholder: Explorer showing data.json path  
> `*fd-manual-030-data-json-path.png` — Profile path showing `data.json` present and recently updated.*

### Stage D — Install the Windows dashboard app

1. Run `**FS25 Farm Dashboard Setup … .exe`**.
2. Complete the installer (language, folder, shortcuts as offered).
3. Launch **Farm Dashboard** from the Start menu.

> **Screenshot — Stage D**  
> Placeholder: NSIS installer welcome or finish screen  
> `*fd-manual-040-windows-installer.png` — Installer welcome or completion step.*

### Stage E — First-time Setup in the app

On first run, **Setup** (Server Manager) asks for:

- **Local play:** path to your FS25 profile / mod output (defaults usually work on one PC).  
- **Hosted / FTP:** host, user, password, remote paths if the game runs on a **dedicated or rented server**.

Then open **[http://localhost:8766](http://localhost:8766)** in your browser.

> **Screenshot — Stage E**  
> Placeholder: Setup / Server Manager main view  
> `*fd-manual-050-first-run-setup-server-manager.png` — First-run setup with servers and paths visible.*

### Stage F — Live dashboard

You should see the **landing** view with section cards (Livestock, Vehicles, Fields, …) and live data after the game has updated `**data.json`**.

> **Screenshot — Stage F**  
> Placeholder: Browser showing localhost:8766 landing  
> `*fd-manual-060-landing-home-loaded.png` — Dashboard home with data loaded (money/time optional).*

---

## 3. First launch and Setup


| If you…                                     | Do this                                                                                                        |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Need to **add or edit servers / FTP** later | **Settings (gear) → Servers & saves** — unified server list and polling.                                       |
| See **“waiting for data”**                  | Confirm Stage B for that save; confirm paths or FTP point at the server profile that contains `**data.json`**. |
| Use **multiple farms** in one save          | Use the **farm selector** in the top bar when the UI shows it (multi-farm or FTP setups).                      |


> **Screenshot**  
> Placeholder: Settings → Servers & saves  
> `*fd-manual-070-settings-servers-and-saves.png` — Settings open on Servers & saves.*

---

## 4. Every setup path — choose your combination

Use this table to **pick the row that matches you**, then configure only the items in that row. Nothing here requires AI — the dashboard works with **Rules** only.


| Your situation                        | Data source (Servers & saves)                                         | Smart suggestions                                              | LAN / second screen                        | Typical use                                     |
| ------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------- |
| **Solo on one PC**                    | Single **local** server → profile path to `data.json`                 | **Rules** only, or **BYOK**, or **Hosted**                     | Optional: enable LAN for a tablet on Wi‑Fi | Everyday play beside the game                   |
| **Solo + your own Gemini/OpenAI key** | Local server                                                          | **BYOK** in **Settings → AI Farm Manager**                     | As above                                   | AI tips without a subscription                  |
| **Solo + hosted Smart AI**            | Local server                                                          | **Hosted AI**: URL + link key + send snapshot                  | As above                                   | Full consultant quality; see §10                |
| **Dedicated / rented server (FTP)**   | Add **FTP** server: host, credentials, remote profile path, save slot | **Rules** / **BYOK** / **Hosted** same as above                | Usually on the PC that runs Farm Dashboard | Admin monitors server farm from another machine |
| **Multiple FTP farms**                | Several FTP entries; use **staggered** or **sync** polling            | Any tier                                                       | LAN optional                               | G-Portal / multi-save operators                 |
| **Tablet only (no AI on tablet)**     | Dashboard runs on **gaming PC**; tablet uses **LAN URL**              | Host PC chooses tier; tablet often sees **cached** suggestions | **Required**                               | Kitchen / couch second screen                   |
| **AI off completely**                 | Any data source                                                       | Leave BYOK empty; do not configure Hosted                      | Any                                        | Privacy, offline, or troubleshooting            |


**Decision guide**

- **Just monitoring** (animals, fleet, money): **Rules** tier is enough — no API keys.  
- **Experimenting with AI cost**: **BYOK** with a personal Gemini/OpenAI key on **localhost**.  
- **Best FS25-aware tips + multiplayer chat bot**: **Hosted** subscription path (§10) — tuned prompts and **!hank** on the server.

**FTP polling (when applicable):** In **Settings → Servers & saves**, set **first poll delay**, **interval** (minutes), and **sync** (all servers at once) vs **staggered** (spread load). Match the interval to how often the host writes `**data.json`** and how fresh you need the view.

> **Screenshot**  
> Placeholder: FTP server row expanded with stagger/sync  
> `*fd-manual-065-ftp-polling-options.png` — FTP polling: interval + sync vs staggered (if visible in your build).*

---

## 5. Main screen map

After data loads, the **top bar** typically includes:


| Area                     | What it is                                                                              |
| ------------------------ | --------------------------------------------------------------------------------------- |
| **Title / section name** | Current section (e.g. Fields, Livestock).                                               |
| **Farm selector**        | Appears when multiple farms or FTP servers need a choice.                               |
| **Status badges**        | Combined view of **XML**, **live Lua**, and **API** health (wording may vary by build). |
| **Game time / weather**  | Shown when the payload includes them.                                                   |
| **Settings (gear)**      | Opens unified settings (servers, AI, LAN, theme).                                       |


The **landing page** shows **large cards** for each major area. Use them to jump to **Livestock**, **Vehicles**, **Fields**, **Economy**, **Pastures**, and **Productions**.

> **Screenshot**  
> Placeholder: Top bar with badges and farm dropdown  
> `*fd-manual-080-navbar-status-badges.png` — Top bar: farm selector, data source, weather.*

> **Screenshot**  
> Placeholder: Landing grid of section cards  
> `*fd-manual-090-landing-six-cards.png` — Home landing with six section cards.*

---

## 6. Smart suggestions — the three stages (tiers)

Smart suggestions are optional. When active, the UI shows which **stage** is in use:


| Stage (tier)      | Badge (typical) | What it means                                                                                                                                                                                          |
| ----------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1 — Hosted AI** | **Hosted**      | You configured an **AI Farm Manager** URL + **link key** on the **Hosted AI** sub-tab. The cloud server runs the LLM using your farm snapshot.                                                         |
| **2 — BYOK**      | **BYOK**        | **Bring your own key** — OpenAI or Gemini key saved under **Settings → AI Farm Manager → BYOK**. On **this PC**, the app can call the provider directly for suggestions (no hosted LLM for that path). |
| **3 — Rules**     | **Rules**       | **No LLM** — local rules (especially strong on **Fields** for swaths, bales, soil). Always available as a fallback when AI is off, misconfigured, or rate-limited.                                     |


**Precedence:** If both **Hosted** and **BYOK** are set on the **same PC**, **BYOK** is typically preferred for **localhost** Smart suggestions; tablets on the LAN may see **cached** results from the host.

**In-game chat (`!hank`)** is **not** the same as BYOK — it requires the **hosted** stack and **multiplayer**; see [AI_IN_GAME_CHAT.md](./AI_IN_GAME_CHAT.md).

> **Screenshot**  
> Placeholder: Smart suggestions row with tier badge  
> *`fd-manual-100-smart-suggestions-tier-badge.png` — Home: Smart suggestions strip showing Hosted / BYOK / Rules badge.*

> **Screenshot**  
> Placeholder: Settings → AI Farm Manager with BYOK + Hosted tabs  
> *`fd-manual-110-settings-ai-farm-manager-tabs.png` — AI Farm Manager settings: BYOK card and Hosted AI sub-tab.*

> **Screenshot**  
> Placeholder: Collapsed smart suggestions chevron on home  
> *`fd-manual-115-smart-suggestions-collapsed.png` — Optional: collapsed Smart suggestions row (v3.0+).*

---

## 7. Settings — every option explained

Open **Settings** from the **gear** icon. The exact labels may vary slightly by app version; groupings below match the **3.x** layout.

### 7.1 Servers & saves


| Control / area                                                     | What to do                                                                                                                                                 |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Add server**                                                     | Create one entry per **data source** (your PC’s profile, or an **FTP** host).                                                                              |
| **Local path**                                                     | Point at the folder that contains `**data.json`** for the save (often under `modSettings\FS25_FarmDashboard\<savegame>\`).                                 |
| **FTP fields**                                                     | Hostname, port, username, password, remote directory to the server **profile**, correct **savegame slot** / subfolder if the UI asks for it.               |
| **Poll interval**                                                  | How often the app pulls remote files (FTP). Longer intervals = less load; shorter = fresher view.                                                          |
| **First poll delay**                                               | Wait after app start before the first FTP pull (helps right after server restart).                                                                         |
| **Sync vs staggered**                                              | **Sync**: all FTP servers polled together each cycle. **Staggered**: spreads polls across the interval — better when you have many servers or a slow link. |
| **HTTP feed** (if shown)                                           | Optional URL the host provides for extra XML/HTTP data — only when your server documentation says to use it.                                               |
| **Scan local saves** / **discover paths** (if present)             | Helper to locate `modSettings\FS25_FarmDashboard` folders.                                                                                                 |
| **Mod shop images** / **export images** (if on setup or dashboard) | Runs the PowerShell pipeline to extract **store** images from your FS25 `mods` folder for richer vehicle thumbnails — optional.                            |


> **Screenshot**  
> Placeholder: Settings overview or sidebar  
> `*fd-manual-120-settings-overview.png` — Settings panel overview.*

### 7.2 AI Farm Manager — BYOK (on this PC)

Use when you want **OpenAI**, **Google Gemini**, or a **local OpenAI-compatible server** (e.g. **Ollama** on your NAS or PC) to power Smart suggestions **from your own API account** or LAN (you manage keys and network access).

For **Ollama / vLLM / LM Studio**, pick **Local / OpenAI-compatible** in the BYOK provider dropdown, enter the **base URL** (e.g. `http://192.168.1.10:11434`), optionally use key **`ollama`** if your server does not require auth, then **Refresh models** and **Save BYOK**. Technical reference: [LLM_OPENAI_COMPATIBLE.md](./LLM_OPENAI_COMPATIBLE.md).


| Control                              | Purpose                                                                                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Provider**                         | **Gemini**, **OpenAI (cloud)**, or **Local / OpenAI-compatible** (Ollama, vLLM…).                                                              |
| **API key**                          | Paste your key; stored in the app’s secure store — **never share screenshots** with keys visible.                                             |
| **Model**                            | Choose from the list (**Refresh models** may query the provider). Pick a current model id (avoid deprecated names your provider has retired). |
| **Extra keys / models** (if present) | Spread load across keys or models on free tiers — see [SMART_SUGGESTIONS_TIERS.md](./SMART_SUGGESTIONS_TIERS.md).                             |
| **Save**                             | Persist BYOK so Smart suggestions can use **BYOK** tier on **localhost**.                                                                     |


**Limits of BYOK:** Tips follow **generic** LLM behaviour unless you also use **Hosted** — the model does not automatically know FS25 growth stages unless the **dashboard JSON** and prompts carry that context; quality depends on your key’s quota and model choice.

### 7.3 AI Farm Manager — Hosted AI (subscription / partner URL)

Use when you have a **hosted AI Farm Manager** subscription or partner **base URL** + **link key** (integration key).


| Control                                     | Purpose                                                                                                                                                          |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Server URL**                              | HTTPS base of the hosted API (**no trailing slash**).                                                                                                            |
| **Link / integration key**                  | Matches what the host issued — often `FARMDASH_INTEGRATION_KEY` on the server.                                                                                   |
| **Send farm data** / **push snapshot**      | Allows the PC to POST merged farm JSON so the host can run the consultant without FTP from the host into your PC.                                                |
| **Save hosted connection**                  | Store URL + key.                                                                                                                                                 |
| **Test / status** (if present)              | Verifies reachability and auth.                                                                                                                                  |
| **In-game chat (!hank)** block (if present) | Downloads or references `**ai_farm_manager_config.xml`** for the **game server** — **multiplayer only**; see §10 and [AI_IN_GAME_CHAT.md](./AI_IN_GAME_CHAT.md). |


This manual does **not** cover **installing or maintaining a VPS** — that is operator work. For **why** a hosted tier exists and what you gain, see **§10**.

### 7.4 Remote / LAN access


| Control                       | Purpose                                                                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Enable LAN**                | Binds the dashboard to **all interfaces** (`0.0.0.0`) so other devices on the LAN can connect. **Off** = **localhost only**. |
| **Username / password**       | **HTTP Basic Auth** for non-localhost clients.                                                                               |
| **IP allowlist** (if present) | Only listed IPs may connect when LAN is on. **127.0.0.1** is usually exempt so the same PC always works.                     |


See [SECURITY.md](./SECURITY.md).

> **Screenshot**  
> Placeholder: LAN access toggle and credentials  
> `*fd-manual-130-settings-lan-access.png` — LAN enabled with auth fields (blur secrets).*

### 7.5 Theme, language, and appearance


| Control               | Purpose                                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Theme / colours**   | Dark/light and accent — personal preference.                                                               |
| **Language / locale** | If the build ships translations, select your language; English fallback applies where strings are missing. |


> **Screenshot**  
> Placeholder: Theme and language settings  
> `*fd-manual-135-theme-language.png` — Theme & language (optional).*

### 7.6 Notifications


| Control                  | Purpose                                                                |
| ------------------------ | ---------------------------------------------------------------------- |
| **Notification history** | Review past alerts (opens from navbar or settings depending on build). |


---

## 8. Dashboard sections — what each area shows

Use the **landing cards** or the **navigation** to switch sections. Below: what to look for in each.

### Home (landing)

- **Section cards** — Quick entry to all areas.  
- **Smart suggestions** — Top farm priorities when AI or rules are active.

*(Screenshots: §5–§6.)*

### Livestock

- Herds, husbandries, animal counts and status summaries.

> **Screenshot**  
> Placeholder: Livestock section main view  
> `*fd-manual-200-section-livestock.png` — Livestock dashboard.*

### Vehicles

- Fleet list/cards: machines, damage, fuel, hours where exported.

> **Screenshot**  
> Placeholder: Vehicles section  
> *`fd-manual-210-section-vehicles.png` — Vehicles fleet view.*

### Fields

- Per-field cards: growth, work needed, **swath / bale** hints from the game, optional **AI “Suggested next step”** line.  
- Filters such as **Needs work** where available.

> **Screenshot**  
> Placeholder: Fields list overview  
> *`fd-manual-220-section-fields-overview.png` — Fields section overview.*

> **Screenshot**  
> Placeholder: Single field card with AI suggestion  
> *`fd-manual-225-field-card-ai-suggestion.png` — One field card with suggested next step (tier badge optional).*

### Economy

- Prices, finance summary, inventory-aware tips when AI is configured.

> **Screenshot**  
> Placeholder: Economy section  
> *`fd-manual-230-section-economy.png` — Economy / prices view.*

### Pastures

- Grazing and pasture-related summaries.

> **Screenshot**  
> Placeholder: Pastures section  
> *`fd-manual-240-section-pastures.png` — Pastures view.*

### Productions

- Production chains, fill levels, bottlenecks.

> **Screenshot**  
> Placeholder: Productions section  
> *`fd-manual-250-section-productions.png` — Productions view.*

### Notifications & history

- **Notification history** may open as a modal — useful for alerts across sessions.

> **Screenshot**  
> Placeholder: Notification history modal  
> *`fd-manual-260-notification-history-modal.png` — Notification history open.*

---

## 9. Optional: LAN and tablets

1. On the PC running the app, open **Settings** → LAN / remote access.
2. Enable **LAN**, set a **username and password**, and optionally restrict **IP addresses**.
3. On the tablet (same Wi‑Fi), open `**http://<PC-LAN-IP>:8766`** and sign in when prompted.

See [SECURITY.md](./SECURITY.md) for the trust model.

> **Screenshot**  
> Placeholder: Tablet browser on LAN URL  
> `*fd-manual-300-tablet-lan-dashboard.png` — Tablet showing dashboard over LAN (optional).*

---

<a id="section-10-hosted-ai"></a>

## 10. Hosted Smart AI and multiplayer chat — why subscribe

This section explains **what you get** when you use the **hosted Smart AI** service (subscription or partner plan) and **why** it is priced as a service — **not** how to rent a VPS or install Docker. Server setup is intentionally out of scope here; use your host’s onboarding or [SALES_HANDOVER.md](./SALES_HANDOVER.md) for B2B integration talk tracks.

### 10.1 What you configure on your PC (customer steps only)

1. In **Settings → AI Farm Manager → Hosted AI**, enter the **server URL** and **link key** your provider gave you.
2. Enable **sending farm data** / snapshot push if your plan requires it, then **save**.
3. Confirm the Smart suggestions badge shows **Hosted** when the service responds successfully.

That is the full **dashboard-side** setup. **No firewall rules, Docker, or Linux steps** are part of this user manual.

> **Screenshot**  
> Placeholder: Hosted AI connected — status OK  
> `*fd-manual-310-hosted-ai-connected.png` — Hosted AI URL + key saved; tier badge **Hosted** (blur secrets).*

### 10.2 Why hosted Smart AI is priced as a service

Subscription pricing typically reflects **ongoing costs and value**, not a one-time download:


| Cost driver                | What it pays for                                                                                                                                                                  |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Inference & models**     | GPU/TPU time on up-to-date models, rate-limit handling, and failover when a provider is busy.                                                                                     |
| **Farm snapshot pipeline** | Secure ingest of dashboard JSON, per-server isolation, and storage in RAM/volatile cache for consultant runs.                                                                     |
| **FS25-specific tuning**   | Prompts and pruning tuned for **fields, growth stages, swaths, bales, Precision Farming signals** (where present), productions, and economy — not a generic “chat about farming.” |
| **Updates**                | Game patches change XML and Lua exports; hosted stacks can adjust prompts and parsers without you editing files.                                                                  |
| **Operations**             | Monitoring, incident response, and key rotation for integration auth.                                                                                                             |


**Insert your public price table here** (monthly tiers, trial length, fair-use limits) — keep this manual aligned with your website.

### 10.3 Why hosted beats “only BYOK” for many players


| Dimension                    | BYOK (your Gemini/OpenAI key)                                                                   | Hosted Smart AI                                                                                                                 |
| ---------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Prompt design**            | General model; quality depends on how much **farm JSON** fits in context and your model choice. | **Purpose-built** consultant prompts for FS25: priorities, field map mode, inventory-aware economy tips where enabled.          |
| **Game stages & workflow**   | May miss nuance unless you pick a strong model and stay under token limits.                     | Tuned for **order of operations** (e.g. clear swaths before tillage, bale counts, soil scan gaps) aligned with dashboard rules. |
| **Tone**                     | Variable — can be dry or overly generic.                                                        | **Mentor-style** NPC voices (e.g. named coaches) and consistent brief tips for streams and crew briefings.                      |
| **Multiplayer in-game chat** | **Not** provided by BYOK alone.                                                                 | **!hank**-style chat on the **authoritative server** when the hosted stack + mod bridge are configured — see §10.5.             |
| **Quota surprises**          | Free tiers hit **429/503** often unless you manage keys.                                        | Provider manages routing, key pools, and model rollover on the server side (per plan).                                          |


BYOK remains ideal for **privacy** and **experimentation**. Hosted is ideal when you want **turnkey quality** and **multiplayer chat** without becoming your own LLM ops team.

### 10.4 Example: same farm — generic vs hosted-style answer

*Illustrative only — exact wording changes with patch, mod list, and model.*

**Scenario:** Field 7 shows harvest-ready cereal straw on the ground, bales still counted on the field, and a soil scan pending for variable-rate.


| Source                                   | Example phrasing                                                                                                                                                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Generic chat-style answer**            | “You should harvest your crops and then think about fertilizing.”                                                                                                                                                                           |
| **Hosted-style Smart AI (illustrative)** | “Field 7: finish straw baling or clear those bales before you work the soil — the map still shows bales on the parcel. After the ground is clear, run your Precision Farming soil scan before the next lime pass if the scan map is empty.” |


The second style uses **actual dashboard fields** (`baleCountOnField`, `needsBaling`, PF scan flags) — the product goal of the hosted consultant layer.

### 10.5 Multiplayer in-game chat (`!hank`) — what it is and who can use it

- **What it is:** Players on the **server** type a trigger (e.g. `!hank …`) in **multiplayer chat**; the **server-side** mod forwards the line to your **hosted** AI Farm Manager; a short reply can appear back in chat.  
- **Who runs it:** The **host or dedicated server** — not joining clients as senders. **Single-player career** does not use this bridge.  
- **Why it needs hosted infrastructure:** The game talks to a **HTTPS API**; that endpoint is part of the **subscription service**, not the desktop app alone. This runs in the cloud and is not a fee service that can be provided otherwise it would be.

Full technical detail: [AI_IN_GAME_CHAT.md](./AI_IN_GAME_CHAT.md).

#### Example chat lines (fiction — replace with your marketing captures)

**Example A — field priority**

- **Player:** `!hank which field should we hit first after chores?`  
- **Bot (illustrative):** “Biggest win: **Field 12** — grass is ready to mow for silage before rain; **Field 3** still has two bales on the ground blocking cultivator work.”

**Example B — production choke**

- **Player:** `!hank are we bottlenecked anywhere?`  
- **Bot (illustrative):** “Your **Spinnery** input hopper is under 10% on wool — either buy more sheep or buy in before the clothes chain stalls.”

**Example C — crew coordination**

- **Player:** `!hank remind us what the dashboard says about fuel`  
- **Bot (illustrative):** “Fleet view shows **two combines under 15% fuel** — send the tanker to the north header before you start the next swath.”

> **Screenshot**  
> Placeholder: In-game multiplayer chat with !hank trigger and reply  
> `*fd-manual-320-in-game-hank-chat.png` — MP chat showing trigger + reply (blur player names if needed).*

### 10.6 Where to go next

- **Commercial framing & ICP:** [SALES_HANDOVER.md](./SALES_HANDOVER.md)  
- **Tier badges & API fields:** [SMART_SUGGESTIONS_TIERS.md](./SMART_SUGGESTIONS_TIERS.md)  
- **Security (HTTPS, keys):** [AI_SERVER_SECURITY.md](./AI_SERVER_SECURITY.md) (operators)

---

## 11. Troubleshooting


| Symptom                           | Check                                                                                                                                           |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Blank or “waiting for data”       | Stage B completed for this save; `**data.json`** updating; Setup/FTP paths.                                                                     |
| Wrong farm                        | **Farm selector** in the header; correct **server** in Settings.                                                                                |
| No AI, only Rules                 | Hosted/BYOK not saved or key invalid; check **Settings → AI Farm Manager**; for **Hosted**, confirm subscription status with your **provider**. |
| Cannot delete / rebuild on dev PC | Use default `**npm run dist`** output under `%LOCALAPPDATA%\fs25-farm-dashboard-electron-out` (see [CHANGELOG.md](./CHANGELOG.md) §3.0.0).      |


---

## 12. Screenshot assets — filenames to create

Use **PNG**, **1920×1080** or similar, **no secrets** (blur API keys and passwords). Save files under `**docs/screenshots/`** using the names below so this manual’s image links resolve after you add the files.


| #   | Filename                                           | What to capture                                                   |
| --- | -------------------------------------------------- | ----------------------------------------------------------------- |
| 1   | `fd-manual-010-mod-folder-in-mods.png`             | Explorer: `FS25_FarmDashboard` under `mods`.                      |
| 2   | `fd-manual-020-fs25-mod-enabled-for-save.png`      | FS25 UI: mod enabled for save.                                    |
| 3   | `fd-manual-030-data-json-path.png`                 | Explorer: `data.json` under `modSettings\FS25_FarmDashboard\...`. |
| 4   | `fd-manual-040-windows-installer.png`              | Installer welcome or finish.                                      |
| 5   | `fd-manual-050-first-run-setup-server-manager.png` | First-run Setup / Server Manager.                                 |
| 6   | `fd-manual-060-landing-home-loaded.png`            | Browser: `localhost:8766` home with data.                         |
| 7   | `fd-manual-070-settings-servers-and-saves.png`     | Settings → Servers & saves.                                       |
| 8   | `fd-manual-080-navbar-status-badges.png`           | Top bar: farm selector + badges + weather.                        |
| 9   | `fd-manual-090-landing-six-cards.png`              | Landing: six section cards.                                       |
| 10  | `fd-manual-100-smart-suggestions-tier-badge.png`   | Smart suggestions + **Hosted / BYOK / Rules** badge.              |
| 11  | `fd-manual-110-settings-ai-farm-manager-tabs.png`  | Settings → AI Farm Manager (BYOK + Hosted visible).               |
| 12  | `fd-manual-115-smart-suggestions-collapsed.png`    | Optional: collapsed Smart suggestions (chevron).                  |
| 13  | `fd-manual-120-settings-overview.png`              | Settings sidebar / overview.                                      |
| 14  | `fd-manual-130-settings-lan-access.png`            | LAN access + auth (secrets blurred).                              |
| 15  | `fd-manual-200-section-livestock.png`              | Livestock section.                                                |
| 16  | `fd-manual-210-section-vehicles.png`               | Vehicles section.                                                 |
| 17  | `fd-manual-220-section-fields-overview.png`        | Fields overview.                                                  |
| 18  | `fd-manual-225-field-card-ai-suggestion.png`       | Single field card with suggestion line.                           |
| 19  | `fd-manual-230-section-economy.png`                | Economy section.                                                  |
| 20  | `fd-manual-240-section-pastures.png`               | Pastures section.                                                 |
| 21  | `fd-manual-250-section-productions.png`            | Productions section.                                              |
| 22  | `fd-manual-260-notification-history-modal.png`     | Notification history modal.                                       |
| 23  | `fd-manual-300-tablet-lan-dashboard.png`           | Tablet on LAN (optional).                                         |
| 24  | `fd-manual-065-ftp-polling-options.png`            | FTP: interval + sync vs staggered (when using remote servers).    |
| 25  | `fd-manual-135-theme-language.png`                 | Theme & language settings.                                        |
| 26  | `fd-manual-310-hosted-ai-connected.png`            | Hosted AI: URL saved, tier **Hosted** visible (blur URL/key).     |
| 27  | `fd-manual-320-in-game-hank-chat.png`              | Multiplayer chat: `!hank` trigger + reply (blur names).           |


**Optional extras (marketing / advanced):**


| Filename                                        | What to capture                                              |
| ----------------------------------------------- | ------------------------------------------------------------ |
| `fd-manual-optional-api-error-retry.png`        | API error card with “Back to Home” / Settings (if shown).    |
| `fd-manual-optional-hosted-value-one-pager.png` | One-page graphic: BYOK vs Hosted vs Rules (for PDF/website). |


---

**Document version:** aligned with app **3.1.0** and mod **2.0.0.0** line. Update screenshots when the UI changes. **Authors:** [AUTHORS.md](./AUTHORS.md).