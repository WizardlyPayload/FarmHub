"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Writable } = require("stream");

const LOCAL_LIMIT = 8192;
const PROPOSAL_LIMIT = 512;
const COUNT_MAX = 2147483647;
const NAMESPACE = /^[a-f0-9]{16}$/;
const IDENTITY_NAMES = ["identity-ready.xml", "allocator-a.xml", "allocator-b.xml", "identity-provision.xml"];
const SCHEMAS = Object.assign(Object.create(null), {
    identityProvision: { required: ["version", "namespace"] },
    identityReady: { required: ["namespace", "revision"] },
    allocator: { required: ["namespace", "highWater", "revision"] },
});

function canonicalCount(text) {
    if (typeof text !== "string" || !/^(0|[1-9][0-9]*)$/.test(text)) return null;
    if (text.length > 10) return null;
    const value = Number(text);
    if (!Number.isSafeInteger(value) || value < 0 || value > COUNT_MAX) return null;
    return value;
}

function parseIdentityDocument(text, expectedRoot) {
    if (typeof text !== "string" || text.length === 0 || text.includes("<!")) return null;
    let index = 0;
    const skipSpace = () => {
        while (index < text.length && " \t\n\r".includes(text[index])) index += 1;
    };
    skipSpace();
    if (text.startsWith("<?", index)) {
        const declaration = /^<\?xml version="1\.0" encoding="utf-8"(?: standalone="no")?\?>/.exec(text.slice(index));
        if (!declaration) return null;
        index += declaration[0].length;
        skipSpace();
    }
    if (text[index] !== "<") return null;
    index += 1;
    const rootMatch = /^[A-Za-z][A-Za-z0-9]*/.exec(text.slice(index));
    if (!rootMatch) return null;
    const root = rootMatch[0];
    if (!Object.prototype.hasOwnProperty.call(SCHEMAS, root)) return null;
    const schema = SCHEMAS[root];
    if (!schema || (expectedRoot && root !== expectedRoot)) return null;
    index += root.length;
    const attrs = {};
    let closed = false;
    while (index < text.length) {
        if (text[index] === "/" && text[index + 1] === ">") {
            index += 2;
            closed = true;
            break;
        }
        if (!" \t\n\r".includes(text[index])) return null;
        skipSpace();
        if (text[index] === "/" && text[index + 1] === ">") {
            index += 2;
            closed = true;
            break;
        }
        const nameMatch = /^[A-Za-z][A-Za-z0-9]*/.exec(text.slice(index));
        if (!nameMatch || !schema.required.includes(nameMatch[0]) || Object.prototype.hasOwnProperty.call(attrs, nameMatch[0])) {
            return null;
        }
        index += nameMatch[0].length;
        if (text[index] !== "=" || text[index + 1] !== "\"") return null;
        index += 2;
        const end = text.indexOf("\"", index);
        if (end < 0) return null;
        const value = text.slice(index, end);
        if (value.includes("&") || value.includes("<")) return null;
        attrs[nameMatch[0]] = value;
        index = end + 1;
    }
    if (!closed) return null;
    skipSpace();
    if (index !== text.length) return null;
    if (schema.required.some((name) => !Object.prototype.hasOwnProperty.call(attrs, name))) return null;
    if (root === "identityProvision" && attrs.version !== "1") return null;
    if (!NAMESPACE.test(attrs.namespace)) return null;
    const record = { root, namespace: attrs.namespace };
    if (Object.prototype.hasOwnProperty.call(attrs, "revision")) {
        record.revision = canonicalCount(attrs.revision);
        if (record.revision == null) return null;
    }
    if (Object.prototype.hasOwnProperty.call(attrs, "highWater")) {
        record.highWater = canonicalCount(attrs.highWater);
        if (record.highWater == null) return null;
    }
    return record;
}

function readBounded(file, limit) {
    let handle = null;
    try {
        handle = fs.openSync(file, "r");
    } catch (error) {
        if (error && error.code === "ENOENT") return { state: "absent" };
        return { state: "unreadable" };
    }
    let outcome = { state: "unreadable" };
    try {
        const buffer = Buffer.alloc(limit + 1);
        let filled = 0;
        while (filled <= limit) {
            const requested = (limit + 1) - filled;
            const read = fs.readSync(handle, buffer, filled, requested, filled);
            if (typeof read !== "number" || !Number.isInteger(read) || read < 0 || read > requested) {
                outcome = { state: "unreadable" };
                break;
            }
            if (read === 0) {
                if (filled === 0) {
                    outcome = { state: "invalid" };
                } else {
                    try {
                        const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, filled));
                        outcome = text.length === 0 ? { state: "invalid" } : { state: "text", text };
                    } catch (error) {
                        outcome = { state: "invalid" };
                    }
                }
                break;
            }
            filled += read;
            if (filled > limit) {
                outcome = { state: "unreadable" };
                break;
            }
        }
    } catch (error) {
        outcome = { state: "unreadable" };
    }
    try {
        fs.closeSync(handle);
    } catch (error) {
        outcome = { state: "unreadable" };
    }
    return outcome;
}

function readIdentityFile(file, root, limit) {
    const loaded = readBounded(file, limit);
    if (loaded.state !== "text") return loaded;
    const record = parseIdentityDocument(loaded.text, root);
    if (!record) return { state: "invalid" };
    return { state: "valid", record };
}

function classify(file) {
    return readIdentityFile(file, null, LOCAL_LIMIT);
}

function publishNoReplace(file, body) {
    const tmp = file + "." + process.pid + "." + crypto.randomBytes(4).toString("hex") + ".tmp";
    fs.mkdirSync(path.dirname(file), { recursive: true });
    let fd = null;
    let owned = false;
    let outcome = null;
    try {
        fd = fs.openSync(tmp, "wx");
        owned = true;
        const payload = Buffer.from(body, "utf8");
        let offset = 0;
        while (offset < payload.length) {
            const wrote = fs.writeSync(fd, payload, offset, payload.length - offset);
            if (wrote <= 0) {
                const error = new Error("short-write");
                error.code = "EIO";
                throw error;
            }
            offset += wrote;
        }
        fs.closeSync(fd);
        fd = null;
        try {
            fs.linkSync(tmp, file);
            outcome = "published";
        } catch (error) {
            if (!(error && error.code === "EEXIST")) throw error;
            outcome = "exists";
        }
    } catch (error) {
        outcome = error;
    } finally {
        if (fd != null) {
            try { fs.closeSync(fd); } catch (_) { /* closure attempted before owned cleanup */ }
            fd = null;
        }
        if (owned) {
            try {
                fs.unlinkSync(tmp);
            } catch (cleanupError) {
                if (!(cleanupError && cleanupError.code === "ENOENT") && !(outcome instanceof Error)) {
                    outcome = Object.assign(new Error("stage-cleanup-failed"), { code: "EIO" });
                }
            }
        }
    }
    if (outcome instanceof Error) throw outcome;
    return outcome;
}

function adoptedDecision(ready, slotA, slotB) {
    const present = [ready, slotA, slotB].filter((item) => item.state !== "absent");
    if (present.length === 0) return null;
    if (present.some((item) => item.state !== "valid")) return { status: "recovery-needed" };
    if (ready.state === "valid" && slotA.state === "absent" && slotB.state === "absent") {
        return { status: "recovery-needed" };
    }
    let namespace = null;
    let revision = 0;
    let sawAllocator = false;
    for (const slot of [slotA, slotB]) {
        if (slot.state !== "valid") continue;
        if (namespace != null && namespace !== slot.record.namespace) return { status: "recovery-needed" };
        namespace = slot.record.namespace;
        if (!sawAllocator || slot.record.revision > revision) revision = slot.record.revision;
        sawAllocator = true;
    }
    if (ready.state === "valid") {
        if (namespace != null && ready.record.namespace !== namespace) return { status: "recovery-needed" };
        if (!sawAllocator || ready.record.revision > revision) return { status: "recovery-needed" };
        namespace = namespace || ready.record.namespace;
    }
    if (!namespace) return { status: "recovery-needed" };
    return { status: "adopted-readonly", namespace };
}

/**
 * Propose a namespace for one selected dashboard root.
 * A valid ready or allocator file is read-only. Damaged adopted state is not replaced.
 * Creating the proposal file is not an exclusive claim against another writer.
 */
function ensureIdentityProposal(rootDir) {
    if (typeof rootDir !== "string" || rootDir.trim() === "") return { status: "refused" };
    let root = "";
    try {
        root = path.resolve(rootDir);
    } catch (error) {
        return { status: "recovery-needed" };
    }
    const ready = readIdentityFile(path.join(root, "identity-ready.xml"), "identityReady", LOCAL_LIMIT);
    const slotA = readIdentityFile(path.join(root, "allocator-a.xml"), "allocator", LOCAL_LIMIT);
    const slotB = readIdentityFile(path.join(root, "allocator-b.xml"), "allocator", LOCAL_LIMIT);
    const adopted = adoptedDecision(ready, slotA, slotB);
    if (adopted) return adopted;
    const proposalPath = path.join(root, "identity-provision.xml");
    const proposal = readIdentityFile(proposalPath, "identityProvision", LOCAL_LIMIT);
    if (proposal.state === "valid") return { status: "proposal-present", namespace: proposal.record.namespace };
    if (proposal.state !== "absent") return { status: "recovery-needed" };
    const namespace = crypto.randomBytes(8).toString("hex");
    const body = `<?xml version="1.0" encoding="utf-8"?>\n<identityProvision version="1" namespace="${namespace}"/>\n`;
    let published = "failed";
    try {
        published = publishNoReplace(proposalPath, body);
    } catch (error) {
        published = "failed";
    }
    const adoptedNow = adoptedDecision(
        readIdentityFile(path.join(root, "identity-ready.xml"), "identityReady", LOCAL_LIMIT),
        readIdentityFile(path.join(root, "allocator-a.xml"), "allocator", LOCAL_LIMIT),
        readIdentityFile(path.join(root, "allocator-b.xml"), "allocator", LOCAL_LIMIT),
    );
    if (adoptedNow) return adoptedNow;
    const written = readIdentityFile(proposalPath, "identityProvision", LOCAL_LIMIT);
    if (written.state === "valid") {
        if (published === "published" && written.record.namespace === namespace) return { status: "proposed", namespace };
        return { status: "proposal-present", namespace: written.record.namespace };
    }
    if (written.state === "absent") return { status: "proposal-failed" };
    return { status: "recovery-needed" };
}

function listingDecision(listed) {
    if (!Array.isArray(listed)) return { status: "remote-unknown" };
    const present = new Set();
    const seen = new Set();
    for (const entry of listed) {
        if (!entry || typeof entry.name !== "string" || entry.name === "" || seen.has(entry.name)) {
            return { status: "remote-unknown" };
        }
        seen.add(entry.name);
        if (!IDENTITY_NAMES.includes(entry.name)) continue;
        const directory = entry.type === 2 || entry.type === "d" || entry.type === "dir" || entry.isDirectory === true;
        const file = entry.type === 1 || entry.type === "file" || entry.isDirectory === false;
        if (directory || !file) return { status: "remote-unknown" };
        present.add(entry.name);
    }
    return { present };
}

/**
 * One owned readback. The transfer promise and the sink both report tagged
 * outcomes, so a rejection is observed immediately and never left pending.
 * Success is a finished sink after a completed transfer. Close without finish
 * is an incomplete readback.
 */
function readProposalDownload(client, remotePath) {
    const chunks = [];
    let readBytes = 0;
    let sinkState = "pending";
    let sealed = false;
    let wakeSink = () => {};
    const sinkReady = new Promise((resolve) => {
        wakeSink = resolve;
    });
    const sink = new Writable({
        write(chunk, _enc, callback) {
            const buf = Buffer.from(chunk);
            readBytes += buf.length;
            if (readBytes > PROPOSAL_LIMIT) {
                callback(new Error("proposal-too-large"));
                return;
            }
            chunks.push(buf);
            callback();
        },
    });
    const noteSink = (next) => {
        if (sinkState !== "pending") return;
        sinkState = next;
        wakeSink();
    };
    const onError = () => noteSink("failed");
    const onFinish = () => noteSink("finished");
    const onClose = () => noteSink("closed");
    sink.on("error", onError);
    sink.on("finish", onFinish);
    sink.on("close", onClose);
    const seal = () => {
        if (sealed) return;
        sealed = true;
        sink.removeListener("error", onError);
        sink.removeListener("finish", onFinish);
        sink.removeListener("close", onClose);
        sink.on("error", () => {});
        if (sinkState !== "finished" && !sink.destroyed) sink.destroy();
    };
    const transferDone = Promise.resolve()
        .then(() => client.downloadTo(sink, remotePath))
        .then(() => "ok", () => "failed");
    return transferDone.then(async (transferStatus) => {
        if (transferStatus !== "ok") {
            noteSink("failed");
            seal();
            return null;
        }
        if (sinkState === "pending") {
            if (sink.writableEnded) await sinkReady;
            else noteSink("failed");
        }
        const finished = sinkState === "finished";
        seal();
        if (!finished) return null;
        return Buffer.concat(chunks);
    });
}

/**
 * A completed empty listing is not a conditional create. basic-ftp uploadFrom can replace
 * a proposal that appears after the list, so a fresh remote root stays provisioning-required.
 * Already listed identity files are left untouched. Strict readback remains available for a
 * publication path that can actually create without replacement.
 */
async function publishIdentityProposalFtp(client, remoteDir) {
    if (!client || typeof client.list !== "function" || typeof remoteDir !== "string" || remoteDir.trim() === "") {
        return { status: "remote-unknown", uploads: 0 };
    }
    const root = remoteDir.replace(/\\/g, "/").replace(/\/$/, "");
    let listed = null;
    try {
        listed = await client.list(root);
    } catch (error) {
        return { status: "remote-unknown", uploads: 0 };
    }
    const decision = listingDecision(listed);
    if (decision.status) return { status: decision.status, uploads: 0 };
    const ready = decision.present.has("identity-ready.xml");
    const allocator = decision.present.has("allocator-a.xml") || decision.present.has("allocator-b.xml");
    const proposal = decision.present.has("identity-provision.xml");
    if (ready || allocator) return { status: "remote-present-not-replaced", uploads: 0 };
    if (proposal) return { status: "proposal-present", uploads: 0 };
    return { status: "provisioning-required", uploads: 0 };
}

module.exports = {
    ensureIdentityProposal,
    classify,
    publishIdentityProposalFtp,
    readProposalDownload,
    parseIdentityDocument,
};
