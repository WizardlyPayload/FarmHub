"use strict";

const crypto = require("crypto");

const STATUSES = new Set(["pending", "snapshot", "held", "cache", "blocked"]);
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const boundStateOwners = new WeakMap();

function cloneVisible(value) {
  if (value == null) return null;
  return JSON.parse(JSON.stringify(value));
}

function freezeVisible(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeVisible(child);
  return Object.freeze(value);
}

// These are app transport clocks, not source commit evidence. Keep the original
// visible payload frozen; omit only these fields from the revision decision.
function revisionPayload(payload) {
  const comparable = cloneVisible(payload);
  if (!comparable || typeof comparable !== "object" || Array.isArray(comparable)) return comparable;
  delete comparable.transportTimestamp;
  delete comparable.responseTimestamp;
  delete comparable.lastUpdated;
  const ts = comparable.dataTimestamps;
  if (ts && typeof ts === "object" && !Array.isArray(ts)) {
    delete ts.lastCheckedAt;
    delete ts.lastReadAt;
    delete ts.lastPolledAt;
    delete ts.lastMergedAt;
    delete ts.mergeComputedAt;
    delete ts.fetchedAt;
  }
  return comparable;
}

function validatedExportIdentity(identity, sourceId) {
  if (!identity || identity.legacy === true || String(identity.sourceId || "") !== String(sourceId)) return null;
  const { careerId, sessionId, publicationSequence, exportGeneration } = identity;
  if (!SAFE_ID.test(String(careerId || "")) || !SAFE_ID.test(String(sessionId || ""))) return null;
  if (!Number.isSafeInteger(publicationSequence) || publicationSequence < 0
      || !Number.isSafeInteger(exportGeneration) || exportGeneration < 0) return null;
  return Object.freeze({ careerId, sessionId, publicationSequence, exportGeneration });
}

function hasValidatedReplicaForState(state) {
  const ingress = state?.exportIngress;
  const transport = state?.exportIdentity;
  const owner = state && boundStateOwners.get(state);
  const sourceId = owner?.sourceId;
  if (!sourceId || owner.generation !== state.activationGeneration
      || ingress?.status !== "replica" || ingress.replica !== true
      || ingress.legacy === true || !ingress.payload
      || transport?.ingressStatus !== "replica" || transport.replica !== true) return false;
  const selected = validatedExportIdentity(ingress.identity, sourceId);
  const applied = validatedExportIdentity(transport, sourceId);
  if (!selected || !applied) return false;
  const selectedSlot = ingress.identity?.configuredSlot;
  if (typeof selectedSlot !== "string" || !selectedSlot
      || selectedSlot !== transport.configuredSlot) return false;
  return selected.careerId === applied.careerId && selected.sessionId === applied.sessionId
    && selected.publicationSequence === applied.publicationSequence
    && selected.exportGeneration === applied.exportGeneration;
}

function statusForPayload(state, payload) {
  if (state?.active === false || state?.configWarning?.code === "configuration-required"
      || state?.configWarning?.code === "registration-recovery-required") return "blocked";
  // A missing authority folder is not an absent source when its separately
  // registered, validated replica is the selected ingress. Its actual
  // freshness metadata, not the absent authority directory, determines status.
  if (state?.configWarning?.code === "localSubFolderMissing") {
    if (!payload || !hasValidatedReplicaForState(state)) return "blocked";
  }
  if (!payload) return "pending";
  const ts = payload.dataTimestamps || {};
  if (ts.confidence === "cache" || ts.cacheUsedDueToFailure === true
      || ts.loadedFromDiskCacheAt || ts.source === "cache") return "cache";
  if (ts.confidence === "held" || ts.confidence === "stale" || ts.confidence === "unconfirmed"
      || ts.isStale === true || payload.isStale === true || payload.error
      || ts.heldFromSnapshotAt || ts.mergeHeldStaleAt
      || ts.liveSectionsHeldAt || ts.liveExportStaleAt) return "held";
  return "snapshot";
}

/** The asynchronous result still owns the exact bound state, not merely its source ID. */
function ownsOrigin(currentState, originState, activationGeneration) {
  return !!originState && currentState === originState && originState.active !== false
    && originState.activationGeneration === activationGeneration;
}

function createBoundSourcePublication({
  sameBinding,
  now = () => new Date(),
  randomId = () => crypto.randomUUID(),
} = {}) {
  if (typeof sameBinding !== "function") throw new TypeError("sameBinding is required");
  const records = new Map();
  const stamp = () => new Date(now()).toISOString();
  const binding = (row) => Object.freeze({
    bindingId: row.bindingId,
    stateRevision: row.stateRevision,
    stateStatus: row.stateStatus,
    publishedAt: row.publishedAt,
    exportIdentity: row.exportIdentity,
  });
  const event = (serverId, row, removed = false) => Object.freeze({
    type: "source-state", serverId, sourceBinding: binding(row), ...(removed ? { removed: true } : {}),
  });
  const snapshot = (serverId) => {
    const row = records.get(String(serverId));
    return row ? Object.freeze({ sourceBinding: binding(row), payload: row.payload, configWarning: row.configWarning }) : null;
  };
  const owns = (serverId, state, generation) => {
    const row = records.get(String(serverId));
    return !!row && !row.disabled && row.owner === state && row.generation === generation
      && ownsOrigin(state, row.owner, generation);
  };
  const transition = (row, stateStatus, payload, exportIdentity, warning) => {
    const identity = exportIdentity || null;
    const fingerprint = JSON.stringify([stateStatus, identity, revisionPayload(payload), warning == null ? null : warning]);
    if (row.fingerprint === fingerprint) return false;
    const visible = freezeVisible(cloneVisible(payload));
    const configWarning = freezeVisible(cloneVisible(warning));
    row.stateRevision += 1;
    row.stateStatus = stateStatus;
    row.publishedAt = stamp();
    row.exportIdentity = identity;
    row.payload = visible;
    row.configWarning = configWarning;
    row.fingerprint = fingerprint;
    return true;
  };

  function beginActivation(servers, generation) {
    const previous = new Map(records);
    records.clear();
    const events = [];
    for (const server of Array.isArray(servers) ? servers : []) {
      if (!server || server.id == null) continue;
      const id = String(server.id);
      if (records.has(id)) continue;
      const prior = previous.get(id);
      const retained = !!prior && sameBinding(prior.privateConfig, server);
      const stateStatus = server.enabled === false ? "blocked" : "pending";
      const row = {
        bindingId: retained ? prior.bindingId : randomId(),
        stateRevision: retained ? prior.stateRevision + 1 : 1,
        stateStatus,
        publishedAt: stamp(),
        exportIdentity: null,
        payload: null,
        configWarning: null,
        fingerprint: JSON.stringify([stateStatus, null, null, null]),
        owner: null,
        generation,
        // Internal comparison only; never returned, logged, hashed into a public ID, or persisted.
        privateConfig: cloneVisible(server),
        disabled: server.enabled === false,
      };
      records.set(id, row);
      events.push(event(id, row));
    }
    for (const [id, prior] of previous) {
      if (records.has(id)) continue;
      events.push(event(id, {
        ...prior, stateRevision: prior.stateRevision + 1,
        stateStatus: "blocked", publishedAt: stamp(), exportIdentity: null, payload: null, configWarning: null,
      }, true));
    }
    return events;
  }

  function attach(serverId, state, generation) {
    const row = records.get(String(serverId));
    if (!row || row.generation !== generation || !state || state.activationGeneration !== generation) return false;
    row.owner = state;
    boundStateOwners.set(state, { sourceId: String(serverId), generation });
    const status = statusForPayload(state, null);
    return status === "blocked" ? transition(row, "blocked", null, null, state.configWarning) : false;
  }

  function publish(serverId, state, generation, payload, status = statusForPayload(state, payload)) {
    if (!owns(serverId, state, generation) || !STATUSES.has(status)) return null;
    const row = records.get(String(serverId));
    const identity = validatedExportIdentity(state.exportIdentity, serverId);
    const changed = transition(row, status, status === "pending" || status === "blocked" ? null : payload,
      identity, state.configWarning);
    return Object.freeze({ changed, ...snapshot(serverId) });
  }

  function clearOwned(state, status = "pending") {
    if (status !== "pending" && status !== "blocked") return null;
    for (const [id, row] of records) {
      if (row.owner !== state || !owns(id, state, state.activationGeneration)) continue;
      const changed = transition(row, status, null, null, state.configWarning);
      return Object.freeze({ changed, serverId: id, ...snapshot(id) });
    }
    return null;
  }

  return Object.freeze({ beginActivation, attach, publish, clearOwned, owns, snapshot });
}

module.exports = { createBoundSourcePublication, ownsOrigin, statusForPayload, validatedExportIdentity };
