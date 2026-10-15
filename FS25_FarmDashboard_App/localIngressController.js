"use strict";

const path = require("path");
const ingressOrchestration = require("./ingressOrchestration");

const REPLICA_FILES = ["selected.xml", "slot-a.xml", "slot-b.xml", "selection-a.xml", "selection-b.xml"];

function remoteSlotFor(srv) {
    const registration = srv && srv.replicaRegistration;
    if (registration && typeof registration.remoteSlot === "string" && registration.remoteSlot.trim()) {
        return registration.remoteSlot.trim();
    }
    if (srv && typeof srv.replicaRemoteSlot === "string" && srv.replicaRemoteSlot.trim()) {
        return srv.replicaRemoteSlot.trim();
    }
    return null;
}

function resolveTargets(srv, parts) {
    const basePath = parts && parts.basePath;
    const localFolder = parts && parts.folderName;
    const sourceId = srv && srv.id != null ? String(srv.id) : "";
    const replicaDir = ingressOrchestration.replicaDirFor(basePath, sourceId);
    const authorityDir = basePath && localFolder ? path.join(basePath, localFolder) : null;
    return {
        basePath,
        localFolder,
        sourceId,
        remoteSlot: remoteSlotFor(srv),
        replicaDir,
        authorityDir,
        authorityXml: authorityDir ? path.join(authorityDir, "active.xml") : null,
        authorityJson: authorityDir ? path.join(authorityDir, "data.json") : null,
    };
}

function replicaFilesReady(replicaDir, existsSync) {
    if (!replicaDir || typeof existsSync !== "function") return false;
    for (const name of REPLICA_FILES) {
        try {
            if (existsSync(path.join(replicaDir, name))) return true;
        } catch (error) {
            /* keep checking the other fixed names */
        }
    }
    return false;
}

function selectIngress(srv, parts, existsSync) {
    const targets = resolveTargets(srv, parts);
    if (srv && srv.replicaRegistration) {
        if (!targets.remoteSlot) {
            return { kind: "replica", dir: null, reason: "configuration-required", targets };
        }
        if (replicaFilesReady(targets.replicaDir, existsSync)) {
            return {
                kind: "replica",
                dir: targets.replicaDir,
                configuredSlot: targets.remoteSlot,
                targets,
            };
        }
        return { kind: "none", dir: null, reason: "replica-unavailable", targets };
    }
    const authorityReady = !!(targets.authorityXml && existsSync(targets.authorityXml));
    if (authorityReady) {
        return {
            kind: "authority",
            dir: targets.authorityDir,
            configuredSlot: targets.remoteSlot || targets.localFolder,
            targets,
        };
    }
    if (replicaFilesReady(targets.replicaDir, existsSync)) {
        if (!targets.remoteSlot) {
            return { kind: "replica", dir: null, reason: "configuration-required", targets };
        }
        return {
            kind: "replica",
            dir: targets.replicaDir,
            configuredSlot: targets.remoteSlot,
            targets,
        };
    }
    return { kind: "none", dir: null, targets };
}

function allowRawLegacy(srv, selected) {
    return !!(srv && srv.legacyJson === true && selected && selected.kind === "none");
}

function chooseIngressDir(authorityReady, replicaReady, replicaDir, slotDir) {
    if (authorityReady) return slotDir;
    if (replicaReady) return replicaDir;
    return slotDir;
}

function transportForIngress(ingress, sourceId) {
    const identity = (ingress && ingress.identity) || {};
    const replica = identity.replica === true || ingress.replica === true;
    return {
        ...identity,
        freshness: ingress && ingress.freshness,
        ingressStatus: ingress && ingress.status,
        sourceId: String(sourceId),
        replica,
        authoritative: replica ? false : ingress && ingress.authoritative,
    };
}

function applyWatchedIngress(state, srv, ingress, processLuaData) {
    if (!state || !srv || !ingress || !ingress.payload || typeof processLuaData !== "function") return false;
    if (ingress.status !== "valid" && ingress.status !== "identity-unconfirmed" && ingress.status !== "last-known" && ingress.status !== "replica") {
        return false;
    }
    state.exportIngress = ingress;
    processLuaData(srv.id, JSON.stringify(ingress.payload), transportForIngress(ingress, srv.id));
    return true;
}

module.exports = {
    REPLICA_FILES,
    remoteSlotFor,
    resolveTargets,
    replicaFilesReady,
    selectIngress,
    allowRawLegacy,
    chooseIngressDir,
    transportForIngress,
    applyWatchedIngress,
};
