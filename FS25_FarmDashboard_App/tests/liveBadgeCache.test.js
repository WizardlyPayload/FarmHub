"use strict";

const { productionTs } = require("./helpers/production-source.cjs");

const { resolveNavbarConnectionBadge } = productionTs("NEW APP/src/lib/connection-badge.ts");
const { readFreshness } = productionTs("NEW APP/src/lib/ux-freshness.ts");
const { resolveLuaExportStaleMs } = require("../liveExportFreshness");
const NOW = Date.parse("2026-06-23T12:00:00.000Z");

describe("new UI freshness confidence", () => {
    test("cached fallback is not shown as Live API despite a recent Lua timestamp", () => {
        const dataTimestamps = {
            lastLuaReceivedAt: "2026-06-23T11:59:30.000Z",
            cacheUsedDueToFailure: true,
            confidence: "live",
        };
        const badge = resolveNavbarConnectionBadge({
            dataSource: "merged", luaAvailable: true, xmlAvailable: true,
            apiConnected: true, nowMs: NOW, dataTimestamps,
        });
        expect(badge.kind).toBe("snap");
        expect(badge.titleKey).toBe("nav.badgeSnapXmlHeldTitle");
        expect(readFreshness({ dataTimestamps }).confidence).toBe("cache");
        expect(readFreshness({ dataTimestamps }).isStale).toBe(true);
    });

    test("a fresh export with no active cache or stale flag remains live", () => {
        const badge = resolveNavbarConnectionBadge({
            dataSource: "merged", luaAvailable: true, xmlAvailable: true,
            apiConnected: true, nowMs: NOW,
            dataTimestamps: { lastLuaReceivedAt: "2026-06-23T11:59:30.000Z" },
        });
        expect(badge.kind).toBe("live");
    });

    test("replica cadence stays live between paused-world exports without weakening local freshness", () => {
        const replicaMs = resolveLuaExportStaleMs(1, true);
        expect(replicaMs).toBe(300_000);
        expect(resolveLuaExportStaleMs(1, false)).toBe(105_000);
        const dataTimestamps = {
            lastLuaReceivedAt: new Date(NOW - 200_000).toISOString(),
            luaExportStaleMs: replicaMs,
        };
        const state = { dataSource: "merged", luaAvailable: true, xmlAvailable: true,
            apiConnected: true, nowMs: NOW, dataTimestamps };
        expect(resolveNavbarConnectionBadge(state).kind).toBe("live");
        expect(resolveNavbarConnectionBadge({ ...state, nowMs: NOW + 101_000 }).kind).toBe("snap");
    });
});
