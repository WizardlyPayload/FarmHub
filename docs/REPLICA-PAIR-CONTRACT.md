# Replica pair contract

Source-local publication for one replica directory. This is not an authority career id, session id, or publication sequence.

## Files

Each source directory holds two slots, `a` and `b`. A slot is eligible only as a pair:

- `slot-<letter>.xml` — schema 2 `farmDashboardExport` envelope, decoded by the frozen envelope reader
- `selection-<letter>.xml` — `farmDashboardReplicaSelection` schema 1

`selected.xml` and `replicaContext.xml` are compatibility copies. They do not choose the snapshot. A directory that has slot or selection files never falls back to those copies or to legacy JSON. A directory with only the compatibility copies is a legacy preview when the caller passes `explicitLegacy: true`, and is unavailable otherwise.

## Selection attributes, in order

`selectionSchema`, `replicaRevision`, `sourceId`, `sourceSlot`, `connectionEpoch`, `replica`, `slot`, `schema`, `careerId`, `sessionId`, `publicationSequence`, `exportGeneration`, `simulationTimeMs`, `encoding`, `bytes`, `crc`.

Whitespace is required before every attribute. `selectionSchema` is `1`. `replicaRevision` is the source-local order: a canonical integer from 1 through 2147483647. The next value comes from the highest validated pair on disk. Exhaustion fails. It does not wrap.

The repeated envelope fields must match the decoded slot. `slot` must match the filename. `sourceId` and `sourceSlot` must match the configured source. A readable file for a different source is not substituted.

## Order

Within one career and session, a lower authority sequence does not replace a higher one. Equal authority identity with different payload, generation, tick, bytes, or checksum is a conflict. Adler32 is not treated as proof of payload equality. Across careers or sessions, `replicaRevision` orders the transition. A new career starts unconfirmed and does not borrow the previous career's live status.

## Presence

`fileExists` false is absent. `fileExists` true with no readable document is unreadable. A missing function, a throw, or a non-boolean is unknown. Unknown and unreadable are not empty, and they are not overwritten. An invalid inactive candidate may be rewritten. The valid pair is kept.

## Work

Recovery reads one document at a time. A stored payload is valid only after its canonical base64, decoded length, checksum, strict UTF-8, and one JSON object all match. The checksum text is the publisher's unsigned decimal, including values above 2147483647. An object key state accepts a quoted name or, when the object is empty, a closing brace. It does not accept another value. A number sign, decimal point, or exponent marker needs its required digit before the token can end. Property names are matched after JSON escapes are decoded. Two padding characters are padding two, not three. Header agreement or a checksum alone does not protect a slot. Stored-pair equality and the selected-versus-incoming comparison keep separate cursors, so finishing one comparison does not skip the other. Comparison and validation share the finalizer's one update allowance and its two-millisecond deadline; the deadline is checked before every quartet and comparison quantum. A quartet is debited when its four characters are taken, including a quartet that is then rejected. A slice cap does not grant a second budget. `getXMLString` still returns a whole attribute in one native call and is not preempted by that deadline. A native load or save that has started is not cancelled. Cleanup failure stays `cleanup-unconfirmed`. The wire reservation cap does not include these XML copies.

Equal local revision with two different commits is a conflict, including the same payload under two careers. The same authority sequence with a different generation, tick, or payload is a conflict. The next revision is one past the highest validated revision. A previous snapshot is last-known only when its source and slot match the request. A finished or cancelled publication drops that job's store turn and payload buffers.
