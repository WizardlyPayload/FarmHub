"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
    decodeEnvelope,
    createFreshnessTracker,
} = require("./exportEnvelope");
const { isLuaExportStale, LUA_EXPORT_STALE_MS } = require("./liveExportFreshness");
const {
    SELECTION_ATTRS,
    SELECTION_ROOT,
    REVISION_MAX,
} = require("./replicaPairContract.cjs");

const ROUTE_ATTRS = ["schema", "careerId", "sessionId", "publicationSequence", "slot", "persistence", "sourceSlot"];
const freshnessBySource = new Map();
const validatedSlots = new Map();
const MAX_VALIDATED_SLOT_BYTES = 24 * 1024 * 1024;
const MAX_VALIDATED_SLOTS = 32;
let validatedSlotBytes = 0;

function decodeSelectedSlot(slotXml, careerId) {
    if (typeof slotXml !== "string") return decodeEnvelope(slotXml, { careerId });
    const cached = validatedSlots.get(slotXml);
    if (cached && cached.careerId === careerId) {
        validatedSlots.delete(slotXml);
        validatedSlots.set(slotXml, cached);
        // Merging may mutate the returned JSON. Never expose the cached copy.
        return JSON.parse(JSON.stringify(cached.decoded));
    }
    const decoded = decodeEnvelope(slotXml, { careerId });
    if (decoded && decoded.status === "valid" && decoded.gameplay === true && decoded.record && decoded.json) {
        const bytes = Buffer.byteLength(slotXml, "utf8");
        if (bytes <= MAX_VALIDATED_SLOT_BYTES && !cached) {
            const snapshot = JSON.parse(JSON.stringify({
                status: decoded.status,
                gameplay: decoded.gameplay,
                record: decoded.record,
                json: decoded.json,
            }));
            validatedSlots.set(slotXml, { careerId, bytes, decoded: snapshot });
            validatedSlotBytes += bytes;
            while (validatedSlots.size > MAX_VALIDATED_SLOTS || validatedSlotBytes > MAX_VALIDATED_SLOT_BYTES) {
                const oldestKey = validatedSlots.keys().next().value;
                const oldest = validatedSlots.get(oldestKey);
                validatedSlots.delete(oldestKey);
                validatedSlotBytes -= oldest.bytes;
            }
        }
    }
    return decoded;
}

function safeId(value) {
    return typeof value === "string" && value.length > 0 && value.length <= 64 && !value.includes("..") && /^[A-Za-z0-9_-]+$/.test(value);
}

function canonicalSequence(text) {
    if (typeof text !== "string" || !/^[1-9][0-9]*$/.test(text) || text.length > 10) return null;
    const sequence = Number(text);
    if (!Number.isInteger(sequence) || sequence < 1 || sequence > 2147483647) return null;
    return sequence;
}

function parseAttributes(body) {
    const fields = {};
    const order = [];
    let i = 0;
    while (i < body.length) {
        const ws = /^[ \t\r\n]+/.exec(body.slice(i));
        if (!ws) return null;
        i += ws[0].length;
        if (i >= body.length) break;
        const name = /^[A-Za-z_:][A-Za-z0-9_:-]*/.exec(body.slice(i));
        if (!name) return null;
        i += name[0].length;
        if (body[i] !== "=" || body[i + 1] !== "\"") return null;
        i += 2;
        const end = body.indexOf("\"", i);
        if (end < 0) return null;
        const value = body.slice(i, end);
        i = end + 1;
        if (Object.prototype.hasOwnProperty.call(fields, name[0])) return null;
        if (!ROUTE_ATTRS.includes(name[0])) return null;
        fields[name[0]] = value;
        order.push(name[0]);
    }
    if (order.length !== ROUTE_ATTRS.length) return null;
    for (const name of ROUTE_ATTRS) {
        if (!Object.prototype.hasOwnProperty.call(fields, name)) return null;
    }
    return fields;
}

function parseRoute(xml) {
    if (typeof xml !== "string" || xml.length === 0 || xml.length > 8192) return null;
    if (xml.includes("<!") || xml.includes("&")) return null;
    const trimmed = xml.trim();
    const tag = trimmed.match(/^(?:<\?xml\s[^?]*\?>\s*)?<farmDashboardRoute\b([^>]*?)\/>\s*$/);
    if (!tag) return null;
    const fields = parseAttributes(tag[1]);
    if (!fields) return null;
    if (fields.schema !== "1") return null;
    if (!safeId(fields.careerId) || !safeId(fields.sessionId) || !safeId(fields.sourceSlot)) return null;
    if (fields.slot !== "a" && fields.slot !== "b") return null;
    if (fields.persistence !== "saved" && fields.persistence !== "provisional") return null;
    const sequence = canonicalSequence(fields.publicationSequence);
    if (sequence == null) return null;
    for (const name of ROUTE_ATTRS) {
        if (fields[name] == null) return null;
    }
    return {
        careerId: fields.careerId,
        sessionId: fields.sessionId,
        publicationSequence: sequence,
        slot: fields.slot,
        persistence: fields.persistence,
        sourceSlot: fields.sourceSlot,
    };
}

function previousView(previous, input) {
    if (!previous || typeof previous !== "object") return null;
    const identity = previous.identity && typeof previous.identity === "object" ? previous.identity : previous;
    if (!identity || identity.sourceId == null || previous.payload == null) return null;
    const configured = input && input.configuredSlot;
    if (configured && identity.configuredSlot && identity.configuredSlot !== configured) return null;
    return { identity, payload: previous.payload };
}

function trackerFor(input) {
    if (input.tracker) return input.tracker;
    const key = `${String(input.sourceId || "source")}|${input.configuredSlot || ""}`;
    let slot = freshnessBySource.get(key);
    if (!slot) {
        slot = { now: input.now || Date.now, staleAfterMs: input.staleAfterMs || 60000 };
        slot.tracker = createFreshnessTracker({
            now: () => slot.now(),
            staleAfterMs: slot.staleAfterMs,
        });
        freshnessBySource.set(key, slot);
    } else if (typeof input.now === "function") {
        slot.now = input.now;
    }
    return slot.tracker;
}

function slotAccepted(input, route) {
    if (!input.configuredSlot) return true;
    if (route.sourceSlot === input.configuredSlot) return true;
    const mirrors = input.mirrorSlots;
    return !!(mirrors && mirrors[route.sourceSlot] === input.configuredSlot);
}

function parseLegacy(text) {
    if (typeof text !== "string" || text.trim() === "") return null;
    try {
        const data = JSON.parse(text);
        if (data == null || typeof data !== "object" || Array.isArray(data)) return null;
        return data;
    } catch (error) {
        return null;
    }
}

function readExportBuffers(input) {
    const sourceId = input.sourceId || "source";
    const previous = input.previous || null;
    const known = previousView(previous, input);
    const tracker = trackerFor(input);
    const route = parseRoute(input.routeXml);
    const base = {
        tracker,
        payload: null,
        identity: null,
        freshness: "unavailable",
        clearHold: false,
    };
    if (!route) {
        if (input.explicitLegacy === true) {
            const legacy = parseLegacy(input.legacyJson);
            if (legacy) {
                return {
                    ...base,
                    status: "identity-unconfirmed",
                    reason: "legacy-json",
                    payload: legacy,
                    freshness: "unconfirmed",
                    identity: {
                        sourceId,
                        configuredSlot: input.configuredSlot || null,
                        persistence: "unknown",
                        legacy: true,
                    },
                };
            }
        }
        if (known && known.identity.sourceId === sourceId) {
            return {
                ...base,
                status: "last-known",
                reason: "route-unavailable",
                payload: known.payload,
                identity: known.identity,
                freshness: "unconfirmed",
            };
        }
        return { ...base, status: "unavailable", reason: "route-unavailable" };
    }
    if (!slotAccepted(input, route)) {
        return { ...base, status: "conflict", reason: "source-slot" };
    }
    const slotXml = input.slotXml;
    const decoded = decodeSelectedSlot(slotXml, route.careerId);
    if (!decoded || decoded.status !== "valid" || !decoded.record || decoded.gameplay !== true) {
        const reason = decoded && decoded.reason ? decoded.reason : "snapshot-unavailable";
        if (previous && previous.identity && previous.identity.careerId === route.careerId && previous.identity.sourceId === sourceId) {
            return {
                ...base,
                status: "last-known",
                reason,
                payload: previous.payload,
                identity: previous.identity,
                freshness: "unconfirmed",
            };
        }
        return { ...base, status: "unavailable", reason };
    }
    const record = decoded.record;
    if (record.publicationSequence !== route.publicationSequence || record.sessionId !== route.sessionId) {
        return { ...base, status: "conflict", reason: "route-mismatch" };
    }
    const identity = {
        sourceId,
        careerId: record.careerId,
        sessionId: record.sessionId,
        publicationSequence: record.publicationSequence,
        exportGeneration: record.exportGeneration,
        // A trusted authority slot's stable file write is the local commit clock.
        committedAt: input.slotCommittedAt || null,
        configuredSlot: input.configuredSlot || route.sourceSlot,
        persistence: route.persistence,
        legacy: false,
    };
    const clearHold = !!(previous && previous.identity && (previous.identity.careerId !== identity.careerId || previous.identity.sourceId !== sourceId));
    const freshness = tracker.observe({
        sourceId,
        careerId: identity.careerId,
        publicationSequence: identity.publicationSequence,
        exportGeneration: identity.exportGeneration,
        gameplay: true,
    });
    return {
        status: "valid",
        reason: "selected",
        payload: decoded.json,
        identity,
        freshness: freshness || tracker.classify(sourceId, identity.careerId),
        tracker,
        clearHold,
    };
}

function slotFileName(slot) {
    return slot === "b" ? "slot-b.xml" : "slot-a.xml";
}

function sameResourcePayload(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

function sameCommittedResource(left, right) {
    if (!left || !right || !left.record || !right.record) return false;
    const a = left.record;
    const b = right.record;
    return a.careerId === b.careerId
        && a.sessionId === b.sessionId
        && a.publicationSequence === b.publicationSequence
        && a.exportGeneration === b.exportGeneration
        && String(a.simulationTimeMs) === String(b.simulationTimeMs)
        && a.bytes === b.bytes
        && a.crc === b.crc
        && sameResourcePayload(left.json, right.json);
}

/**
 * Highest valid resource sequence for one career and session.
 * Generation 0 is a normal resource export. An old session does not win by sequence.
 * Equal sequence is one result only when the committed envelope and payload match.
 */
function selectResourceSelection(documents, expected) {
    const careerId = expected && expected.careerId;
    const sessionId = expected && expected.sessionId;
    if (!careerId) return { status: "unavailable", payload: null, record: null };
    let selected = null;
    let selectedSequence = -1;
    let conflict = false;
    const sessions = new Set();
    let sawInvalid = false;
    for (const xml of documents || []) {
        if (xml == null || xml === "") continue;
        if (typeof xml !== "string") {
            sawInvalid = true;
            continue;
        }
        let decoded = null;
        try {
            decoded = decodeEnvelope(xml, { careerId });
        } catch (error) {
            sawInvalid = true;
            continue;
        }
        if (!decoded || decoded.status !== "valid" || !decoded.json || typeof decoded.json !== "object" || !decoded.record) {
            sawInvalid = true;
            continue;
        }
        const record = decoded.record;
        if (record.careerId !== careerId) continue;
        if (sessionId && record.sessionId !== sessionId) continue;
        if (!sessionId && record.sessionId) sessions.add(record.sessionId);
        const sequence = Number(record.publicationSequence);
        if (!Number.isInteger(sequence)) {
            sawInvalid = true;
            continue;
        }
        if (typeof (expected && expected.accept) === "function" && !expected.accept(decoded.json, record)) {
            sawInvalid = true;
            continue;
        }
        const candidate = { json: decoded.json, record, xml };
        if (sequence === selectedSequence) {
            if (!sameCommittedResource(selected, candidate)) conflict = true;
            continue;
        }
        if (sequence > selectedSequence) {
            selected = candidate;
            selectedSequence = sequence;
            conflict = false;
        }
    }
    if (conflict) return { status: "conflict", payload: null, record: null };
    if (!sessionId && sessions.size > 1) return { status: "conflict", payload: null, record: null };
    if (!selected) return { status: sawInvalid ? "invalid" : "absent", payload: null, record: null };
    return { status: "valid", payload: selected.json, record: selected.record, xml: selected.xml };
}

function selectResourceDocuments(documents, expected) {
    const selected = selectResourceSelection(documents, expected);
    return selected.status === "valid" ? selected.payload : null;
}

function readResourcePayloadSync(dir, careerId, kind, resourceId, expected) {
    if (!safeId(careerId) || (kind !== "dirtyPens" && kind !== "penDetail")) return null;
    if (kind === "penDetail" && !safeId(resourceId)) return null;
    const bound = { careerId, sessionId: expected && expected.sessionId };
    if (!bound.sessionId) {
        try {
            const route = parseRoute(fs.readFileSync(path.join(dir, "active.xml"), "utf8"));
            if (route && route.careerId && route.careerId !== careerId) return null;
            if (route && route.sessionId) bound.sessionId = route.sessionId;
        } catch (error) {
            bound.sessionId = null;
        }
    }
    const folder = kind === "penDetail"
        ? path.join(dir, careerId, "resources", kind, resourceId)
        : path.join(dir, careerId, "resources", kind);
    const documents = ["slot-a.xml", "slot-b.xml"].map((name) => {
        try {
            return fs.readFileSync(path.join(folder, name), "utf8");
        } catch (error) {
            return null;
        }
    });
    return selectResourceDocuments(documents, bound);
}

function readExportDirectorySync(dir, options) {
    const opts = options || {};
    let routeXml = null;
    let slotXml = null;
    let slotCommittedAt = null;
    let legacyJson = null;
    try {
        routeXml = fs.readFileSync(path.join(dir, "active.xml"), "utf8");
    } catch (error) {
        routeXml = null;
    }
    const route = parseRoute(routeXml);
    if (route && safeId(route.careerId)) {
        const slotFile = readNamedXml(path.join(dir, route.careerId), slotFileName(route.slot));
        if (slotFile.state === "present") {
            slotXml = slotFile.text;
            if (opts.trustedLocalClock === true && Number.isFinite(slotFile.mtimeMs)
                && slotFile.mtimeMs > 0 && slotFile.mtimeMs <= Date.now() + 1000) {
                slotCommittedAt = new Date(slotFile.mtimeMs).toISOString();
            }
        }
    }
    // A validated route uses the committed XML slot. Reading the legacy mirror
    // as well duplicates I/O on every live export without affecting selection.
    if (!route && opts.explicitLegacy === true) {
        try {
            legacyJson = fs.readFileSync(path.join(dir, "data.json"), "utf8");
        } catch (error) {
            legacyJson = null;
        }
    }
    return readExportBuffers({
        routeXml,
        slotXml,
        slotCommittedAt,
        legacyJson,
        explicitLegacy: opts.explicitLegacy === true,
        sourceId: opts.sourceId,
        configuredSlot: opts.configuredSlot,
        previous: opts.previous,
        tracker: opts.tracker,
        now: opts.now,
        staleAfterMs: opts.staleAfterMs,
    });
}

function utf8Bytes(text) {
    return Buffer.from(String(text || ""), "utf8");
}

function utf8Additive(bytes) {
    let sum = 0;
    for (const value of bytes) sum = (sum + value) % 2147483647;
    return sum;
}

function adler32(bytes) {
    let a = 1;
    let b = 0;
    for (const value of bytes) {
        a = (a + value) % 65521;
        b = (b + a) % 65521;
    }
    return (b * 65536) + a;
}

function replicaIdentityOk(meta) {
    if (!meta || meta.replica !== true) return false;
    if (!safeId(meta.careerId) || !safeId(meta.sessionId) || !safeId(meta.sourceSlot)) return false;
    const sequence = Number(meta.publicationSequence);
    const generation = Number(meta.exportGeneration);
    if (!Number.isInteger(sequence) || sequence <= 0) return false;
    if (!Number.isInteger(generation) || generation <= 0) return false;
    return true;
}

function parseStrictElement(xml, rootName, allow, options) {
    const requireOrder = !!(options && options.order === true);
    const limit = options && options.limit ? options.limit : 8192;
    if (typeof xml !== "string" || xml.length === 0 || xml.length > limit) return null;
    if (xml.includes("<!") || xml.includes("<!--") || xml.includes("&")) return null;
    let text = xml.replace(/^\uFEFF/, "").trim();
    text = text.replace(/^<\?xml\s+version="1\.0"(?:\s+encoding="[A-Za-z0-9._-]+")?(?:\s+standalone="(?:yes|no)")?\s*\?>/, "").trim();
    const tag = text.match(new RegExp("^<" + rootName + "(\\s[^>]*)?/>$"));
    if (!tag) return null;
    const body = tag[1] || "";
    const fields = Object.create(null);
    let index = 0;
    let seen = 0;
    while (index < body.length) {
        const ws = /^\s+/.exec(body.slice(index));
        if (!ws) return null;
        index += ws[0].length;
        if (index >= body.length) break;
        const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(body.slice(index));
        if (!name || !allow.includes(name[0])) return null;
        if (requireOrder && allow[seen] !== name[0]) return null;
        index += name[0].length;
        if (body[index] !== "=" || body[index + 1] !== "\"") return null;
        index += 2;
        const end = body.indexOf("\"", index);
        if (end < 0) return null;
        if (Object.prototype.hasOwnProperty.call(fields, name[0])) return null;
        fields[name[0]] = body.slice(index, end);
        index = end + 1;
        seen += 1;
    }
    if (index !== body.length) return null;
    if (requireOrder && seen !== allow.length) return null;
    return fields;
}

function parseReplicaContext(xml) {
    const fields = parseStrictElement(xml, "farmDashboardReplicaContext", ["sourceId", "sourceSlot", "connectionEpoch", "replica"]);
    if (!fields || fields.replica !== "true") return null;
    if (!safeId(fields.sourceId) || !safeId(fields.sourceSlot)) return null;
    if (!/^[0-9]+$/.test(fields.connectionEpoch || "")) return null;
    return fields;
}

function canonicalDecimal(text, min, max) {
    if (typeof text !== "string" || !/^(0|[1-9][0-9]*)$/.test(text) || text.length > 15) return null;
    const value = Number(text);
    if (!Number.isInteger(value) || value < min || value > max) return null;
    return value;
}

function payloadProof(bytes) {
    return crypto.createHash("sha256").update(bytes).digest("hex");
}

function parseSelectionRecord(xml) {
    const fields = parseStrictElement(xml, SELECTION_ROOT, SELECTION_ATTRS, { order: true, limit: 8192 });
    if (!fields || fields.selectionSchema !== "1" || fields.replica !== "true") return null;
    if (!safeId(fields.sourceId) || !safeId(fields.sourceSlot)) return null;
    if (fields.slot !== "a" && fields.slot !== "b") return null;
    if (canonicalDecimal(fields.connectionEpoch, 0, 2147483647) == null) return null;
    if (canonicalDecimal(fields.replicaRevision, 1, REVISION_MAX) == null) return null;
    if (canonicalDecimal(fields.publicationSequence, 1, 2147483647) == null) return null;
    if (canonicalDecimal(fields.exportGeneration, 1, 2147483647) == null) return null;
    if (canonicalDecimal(fields.bytes, 0, 8388608) == null) return null;
    if (canonicalDecimal(fields.crc, 0, 4294967295) == null) return null;
    if (fields.schema !== "2" || fields.encoding !== "base64") return null;
    if (!safeId(fields.careerId) || !safeId(fields.sessionId)) return null;
    if (fields.simulationTimeMs !== "unknown" && canonicalDecimal(fields.simulationTimeMs, 0, 999999999999999) == null) return null;
    return fields;
}

function readNamedXml(dir, name) {
    const full = path.join(dir, name);
    let fd;
    try {
        fd = fs.openSync(full, "r");
        let before = null;
        let after = null;
        try { before = fs.fstatSync(fd); } catch (error) { /* readable data can still be last-known */ }
        const text = fs.readFileSync(fd, "utf8");
        try { after = fs.fstatSync(fd); } catch (error) { /* no wall-clock proof */ }
        if (typeof text !== "string" || text.length > 12000000) return { state: "invalid" };
        const stable = before && after && before.size === after.size
            && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs;
        return { state: "present", text, mtimeMs: stable ? before.mtimeMs : null };
    } catch (error) {
        return { state: error && error.code === "ENOENT" ? "absent" : "unreadable" };
    } finally {
        if (fd !== undefined) fs.closeSync(fd);
    }
}

function classifySlot(dir, letter, opts) {
    const slotFile = readNamedXml(dir, "slot-" + letter + ".xml");
    const selectionFile = readNamedXml(dir, "selection-" + letter + ".xml");
    if (slotFile.state === "unreadable" || selectionFile.state === "unreadable") return { state: "unreadable", letter };
    if (slotFile.state === "absent" && selectionFile.state === "absent") return { state: "absent", letter };
    if (slotFile.state !== "present" || selectionFile.state !== "present") return { state: "invalid", letter };
    const selection = parseSelectionRecord(selectionFile.text);
    if (!selection || selection.slot !== letter) return { state: "invalid", letter };
    if (opts.sourceId && selection.sourceId !== opts.sourceId) return { state: "invalid", letter };
    if (opts.configuredSlot && selection.sourceSlot !== opts.configuredSlot) return { state: "invalid", letter };
    const decoded = decodeEnvelope(slotFile.text, {});
    if (!decoded || decoded.status !== "valid" || decoded.gameplay !== true || !decoded.record || !decoded.payload) {
        return { state: "invalid", letter };
    }
    const record = decoded.record;
    const same = selection.schema === "2"
        && selection.careerId === record.careerId
        && selection.sessionId === record.sessionId
        && Number(selection.publicationSequence) === record.publicationSequence
        && Number(selection.exportGeneration) === record.exportGeneration
        && selection.simulationTimeMs === String(record.simulationTimeMs)
        && selection.encoding === record.encoding
        && Number(selection.bytes) === record.bytes
        && selection.crc === String(record.crc);
    if (!same) return { state: "invalid", letter };
    return {
        state: "valid",
        letter,
        selection,
        decoded,
        committedAt: Number.isFinite(slotFile.mtimeMs) && slotFile.mtimeMs > 0
            && Number.isFinite(selectionFile.mtimeMs) && selectionFile.mtimeMs > 0
            && Math.max(slotFile.mtimeMs, selectionFile.mtimeMs) <= Date.now() + 1000
            ? new Date(Math.min(slotFile.mtimeMs, selectionFile.mtimeMs)).toISOString()
            : null,
        revision: Number(selection.replicaRevision),
        sequence: record.publicationSequence,
        proof: payloadProof(decoded.payload),
        lineage: `${record.careerId}|${record.sessionId}`,
    };
}

function commitDiffers(left, right) {
    const a = left.decoded.record;
    const b = right.decoded.record;
    return left.proof !== right.proof
        || a.schema !== b.schema
        || a.careerId !== b.careerId
        || a.sessionId !== b.sessionId
        || a.publicationSequence !== b.publicationSequence
        || a.exportGeneration !== b.exportGeneration
        || String(a.simulationTimeMs) !== String(b.simulationTimeMs)
        || a.encoding !== b.encoding
        || a.bytes !== b.bytes
        || String(a.crc) !== String(b.crc);
}

function eligiblePrevious(previous, opts) {
    if (!previous || !previous.payload || !previous.identity) return null;
    const identity = previous.identity;
    if (!identity.payloadProof || identity.exportGeneration == null || identity.simulationTimeMs == null) return null;
    if (opts.sourceId && identity.sourceId !== opts.sourceId) return null;
    const slot = identity.sourceSlot || identity.configuredSlot;
    if (opts.configuredSlot && slot !== opts.configuredSlot) return null;
    return previous;
}

function sameObservedCommit(identity, record, proof) {
    return identity.payloadProof === proof
        && Number(identity.publicationSequence) === record.publicationSequence
        && Number(identity.exportGeneration) === record.exportGeneration
        && String(identity.simulationTimeMs) === String(record.simulationTimeMs)
        && Number(identity.bytes) === record.bytes
        && String(identity.crc) === String(record.crc);
}

function readBestCommittedPair(dir, opts) {
    const options = opts || {};
    const sides = ["a", "b"].map((letter) => classifySlot(dir, letter, options));
    if (sides.some((side) => side.state === "unreadable")) {
        return { state: "unreadable", sides };
    }
    const present = sides.filter((side) => side.state !== "absent");
    if (present.length === 0) return { state: "absent", sides };
    const valid = sides.filter((side) => side.state === "valid");
    if (valid.length === 0) return { state: "invalid", sides };
    const byLineage = new Map();
    for (const side of valid) {
        const group = byLineage.get(side.lineage) || [];
        group.push(side);
        byLineage.set(side.lineage, group);
    }
    const lineages = [];
    for (const group of byLineage.values()) {
        group.sort((left, right) => right.sequence - left.sequence || right.revision - left.revision);
        const top = group[0];
        if (group.some((side) => side.sequence === top.sequence && commitDiffers(side, top))) {
            return { state: "conflict", sides };
        }
        if (group.some((side) => side.revision === top.revision && commitDiffers(side, top))) {
            return { state: "conflict", sides };
        }
        lineages.push(top);
    }
    lineages.sort((left, right) => right.revision - left.revision);
    if (lineages.length > 1 && lineages[0].revision === lineages[1].revision && commitDiffers(lineages[0], lineages[1])) {
        return { state: "conflict", sides };
    }
    return { state: "valid", pair: lineages[0], sides };
}

function readLegacyReplica(dir, options) {
    const opts = options || {};
    let metaText = null;
    let payloadText = null;
    try {
        metaText = fs.readFileSync(path.join(dir, "export-meta.json"), "utf8");
        payloadText = fs.readFileSync(path.join(dir, "data.json"), "utf8");
    } catch (error) {
        return null;
    }
    let meta = null;
    try { meta = JSON.parse(metaText); } catch (error) { return null; }
    if (!replicaIdentityOk(meta)) return null;
    if (opts.configuredSlot && meta.sourceSlot !== opts.configuredSlot) return null;
    if (payloadText.trim().startsWith("<")) return null;
    const bytes = utf8Bytes(payloadText);
    if (meta.crc == null || Number(meta.crc) !== adler32(bytes)) return null;
    let payload = null;
    try { payload = JSON.parse(payloadText); } catch (error) { return null; }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    return {
        status: "replica",
        replica: true,
        authoritative: false,
        legacy: true,
        freshness: "unconfirmed",
        identity: { ...meta, legacy: true, replica: true, authoritative: false },
        payload,
    };
}

function readReplicaIngress(dir, options) {
    const opts = options || {};
    const previousRecord = eligiblePrevious(opts.previous, opts);
    const found = readBestCommittedPair(dir, opts);
    let selected = null;
    let provenance = null;
    let decoded = null;
    let proof = null;
    if (found.state === "unreadable" || found.state === "invalid" || found.state === "conflict") {
        const previous = previousRecord;
        if (previous) {
            return {
                status: "last-known",
                reason: found.state,
                replica: true,
                authoritative: false,
                payload: previous.payload,
                identity: previous.identity || null,
                freshness: "unconfirmed",
                progress: "retained",
            };
        }
        return { status: "unavailable", reason: found.state, replica: true, authoritative: false, payload: null };
    }
    if (found.state === "valid") {
        decoded = found.pair.decoded;
        proof = found.pair.proof;
        provenance = {
            sourceId: found.pair.selection.sourceId,
            sourceSlot: found.pair.selection.sourceSlot,
            connectionEpoch: found.pair.selection.connectionEpoch,
            replica: found.pair.selection.replica,
            replicaRevision: found.pair.revision,
        };
    } else {
        const pairArtifacts = found.sides.some((side) => side.state !== "absent");
        if (pairArtifacts) {
            return { status: "unavailable", reason: "invalid", replica: true, authoritative: false, payload: null };
        }
        try { selected = fs.readFileSync(path.join(dir, "selected.xml"), "utf8"); } catch (error) { selected = null; }
        let contextXml = null;
        try { contextXml = fs.readFileSync(path.join(dir, "replicaContext.xml"), "utf8"); } catch (error) { contextXml = null; }
        if (selected == null && contextXml == null) {
            if (opts.explicitLegacy === true) return readLegacyReplica(dir, opts);
            return null;
        }
        if (opts.explicitLegacy !== true) {
            return { status: "unavailable", reason: "legacy-unconfirmed", replica: true, authoritative: false, payload: null };
        }
        if (selected == null) return null;
        provenance = parseReplicaContext(contextXml);
        if (!provenance) return null;
        if (opts.configuredSlot && provenance.sourceSlot !== opts.configuredSlot) return null;
        if (opts.sourceId && provenance.sourceId !== opts.sourceId) return null;
        decoded = decodeEnvelope(selected, {});
        if (!decoded || !decoded.payload) return null;
        proof = payloadProof(decoded.payload);
    }
    if (!decoded || decoded.status !== "valid" || decoded.gameplay !== true || !decoded.json || !decoded.record) return null;
    const record = decoded.record;
    if (!safeId(record.careerId) || !safeId(record.sessionId)) return null;
    if (!Number.isInteger(record.publicationSequence) || record.publicationSequence <= 0) return null;
    if (!Number.isInteger(record.exportGeneration) || record.exportGeneration <= 0) return null;
    const previous = previousRecord && previousRecord.identity;
    const legacyPreview = found.state !== "valid";
    const tracker = trackerFor({
        sourceId: provenance.sourceId,
        configuredSlot: provenance.sourceSlot,
        tracker: opts.tracker,
        now: opts.now,
        staleAfterMs: opts.staleAfterMs,
    });
    const previousContext = opts.previous && opts.previous.identity;
    if (previousContext && previousContext.sourceId === provenance.sourceId
        && (previousContext.sourceSlot !== provenance.sourceSlot
            || String(previousContext.connectionEpoch ?? "") !== String(provenance.connectionEpoch ?? ""))) {
        tracker.forget(provenance.sourceId);
    }
    if (previous && previous.careerId === record.careerId && previous.sessionId === record.sessionId && previous.sourceId === provenance.sourceId && Number(previous.publicationSequence) === record.publicationSequence) {
        if (!sameObservedCommit(previous, record, proof)) {
            if (previousRecord && previousRecord.payload) {
                return {
                    status: "last-known",
                    reason: "equal-sequence-conflict",
                    replica: true,
                    authoritative: false,
                    payload: previousRecord.payload,
                    identity: previous,
                    tracker,
                    freshness: "unconfirmed",
                    progress: "retained",
                };
            }
            return { status: "unavailable", reason: "equal-sequence-conflict", replica: true, authoritative: false, payload: null };
        }
    }
    if (previous && previous.careerId === record.careerId && previous.sessionId === record.sessionId && previous.sourceId === provenance.sourceId && Number(previous.publicationSequence) > record.publicationSequence) {
        return {
            status: "last-known",
            reason: "sequence-rollback",
            replica: true,
            authoritative: false,
            payload: previousRecord.payload,
            identity: previous,
            tracker,
            freshness: "unconfirmed",
            progress: "retained",
        };
    }
    if (previous && previous.careerId === record.careerId && previous.sessionId && previous.sessionId !== record.sessionId) {
        tracker.forget(provenance.sourceId);
    }
    const committedAt = legacyPreview ? null : found.pair.committedAt;
    if (!committedAt) tracker.forget(provenance.sourceId);
    const observed = !committedAt ? null : tracker.observe({
        sourceId: provenance.sourceId,
        careerId: record.careerId,
        publicationSequence: record.publicationSequence,
        exportGeneration: record.exportGeneration,
        gameplay: true,
    });
    const freshness = !committedAt ? "unconfirmed"
        : isLuaExportStale(committedAt, Date.now(), LUA_EXPORT_STALE_MS) ? "stale"
            : (observed || tracker.classify(provenance.sourceId, record.careerId));
    return {
        status: "replica",
        replica: true,
        authoritative: false,
        legacy: legacyPreview,
        reason: legacyPreview ? "legacy-preview" : "selected",
        payload: decoded.json,
        tracker,
        freshness,
        progress: freshness === "live" ? "progressing" : freshness,
        identity: {
            sourceId: provenance.sourceId,
            careerId: record.careerId,
            sessionId: record.sessionId,
            publicationSequence: record.publicationSequence,
            exportGeneration: record.exportGeneration,
            sourceSlot: provenance.sourceSlot,
            configuredSlot: provenance.sourceSlot,
            connectionEpoch: provenance.connectionEpoch,
            replicaRevision: provenance.replicaRevision || null,
            simulationTimeMs: record.simulationTimeMs,
            schema: record.schema,
            encoding: record.encoding,
            bytes: record.bytes,
            crc: String(record.crc),
            payloadProof: proof,
            committedAt,
            replica: true,
            authoritative: false,
            legacy: legacyPreview,
        },
    };
}

function ingestWatchedSlot(dir, options) {
    const opts = options || {};
    let routePresent = false;
    try { routePresent = fs.existsSync(path.join(dir, "active.xml")); } catch (error) { return null; }
    if (routePresent) return readExportDirectorySync(dir, opts);
    let selectedPresent = false;
    try {
        selectedPresent = fs.existsSync(path.join(dir, "selected.xml"))
            || fs.existsSync(path.join(dir, "slot-a.xml"))
            || fs.existsSync(path.join(dir, "slot-b.xml"));
    } catch (error) { return null; }
    if (selectedPresent) {
        const replica = readReplicaIngress(dir, opts);
        if (replica) return replica;
        return { status: "unavailable", reason: "replica-rejected", payload: null };
    }
    let legacyPresent = false;
    try { legacyPresent = fs.existsSync(path.join(dir, "export-meta.json")); } catch (error) { return null; }
    if (legacyPresent) {
        if (opts.explicitLegacy === true) {
            const legacy = readReplicaIngress(dir, opts);
            if (legacy) return legacy;
        }
        return { status: "unavailable", reason: "replica-rejected", payload: null };
    }
    return readExportDirectorySync(dir, opts);
}

module.exports = {
    safeId,
    parseRoute,
    readExportBuffers,
    readExportDirectorySync,
    slotFileName,
    readResourcePayloadSync,
    selectResourceDocuments,
    selectResourceSelection,
    createFreshnessTracker,
    readReplicaIngress,
    ingestWatchedSlot,
    parseReplicaContext,
    parseSelectionRecord,
};
