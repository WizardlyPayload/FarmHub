"use strict";

const fs = require("fs");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");
const { mergeData, mergeFields } = require("../dataMerger");
const {
    SECTION_CONTRACT_VERSION,
    coverageOf,
    originalSampleTime,
    fleetMeasuredAt,
} = require("../sectionContract.cjs");

describe("section freshness contract", () => {
    test("the producer holds the original sample time across a later clock", () => {
        const source = fs.readFileSync(
            path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua"),
            "utf8",
        );
        const start = source.indexOf("local soilSampleHold = {}");
        const end = source.indexOf("function FieldDataCollector.clearSoilSampleHold()");
        const L = lauxlib.luaL_newstate();
        lualib.luaL_openlibs(L);
        const chunk = [
            "FieldDataCollector = {}",
            source.slice(start, end),
            "_G.g_time = 1000",
            "local first = FieldDataCollector.holdSoilSample(7, '40|6.5|true')",
            "_G.g_time = 9000",
            "local held = FieldDataCollector.holdSoilSample(7, '40|6.5|true')",
            "local changed = FieldDataCollector.holdSoilSample(7, '10|6.5|true')",
            "return tostring(first) .. '|' .. tostring(held) .. '|' .. tostring(changed)",
        ].join("\n");
        if (lauxlib.luaL_dostring(L, to_luastring(chunk)) !== lua.LUA_OK) {
            throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
        }
        expect(to_jsstring(lua.lua_tostring(L, -1))).toBe("1000|9000|9000");
    });

    test("one committed generation keeps older soil beside a newer fleet measurement", () => {
        const merged = mergeData({
            generation: 4,
            fields: [{
                id: 1,
                farmlandId: 1,
                farmId: 1,
                nitrogenLevel: 40,
                targetNitrogen: 100,
                soilSampledAt: 1000,
                isPrecisionFarming: true,
                isScanned: true,
            }],
            vehicles: [{ id: "t1", name: "Tractor", ownerFarmId: 1, farmId: 1, measuredAt: 9000, operatingTime: 10 }],
            farmInfo: [{ farmId: 1, name: "Farm", isPlayer: true }],
        }, null);
        expect(SECTION_CONTRACT_VERSION).toBe(1);
        expect(originalSampleTime(merged.fields[0])).toBe(1000);
        expect(fleetMeasuredAt(merged.vehicles[0])).toBe(9000);
        expect(String(merged.lastUpdated)).not.toBe("1000");
        expect(String(merged.dataTimestamps.mergeComputedAt)).not.toContain("1000");
        const again = mergeFields(
            [{ id: 1, farmlandId: 1, nitrogenLevel: null }],
            [{ id: 1, farmlandId: 1, nitrogenLevel: 40, soilSampledAt: 1000 }],
        );
        expect(again[0].soilSampledAt).toBe(1000);
    });

    test("disabled, failed, partial and legacy coverage stay distinct from a real zero", () => {
        expect(coverageOf({ enabled: false, readState: "ok" })).toBe("disabled");
        expect(coverageOf({ enabled: true, readState: "failed" })).toBe("failed");
        expect(coverageOf({ enabled: true, readState: "pending" })).toBe("partial");
        expect(coverageOf({ enabled: true, readState: "ok" })).toBe("unknown");
        expect(coverageOf({ enabled: true, readState: "ok", coverage: "complete" })).toBe("complete");
        expect(coverageOf(null)).toBe("unknown");
        expect(originalSampleTime({ soilSampledAt: null })).toBeNull();
        expect(fleetMeasuredAt({ measuredAt: null })).toBeNull();
    });
});
