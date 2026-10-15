"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");
const { productionTs } = require("./helpers/production-source.cjs");
const {
    liftSectionOutcomes,
    applyLiveSectionHold,
    shouldIgnoreMinimalLuaExport,
    buildHeldPayloadFromState,
} = require("../mergedSnapshotHold");

function luaResult(chunk) {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    if (lauxlib.luaL_dostring(L, to_luastring(chunk)) !== lua.LUA_OK) {
        throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
    }
    return to_jsstring(lua.lua_tostring(L, -1));
}

describe("SOURCE-INTEGRATION-008 producer and hold", () => {
    test("the real assembler emits a disabled stock outcome", () => {
        const source = fs.readFileSync(
            path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua"),
            "utf8",
        ).replace(/\r\n/g, "\n");
        const start = source.indexOf("function FarmDashboardDataCollector:assembleDataFromModuleCache()");
        const end = source.indexOf("self.data = data\n    return data\nend", start);
        expect(start).toBeGreaterThan(0);
        expect(end).toBeGreaterThan(start);
        const fn = source.slice(start, end + "self.data = data\n    return data\nend".length);
        const farmSnapshotStart = source.indexOf("function FarmDashboardDataCollector:beginCompanionFarmSnapshot(");
        const farmSnapshotEnd = source.indexOf("\nfunction FarmDashboardDataCollector:", farmSnapshotStart + 1);
        expect(farmSnapshotStart).toBeGreaterThan(0);
        expect(farmSnapshotEnd).toBeGreaterThan(farmSnapshotStart);
        const farmSnapshotFn = source.slice(farmSnapshotStart, farmSnapshotEnd);
        const result = luaResult(`
            FarmDashboardDataCollector = {}
            DATA_SCHEMA_VERSION = 1
            g_currentMission = {}
            g_time = 9000
            local function _finalizeFillTypeNames() end
            ${farmSnapshotFn}
            ${fn}
            local self = setmetatable({
                moduleCache = {
                    animals = {},
                    vehicles = {},
                    fields = {},
                    production = { chains = {} },
                    stock = { enabled = false, byFarm = {} },
                },
                config = { enableAnimals = true, enableStock = false },
            }, { __index = FarmDashboardDataCollector })
            self.getGameTime = function() return {} end
            self.getFarmInfo = function() return {} end
            self._stripEconomyDebugForExport = function(_, value) return value or {} end
            self._mergeRfFieldEnrichment = function(_, value) return value end
            self._assembleRealisticFarming = function() return {} end
            self.buildAdsSummary = function() return {} end
            self.buildVehicleYearsSummary = function() return {} end
            self.buildMileageSummary = function() return {} end
            local data = self:assembleDataFromModuleCache()
            return tostring(data.sectionOutcomes.stock.outcome) .. "|" .. tostring(data.collectorModules.stock) .. "|" .. tostring(data.sectionOutcomes.animals.outcome)
        `);
        expect(result).toBe("disabled|false|unknown");
    });

    test("null sample time stays null and a current zero replaces stale merged litres", () => {
        const stamped = liftSectionOutcomes({
            stock: { enabled: true, readState: "ok", coverage: "complete", sampledAt: null, byFarm: { "1": { items: [{ totalLiters: 0 }] } } },
        });
        expect(stamped.sectionOutcomes.stock.sampledAt).toBeNull();
        expect(stamped.sectionOutcomes.stock.outcome).toBe("zero");
        const measured = liftSectionOutcomes({
            stock: { enabled: true, readState: "ok", coverage: "complete", sampledAt: 0, byFarm: { "1": { items: [{ totalLiters: 0 }] } } },
        });
        expect(measured.sectionOutcomes.stock.sampledAt).toBe(0);

        const merged = {
            fields: [{ id: 1, hectares: 2 }],
            stock: { enabled: true, byFarm: { "1": { items: [{ totalLiters: 50, fillTypeIndex: 2 }] } } },
        };
        const raw = {
            fields: [{ id: 1, hectares: 2 }],
            stock: {
                enabled: true,
                readState: "ok",
                coverage: "complete",
                byFarm: { "1": { items: [{ totalLiters: 0, fillTypeIndex: 2 }] } },
            },
            sectionOutcomes: {
                stock: { outcome: "zero", readState: "ok", coverage: "complete", provider: null, sampledAt: null, sessionId: null },
            },
        };
        const state = {
            lastGoodMergedSnapshot: {
                stock: { enabled: true, byFarm: { "1": { items: [{ totalLiters: 50, fillTypeIndex: 2 }] } } },
                fields: [{ id: 1, hectares: 2 }],
                animals: [{ animalCount: 4 }],
            },
        };
        const held = applyLiveSectionHold(merged, state, raw, null);
        expect(held.stock.byFarm["1"].items[0].totalLiters).toBe(0);
        expect(held.sectionOutcomes.stock.outcome).toBe("zero");
        expect(state.lastGoodMergedSnapshot.stock.byFarm["1"].items[0].totalLiters).toBe(0);
    });

    test("an authoritative all-empty export is not dropped as a bootstrap stub", () => {
        const current = {
            animals: [],
            vehicles: [],
            fields: [],
            production: { chains: [] },
            stock: { enabled: true, readState: "ok", coverage: "complete", byFarm: {} },
            sectionOutcomes: {
                animals: { outcome: "empty", readState: "ok", coverage: "complete", sampledAt: 9000, sessionId: "current" },
                fields: { outcome: "empty", readState: "ok", coverage: "complete", sampledAt: 9000, sessionId: "current" },
                production: { outcome: "empty", readState: "ok", coverage: "complete", sampledAt: 9000, sessionId: "current" },
            },
        };
        const state = {
            lastGoodMergedSnapshot: {
                animals: [{ animalCount: 4 }],
                fields: [{ id: 1, hectares: 2 }],
                vehicles: [{ id: "v" }],
            },
            mergedData: {
                animals: [{ animalCount: 4 }],
                fields: [{ id: 1, hectares: 2 }],
                vehicles: [{ id: "v" }],
            },
        };
        expect(shouldIgnoreMinimalLuaExport(current, state)).toBe(false);
        applyLiveSectionHold(current, state, current, null);
        expect(state.lastGoodMergedSnapshot.animals).toHaveLength(0);
        const offline = buildHeldPayloadFromState(state);
        expect(offline.animals).toHaveLength(0);
    });

    test("the unit hook keeps an explicit viewer choice and Automatic follows the provider", () => {
        const units = productionTs("NEW APP/src/lib/fill-units.ts");
        let state = { payload: null, viewerFillUnitMode: "imperial" };
        const mode = productionTs("NEW APP/src/lib/fill-unit-mode.ts", {
            "@/store/dashboard-store": { useDashboardStore: (select) => select(state) },
            "@/lib/fill-units": units,
        });
        expect(mode.useFillUnitMode()).toBe("imperial");
        state = {
            payload: { unitDisplay: { british: false, imperial: { present: false, liquid: "gallons", crops: "imperial", weight: "imperial" } } },
            viewerFillUnitMode: "imperial",
        };
        expect(mode.useFillUnitMode()).toBe("imperial");
        state = {
            payload: { unitDisplay: { british: true, imperial: { present: false, liquid: "liters" } } },
            viewerFillUnitMode: "litres",
        };
        expect(mode.useFillUnitMode()).toBe("litres");
        state = { ...state, viewerFillUnitMode: null };
        expect(mode.useFillUnitMode()).toBe("british");
        const consumers = [
            "NEW APP/src/sections/pastures/PasturesSection.tsx",
            "NEW APP/src/sections/productions/ProductionsSection.tsx",
            "NEW APP/src/sections/storage/StorageSection.tsx",
            "NEW APP/src/sections/economy/RfEconomyPanels.tsx",
        ];
        for (const rel of consumers) {
            const text = fs.readFileSync(path.resolve(__dirname, "../../", rel), "utf8");
            expect(text).toContain("useFillUnitMode");
        }
        const unitsLua = fs.readFileSync(
            path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src/FillTypeUtils.lua"),
            "utf8",
        );
        const start = unitsLua.indexOf("function FillTypeUtils.unitDisplayForJson()");
        const body = unitsLua.slice(start, start + 4000);
        // The name ban recorded that Save Unit Profiles was not read yet. The reader now exports the profile and does not own fill units.
        expect(unitsLua).toContain("saveUnitProfiles");
        expect(unitsLua).toContain("ownsFillUnits = false");
        expect(unitsLua).not.toContain("fluidUnit");
        expect(body).toContain("liquidUnit");
        expect(body).toContain("cropsUnit");
        expect(body).toContain("weightUnit");
    });

    test("a current zero and a null sample time survive the real cache functions", () => {
        const { saveServerCache, loadServerCache } = require("../serverDataCache");
        const state = {
            lastGoodMergedSnapshot: {
                stock: { enabled: true, byFarm: { "1": { items: [{ totalLiters: 50, fillTypeIndex: 2 }] } } },
                fields: [{ id: 1, hectares: 2 }],
            },
        };
        const raw = {
            fields: [{ id: 1, hectares: 2 }],
            stock: {
                enabled: true,
                readState: "ok",
                coverage: "complete",
                sampledAt: null,
                byFarm: { "1": { items: [{ totalLiters: 0, fillTypeIndex: 2 }] } },
            },
        };
        const stamped = liftSectionOutcomes(raw);
        expect(stamped.sectionOutcomes.stock.sampledAt).toBeNull();
        const held = applyLiveSectionHold(stamped, state, stamped, null);
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fh008-cache-"));
        saveServerCache(dir, "local", {
            mergedSnapshot: state.lastGoodMergedSnapshot,
            sectionOutcomes: held.sectionOutcomes,
            sectionAge: "current",
            savedAt: new Date().toISOString(),
        });
        const disk = loadServerCache(dir, "local");
        expect(disk.mergedSnapshot.stock.byFarm["1"].items[0].totalLiters).toBe(0);
        expect(disk.sectionOutcomes.stock.sampledAt).toBeNull();
        expect(disk.sectionOutcomes.stock.outcome).toBe("zero");
        const offline = buildHeldPayloadFromState({
            lastGoodMergedSnapshot: disk.mergedSnapshot,
            sectionOutcomes: disk.sectionOutcomes,
        });
        expect(offline.stock.byFarm["1"].items[0].totalLiters).toBe(0);
    });
});
