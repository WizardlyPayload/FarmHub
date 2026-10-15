# V5 evidence ledger — 23 September 2026

Status of the B00–B16 brief. Source edits are not installed-app proof and are not release sign-off.

## B00 baseline

Preserved from the earlier recovery pass (inspect, do not redo):

- Mission start uses `MessageType.CURRENT_MISSION_START` via `subscribeOneshot`, re-armed because `deleteMap` clears `hasLoaded`.
- One update path. `loadMap` does not also `addUpdateable`.
- First update and collector errors log with diagnostics off (`FarmDashLog.error`).
- Readiness uses the mission clock. A rewind greater than 1000 ms re-arms collectors.
- Post-load grace uses `_missionNowSec` (`g_time / 1000`).
- Settings parser reads only the `<modules>` element, so `useStateMachine_fields="false"` does not clear `modules#fields`.
- Display-only Save skips `saveModConfig` when the mod snapshot matches the load baseline.

## This pass (source only)

| Item | Result |
|---|---|
| F13 malformed config | `buildModConfigXml` returns null when a file is present but not a usable farmDashboard document. Missing or empty text still writes the default template. `save-mod-config` does not write on null. |
| Export generation | Gameplay snapshots stamp `exportGeneration` and log `export committed generation=N` after the disk write. Bootstrap and empty snapshots stay at 0. |
| Stale session | `resetStaggerState` bumps `_exportSession`. A pending disk job from an older session is dropped. |
| F04 active mods | Companion name resolution and fill-unit style use `g_modIsLoaded` / `getActiveMods`. They no longer walk `g_modManager.mods` or `nameToMod`. |
| F11 readers | Each companion reader is in its own `pcall`. A thrown reader is logged and marked `readState=failed` without clearing the rest of the detected list. A failure of the outer collect still logs and returns an empty payload. |

## Not tested — do not mark PASS

| Gate | State |
|---|---|
| L01–L05 live export | NOT TESTED. Last captured session wrote an empty bootstrap and never committed a gameplay generation. |
| C01 | Parser collision fixture exists. Re-run with this pass. |
| C02 | Dirty-check is in `SettingsModal`. No browser pass this session. |
| C04 | Unit expectation updated to null. No on-disk malformed file trial. |
| A01–A05 | Active-mod filter is in source. No mission with unchecked ZIPs was loaded. |
| G0–G9 | NOT TESTED. No new V5 installer in this pass. |
| Demo saves (B15) | Not started. The preparation guide waits until G7. |

## Still open

- ELS, restrictions, regional crop calendar and Imperial still need their owning Lua environments (F05). Globals are not a substitute.
- Soil current vs target vs scan is display-guarded in NEW APP. Production XML field fixtures still do not import `xmlCollector` (F14).
- Snapshot honesty, loan farm scope, unit normalisation, catalog corrections and the later adapter waves are not done.
- The installed V5 app (Setup 5.0.5 from earlier today) does not contain the settings parser, malformed-config refusal, or this generation stamp until the next V5 app build. The in-game mod picks up Lua only after `package:mod` and a full game restart.
