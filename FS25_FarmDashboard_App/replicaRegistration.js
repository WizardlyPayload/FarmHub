"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const MAX_ROWS = 32;
// 32 sources, three bounded attributes, and ordinary declaration/newline formatting stay under 64 KiB.
const MAX_DOCUMENT_BYTES = 65536;
// Two 32-row snapshots plus the fixed transaction fields stay under 32 KiB.
const JOURNAL_MAX_BYTES = 32768;
const JOURNAL_FIELDS = [
    "version", "id", "phase", "previousExists", "previousRevision", "intendedRevision",
    "previousRows", "intendedRows", "previousDigest", "intendedDigest",
    "previousLength", "intendedLength", "backup",
];
const JOURNAL_PHASES = ["prepared", "published-pending-commit", "committed-cleanup", "restored-cleanup"];
const profileLockKey = Symbol.for("farmdash.replicaRegistration.profileLocks");
function profileLocks() {
    if (!globalThis[profileLockKey]) globalThis[profileLockKey] = new Set();
    return globalThis[profileLockKey];
}
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const KEY = /^[A-Za-z0-9_-]{1,128}$/;
const RECOVERY_NAME = "replicaSources.xml.recovery";
const JOURNAL_NAME = "replicaSources.transaction.json";
const ACTIVE_NAME = "replicaSources.xml";

function validToken(value, pattern) {
    return typeof value === "string" && pattern.test(value) && !value.includes("..");
}

function validId(value) {
    return validToken(value, ID);
}

function validKey(value) {
    return validToken(value, KEY);
}

function escapeAttr(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;");
}

function decodeAttr(value) {
    if (/&(?!(?:amp|quot|lt|gt|apos);)/.test(value)) return null;
    return value
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&");
}

function isXmlWhitespace(char) {
    return char === " " || char === "\t" || char === "\n" || char === "\r";
}

function parseAttrs(raw, allow) {
    if (typeof raw !== "string") return null;
    const attrs = Object.create(null);
    const allowed = Object.create(null);
    for (const name of allow || []) allowed[name] = true;
    let index = 0;
    while (index < raw.length) {
        if (!isXmlWhitespace(raw[index])) return null;
        while (index < raw.length && isXmlWhitespace(raw[index])) index += 1;
        if (index >= raw.length) break;
        if (!/[A-Za-z_]/.test(raw[index])) return null;
        const nameStart = index;
        index += 1;
        while (index < raw.length && /[A-Za-z0-9_]/.test(raw[index])) index += 1;
        const name = raw.slice(nameStart, index);
        while (index < raw.length && isXmlWhitespace(raw[index])) index += 1;
        if (raw[index] !== "=") return null;
        index += 1;
        while (index < raw.length && isXmlWhitespace(raw[index])) index += 1;
        if (raw[index] !== '"') return null;
        index += 1;
        const valueStart = index;
        while (index < raw.length && raw[index] !== '"') index += 1;
        if (index >= raw.length) return null;
        const decoded = decodeAttr(raw.slice(valueStart, index));
        index += 1;
        if (decoded == null || allowed[name] !== true) return null;
        if (Object.prototype.hasOwnProperty.call(attrs, name)) return null;
        attrs[name] = decoded;
    }
    return attrs;
}

function canonicalRevision(value) {
    if (value == null) return 0;
    if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,15})$/.test(value)) return null;
    const revision = Number(value);
    if (!Number.isSafeInteger(revision)) return null;
    return revision;
}

function parseRegistrationDocument(text) {
    if (typeof text !== "string") return { ok: false, error: "damaged" };
    if (Buffer.byteLength(text, "utf8") > MAX_DOCUMENT_BYTES) return { ok: false, error: "too-large" };
    let body = text.replace(/^\uFEFF/, "").trim();
    if (body.startsWith("<?xml")) {
        const decl = body.match(/^<\?xml\s+version="1\.0"(?:\s+encoding="[A-Za-z0-9._-]+")?(?:\s+standalone="(?:yes|no)")?\s*\?>/);
        if (!decl) return { ok: false, error: "damaged" };
        body = body.slice(decl[0].length).trim();
    }
    if (body.includes("<!DOCTYPE") || body.includes("<!ENTITY") || body.includes("<!--")) {
        return { ok: false, error: "damaged" };
    }
    const open = body.match(/^<farmDashboardReplicaSources(\s[^<>]*?)?\s*(\/?)>/);
    if (!open) return { ok: false, error: "damaged" };
    const attrs = parseAttrs(open[1] || "", ["revision"]);
    if (!attrs) return { ok: false, error: "damaged" };
    if (Object.keys(attrs).some((name) => name !== "revision")) return { ok: false, error: "damaged" };
    const revision = canonicalRevision(attrs.revision);
    if (revision == null) return { ok: false, error: "damaged" };
    if (open[2] === "/") {
        if (body.slice(open[0].length).trim() !== "") return { ok: false, error: "damaged" };
        return { ok: true, revision, rows: [] };
    }
    const rest = body.slice(open[0].length);
    const closeAt = rest.lastIndexOf("</farmDashboardReplicaSources>");
    if (closeAt < 0) return { ok: false, error: "damaged" };
    const inner = rest.slice(0, closeAt);
    if (rest.slice(closeAt + "</farmDashboardReplicaSources>".length).trim() !== "") {
        return { ok: false, error: "damaged" };
    }
    if (inner.includes("<farmDashboardReplicaSources")) return { ok: false, error: "damaged" };
    const rows = [];
    const tagRe = /<source(\s[^<>]*?)\s*\/>/g;
    let cursor = 0;
    let tag = tagRe.exec(inner);
    while (tag) {
        if (inner.slice(cursor, tag.index).trim() !== "") return { ok: false, error: "damaged" };
        const sourceAttrs = parseAttrs(tag[1], ["sourceId", "remoteSlot", "serverKey"]);
        if (!sourceAttrs) return { ok: false, error: "damaged" };
        const keys = Object.keys(sourceAttrs).sort().join(",");
        if (keys !== "remoteSlot,serverKey,sourceId") return { ok: false, error: "damaged" };
        if (!validId(sourceAttrs.sourceId) || !validId(sourceAttrs.remoteSlot) || !validKey(sourceAttrs.serverKey)) {
            return { ok: false, error: "invalid-registration" };
        }
        rows.push({
            sourceId: sourceAttrs.sourceId,
            remoteSlot: sourceAttrs.remoteSlot,
            sessionPairing: sourceAttrs.serverKey,
        });
        cursor = tag.index + tag[0].length;
        tag = tagRe.exec(inner);
    }
    if (inner.slice(cursor).trim() !== "") return { ok: false, error: "damaged" };
    if (rows.length > MAX_ROWS) return { ok: false, error: "too-many" };
    const seenId = new Set();
    const seenKey = new Set();
    for (const row of rows) {
        if (seenId.has(row.sourceId) || seenKey.has(row.sessionPairing)) {
            return { ok: false, error: "ambiguous-registration" };
        }
        seenId.add(row.sourceId);
        seenKey.add(row.sessionPairing);
    }
    return { ok: true, revision, rows };
}

function registrationFromServer(server) {
    if (!server || server.id == null) return null;
    const registration = server.replicaRegistration;
    if (!registration || typeof registration !== "object") return null;
    const sourceId = String(server.id);
    const remoteSlot = typeof registration.remoteSlot === "string" ? registration.remoteSlot.trim() : "";
    const sessionPairing = typeof registration.sessionPairing === "string" ? registration.sessionPairing.trim() : "";
    if (!validId(sourceId) || !validId(remoteSlot) || !validKey(sessionPairing)) return null;
    return { sourceId, remoteSlot, sessionPairing };
}

function validateSnapshot(servers) {
    const rows = [];
    const seenId = new Set();
    const seenKey = new Set();
    for (const server of Array.isArray(servers) ? servers : []) {
        if (!server || !server.replicaRegistration) continue;
        if (rows.length >= MAX_ROWS) return { ok: false, error: "too-many" };
        const row = registrationFromServer(server);
        if (!row) return { ok: false, error: "invalid-registration" };
        if (seenId.has(row.sourceId) || seenKey.has(row.sessionPairing)) {
            return { ok: false, error: "ambiguous-registration" };
        }
        seenId.add(row.sourceId);
        seenKey.add(row.sessionPairing);
        rows.push(row);
    }
    return { ok: true, rows };
}

function sameRegistration(leftServers, rightServers) {
    const left = validateSnapshot(leftServers);
    const right = validateSnapshot(rightServers);
    if (!left.ok || !right.ok) return false;
    return JSON.stringify(left.rows) === JSON.stringify(right.rows);
}

function renderRegistrationXml(rows, revision) {
    const lines = [`<farmDashboardReplicaSources revision="${Number(revision) || 1}">`];
    for (const row of rows) {
        lines.push(
            `<source sourceId="${escapeAttr(row.sourceId)}" remoteSlot="${escapeAttr(row.remoteSlot)}" serverKey="${escapeAttr(row.sessionPairing)}"/>`
        );
    }
    lines.push("</farmDashboardReplicaSources>");
    return lines.join("\n");
}

function registrationDir(profileDir) {
    return path.join(profileDir, "modSettings", "FS25_FarmDashboard");
}

function existingFileState(filePath) {
    if (!fs.existsSync(filePath)) return { state: "absent", revision: 0, rows: [] };
    let bytes;
    try {
        const stat = fs.statSync(filePath);
        if (!stat.isFile() || stat.size > MAX_DOCUMENT_BYTES) return { state: "damaged", error: "too-large" };
        bytes = fs.readFileSync(filePath);
    } catch (error) {
        return { state: "damaged" };
    }
    const parsed = parseRegistrationDocument(bytes.toString("utf8"));
    if (!parsed.ok) return { state: "damaged", error: parsed.error };
    return { state: "valid", revision: parsed.revision, rows: parsed.rows, bytes };
}

function writeVerified(target, bytes) {
    const expected = Buffer.isBuffer(bytes) ? bytes : Buffer.from(String(bytes));
    const tmp = `${target}.tmp`;
    fs.writeFileSync(tmp, expected);
    const readBack = fs.readFileSync(tmp);
    if (!readBack.equals(expected)) {
        try { fs.unlinkSync(tmp); } catch (_) { /* keep the active path untouched */ }
        const error = new Error("verify-failed");
        error.code = "verify-failed";
        throw error;
    }
    fs.renameSync(tmp, target);
}

function journalPath(dir) {
    return path.join(dir, JOURNAL_NAME);
}

function digestOf(bytes) {
    return crypto.createHash("sha256").update(bytes).digest("hex");
}

function lockProfile(dir) {
    const key = path.resolve(dir);
    if (profileLocks().has(key)) return null;
    profileLocks().add(key);
    return key;
}

function unlockProfile(key) {
    if (key) profileLocks().delete(key);
}

function plainRows(value) {
    if (!Array.isArray(value) || value.length > MAX_ROWS) return null;
    const rows = [];
    for (const row of value) {
        if (!row || typeof row !== "object" || Array.isArray(row)) return null;
        if (Object.keys(row).sort().join(",") !== "remoteSlot,serverKey,sessionPairing,sourceId" &&
            Object.keys(row).sort().join(",") !== "remoteSlot,sessionPairing,sourceId") return null;
        const sourceId = row.sourceId;
        const remoteSlot = row.remoteSlot;
        const sessionPairing = row.sessionPairing != null ? row.sessionPairing : row.serverKey;
        if (!validId(sourceId) || !validId(remoteSlot) || !validKey(sessionPairing)) return null;
        rows.push({ sourceId, remoteSlot, sessionPairing });
    }
    return rows;
}

function validateJournal(parsed) {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const keys = Object.keys(parsed);
    const adoption = parsed.version === 2 && parsed.kind === "adopt-orphan";
    const repair = parsed.version === 3 && parsed.kind === "repair-orphan";
    const fields = repair ? [...JOURNAL_FIELDS, "kind", "previousAppRows"] : adoption ? [...JOURNAL_FIELDS, "kind"] : JOURNAL_FIELDS;
    if (keys.length !== fields.length || keys.some((key) => !fields.includes(key))) return null;
    if (parsed.version !== 1 && !adoption && !repair) return null;
    if (typeof parsed.id !== "string" || !/^[a-f0-9]{32}$/.test(parsed.id)) return null;
    if (!JOURNAL_PHASES.includes(parsed.phase)) return null;
    if (typeof parsed.previousExists !== "boolean") return null;
    if (!Number.isSafeInteger(parsed.previousRevision) || !Number.isSafeInteger(parsed.intendedRevision)) return null;
    if (parsed.backup !== RECOVERY_NAME) return null;
    const previousRows = plainRows(parsed.previousRows);
    const intendedRows = plainRows(parsed.intendedRows);
    if (!previousRows || !intendedRows) return null;
    const previousAppRows = repair ? plainRows(parsed.previousAppRows) : null;
    if (repair && !previousAppRows) return null;
    const digestOk = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
    if (!digestOk(parsed.intendedDigest) || !Number.isSafeInteger(parsed.intendedLength) || parsed.intendedLength < 0) return null;
    if (parsed.previousExists) {
        if (!digestOk(parsed.previousDigest) || !Number.isSafeInteger(parsed.previousLength) || parsed.previousLength < 0) return null;
    } else if (parsed.previousDigest !== null || parsed.previousLength !== 0 || previousRows.length !== 0) {
        return null;
    }
    return {
        ...parsed,
        previousRows,
        intendedRows,
        ...(repair ? { previousAppRows } : {}),
    };
}

function readJournal(dir) {
    const filePath = journalPath(dir);
    if (!fs.existsSync(filePath)) return null;
    try {
        const stat = fs.statSync(filePath);
        if (!stat.isFile() || stat.size > JOURNAL_MAX_BYTES) return { ok: false, invalid: true };
        const bytes = fs.readFileSync(filePath);
        if (bytes.length > JOURNAL_MAX_BYTES) return { ok: false, invalid: true };
        const record = validateJournal(JSON.parse(bytes.toString("utf8")));
        if (!record) return { ok: false, invalid: true };
        return { ok: true, record };
    } catch (error) {
        return { ok: false, invalid: true };
    }
}

function previousSpec(record) {
    return {
        exists: record.previousExists,
        length: record.previousLength,
        digest: record.previousDigest,
        revision: record.previousRevision,
        rows: record.previousRows,
    };
}

function intendedSpec(record) {
    return {
        exists: true,
        length: record.intendedLength,
        digest: record.intendedDigest,
        revision: record.intendedRevision,
        rows: record.intendedRows,
    };
}

function snapshotMatches(fileState, spec) {
    if (!spec.exists) return fileState.state === "absent";
    if (fileState.state !== "valid" || !Buffer.isBuffer(fileState.bytes)) return false;
    if (fileState.bytes.length !== spec.length) return false;
    if (digestOf(fileState.bytes) !== spec.digest) return false;
    if (fileState.revision !== spec.revision) return false;
    return signatureOf(fileState.rows) === signatureOf(spec.rows);
}

function appSide(record, servers, active) {
    const checked = validateSnapshot(servers);
    if (!checked.ok) return "invalid";
    const signature = signatureOf(checked.rows);
    const selectsPrevious = signature === signatureOf(record.previousAppRows || record.previousRows);
    const selectsIntended = signature === signatureOf(record.intendedRows);
    if (selectsIntended && !selectsPrevious) return "intended";
    if (selectsPrevious && !selectsIntended) return "previous";
    if (selectsIntended && selectsPrevious) {
        if (snapshotMatches(active, intendedSpec(record))) return "intended";
        if (snapshotMatches(active, previousSpec(record))) return "previous";
    }
    return "neither";
}

function readOwnedBackup(dir, record) {
    if (record.backup !== RECOVERY_NAME) return { ok: false, error: "recovery-required" };
    if (!record.previousExists) return { ok: true, absent: true };
    const state = existingFileState(path.join(dir, RECOVERY_NAME));
    if (!snapshotMatches(state, previousSpec(record))) return { ok: false, error: "recovery-required" };
    return { ok: true, bytes: state.bytes };
}

function finishCleanup(dir, record, phase) {
    try {
        writeVerified(journalPath(dir), JSON.stringify({ ...record, phase }));
        const backupPath = path.join(dir, RECOVERY_NAME);
        if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
        const journal = journalPath(dir);
        if (fs.existsSync(journal)) fs.unlinkSync(journal);
        return { ok: true, reconciled: phase };
    } catch (error) {
        return { ok: false, error: "cleanup-pending" };
    }
}

function installPrevious(dir, record) {
    const backup = readOwnedBackup(dir, record);
    if (!backup.ok) return backup;
    const activePath = path.join(dir, ACTIVE_NAME);
    try {
        if (record.previousExists) writeVerified(activePath, backup.bytes);
        else if (fs.existsSync(activePath)) fs.unlinkSync(activePath);
    } catch (error) {
        return { ok: false, error: "rollback-failed" };
    }
    return finishCleanup(dir, record, "restored-cleanup");
}

function signatureOf(rows) {
    return JSON.stringify(Array.isArray(rows) ? rows : []);
}

// XML and app config may list the same registrations in different orders. Reject duplicate
// identities/keys rather than treating an array position as part of the source identity.
function sameRegistrationMembers(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    const index = new Map();
    const leftKeys = new Set();
    const rightIds = new Set();
    const rightKeys = new Set();
    for (const row of left) {
        if (!row || !validId(row.sourceId) || !validId(row.remoteSlot) || !validKey(row.sessionPairing) ||
            index.has(row.sourceId) || leftKeys.has(row.sessionPairing)) return false;
        index.set(row.sourceId, row);
        leftKeys.add(row.sessionPairing);
    }
    for (const row of right) {
        if (!row || !validId(row.sourceId) || !validId(row.remoteSlot) || !validKey(row.sessionPairing) ||
            rightIds.has(row.sourceId) || rightKeys.has(row.sessionPairing)) return false;
        const original = index.get(row.sourceId);
        if (!original || original.remoteSlot !== row.remoteSlot || original.sessionPairing !== row.sessionPairing) return false;
        rightIds.add(row.sourceId);
        rightKeys.add(row.sessionPairing);
    }
    return true;
}

function recoveryDecision(record, active, servers) {
    const side = appSide(record, servers, active);
    const activeIsIntended = snapshotMatches(active, intendedSpec(record));
    if (record.kind === "repair-orphan") {
        if (side === "intended" && activeIsIntended) return "cleanup-committed";
        if (side === "previous" && activeIsIntended) return "restore-previous";
        if (side === "previous" && snapshotMatches(active, previousSpec(record))) return "cleanup-restored";
        return "recovery-required";
    }
    if (record.kind === "adopt-orphan") {
        if (!activeIsIntended) return "recovery-required";
        if (side === "intended") return "cleanup-committed";
        if (side === "previous") return "cleanup-restored";
        return "recovery-required";
    }
    const activeIsPrevious = snapshotMatches(active, previousSpec(record));
    if (record.phase === "committed-cleanup" || record.phase === "restored-cleanup") {
        if (record.phase === "committed-cleanup" && side === "intended" && activeIsIntended) return "cleanup";
        if (record.phase === "restored-cleanup" && side === "previous" && activeIsPrevious) return "cleanup";
        return "recovery-required";
    }
    if (side === "intended" && activeIsIntended) return "cleanup-committed";
    if (side === "previous" && activeIsPrevious) return "cleanup-restored";
    if (side === "previous" && activeIsIntended) return "restore-previous";
    return "recovery-required";
}

function applyRecoveryDecision(dir, record, servers) {
    const active = existingFileState(path.join(dir, ACTIVE_NAME));
    const decision = recoveryDecision(record, active, servers);
    if (decision === "recovery-required") return { ok: false, error: "recovery-required" };
    if (decision === "restore-previous") {
        if (!snapshotMatches(active, intendedSpec(record))) return { ok: false, error: "recovery-required" };
        return installPrevious(dir, record);
    }
    const phase = decision === "cleanup-committed" ? "committed-cleanup" : record.phase === "committed-cleanup" ? "committed-cleanup" : "restored-cleanup";
    return finishCleanup(dir, record, phase);
}

// A prior app-config loss is not a new pairing. Require the game-owned trust entry and a strictly
// ingested replica for the exact registered ID/slot; never infer a link from a loose directory.
function readTrustedSourceIds(filePath) {
    let text;
    try {
        const stat = fs.lstatSync(filePath);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 32768) return null;
        text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "").trim();
    } catch (_) { return null; }
    text = text.replace(/^<\?xml\s+version="1\.0"(?:\s+encoding="[A-Za-z0-9._-]+")?(?:\s+standalone="(?:yes|no)")?\s*\?>\s*/, "");
    const root = /^<farmDashboardReplicaTrust>\s*([\s\S]*?)\s*<\/farmDashboardReplicaTrust>$/.exec(text);
    if (!root) return null;
    const ids = new Map();
    const keyIds = new Set();
    const tags = /<link(\s[^<>]*?)\s*\/>/g;
    let cursor = 0;
    let match;
    while ((match = tags.exec(root[1])) !== null) {
        if (root[1].slice(cursor, match.index).trim() !== "" || ids.size >= 16) return null;
        const attrs = parseAttrs(match[1], ["sourceId", "careerId", "keyId", "key"]);
        if (!attrs || Object.keys(attrs).sort().join(",") !== "careerId,key,keyId,sourceId" ||
            !validId(attrs.sourceId) || !validId(attrs.careerId) ||
            !/^[a-fA-F0-9]{16}$/.test(attrs.keyId) || !/^[a-fA-F0-9]{64}$/.test(attrs.key) ||
            ids.has(attrs.sourceId) || keyIds.has(attrs.keyId)) return null;
        ids.set(attrs.sourceId, { careerId: attrs.careerId, keyId: attrs.keyId.toLowerCase(), key: attrs.key.toLowerCase() });
        keyIds.add(attrs.keyId);
        cursor = match.index + match[0].length;
    }
    return root[1].slice(cursor).trim() === "" ? ids : null;
}

function detectOrphanLinkedSource(profileDir, servers) {
    if (typeof profileDir !== "string" || !path.isAbsolute(profileDir) || !Array.isArray(servers)) {
        return { ok: false, error: "unavailable" };
    }
    const dir = registrationDir(profileDir);
    const registrationPath = path.join(dir, ACTIVE_NAME);
    try {
        if (fs.lstatSync(dir).isSymbolicLink() || fs.lstatSync(registrationPath).isSymbolicLink()) {
            return { ok: false, error: "unavailable" };
        }
    } catch (_) { return { ok: false, error: "unavailable" }; }
    if (readJournal(dir)) return { ok: false, error: "recovery-required" };
    const active = existingFileState(registrationPath);
    if (active.state !== "valid" || active.rows.length === 0 || active.rows.length > 16) {
        return { ok: false, error: "unavailable" };
    }
    const configured = validateSnapshot(servers);
    if (!configured.ok) return { ok: false, error: configured.error };
    const byId = new Map(active.rows.map((row) => [row.sourceId, row]));
    for (const row of configured.rows) {
        const original = byId.get(row.sourceId);
        if (!original || original.remoteSlot !== row.remoteSlot || original.sessionPairing !== row.sessionPairing) {
            return { ok: false, error: "conflict" };
        }
    }
    const configuredIds = new Set(configured.rows.map((row) => row.sourceId));
    const orphans = active.rows.filter((row) => !configuredIds.has(row.sourceId));
    if (orphans.length !== 1) return { ok: false, error: orphans.length ? "ambiguous" : "none" };
    const orphan = orphans[0];
    if (!/^mp-[a-f0-9]{12}$/.test(orphan.sourceId) ||
        servers.some((server) => server && (String(server.id) === orphan.sourceId ||
            (server.replicaRegistration && server.replicaRegistration.sessionPairing === orphan.sessionPairing)))) {
        return { ok: false, error: "conflict" };
    }
    const trusted = readTrustedSourceIds(path.join(dir, "replicaTrust.xml"));
    if (!trusted || !trusted.has(orphan.sourceId)) return { ok: false, error: "untrusted" };
    const replicasDir = path.join(dir, "replicas");
    const replicaDir = path.join(replicasDir, orphan.sourceId);
    try {
        if (!fs.lstatSync(replicasDir).isDirectory() || fs.lstatSync(replicasDir).isSymbolicLink() ||
            !fs.lstatSync(replicaDir).isDirectory() || fs.lstatSync(replicaDir).isSymbolicLink()) {
            return { ok: false, error: "unavailable" };
        }
    } catch (_) { return { ok: false, error: "unavailable" }; }
    const replica = require("./exportIngress").ingestWatchedSlot(replicaDir, { sourceId: orphan.sourceId });
    if (!replica || replica.status !== "replica" || !replica.identity ||
        replica.identity.sourceId !== orphan.sourceId || replica.identity.sourceSlot !== orphan.remoteSlot) {
        return { ok: false, error: "slot-mismatch" };
    }
    if (replica.identity.careerId !== trusted.get(orphan.sourceId).careerId) {
        return { ok: false, error: "career-mismatch" };
    }
    return {
        ok: true, sourceId: orphan.sourceId, remoteSlot: orphan.remoteSlot,
        careerId: trusted.get(orphan.sourceId).careerId,
        keyId: trusted.get(orphan.sourceId).keyId,
        revision: active.revision, digest: digestOf(active.bytes), rows: active.rows,
        row: {
            id: orphan.sourceId,
            name: `Multiplayer save (${orphan.remoteSlot})`,
            mode: "local",
            localPath: dir,
            localSubFolder: orphan.remoteSlot,
            replicaRemoteSlot: orphan.remoteSlot,
            replicaRegistration: { remoteSlot: orphan.remoteSlot, sessionPairing: orphan.sessionPairing },
        },
    };
}

const RECOVERY_REQUEST = "replicaRecoveryRequest.xml";
const RECOVERY_PROOF = "replicaRecoveryProof.xml";
// A full game tick plus an explicit human Restore click must fit in the nonce window.
const RECOVERY_TTL_MS = 300000;

function recoveryFileNonce(filePath, rootName, fields) {
    try {
        const stat = fs.lstatSync(filePath);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2048) return null;
        let text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "").trim();
        text = text.replace(/^<\?xml\s+version="1\.0"(?:\s+encoding="[A-Za-z0-9._-]+")?(?:\s+standalone="(?:yes|no)")?\s*\?>\s*/, "");
        const name = rootName === "request" ? "farmDashboardRecoveryRequest" : "farmDashboardRecoveryProof";
        const root = new RegExp(`^<${name}(\\s[^<>]*?)\\s*\\/>$`).exec(text) ||
            new RegExp(`^<${name}(\\s[^<>]*?)>\\s*<\\/${name}>$`).exec(text);
        const attrs = root && parseAttrs(root[1], fields);
        return attrs && /^[a-f0-9]{32}$/.test(attrs.nonce) ? attrs.nonce : null;
    } catch (_) { return null; }
}

function retireRecoveryChallenge(profileDir, challenge) {
    if (!challenge || !/^[a-f0-9]{32}$/.test(challenge.nonce)) return { ok: false, error: "changed" };
    const dir = registrationDir(profileDir);
    const files = [
        [RECOVERY_REQUEST, "request", ["schema", "nonce", "sourceId", "careerId", "remoteSlot", "keyId"]],
        [RECOVERY_PROOF, "proof", ["nonce", "sourceId", "careerId", "remoteSlot", "keyId", "sessionKey", "proof"]],
    ];
    for (const [name, kind, fields] of files) {
        const filePath = path.join(dir, name);
        try {
            const before = fs.lstatSync(filePath);
            if (!before.isFile() || before.isSymbolicLink() || before.size > 2048 ||
                recoveryFileNonce(filePath, kind, fields) !== challenge.nonce) continue;
            const current = fs.lstatSync(filePath);
            if (current.ino !== before.ino || current.size !== before.size || current.mtimeMs !== before.mtimeMs ||
                recoveryFileNonce(filePath, kind, fields) !== challenge.nonce) continue;
            fs.unlinkSync(filePath);
        } catch (_) { /* absent, replaced, or locked: never touch unrelated data */ }
    }
    return { ok: true };
}

function readRecoveryProof(filePath) {
    try {
        const stat = fs.lstatSync(filePath);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2048) return null;
        let text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "").trim();
        text = text.replace(/^<\?xml\s+version="1\.0"(?:\s+encoding="[A-Za-z0-9._-]+")?(?:\s+standalone="(?:yes|no)")?\s*\?>\s*/, "");
        const root = /^<farmDashboardRecoveryProof(\s[^<>]*?)\s*\/>$/.exec(text) ||
            /^<farmDashboardRecoveryProof(\s[^<>]*?)>\s*<\/farmDashboardRecoveryProof>$/.exec(text);
        if (!root) return null;
        const attrs = parseAttrs(root[1], ["nonce", "sourceId", "careerId", "remoteSlot", "keyId", "sessionKey", "proof"]);
        if (!attrs || Object.keys(attrs).sort().join(",") !== "careerId,keyId,nonce,proof,remoteSlot,sessionKey,sourceId") return null;
        return attrs;
    } catch (_) { return null; }
}

function startRecoveryChallenge(profileDir, candidate, now = Date.now()) {
    if (!candidate || !candidate.ok || !Number.isSafeInteger(now)) return { ok: false, error: "changed" };
    const dir = registrationDir(profileDir);
    try {
        if (fs.lstatSync(dir).isSymbolicLink()) return { ok: false, error: "unavailable" };
        const oldProof = path.join(dir, RECOVERY_PROOF);
        if (fs.existsSync(oldProof)) {
            const stat = fs.lstatSync(oldProof);
            if (!stat.isFile() || stat.isSymbolicLink()) return { ok: false, error: "unavailable" };
            fs.unlinkSync(oldProof);
        }
        const nonce = crypto.randomBytes(16).toString("hex");
        const challenge = { nonce, sourceId: candidate.sourceId, careerId: candidate.careerId,
            remoteSlot: candidate.remoteSlot, keyId: candidate.keyId, expiresAt: now + RECOVERY_TTL_MS,
            digest: candidate.digest, revision: candidate.revision };
        const xml = `<farmDashboardRecoveryRequest schema="1" nonce="${nonce}" sourceId="${challenge.sourceId}" careerId="${challenge.careerId}" remoteSlot="${challenge.remoteSlot}" keyId="${challenge.keyId}"/>`;
        writeVerified(path.join(dir, RECOVERY_REQUEST), xml);
        return { ok: true, challenge };
    } catch (_) { return { ok: false, error: "write-failed" }; }
}

function verifyRecoveryChallenge(profileDir, candidate, challenge, now = Date.now()) {
    if (!candidate || !candidate.ok || !challenge || !Number.isSafeInteger(now) || now >= challenge.expiresAt ||
        challenge.digest !== candidate.digest || challenge.revision !== candidate.revision ||
        challenge.sourceId !== candidate.sourceId || challenge.careerId !== candidate.careerId ||
        challenge.remoteSlot !== candidate.remoteSlot || challenge.keyId !== candidate.keyId) {
        return { ok: false, error: now >= (challenge && challenge.expiresAt) ? "expired" : "changed" };
    }
    const dir = registrationDir(profileDir);
    const trust = readTrustedSourceIds(path.join(dir, "replicaTrust.xml"));
    const entry = trust && trust.get(candidate.sourceId);
    if (!entry || entry.careerId !== candidate.careerId || entry.keyId !== candidate.keyId) return { ok: false, error: "untrusted" };
    const response = readRecoveryProof(path.join(dir, RECOVERY_PROOF));
    if (!response) return { ok: false, error: "waiting" };
    // A completed proof from the previous nonce may still be visible while the current
    // game update is pending. It is not evidence against the new challenge.
    if (response.nonce !== challenge.nonce) return { ok: false, error: "waiting" };
    if (response.sourceId !== candidate.sourceId ||
        response.careerId !== candidate.careerId || response.remoteSlot !== candidate.remoteSlot ||
        response.keyId !== candidate.keyId || !validKey(response.sessionKey) || !/^[a-f0-9]{64}$/.test(response.proof)) {
        return { ok: false, error: "mismatch" };
    }
    const message = ["FDPAIR1", "recover", challenge.nonce, candidate.sourceId,
        candidate.careerId, candidate.remoteSlot, response.sessionKey, candidate.keyId].join("|");
    const expected = crypto.createHmac("sha256", Buffer.from(entry.key, "hex")).update(message).digest();
    const supplied = Buffer.from(response.proof, "hex");
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
        return { ok: false, error: "invalid-proof" };
    }
    return { ok: true, sessionPairing: response.sessionKey };
}

function beginOrphanAdoption(profileDir, servers, expected, challenge) {
    const dir = registrationDir(profileDir);
    const lock = lockProfile(dir);
    if (!lock) return { ok: false, error: "registration-busy" };
    try {
        const current = detectOrphanLinkedSource(profileDir, servers);
        if (!current.ok || !expected || current.digest !== expected.digest ||
            current.revision !== expected.revision || current.sourceId !== expected.sourceId ||
            current.remoteSlot !== expected.remoteSlot) return { ok: false, error: "changed" };
        const verified = verifyRecoveryChallenge(profileDir, current, challenge);
        if (!verified.ok) return verified;
        if (current.revision >= Number.MAX_SAFE_INTEGER) return { ok: false, error: "revision-overflow" };
        const row = { ...current.row, replicaRegistration: {
            remoteSlot: current.remoteSlot, sessionPairing: verified.sessionPairing,
        } };
        const previous = validateSnapshot(servers);
        const intended = validateSnapshot([...servers, row]);
        if (!previous.ok || !intended.ok || current.rows.length !== intended.rows.length ||
            current.rows.some((old) => !intended.rows.some((next) => next.sourceId === old.sourceId && next.remoteSlot === old.remoteSlot &&
                (old.sourceId === current.sourceId || old.sessionPairing === next.sessionPairing)))) {
            return { ok: false, error: "conflict" };
        }
        const bytes = fs.readFileSync(path.join(dir, ACTIVE_NAME));
        if (digestOf(bytes) !== current.digest) return { ok: false, error: "changed" };
        const intendedBytes = Buffer.from(renderRegistrationXml(intended.rows, current.revision + 1), "utf8");
        const journal = {
            version: 3, kind: "repair-orphan", id: crypto.randomBytes(16).toString("hex"), phase: "prepared",
            previousExists: true, previousRevision: current.revision, intendedRevision: current.revision + 1,
            previousRows: current.rows, previousAppRows: previous.rows, intendedRows: intended.rows,
            previousDigest: current.digest, intendedDigest: digestOf(intendedBytes),
            previousLength: bytes.length, intendedLength: intendedBytes.length, backup: RECOVERY_NAME,
        };
        writeVerified(path.join(dir, RECOVERY_NAME), bytes);
        writeVerified(journalPath(dir), JSON.stringify(journal));
        writeVerified(path.join(dir, ACTIVE_NAME), intendedBytes);
        journal.phase = "published-pending-commit";
        writeVerified(journalPath(dir), JSON.stringify(journal));
        return { ok: true, adoption: true, profileDir, transactionId: journal.id, rows: intended.rows, row };
    } catch (_) {
        return { ok: false, error: "write-failed" };
    } finally {
        unlockProfile(lock);
    }
}

function reconcileRegistrationTransaction(profileDir, servers) {
    const dir = registrationDir(profileDir);
    const lock = lockProfile(dir);
    if (!lock) return { ok: false, error: "registration-busy" };
    try {
        const loaded = readJournal(dir);
        if (!loaded) return { ok: true, pending: false };
        if (!loaded.ok) return { ok: false, error: "recovery-required" };
        const applied = applyRecoveryDecision(dir, loaded.record, servers);
        return applied.ok ? { ...applied, pending: false } : applied;
    } finally {
        unlockProfile(lock);
    }
}

function publishReplicaRegistration(profileDir, servers) {
    const checked = validateSnapshot(servers);
    if (!checked.ok) return checked;
    const dir = registrationDir(profileDir);
    const lock = lockProfile(dir);
    if (!lock) return { ok: false, error: "registration-busy" };
    const filePath = path.join(dir, ACTIVE_NAME);
    try {
        fs.mkdirSync(dir, { recursive: true });
        const current = existingFileState(filePath);
        if (current.state === "damaged") return { ok: false, error: "damaged", path: filePath };
        if (readJournal(dir)) return { ok: false, error: "recovery-required", path: filePath };
        if (!Number.isSafeInteger(current.revision) || current.revision >= Number.MAX_SAFE_INTEGER) {
            return { ok: false, error: "revision-overflow", path: filePath };
        }
        const revision = current.revision + 1;
        const xml = renderRegistrationXml(checked.rows, revision);
        const xmlBytes = Buffer.from(xml, "utf8");
        const previousExists = current.state === "valid";
        const journal = {
            version: 1,
            id: crypto.randomBytes(16).toString("hex"),
            phase: "prepared",
            previousExists,
            previousRevision: current.revision || 0,
            intendedRevision: revision,
            previousRows: previousExists ? current.rows : [],
            intendedRows: checked.rows,
            previousDigest: previousExists ? digestOf(current.bytes) : null,
            intendedDigest: digestOf(xmlBytes),
            previousLength: previousExists ? current.bytes.length : 0,
            intendedLength: xmlBytes.length,
            backup: RECOVERY_NAME,
        };
        if (previousExists) writeVerified(path.join(dir, RECOVERY_NAME), current.bytes);
        writeVerified(journalPath(dir), JSON.stringify(journal));
        writeVerified(filePath, xmlBytes);
        journal.phase = "published-pending-commit";
        writeVerified(journalPath(dir), JSON.stringify(journal));
        return { ok: true, path: filePath, revision, xml, rows: checked.rows, profileDir, transactionId: journal.id };
    } catch (error) {
        return { ok: false, error: error && error.code ? error.code : "write-failed", path: filePath };
    } finally {
        unlockProfile(lock);
    }
}

function ownedTransaction(published) {
    if (!published || typeof published.profileDir !== "string" || typeof published.transactionId !== "string") {
        return { ok: false, error: "stale-transaction" };
    }
    if (published.profileDir.includes("..") || published.transactionId.includes("..")) {
        return { ok: false, error: "stale-transaction" };
    }
    const dir = registrationDir(published.profileDir);
    const loaded = readJournal(dir);
    if (!loaded || !loaded.ok) return { ok: false, error: "recovery-required" };
    if (loaded.record.id !== published.transactionId) return { ok: false, error: "stale-transaction" };
    return { ok: true, dir, record: loaded.record };
}

function restoreRegistrationPublication(published) {
    const owned = ownedTransaction(published);
    if (!owned.ok) return owned;
    const lock = lockProfile(owned.dir);
    if (!lock) return { ok: false, error: "registration-busy" };
    try {
        const current = ownedTransaction(published);
        if (!current.ok) return current;
        const active = existingFileState(path.join(current.dir, ACTIVE_NAME));
        if (!snapshotMatches(active, intendedSpec(current.record))) {
            return { ok: false, error: "recovery-required" };
        }
        if (current.record.kind === "adopt-orphan") {
            return finishCleanup(current.dir, current.record, "restored-cleanup");
        }
        return installPrevious(current.dir, current.record);
    } finally {
        unlockProfile(lock);
    }
}

function commitRegistrationPublication(published) {
    const owned = ownedTransaction(published);
    if (!owned.ok) return owned;
    const lock = lockProfile(owned.dir);
    if (!lock) return { ok: false, error: "registration-busy" };
    try {
        const current = ownedTransaction(published);
        if (!current.ok) return current;
        const active = existingFileState(path.join(current.dir, ACTIVE_NAME));
        if (!snapshotMatches(active, intendedSpec(current.record))) {
            return { ok: false, error: "recovery-required" };
        }
        return finishCleanup(current.dir, current.record, "committed-cleanup");
    } finally {
        unlockProfile(lock);
    }
}

module.exports = {
    MAX_ROWS,
    MAX_DOCUMENT_BYTES,
    validId,
    validKey,
    registrationFromServer,
    validateSnapshot,
    sameRegistration,
    parseRegistrationDocument,
    renderRegistrationXml,
    publishReplicaRegistration,
    restoreRegistrationPublication,
    commitRegistrationPublication,
    reconcileRegistrationTransaction,
    detectOrphanLinkedSource,
    beginOrphanAdoption,
    sameRegistrationMembers,
    startRecoveryChallenge,
    verifyRecoveryChallenge,
    retireRecoveryChallenge,
};
