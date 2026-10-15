"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const ts = require(require.resolve("typescript", { paths: [path.join(__dirname, "../../NEW APP")] }));
const { encodeEnvelope } = require("../exportEnvelope");
const { readExportDirectorySync } = require("../exportIngress");
const { recordIngress } = require("../ingressOrchestration");
const { applyFreshnessMeta } = require("../uxContract.cjs");
const { createBoundSourcePublication } = require("../boundSourcePublication.cjs");

function loadUiFunction(file) {
  const source = fs.readFileSync(path.join(__dirname, "../../NEW APP/src/lib", file), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function("module", "exports", code)(module, module.exports);
  return module.exports;
}

const { readHealthClock } = loadUiFunction("health-clock.ts");
const { resolveNavbarConnectionBadge } = loadUiFunction("connection-badge.ts");

function fixture(t, at) {
  const root = fs.mkdtempSync(path.join(__dirname, ".farmdash-v5-health-clock-"));
  t.after(() => {
    assert.equal(path.dirname(root), __dirname);
    assert.match(path.basename(root), /^\.farmdash-v5-health-clock-/);
    fs.rmSync(root, { recursive: true, force: true });
  });
  const career = path.join(root, "career-a");
  fs.mkdirSync(career);
  const payload = { fields: [{ id: 1 }], vehicles: [{ id: "tractor" }] };
  const slot = path.join(career, "slot-a.xml");
  fs.writeFileSync(slot, encodeEnvelope(JSON.stringify(payload), {
    careerId: "career-a", sessionId: "session-a", publicationSequence: 4,
    exportGeneration: 4, simulationTimeMs: 1000,
  }));
  fs.writeFileSync(path.join(root, "active.xml"),
    '<farmDashboardRoute schema="1" careerId="career-a" sessionId="session-a" publicationSequence="4" slot="a" persistence="saved" sourceSlot="savegame1"/>');
  fs.utimesSync(slot, at, at);
  return { root, payload };
}

function readAuthority(root, trustedLocalClock = true) {
  return readExportDirectorySync(root, {
    sourceId: "local-savegame1", configuredSlot: "savegame1", trustedLocalClock,
  });
}

test("generation 4 keeps its game export time through held republish and cold reopen", (t) => {
  const exportMs = Math.floor((Date.now() - 11 * 60_000) / 1000) * 1000;
  const exportAt = new Date(exportMs).toISOString();
  const xmlCollectedAt = new Date(exportMs + 10 * 60_000).toISOString();
  const reopenAt = new Date(exportMs + 11 * 60_000).toISOString();
  const { root } = fixture(t, new Date(exportMs));
  const ingress = readAuthority(root);
  assert.equal(ingress.status, "valid");
  assert.equal(ingress.identity.exportGeneration, 4);
  assert.equal(ingress.identity.committedAt, exportAt);

  const live = { active: true, activationGeneration: 1 };
  recordIngress(live, ingress.payload, ingress.identity, new Date(exportMs + 5000).toISOString());
  assert.equal(live.lastLuaReceivedAt, exportAt);
  const livePayload = applyFreshnessMeta({ dataSource: "merged", luaAvailable: true, xmlAvailable: true }, {
    lastLuaAt: live.lastLuaReceivedAt, nowMs: exportMs + 5000,
    nowIso: new Date(exportMs + 5000).toISOString(),
  });
  assert.equal(livePayload.dataTimestamps.confidence, "live");
  assert.equal(resolveNavbarConnectionBadge({ ...livePayload,
    stateStatus: "snapshot", dataTimestamps: livePayload.dataTimestamps,
    nowMs: exportMs + 5000 }).kind, "live");

  // Reopening creates new app state and a new publication, but no new game export.
  const reopened = { active: true, activationGeneration: 1 };
  const oldGeneration = readAuthority(root);
  recordIngress(reopened, oldGeneration.payload, oldGeneration.identity, reopenAt);
  assert.equal(reopened.lastLuaReceivedAt, exportAt);
  const heldPayload = applyFreshnessMeta({ dataSource: "merged", luaAvailable: true, xmlAvailable: true }, {
    lastLuaAt: reopened.lastLuaReceivedAt, lastXmlAt: xmlCollectedAt,
    nowMs: Date.parse(reopenAt), nowIso: reopenAt,
  });
  assert.equal(heldPayload.dataTimestamps.confidence, "held");
  const bound = createBoundSourcePublication({
    sameBinding: () => true, now: () => new Date(reopenAt), randomId: () => "binding-a",
  });
  bound.beginActivation([{ id: "local-savegame1", enabled: true }], 1);
  bound.attach("local-savegame1", reopened, 1);
  const publication = bound.publish("local-savegame1", reopened, 1, heldPayload);
  assert.equal(publication.sourceBinding.stateStatus, "held");
  assert.equal(publication.sourceBinding.exportIdentity.exportGeneration, 4);
  assert.equal(publication.sourceBinding.publishedAt, reopenAt);
  const visible = { ...publication.payload, sourceBinding: publication.sourceBinding };
  const clock = readHealthClock(visible);
  assert.equal(clock.lastExportAt, exportAt);
  assert.equal(clock.xmlCollectedAt, xmlCollectedAt);
  assert.equal(clock.publishedAt, reopenAt);
  const badge = resolveNavbarConnectionBadge({
    ...visible, stateStatus: publication.sourceBinding.stateStatus,
    dataTimestamps: visible.dataTimestamps, nowMs: Date.parse(reopenAt),
  });
  assert.equal(badge.kind, "snap");
  assert.equal(badge.labelKey, "ux.freshness.held");
});

test("first run has no fabricated export, XML collection, or compatibility result", () => {
  assert.deepEqual(readHealthClock(null), {
    lastExportAt: null, xmlCollectedAt: null, publishedAt: null, compatibility: "unchecked",
  });
  const receivedAt = new Date().toISOString();
  const noExport = readHealthClock({
    dataTimestamps: { fetchedAt: receivedAt },
    sourceBinding: { publishedAt: receivedAt },
    diagnostics: { compatible: true },
  });
  assert.equal(noExport.lastExportAt, null);
  assert.equal(noExport.publishedAt, receivedAt);
  assert.equal(noExport.compatibility, "unchecked");
  assert.equal(readHealthClock({
    dataTimestamps: { lastLuaReceivedAt: receivedAt },
    diagnostics: { compatible: true, modVersion: "5.0", gameVersion: "1.0" },
  }).compatibility, "compatible");
  assert.equal(readHealthClock({
    dataTimestamps: { lastLuaReceivedAt: receivedAt },
    diagnostics: { compatible: true, modVersion: "5.0", missingDependencies: [] },
    modVersionCheck: { status: "ok" },
  }).compatibility, "compatible");
  assert.equal(readHealthClock({
    dataTimestamps: { lastLuaReceivedAt: receivedAt },
    diagnostics: { compatible: true, modVersion: "5.0.0.30", missingDependencies: {} },
    modVersionCheck: { status: "ok" },
  }).compatibility, "compatible");
  assert.equal(readHealthClock({
    dataTimestamps: { lastLuaReceivedAt: receivedAt },
    diagnostics: { compatible: true, modVersion: "5.0.0.30", missingDependencies: { missing: true } },
    modVersionCheck: { status: "ok" },
  }).compatibility, "unchecked");
  assert.equal(resolveNavbarConnectionBadge({ dataSource: "unknown",
    luaAvailable: false, xmlAvailable: false, apiConnected: true }).kind, "connecting");
});

test("untrusted slot clocks stay unconfirmed; a new committed generation can advance unchanged content", (t) => {
  const firstMs = Math.floor((Date.now() - 30_000) / 1000) * 1000;
  const { root } = fixture(t, new Date(firstMs));
  const untrusted = readAuthority(root, false);
  assert.equal(untrusted.identity.committedAt, null);
  const cold = {};
  recordIngress(cold, untrusted.payload, untrusted.identity, new Date(firstMs + 1000).toISOString());
  assert.equal(cold.lastLuaReceivedAt, null);

  const first = readAuthority(root);
  const state = {};
  recordIngress(state, first.payload, first.identity, new Date(firstMs + 1000).toISOString());
  const nextAt = new Date(firstMs + 10_000).toISOString();
  recordIngress(state, first.payload, {
    ...first.identity, publicationSequence: 5, exportGeneration: 5, committedAt: nextAt,
  }, new Date(firstMs + 11_000).toISOString());
  assert.equal(state.lastLuaReceivedAt, nextAt);
});
