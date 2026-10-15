"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const ts = require("../../NEW APP/node_modules/typescript");
const { recordIngress } = require("../ingressOrchestration");
const { resolveLuaExportStaleMs } = require("../liveExportFreshness");

const badgeSource = fs.readFileSync(path.join(__dirname, "../../NEW APP/src/lib/connection-badge.ts"), "utf8");
const badgeCode = ts.transpileModule(badgeSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const badgeModule = { exports: {} };
new Function("module", "exports", badgeCode)(badgeModule, badgeModule.exports);
const { luaStaleRefreshDelayMs, resolveNavbarConnectionBadge } = badgeModule.exports;

test("modern local commit uses local freshness even with a five-minute FTP setting", () => {
  const now = Date.now();
  const exportAt = new Date(now - 60_000).toISOString();
  const state = {};
  recordIngress(state, { collectedAt: exportAt }, {
    legacy: false, replica: false, sourceId: "local-savegame4",
    careerId: "career-4", sessionId: "session-4",
    publicationSequence: 1, exportGeneration: 1,
  }, new Date(now).toISOString());

  assert.equal(typeof state.lastLuaCommitKey, "string");
  assert.equal(state.exportIdentity.replica, false);
  const staleMs = resolveLuaExportStaleMs(5, { mode: "local", replica: state.exportIdentity.replica });
  assert.equal(staleMs, 90_000);
  assert.equal(luaStaleRefreshDelayMs(exportAt, staleMs, now), 30_250);
  assert.equal(luaStaleRefreshDelayMs(exportAt, staleMs, now + 91_000), 0);

  const held = resolveNavbarConnectionBadge({
    dataSource: "merged", stateStatus: "held", luaAvailable: false, xmlAvailable: true,
    apiConnected: true, nowMs: now + 91_000,
    dataTimestamps: { lastLuaReceivedAt: exportAt, luaExportStaleMs: staleMs, confidence: "held" },
  });
  assert.equal(held.kind, "snap");
  assert.equal(held.labelKey, "ux.freshness.held");
});

test("dedicated FTP and paired replicas keep their longer cadence", () => {
  assert.equal(resolveLuaExportStaleMs(1, true), 300_000);
  assert.equal(resolveLuaExportStaleMs(1, false), 105_000);
  assert.equal(resolveLuaExportStaleMs(2, { mode: "ftp" }), 165_000);
  assert.equal(resolveLuaExportStaleMs(5, { mode: "ftp" }), 345_000);
  assert.equal(resolveLuaExportStaleMs(2, { mode: "local", replica: true }), 300_000);
  assert.equal(resolveLuaExportStaleMs(2, { mode: "ftp", replica: true }), 300_000);
});

test("ordinary XML-only saves keep their XML badge without a Lua deadline", () => {
  assert.equal(luaStaleRefreshDelayMs(undefined), null);
  const badge = resolveNavbarConnectionBadge({
    dataSource: "xml_only", xmlAvailable: true, luaAvailable: false,
    nowMs: Date.parse("2026-06-23T12:00:00.000Z"), dataTimestamps: {},
  });
  assert.equal(badge.kind, "snap");
  assert.equal(badge.labelKey, "nav.badgeSnapXml");
});
