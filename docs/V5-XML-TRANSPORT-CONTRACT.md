# V5 XML transport contract

Status: source foundation only. The collector still publishes JSON, and it still refuses that publication when `readFile` is missing. Nothing in this document is wired into `main.js`, `dataMerger.js`, or the mod descriptor.

## What native FS25 1.23.1.0 already showed

Ordered `createFolder` calls returned no value. After those directories existed, `saveXMLFile` returned one Boolean true for an empty payload, a 17-byte payload, and a 2,097,216-byte payload. Each one matched after a new `loadXMLFile`. The synchronous three-case probe took 3425 ms. That is not a production frame budget. `readFile` and `os.rename` were absent. `io.open` is not a reader.

The retained diagnostic files used schema 1 and stored `exportedAt` 0. The cause was a fractional `g_time` rejected before `math.floor`. Schema 1 remains that diagnostic. Production uses schema 2.

## Schema 2

Root element `farmDashboardExport`. Encoding `base64`. Attribute order:

`schema`, `careerId`, `sessionId`, `publicationSequence`, `exportGeneration`, `simulationTimeMs`, `encoding`, `bytes`, `crc`, `payload`.

| Field | Rule |
| --- | --- |
| schema | `2` |
| careerId | Caller-supplied opaque id, 1–64 characters, `[A-Za-z0-9_-]` only. Not mapId, saveDate, playTime, mtime, or `savegameN`. |
| sessionId | Caller-supplied opaque id, same syntax, changed when the export session restarts. |
| publicationSequence | Persistent integer 1–2147483647 for one career. The next write is one higher than the selected slot. Overflow fails with no write. A process restart does not reset it. |
| exportGeneration | Gameplay generation in the current session. `0` is startup and is never a live success callback. |
| simulationTimeMs | Canonical decimal string of the floored nonnegative simulation tick, at most 15 digits, or `unknown`. Not UTC, not file mtime, and not the freshness clock. |
| bytes | Exact decoded byte length, at most 8 MiB. |
| crc | Adler-32 of those bytes, unsigned decimal. Integrity only. |
| payload | Canonical base64 of the unchanged JSON bytes. Maximum encoded length 11184812. Maximum XML document 12 MiB. |

Identifiers and counters are not coerced. A fraction, a negative, or an overflow is a rejection. The JSON bytes are the same object `mergeData` already understands. The envelope does not rewrite them.

## Publisher

`ExportEnvelopePublisher.new(deps)` is one output target. It is not armed and it is not sourced by `modDesc.xml`.

`begin(payload, context)` checks the caller context and stores an immutable snapshot. It does not encode. A second begin while a snapshot is in flight keeps the in-flight bytes and replaces the single waiting snapshot. `cancel(sessionToken)` drops that waiting snapshot, releases any handle once, and does not call the gameplay callback. `step(workBudget)` performs one bounded slice. `getStatus()` reports the phase.

Phases, in order: directories, inspect-a, inspect-b, select, encode, revalidate-a, revalidate-b, write, release-writer, open-reader, read-meta, decode, match, release-reader, commit. Commit with export generation 0 ends as `startup` and does not call `onGameplayCommitted`.

Each directory level is one `createFolder` call. A void return is the measured native shape and is not proof the directory exists. Boolean false on the last level fails before encode. Encode and inspect stop at 4096 payload bytes per step, or when the injected clock has advanced by the time budget. A clock that stays on the same millisecond does not stop the step; the byte cap does. `g_time` is not a CPU deadline. `createXMLFile`, its setters, and `saveXMLFile` are one grouped native step. The reader is a new `loadXMLFile` after `delete` on the writer. A failed writer release does not open a reader. A failed reader release does not commit. Unknown and unreadable slots are not deleted. The selected good slot is not the write target. Equal sequence with different metadata or bytes is `conflict`, with no write and no delete. Identical equal-sequence copies keep one protected slot and publish the next sequence on the other. A different career, session, or target cancels the old job and its waiting snapshot with no gameplay callback. The same career, session, and target may queue one newer snapshot.

Every active step checks `deps.isAuthority()` and `deps.currentContext()`. A missing, throwing, incomplete, or mismatched check fails closed before a slot write and again before commit. The compared binding is career, session, target directory, and session token. A new generation in the same session keeps the token. A different token cancels the old job and its waiting snapshot. The same write step re-reads both slot observations immediately before `createXMLFile`. Unknown and unreadable do not compare equal to absent and do not authorize a write. Setter, save, read, and verification failures do not delete either fixed slot. There is no cross-process compare-and-swap. One process is the writer. A byte budget below 3, or a non-positive or non-numeric time budget, returns `insufficient-budget` and does no work. The budget is read on every codec step. A cursor keeps progress only. It does not keep the first step's byte or time allowance. An invalid budget leaves the cursor, phase, and open files where they are.

`rawLoadClock` is the fixture-clock delta across a complete slot read: presence, open, attribute reads, release, and the failure path of that read. `nativeWriteClock` is the fixture-clock delta across the grouped write, including the ownership re-read, `createXMLFile`, the setters, `saveXMLFile`, writer release, and the failure path. `luaClock` is codec work in old-slot inspection, encoding, and readback. `concatClock` is table concatenation for those stages, including a finished inspection block. `lastStepClock` and `maxStepClock` time the whole step, including checks and the gameplay callback. They are not the sum of the stage clocks. A missing, throwing, non-finite, or backward clock does not stall the step: that step continues under the byte cap and sets `timingUnavailable`. Those clocks stay unset. A zero is not written to stand in for time that was not measured. A stationary finite clock still stops on the byte cap. These counters are fixture clock deltas. They are not a native performance pass. `createXMLFile`, its setters, and `saveXMLFile` stay one grouped native call. `context.multiplayerClient == true` is refused. Losing authority, a callback that calls `step` again, or cancelling the session token does not emit a second gameplay success. An empty payload with a gameplay generation does not commit.

## Consumer

`FS25_FarmDashboard_App/exportEnvelope.js` is pure. Importing it does not read a save or touch Electron.

`decodeEnvelope(buffer, expectedContext)` bounds the document by UTF-8 byte length, requires one validated `farmDashboardExport` root, and takes attributes from that parse. It accepts an XML declaration, either quote style, a self-closing tag, and an explicit empty close. It rejects prefix garbage, an unclosed root, mixed-quote duplicate attributes, DTD, entities, bad base64, checksum mismatches, unsafe JSON keys, and the wrong career. `selectEnvelopeCandidates(candidates, expectedContext)` scans every candidate, then keeps the highest `publicationSequence`. Conflict is decided only inside that sequence. Unreadable and unknown stay structured and do not enable legacy JSON. Legacy requires a positive integer `exportGeneration`. Empty bytes and generation 0 are not gameplay. A corrupt newer slot is ignored when an older valid same-career slot is present. A conflict keeps `expectedContext.lastAccepted`. `createFreshnessTracker({ now, staleAfterMs })` uses the app clock. The first observation is `unconfirmed`. A later higher gameplay sequence becomes `live`. The same sequence does not refresh the progress time and can become `stale`. Generation 0, empty, and non-gameplay samples stay off the live path. `forget(sourceId)` drops that source without touching another source.

## Integration

The production collector selects the schema-2 route when `readFile` or `os.rename` is missing and the publisher module is loaded. A legacy JSON write remains available when both of those functions exist, or when the collector protocol is explicitly `json`. A queued XML submission is not a completed gameplay generation. `_completedGeneration` advances only from the route callback after the inactive snapshot is verified and `active.xml` is written, released, and read back with the same identity fields.

`active.xml` uses the root `farmDashboardRoute`. It names the career, session, publication sequence, and slot letter. It does not carry a filesystem path. Readers reject a missing or truncated descriptor, keep a last-known payload only for the same configured source and career, and do not treat another career's `data.json` as live. A new career id is provisional until the attribute is read back from `careerSavegame.farmDashboard#careerId`. Reloading a save reads `savegameDirectory/careerSavegame.xml` when the live handle is absent. The desktop app proposes one 16-hex namespace in identity-provision.xml. The mod adopts it, reserves sequences in allocator-a.xml and allocator-b.xml, and publishes identity-ready.xml only after a read-back. On single-player and an MP host, a missing proposal waits in the loaded save; a dedicated server follows the section below instead. A clock or process-local counter is not the id. Persistence is confirmed from the final save directory after SavegameController:onSaveComplete reports Savegame.ERROR_OK, not from the live career handle. Damaged career metadata is kept and not replaced. The save hook preserves every return value and does not write an unrelated career object. The local extract is the 1.20-era career source; the protected native run still has to prove that hook on the installed 1.23.1.0 game. Fixture clocks are not that proof.

## Dedicated server identity

Approved by Wizard on 2026-10-05 for mod 5.0.0.19.

A dedicated server (`g_dedicatedServer ~= nil`, the engine's own check in `FSBaseMission.lua`) has no desktop app on its profile, so it owns its career identity. It never reads or writes `identity-provision.xml`, `allocator-a.xml`, `allocator-b.xml`, or `identity-ready.xml`. Data reaches the dashboard over the game connection: the server commits schema-2 snapshots as normal, the export mirror streams each committed envelope to joined clients with `FarmDashboardExportEvent`, the client stores the verified replica locally, and the desktop app on that PC reads it in Local mode.

- **Career ID:** `fd-<16 hex>-1`, generated once when the loaded save has no `careerSavegame.farmDashboard#careerId`. It is used in memory immediately, so export starts in the same session, and it is provisional (`persistence="provisional"`) until the next game save. The existing `FSCareerMissionInfo.saveToXMLFile` hook writes the attribute, and it is confirmed only after `SavegameController:onSaveComplete` reports `Savegame.ERROR_OK` and the attribute reads back from the final save directory. A restart of the same save reuses the saved ID. A different save has its own attribute and gets its own ID. A leftover ID in a new (not loaded) career is never reused.
- **Session ID and token:** `ses-<16 hex>-<n>` and `tok-<16 hex>-<n>`. They use one namespace per server process plus a counter that increases on every rotation, so a session is never repeated after a restart. Rotation follows the same triggers as other hosts.
- **Entropy:** the 16-hex values come from two 32-bit hashes over `getDate`, `getTime`, `g_time`, the savegame directory, a fresh table address and four `math.random` draws. The engine seeds `math.random` at startup; the mod never reseeds it.
- **Formats:** all IDs pass the same checks as app-proposed IDs (`^[A-Za-z0-9_-]+$`, at most 64 characters, no `..`) in the mod mirror (`validReplicaId`) and the app (`exportIngress.safeId`). No app change is required.
- **Single-player and MP host** are unchanged: they keep the desktop proposal and allocator flow above.

## Wired call sites

`FarmDashboard:update(dt)` and `CURRENT_MISSION_START` share one mission arm. That arm captures career identity before the collector session rotates. The update fallback does not mark the mission loaded until that capture succeeds. The route is stepped on the same update. No second `addUpdateable` is registered. `g_time` is not the publisher CPU clock. No elapsed-work primitive is installed, so the publisher reports timing unavailable and stays on the byte cap. Losing authority, `deleteMap`, and `resetStaggerState` cancel the in-flight snapshot and any resource publishers before the export session changes.

A gameplay generation is allocated when the payload is admitted. A second snapshot waits until the first callback, then takes the next generation. The descriptor is written, released, and read back before that callback. A missing reader, a failed handle release, or a lost authority check does not advance generation. `active.xml` is a hint beside the snapshot, not one atomic transaction with it. Pen resource directories are created one parent at a time. The detail ledger updates only after that resource envelope is durable.

`FS25_FarmDashboard_App/exportIngress.js` is the shared reader. Local watch, FTP poll, status, and save discovery use it. One freshness tracker is kept per configured source and uses the desktop clock. The first observation stays unconfirmed until a later sequence. A route document must be one `farmDashboardRoute` element; trailing markup, unknown fields, and non-canonical integers are rejected. A route source slot that is not the configured slot is a conflict unless an explicit mirror map says otherwise. A bad or conflicting route does not fall through to `data.json`. Explicit legacy JSON stays `identity-unconfirmed`. Cache isolation for a career change happens before the minimal-export hold.

The mirror event carries career, session, sequence, generation, and source slot. The client writes that metadata beside the mirrored JSON and does not mint a local gameplay commit. Reassembled replica bytes are accepted only when their checksum matches the UTF-8 bytes. `readReplicaIngress` is the desktop consumer. It requires career, session, sequence, generation, and source slot. An ASCII pair is accepted only when `crc` is the Adler-32 of those bytes. A non-ASCII payload may match the native UTF-8 byte sum. Generation 0 is not live gameplay. `active.xml` is preferred over a neighbouring `export-meta.json`. FTP 550 is not proof a file is absent; a proposal is uploaded only after a completed listing shows the identity files missing.

Route attribute order is not significant. The required attribute set must still be complete, separated by whitespace, and free of unknown or duplicate names. A file that `fileExists` reports present is not absent when `loadXMLFile` returns 0. That state is unreadable and is not an overwrite target. Conflicting identity namespaces, or a ready revision ahead of the surviving allocator, are recovery. Save confirmation uses the controller `currentSavegame` captured before the original callback. An unrelated directory does not confirm the active career. FTP proposes a namespace only when ready, both allocators, and the proposal are confirmed absent. Any other remote error stays unknown and does not upload. A collector export and the route step share one remaining byte budget. `timingUnavailable` stays set because no CPU clock is measured.

Native schema-2 timing, the installed 1.23.1.0 save hook, and multiplayer play are not proven by these fixtures. The 3425 ms figure is the old synchronous probe, not this stepper.
