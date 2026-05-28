# FarmDashboard Plan v5 — Validation runbook

**Repository path:** `docs/VALIDATION-RUNBOOK.md` (FarmHub **docs** folder — consolidated from the mod tree).

This document defines the **five numbered validation profiles** required before shipping the
Plan v5 hardening pass. Each profile lists the fixture, soak duration, and pass thresholds.

> **How to enable diagnostics**
> Edit `<userProfileAppPath>/modSettings/FS25_FarmDashboard/config.xml` and set
> `farmDashboard.settings#diagnostics="true"`. Restart the save. Run the soak. Capture the
> in-game `log.txt`. Lines starting with `[FarmDash][diag]` show the metrics below.
> Always disable diagnostics again before shipping.

---

## Profile 1 — Single-player, base game baseline

**Goal**: regression baseline; ensure Plan v5 changes do not regress small saves.

| Item | Value |
|---|---|
| Fixture | Standard map, 1 farm, ≤ 200 base-game animals across ≤ 4 pens, ≤ 50 vehicles, ≤ 20 fields |
| Mods    | None besides FarmDashboard |
| Soak    | **20 minutes** of real time, 60× time scale |
| Profile | Single-player host |

### Pass thresholds

| Metric (`[FarmDash][diag]` line) | Threshold |
|---|---|
| `update_total median` | ≤ 1.5 ms |
| `update_total p99`    | ≤ 6 ms   |
| `toJSON avg`          | ≤ 5 ms   |
| `jsonWrite avg`       | ≤ 1 ms   |
| Frame-time spikes in chat (`F1`)* | none correlated with FarmDash export ticks |
| `data.json` size      | ≤ 200 KiB |
| `dirtyPens.json`      | exists, schemaVersion=1, ≤ 256 entries |

\*Frame-time is informative only; other mods can spike. The absence of FarmDash spikes is the
primary signal.

---

## Profile 2 — Single-player + RealisticLivestockRM, mid-scale

**Goal**: validate dual-mode LOD, idScheme, animalMode stability, RL event handling.

| Item | Value |
|---|---|
| Fixture | Same map, 1 farm, ~5,000 individual RL animals across 30–50 pens |
| Mods    | RealisticLivestockRM + FarmDashboard |
| Soak    | **30 minutes**, 60× time scale, including at least one in-game day rollover |
| Profile | Single-player host |

### Pass thresholds

| Metric | Threshold |
|---|---|
| `update_total median`        | ≤ 3 ms  |
| `update_total p99`           | ≤ 12 ms |
| `animals_rlInner_perBatch`   | ≤ 4 ms  |
| `mode=`                      | Stable on `RL` after the first 2 cycles; never flips back to `unknown` mid-soak |
| `data.json` size             | ≤ 1 MiB |
| First-cycle `dirtyPens.json` | populated within 2× cycle interval after save load |
| `dirtyPens` cap drop logs    | none (or ≤ 1 with explicit reason) |

---

## Profile 3 — Dedicated server, base game, FTP

**Goal**: validate FTP piggy-back of `dirtyPens.json`, atomic writes on dedicated.

| Item | Value |
|---|---|
| Fixture | Standard map, 2 farms, 1,500 base animals total, 80 vehicles, 60 fields |
| Mods    | None besides FarmDashboard |
| Soak    | **45 minutes** of real time, default time scale |
| Profile | Dedicated server (Linux or Windows host) + remote app instance over FTP |

### Pass thresholds

| Metric | Threshold |
|---|---|
| Server-side `update_total median` | ≤ 2 ms (logged in dedicated `log.txt`)  |
| Server-side `data.json` size      | ≤ 500 KiB                                |
| App-side `pollFtp` cadence        | matches configured `intervalMinutes`; no stalls > 1.5× interval |
| App `dirtyPens.json` cache file   | refreshed within 1 cycle of mod-side updates |
| `/api/livestock/:id` p95 latency  | ≤ 2.5 s with FTP cache warm; ≤ 5 s cold |
| Atomic-write rename failures      | none in 45 minutes |

---

## Profile 4 — Dedicated + RealisticLivestockRM at target scale

**Goal**: the headline 20k-animal SLO. Drives the auto-tuner, detail rotation, FTP pull.

| Item | Value |
|---|---|
| Fixture | 20,000 RL animals / 400 vehicles / 200 pastures / 100 production placeables |
| Mods    | RealisticLivestockRM + FarmDashboard |
| Soak    | **60 minutes** of real time, default time scale |
| Profile | Dedicated server + remote app over FTP |

### Pass thresholds

| Metric | Threshold |
|---|---|
| Server `update_total median` | ≤ 4 ms  |
| Server `update_total p99`    | ≤ 18 ms |
| Server frame-time spikes correlated with FarmDash | none |
| `animals_rlInner_perBatch` median | ≤ 6 ms |
| Auto-tuner adjustments              | observed at least once if `animalRowsPerSlice` was wrong; clamped to [64, 8192] |
| Detail rotation                     | refreshes only pens with stale ledger entries; never stampedes |
| `data.json` size                    | ≤ 8 MiB |
| `dirtyPens.json` size               | ≤ 200 KiB |
| App memory                          | does not exceed `globalCounter.cap × 2` synthetic rows after 1 hour |
| LAN browser open + Pen Detail click | < 5 s end-to-end (warm cache: < 500 ms) |

---

## Profile 5 — Hostile FTP smoke test

**Goal**: prove the app does not lock up or leak when the FTP host misbehaves.

Run **simultaneously** with Profile 1 or 3 to confirm production traffic survives.

### Procedure

1. Deploy the app against an FTP server you control.
2. Inject the following at random:
   - **Empty `dirtyPens.json`** (zero bytes).
   - **Truncated `data.json`** (first 1 KiB only).
   - **`requests.json` with `schemaVersion=99`** (must be quarantined).
   - **`requests.json` ≥ 80 KiB** of garbage (must be quarantined for size).
   - **FTP timeout** (firewall the host for 30 s, then re-open).
   - **Permission denied** on writes (set FTP user RO temporarily).

### Pass thresholds

| Behaviour | Threshold |
|---|---|
| App crashes / unhandled rejections        | none |
| FTP connection storm                      | none — single concurrent connection per server, never > 2 |
| Malformed `dirtyPens.json` reads          | logged once per error (no spam), cache view falls back to "no index" |
| Malformed `requests.json`                 | renamed to `requests.broken.<ts>.json`, log throttled 1/60s |
| Quarantine files left on disk             | retained at most 24 h (manual cleanup acceptable for v1) |
| `/api/livestock/:id` under outage         | returns 404 (not 500), UI shows "Detail not available" with retry |
| `/api/livestock/:id/request` rate limit   | 11th call within 30 s returns 429 with `Retry-After` |

---

## Re-tests required after any of the following

- Changes to `_writePenDetail`, `_writeDirtyPensIndex`, or `_writeFileAtomic`: re-run **3** and **4**.
- Changes to `_subscribeToRLEvents` or `AnimalClusterUpdateEvent` handler: re-run **2** and **4**.
- Changes to `livestockDetail.js`: re-run **3**, **4**, and **5**.
- Changes to `realtime-connector.js _fanOutClusters`: re-run **2** and **4** (focus on cap banner).

## Definition of done

A release is approved when **all five** profiles pass their thresholds in a single back-to-back
sweep on the same machine and configuration. Any single threshold miss requires a fix and a
fresh five-profile sweep.
