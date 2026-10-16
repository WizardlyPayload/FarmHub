// FS25 FarmDashboard | pendingReplicaSession.cjs
// Reads the joined client's "Link this server?" record (FarmDashboardReplicaPairing.lua) and builds the
// desktop source row the user approves. The session token stays in the main process: publicView drops it.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const PENDING_FILE = "replicaPending.xml";
const MAX_BYTES = 4096;
const ROOT = "farmDashboardPendingSession";
const FIELDS = ["schema", "pendingId", "serverKey", "careerId", "sourceSlot", "mapTitle", "serverName", "check"];
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const KEY = /^[A-Za-z0-9_-]{1,128}$/;
const HEX16 = /^[0-9a-f]{16}$/;
const MAX_LABEL_BYTES = 80;
// Matches FarmDashboardReplicaPairing.MAX_TRUST: every linked server keeps a renewal key on the game side.
const MAX_LINKED_SERVERS = 16;

function validId(value) {
    return typeof value === "string" && ID.test(value) && !value.includes("..");
}

function validKey(value) {
    return typeof value === "string" && KEY.test(value) && !value.includes("..");
}

function validLabel(value) {
    if (typeof value !== "string") return false;
    if (Buffer.byteLength(value, "utf8") > MAX_LABEL_BYTES) return false;
    return !/[\u0000-\u001f\u007f"<>&]/.test(value);
}

function adler32(text) {
    const bytes = Buffer.from(text, "utf8");
    let a = 1;
    let b = 0;
    for (const byte of bytes) {
        a = (a + byte) % 65521;
        b = (b + a) % 65521;
    }
    return b * 65536 + a;
}

function pendingCheck(fields) {
    const text = [fields.schema, fields.pendingId, fields.serverKey, fields.careerId, fields.sourceSlot, fields.mapTitle, fields.serverName].join("|");
    return String(adler32(text));
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

/** Strict parse: one self-closing root, the fixed attribute set once each, valid values, matching checksum. */
function parsePendingDocument(text) {
    if (typeof text !== "string") return { ok: false, error: "unreadable" };
    if (Buffer.byteLength(text, "utf8") > MAX_BYTES) return { ok: false, error: "too-large" };
    const body = text.replace(/^\uFEFF/, "").replace(/^\s*<\?xml[^?]*\?>/, "").trim();
    const match = new RegExp(`^<${ROOT}((?:\\s+[A-Za-z]+="[^"<]*")*)\\s*/>$`).exec(body)
        || new RegExp(`^<${ROOT}((?:\\s+[A-Za-z]+="[^"<]*")*)\\s*>\\s*</${ROOT}>$`).exec(body);
    if (!match) return { ok: false, error: "malformed" };
    const fields = {};
    const attrRe = /\s+([A-Za-z]+)="([^"<]*)"/g;
    let attr;
    while ((attr = attrRe.exec(match[1])) !== null) {
        const name = attr[1];
        if (!FIELDS.includes(name)) return { ok: false, error: "unexpected-field" };
        if (Object.prototype.hasOwnProperty.call(fields, name)) return { ok: false, error: "duplicate-field" };
        const value = decodeAttr(attr[2]);
        if (value == null) return { ok: false, error: "malformed" };
        fields[name] = value;
    }
    for (const name of FIELDS) {
        if (!Object.prototype.hasOwnProperty.call(fields, name)) return { ok: false, error: "missing-field" };
    }
    if (fields.schema !== "1") return { ok: false, error: "schema" };
    if (!HEX16.test(fields.pendingId) || !validKey(fields.serverKey) || !validId(fields.careerId) || !validId(fields.sourceSlot)) {
        return { ok: false, error: "invalid-field" };
    }
    if (!validLabel(fields.mapTitle) || !validLabel(fields.serverName)) return { ok: false, error: "invalid-field" };
    if (fields.check !== pendingCheck(fields)) return { ok: false, error: "check" };
    return { ok: true, session: fields };
}

function pendingPathFor(profileRoot) {
    return path.join(profileRoot, "modSettings", "FS25_FarmDashboard", PENDING_FILE);
}

function dashboardRootFor(profileRoot) {
    return path.join(profileRoot, "modSettings", "FS25_FarmDashboard");
}

/** { state: "none" } | { state: "invalid", error } | { state: "pending", session } (session includes serverKey). */
async function readPendingSession(profileRoot) {
    if (!profileRoot) return { state: "unavailable" };
    const file = pendingPathFor(profileRoot);
    let handle;
    try {
        handle = await fs.promises.open(file, "r");
    } catch (error) {
        if (error && error.code === "ENOENT") return { state: "none" };
        return { state: "unavailable" };
    }
    try {
        const stat = await handle.stat();
        if (!stat.isFile()) return { state: "invalid", error: "not-a-file" };
        if (stat.size > MAX_BYTES) return { state: "invalid", error: "too-large" };
        const buffer = Buffer.alloc(stat.size);
        await handle.read(buffer, 0, stat.size, 0);
        const parsed = parsePendingDocument(buffer.toString("utf8"));
        if (!parsed.ok) return { state: "invalid", error: parsed.error };
        return { state: "pending", session: parsed.session };
    } catch (_error) {
        return { state: "unavailable" };
    } finally {
        await handle.close().catch(() => {});
    }
}

function publicView(session) {
    if (!session) return null;
    return {
        pendingId: session.pendingId,
        careerId: session.careerId,
        sourceSlot: session.sourceSlot,
        mapTitle: session.mapTitle,
        serverName: session.serverName,
    };
}

function newSourceId(existingIds) {
    const taken = new Set(existingIds || []);
    for (;;) {
        const id = `mp-${crypto.randomBytes(6).toString("hex")}`;
        if (!taken.has(id)) return id;
    }
}

/**
 * The desktop source for an approved session. Source ID is generated locally, never derived from the career
 * or any value in the record, so two servers that claim the same career keep separate folders.
 */
function approvedServerRow(session, profileRoot, existingServers, fallbackName) {
    const servers = Array.isArray(existingServers) ? existingServers : [];
    let linked = 0;
    for (const server of servers) {
        const registration = server && server.replicaRegistration;
        if (!registration || typeof registration !== "object") continue;
        linked += 1;
        if (registration.sessionPairing === session.serverKey) {
            return { ok: false, error: "already-linked", sourceId: String(server.id) };
        }
    }
    if (linked >= MAX_LINKED_SERVERS) return { ok: false, error: "link-limit" };
    const id = newSourceId(servers.map((s) => s && String(s.id)));
    const name = session.serverName || session.mapTitle || fallbackName || "Multiplayer server";
    return {
        ok: true,
        row: {
            id,
            name,
            mode: "local",
            localPath: dashboardRootFor(profileRoot),
            localSubFolder: session.sourceSlot,
            replicaRemoteSlot: session.sourceSlot,
            replicaRegistration: { remoteSlot: session.sourceSlot, sessionPairing: session.serverKey },
        },
    };
}

module.exports = {
    PENDING_FILE,
    MAX_BYTES,
    MAX_LINKED_SERVERS,
    FIELDS,
    pendingCheck,
    parsePendingDocument,
    pendingPathFor,
    readPendingSession,
    publicView,
    approvedServerRow,
};
