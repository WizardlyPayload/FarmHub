import test from "node:test";
import assert from "node:assert/strict";
import { resolveNavbarConnectionBadge } from "../web/assests/js/modules/environment.js";

const NOW = Date.parse("2026-06-23T12:00:00.000Z");

test("resolveNavbarConnectionBadge shows Live API when lua export is fresh for this save", () => {
  const badge = resolveNavbarConnectionBadge({
    dataSource: "merged",
    luaAvailable: true,
    xmlAvailable: true,
    apiConnected: true,
    nowMs: NOW,
    dataTimestamps: {
      lastLuaReceivedAt: "2026-06-23T11:59:30.000Z",
      liveExportStaleAt: "2026-06-23T11:00:00.000Z",
    },
  });
  assert.equal(badge.labelKey, "nav.badgeLiveApi");
  assert.ok(badge.badgeClasses.includes("bg-success"));
});

test("resolveNavbarConnectionBadge shows Snap XML when lua export is stale even if apiConnected", () => {
  const badge = resolveNavbarConnectionBadge({
    dataSource: "merged",
    luaAvailable: true,
    xmlAvailable: true,
    apiConnected: true,
    nowMs: NOW,
    dataTimestamps: { lastLuaReceivedAt: "2026-06-23T11:58:00.000Z" },
  });
  assert.equal(badge.labelKey, "nav.badgeSnapXml");
  assert.ok(badge.badgeClasses.includes("bg-info"));
  assert.equal(badge.titleKey, "nav.badgeSnapXmlStaleTitle");
});

test("resolveNavbarConnectionBadge shows Snap XML when snapshot is held and export stale", () => {
  const badge = resolveNavbarConnectionBadge({
    dataSource: "merged",
    luaAvailable: false,
    xmlAvailable: true,
    apiConnected: true,
    nowMs: NOW,
    dataTimestamps: {
      lastLuaReceivedAt: "2026-06-23T11:58:00.000Z",
      liveExportStaleAt: "2026-06-23T12:00:00.000Z",
    },
  });
  assert.equal(badge.labelKey, "nav.badgeSnapXml");
  assert.ok(badge.badgeClasses.includes("bg-info"));
});

test("resolveNavbarConnectionBadge shows Snap XML for xml-only saves", () => {
  const badge = resolveNavbarConnectionBadge({
    dataSource: "xml_only",
    luaAvailable: false,
    xmlAvailable: true,
    apiConnected: true,
    nowMs: NOW,
    dataTimestamps: null,
  });
  assert.equal(badge.labelKey, "nav.badgeSnapXml");
  assert.ok(badge.badgeClasses.includes("bg-info"));
});

test("held Lua-only data says Held snapshot without claiming XML", () => {
  const badge = resolveNavbarConnectionBadge({
    dataSource: "lua_only", luaAvailable: false, xmlAvailable: false, nowMs: NOW,
    dataTimestamps: { lastLuaReceivedAt: "2026-06-23T11:59:30.000Z", isStale: true, confidence: "held", lastXmlReceivedAt: null },
  });
  assert.equal(badge.labelKey, "ux.freshness.held");
  assert.equal(badge.titleKey, "ux.freshness.staleHint");
  assert.notEqual(badge.labelKey, "nav.badgeLiveApi");
  assert.doesNotMatch(badge.titleFallback, /XML/i);
  assert.match(badge.titleFallback, /not a live export/i);
});

test("stale and other non-live Lua-only badges use existing keys without XML claims", () => {
  const base = { dataSource: "lua_only", luaAvailable: false, xmlAvailable: false, nowMs: NOW };
  const stale = resolveNavbarConnectionBadge({ ...base, dataTimestamps: { lastLuaReceivedAt: "2026-06-23T11:58:00.000Z" } });
  assert.equal(stale.labelKey, "ux.freshness.stale");
  assert.equal(stale.titleKey, "ux.freshness.staleHint");
  const other = resolveNavbarConnectionBadge({ ...base, dataTimestamps: { lastLuaReceivedAt: "2026-06-23T11:59:30.000Z" } });
  assert.equal(other.labelKey, "ux.state.stale");
  assert.equal(other.titleKey, "ux.freshness.staleHint");
  for (const badge of [stale, other]) {
    assert.notEqual(badge.labelKey, "nav.badgeSnapXml");
    assert.notEqual(badge.labelKey, "nav.badgeLiveApi");
    assert.doesNotMatch(badge.titleFallback, /XML/i);
    assert.match(badge.titleFallback, /not a live export/i);
  }
});

test("merged data with available XML keeps Snap XML provenance", () => {
  const badge = resolveNavbarConnectionBadge({
    dataSource: "merged", luaAvailable: false, xmlAvailable: true, nowMs: NOW,
    dataTimestamps: { isStale: true, confidence: "held" },
  });
  assert.equal(badge.labelKey, "nav.badgeSnapXml");
  assert.equal(badge.titleKey, "nav.badgeSnapXmlHeldTitle");
});

test("fresh Lua-only data remains Live API", () => {
  const badge = resolveNavbarConnectionBadge({
    dataSource: "lua_only", luaAvailable: true, xmlAvailable: false, nowMs: NOW,
    dataTimestamps: { lastLuaReceivedAt: "2026-06-23T11:59:30.000Z" },
  });
  assert.equal(badge.labelKey, "nav.badgeLiveApi");
});

test("resolveNavbarConnectionBadge stays Live API between 2-min FTP polls", () => {
  const badge = resolveNavbarConnectionBadge({
    dataSource: "merged",
    luaAvailable: true,
    xmlAvailable: true,
    apiConnected: true,
    nowMs: NOW,
    dataTimestamps: {
      lastLuaReceivedAt: "2026-06-23T11:58:30.000Z",
      luaExportStaleMs: 165_000,
    },
  });
  assert.equal(badge.labelKey, "nav.badgeLiveApi");
});

test("resolveNavbarConnectionBadge ignores api websocket for dedicated server still live", () => {
  const badge = resolveNavbarConnectionBadge({
    dataSource: "merged",
    luaAvailable: false,
    xmlAvailable: true,
    apiConnected: true,
    nowMs: NOW,
    dataTimestamps: {
      lastLuaReceivedAt: "2026-06-23T11:58:00.000Z",
      liveExportStaleAt: "2026-06-23T11:58:00.000Z",
    },
  });
  assert.equal(badge.labelKey, "nav.badgeSnapXml");
});

test("resolveNavbarConnectionBadge does not call cached data live after API fallback", () => {
  const badge = resolveNavbarConnectionBadge({
    dataSource: "merged",
    luaAvailable: true,
    xmlAvailable: true,
    apiConnected: true,
    nowMs: NOW,
    dataTimestamps: {
      lastLuaReceivedAt: "2026-06-23T11:59:30.000Z",
      cacheUsedDueToFailure: true,
      confidence: "cache",
    },
  });
  assert.equal(badge.labelKey, "nav.badgeSnapXml");
  assert.equal(badge.titleKey, "nav.badgeSnapXmlHeldTitle");
});
