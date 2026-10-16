"use strict";

const crypto = require("crypto");
const path = require("path");
const { isLuaExportStale, LUA_EXPORT_STALE_MS } = require("./liveExportFreshness");

function contentHash(data) {
    const producedAt = data && (data.collectedAt || (data.serverInfo && data.serverInfo.collectedAt) || data.exportGeneratedAt) || null;
    return crypto.createHash("sha256").update(JSON.stringify({
        collectedAt: producedAt,
        animals: data && data.animals,
        vehicles: data && data.vehicles,
        fields: data && data.fields,
        production: data && data.production,
        stock: data && data.stock,
        finance: data && data.finance,
    })).digest("hex");
}

function sourceProducedAt(data, observedAt) {
    const candidate = data && (data.collectedAt || (data.serverInfo && data.serverInfo.collectedAt) || data.exportGeneratedAt);
    if (typeof candidate !== "string") return null;
    const producedMs = Date.parse(candidate);
    const observedMs = Date.parse(observedAt);
    if (!Number.isFinite(producedMs) || producedMs <= 0 || !Number.isFinite(observedMs)
        || producedMs > observedMs + 1000) return null;
    return new Date(producedMs).toISOString();
}

function recordIngress(state, data, transport, nowIso) {
    const previous = state.exportIdentity;
    const sessionChanged = !!(
        transport && previous && transport.sessionId && previous.sessionId
        && previous.sessionId !== transport.sessionId
    );
    const careerChanged = !!(
        transport && previous && transport.careerId && previous.careerId
        && (previous.careerId !== transport.careerId || previous.sourceId !== transport.sourceId)
    );
    const replicaContextChanged = !!(
        transport && transport.replica === true && previous && previous.replica === true
        && (previous.sourceSlot !== transport.sourceSlot
            || String(previous.connectionEpoch ?? "") !== String(transport.connectionEpoch ?? ""))
    );
    if (careerChanged || sessionChanged || replicaContextChanged) {
        state.lastGoodMergedSnapshot = null;
        state.luaData = null;
        state.lastLuaContentHash = null;
        state.lastLuaCommitKey = null;
        state.lastLuaReceivedAt = null;
    }
    if (transport) {
        const freshness = transport.freshness || (state.exportIdentity && state.exportIdentity.freshness);
        state.exportIdentity = {
            ...transport,
            freshness,
            replica: transport.replica === true,
            authoritative: transport.replica === true ? false : transport.authoritative === true,
        };
    }
    state.luaData = data;
    const stamp = nowIso || new Date().toISOString();
    state.lastLuaReceiptAt = stamp;
    const hash = contentHash(data || {});
    const replica = transport && transport.replica === true;
    const modernLocal = !replica && transport && transport.legacy === false
        && transport.careerId && transport.sessionId
        && Number.isInteger(Number(transport.publicationSequence)) && Number(transport.publicationSequence) > 0
        && Number.isInteger(Number(transport.exportGeneration)) && Number(transport.exportGeneration) > 0;
    const hadPreviousLocalHash = typeof state.lastLuaContentHash === "string";
    const commitKey = replica && transport.sourceId && transport.careerId && transport.sessionId
        && transport.publicationSequence != null && transport.exportGeneration != null && transport.payloadProof
        ? JSON.stringify([transport.sourceId, transport.sourceSlot || null,
            transport.connectionEpoch || null, transport.careerId, transport.sessionId,
            transport.publicationSequence, transport.exportGeneration, transport.payloadProof])
        : modernLocal ? JSON.stringify([transport.sourceId, transport.careerId, transport.sessionId,
            transport.publicationSequence, transport.exportGeneration]) : null;
    const committedMs = replica && commitKey ? Date.parse(transport.committedAt || "") : NaN;
    const committedTimeValid = Number.isFinite(committedMs) && committedMs > 0 && committedMs <= Date.now() + 1000;
    const heldReplica = replica && transport.ingressStatus === "last-known";
    if (replica && (!committedTimeValid || heldReplica)) state.lastLuaReceivedAt = null;
    if (!replica && !modernLocal) state.lastLuaReceivedAt = null;
    if (state.lastLuaCommitKey !== commitKey || state.lastLuaContentHash !== hash) {
        state.lastLuaContentHash = hash;
        state.lastLuaCommitKey = commitKey;
        state.lastLuaReceivedAt = replica
            ? (committedTimeValid && !heldReplica ? new Date(committedMs).toISOString() : null)
            : (modernLocal ? (sourceProducedAt(data, stamp)
                || sourceProducedAt({ collectedAt: transport.committedAt }, stamp)
                || (hadPreviousLocalHash ? stamp : null)) : null);
    }
    if (replica && !state.lastLuaReceivedAt && state.exportIdentity) {
        state.exportIdentity.freshness = "unconfirmed";
    }
    return state.exportIdentity || null;
}

function projectStatus(ident, tracker) {
    if (!ident) return {};
    let freshness = ident.freshness || null;
    let aged = null;
    if (tracker && typeof tracker.classify === "function" && ident.sourceId && ident.careerId) {
        aged = tracker.classify(ident.sourceId, ident.careerId);
    }
    if (ident.replica === true) {
        const committedMs = Date.parse(ident.committedAt || "");
        if (!Number.isFinite(committedMs) || committedMs <= 0 || committedMs > Date.now() + 1000) {
            freshness = "unconfirmed";
        } else if (freshness === "live") {
            if (isLuaExportStale(ident.committedAt, Date.now(), LUA_EXPORT_STALE_MS) || aged === "stale") {
                freshness = "stale";
            } else if (aged && aged !== "live") {
                freshness = "unconfirmed";
            }
        }
        if (!freshness) freshness = "unconfirmed";
    } else if (aged) {
        freshness = aged;
    }
    return {
        careerId: ident.careerId || null,
        publicationSequence: ident.publicationSequence || null,
        exportGeneration: ident.exportGeneration || null,
        freshness,
        persistence: ident.persistence || null,
        replica: ident.replica === true,
        authoritative: ident.replica === true ? false : ident.authoritative === true,
        readiness: ident.legacy ? "identity-unconfirmed" : (freshness || "unconfirmed"),
        progress: freshness === "live" ? "progressing" : freshness,
    };
}

function replicaDirFor(basePath, sourceId) {
    if (!basePath || !sourceId) return null;
    return path.join(basePath, "replicas", String(sourceId));
}

module.exports = {
    contentHash,
    recordIngress,
    projectStatus,
    replicaDirFor,
};
