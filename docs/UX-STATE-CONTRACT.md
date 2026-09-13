# UX state contract

Source of truth for setup, data states, errors, and recovery across the desktop app, NEW APP UI, classic web, and the in-game mod. Implementation must not invent extra states or error codes without updating this document.

**Primary screen layer:** NEW APP (`NEW APP/src/`). Electron / merge / Lua feed both UIs. Classic `web/` consumes the same APIs with a thin adapter.

---

## 1. Module UI states

Every section (fields, livestock, notifications, and any new board) reports one of:

| `state` | Meaning | User sees |
|---------|---------|-----------|
| `loading` | First paint or explicit refresh in flight | Skeleton, not a blank card |
| `pending` | Work in progress that is **not** a first-paint fetch | “In progress…” status, no skeleton, no retry |
| `error` | Fetch failed and no usable rows | Explanation + **one** retry |
| `empty` | Connected, payload present, nothing to show | Why it is empty + next action |
| `success` | Live or recent data | Content + optional freshness chip |
| `stale` | Showing last-known data | Stale chip + refresh + why |

`pending` must not be normalized to `loading`. Setup step states are only `success` | `error` | `pending` (unknown values become `pending`).

### Event payload

```js
{
  state: "loading" | "error" | "empty" | "success" | "stale" | "pending",
  timestamp: string,          // ISO
  errorCode: string | null,   // see §3
  retryFn: null,              // UI only; never serialized over IPC/HTTP
  lastUpdated: string | null, // ISO of payload / export
  source: "lua" | "xml" | "merged" | "cache" | "unknown",
  isStale: boolean,
  staleReason: string | null
}
```

Renderer helpers: `NEW APP/src/lib/ux-state.ts`, classic `web/assests/js/modules/uiState.js`. Node: `FS25_FarmDashboard_App/uxContract.cjs`. Shared save/error classification: `web/assests/js/ux-classify.js` (re-exported by `uxContract.cjs` and the setup-validation shim).

---

## 2. Screen transitions (setup)

```
Fresh install
  → detect (config / saves)
  → connectivity (HTTP + export)
  → auth (setup token / LAN)
  → service (merge running)
  → dashboard

Existing config, invalid token
  → stay on setup / settings with E_INVALID_TOKEN + reset token

Server offline then returns
  → stale/cache (E_CACHE_FALLBACK / E_LUA_STALE) → success when Lua/XML resume

LAN toggle
  → confirm if exposing → pending → validated → saved → HTTP restart (synced) or rollback
```

Setup completion after prerequisites are known is **at most three steps**: detect → confirm save → launch.

---

## 3. Error taxonomy

| Code | Class | Typical nextAction |
|------|-------|--------------------|
| `E_CONFIG_INCOMPLETE` | blocking | `add_server` / `open_setup` |
| `E_AUTH_MISSING` | user-action | `open_setup` (enter LAN user/pass) |
| `E_INVALID_TOKEN` | user-action | `reset_token` |
| `E_LAN_BLOCKED` | user-action | `enable_firewall` |
| `E_LAN_TIMEOUT` | user-action | `rehandshake` (Wi‑Fi / host; not a password reject) |
| `E_SETUP_LOCAL_ONLY` | user-action | configure on the PC (`open_setup` there) |
| `E_SERVER_OFFLINE` | recoverable | retry once, then `start_game` |
| `E_LUA_STALE` | recoverable | `restart_game` / wait one export cycle |
| `E_MOD_MISSING` | user-action | `check_mod` |
| `E_MOD_OUTDATED` | user-action | `check_mod` |
| `E_PATH_DENIED` | user-action | `verify_save_slot` |
| `E_PERMISSION_DENIED` | user-action | `verify_save_slot` |
| `E_CACHE_FALLBACK` | recoverable | manual refresh; never silent as live |
| `E_NETWORK` | recoverable | retry with jitter |
| `E_SAVE_FAILED` | blocking | show mapped copy + retry save |

**Recoverable:** automatic retry allowed (central policy only).  
**Blocking:** stop; user must change config.  
**User-action:** show specific recovery, do not spin.

Retries: max 3, exponential backoff + jitter, only `E_SERVER_OFFLINE` and `E_NETWORK`. Modules must not add their own retry loops.

---

## 4. Setup status object

`GET /api/setup-status` and IPC `get-setup-status`:

```js
{
  status: "needs-setup" | "incomplete" | "degraded" | "ready",
  lastErrorCode: string | null,
  nextAction: string,             // machine id, e.g. add_server
  configCompleteness: number,     // 0–1
  requiresRestart: boolean,
  steps: [
    { id: "detect", state: "success"|"error"|"pending", errorCode: null },
    { id: "connectivity", ... },
    { id: "auth", ... },
    { id: "service", ... }
  ],
  recentEvents: [ /* last 5, see §6 */ ]
}
```

Remote LAN clients get the same shape without local filesystem paths.

---

## 5. Freshness + collection health

Merged payload `dataTimestamps` always includes:

| Field | Meaning |
|-------|---------|
| `fetchedAt` | Merge computed time (ISO) |
| `source` | `lua` / `xml` / `merged` / `cache` |
| `isStale` | True when Lua is stale, XML-only, held, or cache fallback |
| `staleReason` | Error code or null |
| `cacheUsedDueToFailure` | True only when live merge/export failed |
| `confidence` | `live` \| `held` \| `cache` |
| `collectionHealth` | From XML collector when present |

XML collector:

```js
{
  collectionDurationMs: number,
  sourceLagSeconds: number | null,
  parseErrors: [{ file, error }]
}
```

Mod `data.json` `diagnostics`:

```js
{
  modVersion, gameVersion, isAuthority,
  lastExportGameTime, lastXmlSampleTime,
  missingDependencies, compatible
}
```

Stale cache is never presented as live. UI shows a chip + one-click refresh.

---

## 6. In-app status log

Last **5** events only (not a debug dump):

```js
{ at: ISO, code: string, message: string, source: "setup"|"merge"|"lan"|"mod" }
```

Shown in settings health panel and the helper strip.

---

## 7. LAN security labels

| Condition | Badge |
|-----------|--------|
| LAN off | **Local-only** / **Secure default** |
| LAN on + Basic required | **LAN exposed** (warn) |
| LAN on + optional auth | **LAN exposed (high risk)** |

Enabling LAN or optional auth requires an explicit confirm modal. High-risk changes get **Restore default** (LAN off).

Save lifecycle: `pending` → `validated` → `saved` → `synced` (HTTP rebound) or `failed` / `rollback`.

### Remote tablet login (verify first)

Stored LAN Basic tokens are **not** treated as success. Bootstrap calls `GET /api/servers` (not `/api/status`) with the stored token:

| Verify result | UI |
|---------------|----|
| 2xx | Close overlay, continue |
| 401 / 403 | Clear token, show overlay with stale-login copy |
| Network / other | Clear token, show connection-failure copy |

`GET /api/status` stays **unauthenticated** so tablets can load HTML/JS and health without the browser Basic dialog. Protected `/api/*` routes (including `/api/servers`) still require LAN Basic (or same-machine trust). Local Electron on loopback skips this gate.

The LAN wait has a 30s timeout so a missing overlay cannot hang startup. Timeout sets `body.farmdash-lan-auth-timeout` and `E_LAN_TIMEOUT` (not generic `E_NETWORK`), then continues.

**Setup stays on the PC.** LAN tablets may view the dashboard. They must not load `/setup.html` or read/write `/api/setup-config`. See [SECURITY.md](./SECURITY.md).

---

## 8. Acceptance criteria

- No blank states without explanatory text.
- No duplicate retry loops without explicit user action.
- Setup completion path ≤ 3 steps once the prerequisite is known.
- Every critical error includes `nextAction`.
- Staleness indicators visible and understandable.
- Security-sensitive options have an explicit confirmation path.

---

## 9. Manual QA matrix

| Scenario | Expect |
|----------|--------|
| Fresh install, no config | Setup gated `needs-setup`; cannot launch with zero servers; copy explains detect |
| Old config, invalid token | `E_INVALID_TOKEN`; reload/reset token; no generic “save failed” |
| New remote tablet, no credentials | LAN overlay; after sign-in dashboard loads |
| Remote tablet, stale stored Basic | Overlay again with stale-login copy; token cleared |
| LAN Basic off / optional | `/api/status` works; `/api/servers` and other protected routes still require auth |
| Setup unknown save error | Same class as `ux-classify.js` + setup copy |
| LAN enable | Confirm modal; risk badge; restore default works |
| LAN disable | Back to local-only badge; bind 127.0.0.1 |
| Server offline then returns | Stale chip + cache confidence; then live; single retry policy |
| Mod stale/outdated | Health panel + topbar badge; `check_mod` |
| Permission denied path | `E_PATH_DENIED` / `E_PERMISSION_DENIED`; verify save slot |
| Happy path | `ready`; success states; live freshness |
| Upgrade existing config | Settings load; unsaved indicator only after edits; no forced re-setup |

Contexts: **fresh clean config** and **existing config upgrade**. Fallback: `apiStorage.js` / `fetchDashboardData` must still paint last-known data with stale labels.

---

## 10. Changelog / migration (users)

- Setup is status-gated (detect → connect → launch) instead of a pile of toasts.
- Dashboard sections share loading / empty / error / stale chrome.
- LAN exposure uses named risk badges and a confirm step.
- Last-known data shows **stale** / **cache** chips; refresh is explicit.
- Settings → Health shows mod/export diagnostics (no log diving required).
- New JSON fields (`dataTimestamps.*`, `collectionHealth`, `diagnostics`) are additive; older apps ignore them.
