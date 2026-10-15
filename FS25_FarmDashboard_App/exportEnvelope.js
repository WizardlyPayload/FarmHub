"use strict";

const { XMLParser, XMLValidator } = require("fast-xml-parser");

const SCHEMA = 2;
const MAX_DECODED = 8 * 1024 * 1024;
const MAX_ENCODED = 11184812;
const MAX_WIRE = 12 * 1024 * 1024;
const XML_INT_MAX = 2147483647;
const MAX_ID = 64;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    parseAttributeValue: false,
    parseTagValue: false,
    trimValues: false,
    processEntities: false,
    htmlEntities: false,
    allowBooleanAttributes: false,
});

function adler32(buffer) {
    let a = 1;
    let b = 0;
    for (let i = 0; i < buffer.length; i += 1) {
        a = (a + buffer[i]) % 65521;
        b = (b + a) % 65521;
    }
    return String(b * 65536 + a);
}

function encodeBase64(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length > MAX_DECODED) return null;
    return buffer.toString("base64");
}

function decodeCanonicalBase64(text) {
    if (typeof text !== "string") return null;
    if (text === "") return Buffer.alloc(0);
    if (text.length % 4 !== 0 || text.length > MAX_ENCODED) return null;
    let padding = 0;
    for (let i = 0; i < text.length; i += 1) {
        const ch = text[i];
        if (ch === "=") {
            if (i < text.length - 2) return null;
            padding += 1;
        } else if (padding > 0 || ALPHABET.indexOf(ch) < 0) {
            return null;
        }
    }
    if (padding > 2) return null;
    const outLen = (text.length / 4) * 3 - padding;
    if (outLen > MAX_DECODED) return null;
    const bytes = Buffer.alloc(outLen);
    let at = 0;
    for (let q = 0; q < text.length; q += 4) {
        const c1 = ALPHABET.indexOf(text[q]);
        const c2 = ALPHABET.indexOf(text[q + 1]);
        const c3raw = text[q + 2];
        const c4raw = text[q + 3];
        if (c1 < 0 || c2 < 0) return null;
        const last = q + 4 === text.length;
        let c3 = 0;
        let c4 = 0;
        if (c3raw !== "=") {
            c3 = ALPHABET.indexOf(c3raw);
            if (c3 < 0) return null;
        } else if (!last || c4raw !== "=") return null;
        if (c4raw !== "=") {
            c4 = ALPHABET.indexOf(c4raw);
            if (c4 < 0) return null;
        } else if (!last) return null;
        if (last && padding === 2 && (c2 % 16) !== 0) return null;
        if (last && padding === 1 && (c3 % 4) !== 0) return null;
        const triple = (c1 * 262144) + (c2 * 4096) + (c3 * 64) + c4;
        bytes[at] = (triple >> 16) & 255;
        at += 1;
        if (c3raw !== "=") {
            bytes[at] = (triple >> 8) & 255;
            at += 1;
        }
        if (c4raw !== "=") {
            bytes[at] = triple & 255;
            at += 1;
        }
    }
    if (encodeBase64(bytes) !== text) return null;
    return bytes;
}

function validId(value) {
    return typeof value === "string" && value.length > 0 && value.length <= MAX_ID && /^[\w-]+$/.test(value) && !value.includes("..");
}

function fieldInt(value, minimum, maximum) {
    if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
    if (value.length > 1 && value.startsWith("0")) return null;
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < minimum || number > maximum) return null;
    return number;
}

// Game-native XML starts with one UTF-8 BOM. The fatal decoder drops exactly one leading BOM from
// Buffers, so strings (fs utf8 reads) drop exactly one too. Size limits apply to the raw wire first.
function asUtf8(input) {
    if (Buffer.isBuffer(input)) {
        if (input.length > MAX_WIRE) {
            const error = new Error("wire-limit");
            error.code = "wire-limit";
            throw error;
        }
        return new TextDecoder("utf-8", { fatal: true }).decode(input);
    }
    if (typeof input === "string") {
        if (Buffer.byteLength(input, "utf8") > MAX_WIRE) {
            const error = new Error("wire-limit");
            error.code = "wire-limit";
            throw error;
        }
        return input.charCodeAt(0) === 0xFEFF ? input.slice(1) : input;
    }
    const error = new Error("bad-input");
    error.code = "bad-input";
    throw error;
}

function result(status, reason, extra) {
    return Object.assign({ status, reason: reason || null }, extra || {});
}

function openingAttributes(xml) {
    const match = xml.match(/<farmDashboardExport\b([^>]*)\/?>/);
    if (!match) return { error: "malformed" };
    const body = match[1];
    const seen = new Set();
    const fields = {};
    const attr = /([A-Za-z][\w-]*)\s*=\s*"([^"]*)"/g;
    let found = attr.exec(body);
    while (found) {
        if (seen.has(found[1])) return { error: "duplicate-attribute" };
        seen.add(found[1]);
        fields[found[1]] = found[2];
        found = attr.exec(body);
    }
    return { fields };
}

function decodeRecord(fields, allowSchema1) {
    if (fields.schema === "1" && allowSchema1) {
        return result("diagnostic", "schema-1", {
            record: {
                schema: 1,
                careerId: fields.career || null,
                sessionId: fields.session || null,
                publicationSequence: fieldInt(String(fields.generation || ""), 0, XML_INT_MAX),
                simulationTimeMs: fields.exportedAt || null,
                bytes: fieldInt(String(fields.bytes || ""), 0, MAX_DECODED),
                crc: fields.crc || null,
                encoding: fields.encoding || null,
            },
            payload: decodeCanonicalBase64(fields.payload || ""),
        });
    }
    if (fields.schema !== "2" || fields.encoding !== "base64") return result("corrupt", "unsupported");
    if (!validId(fields.careerId) || !validId(fields.sessionId)) return result("identity-unconfirmed", "identity");
    const sequence = fieldInt(fields.publicationSequence, 1, XML_INT_MAX);
    const generation = fieldInt(fields.exportGeneration, 0, XML_INT_MAX);
    const bytes = fieldInt(fields.bytes, 0, MAX_DECODED);
    if (sequence == null || generation == null || bytes == null) return result("corrupt", "bad-counter");
    if (fields.simulationTimeMs !== "unknown" && fieldInt(fields.simulationTimeMs, 0, 999999999999999) == null) {
        return result("corrupt", "bad-clock");
    }
    if (typeof fields.payload !== "string" || fields.payload.length > MAX_ENCODED) return result("corrupt", "wire-limit");
    const payload = decodeCanonicalBase64(fields.payload);
    if (!payload || payload.length !== bytes || adler32(payload) !== fields.crc) return result("corrupt", "checksum");
    let json = null;
    let gameplay = false;
    if (payload.length === 0) {
        return result("valid", "empty-payload", {
            record: recordFrom(fields, sequence, generation, bytes),
            payload,
            json: null,
            gameplay: false,
        });
    }
    let text;
    try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(payload);
        json = JSON.parse(text, (key, value) => {
            if (key === "__proto__" || key === "constructor" || key === "prototype") {
                const error = new Error("prototype-pollution");
                error.code = "prototype-pollution";
                throw error;
            }
            return value;
        });
    } catch (error) {
        const reason = error && error.code === "prototype-pollution" ? "prototype-pollution" : "json";
        return result("corrupt", reason, { payload });
    }
    if (json === null || typeof json !== "object" || Array.isArray(json)) {
        return result("corrupt", "json", { payload });
    }
    gameplay = generation > 0;
    return result("valid", gameplay ? "live-candidate" : "startup", {
        record: recordFrom(fields, sequence, generation, bytes),
        payload,
        json,
        gameplay,
    });
}

function recordFrom(fields, sequence, generation, bytes) {
    return {
        schema: 2,
        careerId: fields.careerId,
        sessionId: fields.sessionId,
        publicationSequence: sequence,
        exportGeneration: generation,
        simulationTimeMs: fields.simulationTimeMs,
        encoding: "base64",
        bytes,
        crc: fields.crc,
    };
}

function duplicateAttributes(xml) {
    const start = xml.indexOf("<farmDashboardExport");
    if (start < 0) return false;
    const end = xml.indexOf(">", start);
    if (end < 0) return false;
    const body = xml.slice(start, end);
    const seen = new Set();
    const attr = /([A-Za-z][\w-]*)\s*=\s*(?:"[^"]*"|'[^']*')/g;
    let found = attr.exec(body);
    while (found) {
        if (seen.has(found[1])) return true;
        seen.add(found[1]);
        found = attr.exec(body);
    }
    return false;
}

function fieldsFromRoot(root) {
    if (!root || typeof root !== "object" || Array.isArray(root)) return { error: "malformed" };
    const fields = {};
    for (const key of Object.keys(root)) {
        if (key === "#text" && String(root[key]).trim() === "") continue;
        if (!key.startsWith("@_")) return { error: "malformed" };
        fields[key.slice(2)] = String(root[key]);
    }
    return { fields };
}

function decodeEnvelope(input, expectedContext) {
    const context = expectedContext || {};
    let xml;
    try {
        xml = asUtf8(input);
    } catch (error) {
        return result("corrupt", error.code === "wire-limit" ? "wire-limit" : "utf8");
    }
    if (xml.includes("<!") || xml.includes("&")) return result("corrupt", xml.includes("<!") ? "dtd" : "entity");
    const trimmed = xml.trim();
    if (!trimmed.startsWith("<?xml") && !trimmed.startsWith("<farmDashboardExport")) {
        return result("corrupt", "malformed");
    }
    const without = xml
        .replace(/<\?xml[\s\S]*?\?>/, "")
        .replace(/<farmDashboardExport\b[^>]*\/>/, "")
        .replace(/<farmDashboardExport\b[^>]*>[\s\S]*?<\/farmDashboardExport>/, "");
    if (without.includes("<")) return result("corrupt", "multiple-roots");
    if (duplicateAttributes(xml)) return result("corrupt", "duplicate-attribute");
    if (XMLValidator.validate(xml, { allowBooleanAttributes: false, processEntities: false }) !== true) {
        return result("corrupt", "malformed");
    }
    let parsed;
    try {
        parsed = parser.parse(xml);
    } catch (error) {
        return result("corrupt", "malformed");
    }
    const keys = Object.keys(parsed || {}).filter((key) => key !== "?xml");
    if (keys.length !== 1 || keys[0] !== "farmDashboardExport") return result("corrupt", "malformed");
    const opened = fieldsFromRoot(parsed.farmDashboardExport);
    if (opened.error) return result("corrupt", opened.error);
    const decoded = decodeRecord(opened.fields, context.allowDiagnosticSchema1 === true);
    if (decoded.status !== "valid" && decoded.status !== "diagnostic") return decoded;
    if (context.careerId && decoded.record.careerId !== context.careerId) {
        return result("identity-unconfirmed", "career", { record: decoded.record });
    }
    return decoded;
}

function encodeEnvelope(payload, context) {
    const bytes = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), "utf8");
    if (bytes.length > MAX_DECODED) return null;
    const tick = context.simulationTimeMs == null ? "unknown" : String(context.simulationTimeMs);
    const fields = {
        schema: "2",
        careerId: context.careerId,
        sessionId: context.sessionId,
        publicationSequence: String(context.publicationSequence),
        exportGeneration: String(context.exportGeneration),
        simulationTimeMs: tick,
        encoding: "base64",
        bytes: String(bytes.length),
        crc: adler32(bytes),
        payload: encodeBase64(bytes),
    };
    const names = ["schema", "careerId", "sessionId", "publicationSequence", "exportGeneration", "simulationTimeMs", "encoding", "bytes", "crc", "payload"];
    const body = names.map((name) => `${name}="${fields[name]}"`).join(" ");
    return `<farmDashboardExport ${body}/>`;
}

function recordOf(item) {
    return (item && item.record) || item || {};
}

function payloadOf(item) {
    if (!item) return null;
    if (item.payload) return item.payload;
    return item.record ? item.record.payload : null;
}

function sameRecord(left, right) {
    const a = recordOf(left);
    const b = recordOf(right);
    const leftPayload = payloadOf(left);
    const rightPayload = payloadOf(right);
    return a.sessionId === b.sessionId
        && a.careerId === b.careerId
        && a.exportGeneration === b.exportGeneration
        && a.simulationTimeMs === b.simulationTimeMs
        && a.crc === b.crc
        && a.publicationSequence === b.publicationSequence
        && leftPayload && rightPayload && leftPayload.equals(rightPayload);
}

function selectEnvelopeCandidates(candidates, expectedContext) {
    const context = expectedContext || {};
    if (!validId(context.careerId)) return result("identity-unconfirmed", "identity");
    const grouped = new Map();
    let sawUnknown = false;
    let sawUnreadable = false;
    let sawNonGameplay = false;
    for (const candidate of candidates || []) {
        if (!candidate || candidate.presence === "absent") continue;
        if (candidate.presence === "unknown") {
            sawUnknown = true;
            continue;
        }
        if (candidate.presence === "unreadable") {
            sawUnreadable = true;
            continue;
        }
        if (candidate.status && candidate.status !== "valid") continue;
        if (candidate.gameplay === false || (candidate.record && candidate.record.bytes === 0)) {
            sawNonGameplay = true;
            continue;
        }
        const record = candidate.record;
        if (!record || record.careerId !== context.careerId || record.schema !== 2) continue;
        if (record.exportGeneration === 0) {
            sawNonGameplay = true;
            continue;
        }
        const list = grouped.get(record.publicationSequence) || [];
        list.push(candidate);
        grouped.set(record.publicationSequence, list);
    }
    const sequences = Array.from(grouped.keys()).sort((left, right) => right - left);
    if (sequences.length === 0) {
        if (sawUnreadable) return result("unreadable", "unreadable");
        if (sawUnknown) return result("unknown", "unknown");
        if (sawNonGameplay) return result("invalid", "empty-payload");
        const generation = context.exportGeneration;
        if (context.legacyJson && context.legacyCompatible === true && Number.isInteger(generation) && generation > 0) {
            return result("legacy", "data-json", { json: context.legacyJson, gameplay: true });
        }
        if (generation === 0) return result("startup", "generation-0");
        return result("absent", "none");
    }
    const top = grouped.get(sequences[0]);
    for (let i = 1; i < top.length; i += 1) {
        if (!sameRecord(top[0], top[i])) {
            return result("conflict", "equal-sequence", { retained: context.lastAccepted || null });
        }
    }
    if (top.length > 1) return result("redundant", "identical", { selected: top[0] });
    return result("valid", "selected", { selected: top[0] });
}

function createFreshnessTracker(options) {
    const now = options.now;
    const staleAfterMs = options.staleAfterMs;
    const sources = new Map();
    function key(sample) {
        return `${sample.sourceId}|${sample.careerId}`;
    }
    return {
        observe(sample) {
            const id = key(sample);
            const current = sources.get(id) || {
                confirmed: false,
                sequence: null,
                progressAt: null,
                firstAt: now(),
            };
            if (sample.corrupt === true || sample.exportGeneration === 0 || sample.gameplay === false || sample.empty === true) {
                sources.set(id, current);
                return current.exportGeneration === 0 || sample.exportGeneration === 0 ? "startup" : "unconfirmed";
            }
            if (current.sequence == null) {
                current.sequence = sample.publicationSequence;
                current.progressAt = now();
                current.confirmed = false;
                sources.set(id, current);
                return "unconfirmed";
            }
            if (sample.publicationSequence > current.sequence) {
                current.sequence = sample.publicationSequence;
                current.progressAt = now();
                current.confirmed = true;
                sources.set(id, current);
                return "live";
            }
            sources.set(id, current);
            return null;
        },
        classify(sourceId, careerId) {
            const current = sources.get(`${sourceId}|${careerId}`);
            if (!current) return "absent";
            if (current.sequence == null) return "startup";
            if (!current.confirmed) return "unconfirmed";
            if (typeof current.progressAt === "number" && now() - current.progressAt >= staleAfterMs) return "stale";
            return "live";
        },
        forget(sourceId) {
            for (const id of Array.from(sources.keys())) {
                if (id.startsWith(`${sourceId}|`)) sources.delete(id);
            }
        },
    };
}

module.exports = {
    SCHEMA,
    MAX_DECODED,
    MAX_ENCODED,
    MAX_WIRE,
    adler32,
    encodeBase64,
    decodeCanonicalBase64,
    decodeEnvelope,
    encodeEnvelope,
    selectEnvelopeCandidates,
    createFreshnessTracker,
};
