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
