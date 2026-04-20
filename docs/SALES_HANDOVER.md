# FS25 Farm Dashboard — Sales handover

**Purpose:** Equip sales, partnerships, and customer success to explain **what the Farm Dashboard is**, **who it is for**, and **how to qualify deals**. Technical depth: [DEVELOPER_HANDOVER.md](./DEVELOPER_HANDOVER.md). Step-by-step and screenshots: [USER_MANUAL.md](./USER_MANUAL.md).

**Authors / product:** JoshWalki, WizardlyPayload (see [AUTHORS.md](./AUTHORS.md)).

---

## 1. Product in one sentence

**Farm Dashboard** is a Windows desktop app (with optional **LAN browser** access) that turns live **Farming Simulator 25** farm data into a **real-time command center** — animals, fleet, fields, economy, production, pastures — using the official **in-game mod** plus a **local HTTP dashboard** at **http://localhost:8766**.

---

## 2. What the customer gets

| Layer | What it is | Buyer value |
| ----- | ---------- | ----------- |
| **FS25 mod** | Runs with the save; exports rich JSON (fields, vehicles, animals, weather, economy, …). | Accurate farm state without manual spreadsheets. |
| **Farm Dashboard app** | Electron + embedded UI; reads local saves or **FTP**; optional **LAN** for tablets/second screens. | One place to monitor the operation beside the game or on a wall-mounted tablet. |
| **Field rules** | Offline heuristics on **field cards** (bales, windrows, growth, soil hints where exported). | “What should I hit next on this parcel?” without external services. |

Nothing here requires internet beyond what you already use for FS25 updates or optional FTP hosts.

---

## 3. Typical customers

| Segment | Pitch |
| ------- | ----- |
| **Serious solo players** | Second screen with herd, fleet, and field work hints while in cab view. |
| **Server admins / G-Portal** | FTP polling + multi-server list; staggered pulls for many farms. |
| **Streamers / crews** | LAN URL + Basic Auth for a producer tablet showing the same live JSON-backed view. |

---

## 4. Objections — short answers

| Objection | Response |
| --------- | -------- |
| **“Is this cheating?”** | It reads the same data the game already exposes to the PDA; it does not automate gameplay. |
| **“Does it need always-online?”** | Local play is **offline-first** once `data.json` exists; FTP needs network to the host. |
| **“Will it slow FS25?”** | The mod uses **staggered collectors** (see [CHANGELOG.md](./CHANGELOG.md) §2.0.0) to spread work across frames. |

---

## 5. Partner checklist

- Ship **mod zip** + **Windows installer** together; install order is **mod → load save → app** ([INSTALL.md](./INSTALL.md)).
- For **LAN exposure**, insist customers read [SECURITY.md](./SECURITY.md) (Basic Auth + allowlist).
- **Versioning:** app semver in `package.json`; mod in `modDesc.xml` — quote both in support tickets.

---

## 6. Where to send prospects

- **Install:** [INSTALL.md](./INSTALL.md)  
- **Full walkthrough:** [USER_MANUAL.md](./USER_MANUAL.md)  
- **Security / LAN:** [SECURITY.md](./SECURITY.md)  
- **Release blurbs:** [RELEASE_NOTES.md](./RELEASE_NOTES.md)
