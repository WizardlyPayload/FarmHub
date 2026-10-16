"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");
const {
    liftSectionOutcomes,
    applyLiveSectionHold,
    shouldIgnoreMinimalLuaExport,
    buildHeldPayloadFromState,
} = require("../mergedSnapshotHold");
const { saveServerCache, loadServerCache } = require("../serverDataCache");
const { mergeData } = require("../dataMerger");
const ingressOrchestration = require("../ingressOrchestration");
const exportIngress = require("../exportIngress");
const { productionFunctions } = require("./helpers/production-source.cjs");

const collectorPath = path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua");
const animalPath = path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src/collectors/AnimalDataCollector.lua");
const source = fs.readFileSync(collectorPath, "utf8").replace(/\r\n/g, "\n");

function extractMethod(name) {
    const needle = "function FarmDashboardDataCollector:" + name;
    const start = source.indexOf(needle);
    if (start < 0) throw new Error("missing " + name);
    const next = source.indexOf("\nfunction FarmDashboardDataCollector:", start + needle.length);
    return source.slice(start, next < 0 ? source.length : next);
}

function luaString(chunk) {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    if (lauxlib.luaL_dostring(L, to_luastring(chunk)) !== lua.LUA_OK) {
        throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
    }
    return to_jsstring(lua.lua_tostring(L, -1));
}

const methods = [
    "_admitSection",
    "_detachData",
    "beginCompanionFarmSnapshot",
    "assembleDataFromModuleCache",
    "refreshAssembledInMemory",
    "_rememberModuleOutcome",
    "resetStaggerState",
    "safeCollect",
    "finishModuleSlice",
    "runIncrementalActiveStep",
    "runLegacyModuleSlice",
    "startHusbandryJobAfterProduction",
    "husbandryTotalsStep",
    "toJSON",
].map(extractMethod).join("\n");
const jsonHelpers = source.slice(
    source.indexOf("local function _escapeJsonString"),
    source.indexOf("local function _buildFillTypeCatalog"),
);
const jsonLocal = source.slice(source.indexOf("local JSON_MAX_DEPTH = 32"), source.indexOf("function FarmDashboardDataCollector:_toJSONInto"));
const jsonInto = extractMethod("_toJSONInto");

const prelude = `
FarmDashboardDataCollector = {}
DATA_SCHEMA_VERSION = 1
g_time = 9000
g_currentMission = { husbandrySystem = { placeables = {} } }
FarmDashLog = { devWarn = function() end }
local function _finalizeFillTypeNames() end
${jsonHelpers}
${methods}
${jsonLocal}
${jsonInto}
local function subject(mc)
    local s = setmetatable({ moduleCache = mc or {}, config = {}, collectors = {} }, { __index = FarmDashboardDataCollector })
    s.getGameTime = function() return {} end
    s.getFarmInfo = function() return {} end
    s._stripEconomyDebugForExport = function(_, value) return value or {} end
    s._mergeRfFieldEnrichment = function(_, value) return value end
    s._assembleRealisticFarming = function() return {} end
    s.buildAdsSummary = function() return {} end
    s.buildVehicleYearsSummary = function() return {} end
    s.buildMileageSummary = function() return {} end
    s._diagTrace = function() end
    s._diagNow = function() return nil end
    s._diagEnabled = function() return false end
    s._cycleFreshCount = function() return 0 end
    s.beginDeferredJsonWrite = function() end
    s.tryFlushAfterFullCycle = function() end
    s.shouldDeferVehicleFleetWork = function() return false end
    s.collectorStepUsesCoroutine = function() return false end
    s._skipFleetSliceForSpawnGrace = function() end
    s.getActiveFarmId = function() return 1 end
    s.accumulateHusbandryTotalsForPlaceable = function() end
    return s
end
`;

function run(body) {
    return luaString(prelude + "\n" + body);
}

describe("PRODUCER-010 real collector completion", () => {
    test("P01 P02 P08 P09 P10 classify the finished section", () => {
        expect(run(`
            local s = subject({ fields = {} })
            s:finishModuleSlice("fields", {"fields"}, false, false)
            return s._sectionOutcomes.fields.outcome
        `)).toBe("empty");
        expect(run(`
            local s = subject({ stock = { enabled = true, byFarm = { ["1"] = { items = { { fillTypeIndex = 2, totalLiters = 0 } } } } } })
            s:finishModuleSlice("stock", {"stock"}, false, false)
            return s._sectionOutcomes.stock.outcome
        `)).toBe("zero");
        expect(run(`
            local s = subject({ stock = { enabled = true, byFarm = {} } })
            s:finishModuleSlice("stock", {"stock"}, false, false)
            return s._sectionOutcomes.stock.outcome
        `)).toBe("zero");
        expect(run(`
            local s = subject({ fields = { { id = 1 } } })
            s:finishModuleSlice("fields", {"fields"}, false, false)
            return s._sectionOutcomes.fields.outcome
        `)).toBe("ok");
        expect(run(`
            g_time = 9000
            local s = subject({})
            s.config.enableStock = false
            local data = s:assembleDataFromModuleCache()
            return data.sectionOutcomes.stock.outcome
        `)).toBe("disabled");
        expect(run(`
            g_time = nil
            local s = subject({ fields = { { id = 1 } } })
            s:finishModuleSlice("fields", {"fields"}, false, false)
            return tostring(s._sectionOutcomes.fields.sampledAt)
        `)).toBe("nil");
    });

    test("P03 completed animal overview is empty and a counted LOD row stays visible", () => {
        const animals = fs.readFileSync(animalPath, "utf8").replace(/\r\n/g, "\n");
        const result = luaString(`
            ${animals}
            ${prelude}
            local s = subject({})
            AnimalDataCollector:collectBegin()
            local done, payload = AnimalDataCollector:collectStep({})
            s.moduleCache.animals = payload
            s:finishModuleSlice("animals", {"animals"}, true, false)
            local counted = subject({ animals = { { animalCount = 4, animals = {}, lod = "agg" } } })
            counted:finishModuleSlice("animals", {"animals"}, true, false)
            return tostring(done) .. "|" .. tostring(#payload) .. "|" .. s._sectionOutcomes.animals.outcome .. "|" .. counted._sectionOutcomes.animals.outcome
        `);
        expect(result).toBe("true|0|empty|ok");
    });

    test("P04 P05 P06 P07 P11 reset, missing collector, and failed follow-up", () => {
        expect(run(`
            g_time = 9000
            local s = subject({ fields = { { id = 1 } } })
            s:finishModuleSlice("fields", {"fields"}, false, false)
            s:resetStaggerState()
            local data = s:assembleDataFromModuleCache()
            return data.sectionOutcomes.fields.outcome .. "|" .. tostring(data.sectionOutcomes.fields.sampledAt)
        `)).toBe("unknown|nil");
        expect(run(`
            g_time = 9000
            local s = subject({ fields = { { id = 1 } } })
            s:finishModuleSlice("fields", {"fields"}, false, false)
            s:resetStaggerState({ preserveSession = true })
            local data = s:assembleDataFromModuleCache()
            return data.sectionOutcomes.fields.outcome .. "|" .. tostring(data.sectionOutcomes.fields.sampledAt)
        `)).toBe("unknown|nil");
        expect(run(`
            local s = subject({})
            s.collectors = {}
            local _, failed = s:safeCollect("fields")
            return tostring(failed)
        `)).toBe("true");
        expect(run(`
            local s = subject({})
            s.collectors = { fields = { collect = function() error("boom") end } }
            local _, failed = s:safeCollect("fields")
            return tostring(failed)
        `)).toBe("true");
        expect(run(`
            local s = subject({})
            s.collectors = { fields = { collect = function() return nil end } }
            local _, failed = s:safeCollect("fields")
            return tostring(failed)
        `)).toBe("true");
        expect(run(`
            g_time = 111
            local s = subject({ fields = { { id = 1 } } })
            s:finishModuleSlice("fields", {"fields"}, false, false)
            g_time = 9000
            s:finishModuleSlice("fields", {"fields"}, false, true)
            return s._sectionOutcomes.fields.outcome .. "|" .. tostring(s._sectionOutcomes.fields.sampledAt)
        `)).toBe("failed|111");
    });

    test("P12 partial step keeps the committed field and P13 nil production stays failed", () => {
        expect(run(`
            g_time = 111
            local s = subject({ fields = { { id = 1 } } })
            s:finishModuleSlice("fields", {"fields"}, false, false)
            g_time = 9000
            s._incActiveModule = "fields"
            s.collectors.fields = { collectStep = function() return false, { { id = 2 } } end }
            s:runIncrementalActiveStep({"fields"})
            local data = s:assembleDataFromModuleCache()
            local kept = data.fields[1].id == 1 and data.sectionOutcomes.fields.outcome == "ok" and data.sectionOutcomes.fields.sampledAt == 111
            return tostring(kept)
        `)).toBe("true");
        expect(run(`
            g_time = 111
            local s = subject({ production = { chains = { { id = "mill" } } } })
            s:finishModuleSlice("production", {"production"}, false, false)
            g_time = 9000
            s._incActiveModule = "production"
            s.collectors.production = { collectStep = function() return true, nil end }
            s:runIncrementalActiveStep({"production"})
            local kept = s.moduleCache.production.chains[1].id == "mill"
            return s._sectionOutcomes.production.outcome .. "|" .. tostring(kept)
        `)).toBe("failed|true");
    });

    test("a stale completion after reset does not commit the next session", () => {
        expect(run(`
            g_time = 111
            local s = subject({ fields = { { id = 1 } } })
            s._exportSession = 1
            s._sliceSession = 1
            s:finishModuleSlice("fields", {"fields"}, false, false)
            s:resetStaggerState()
            s._incActiveModule = "fields"
            s.collectors.fields = { collectStep = function() return true, { { id = 9 } } end }
            s:runIncrementalActiveStep({"fields"})
            local data = s:assembleDataFromModuleCache()
            return data.sectionOutcomes.fields.outcome .. "|" .. tostring(data.fields[1])
        `)).toBe("unknown|nil");
    });

    test("Q01 through Q06 detach, stage production, and reject malformed rows", () => {
        expect(run(`
            local payload = { { id = 1, hectares = 2, soil = { nitrogen = 40 } } }
            local s = subject({})
            s.collectors = { fields = { collectStep = function() return true, payload end } }
            s._incActiveModule = "fields"
            g_time = 111
            s:runIncrementalActiveStep({"fields"})
            payload[1].soil.nitrogen = 99
            g_time = 9000
            local data = s:assembleDataFromModuleCache()
            return tostring(data.fields[1].soil.nitrogen) .. "|" .. tostring(data.sectionOutcomes.fields.sampledAt)
        `)).toBe("40|111");
        expect(run(`
            local s = subject({ production = { chains = { { id = "old" } } } })
            g_time = 111
            s:finishModuleSlice("production", {"production"}, false, false)
            g_currentMission.husbandrySystem.placeables = { { id = 1 } }
            s.collectors = { production = { collectStep = function() return true, { chains = { { id = "new" } } } end } }
            s._incActiveModule = "production"
            g_time = 9000
            s:runIncrementalActiveStep({"production"})
            local data = s:assembleDataFromModuleCache()
            return data.production.chains[1].id .. "|" .. tostring(data.sectionOutcomes.production.sampledAt)
        `)).toBe("old|111");
        expect(run(`
            local s = subject({ production = { chains = { { id = "old" } } } })
            g_time = 111
            s:finishModuleSlice("production", {"production"}, false, false)
            g_currentMission.husbandrySystem.placeables = { { id = 1 } }
            s.collectors = { production = { collectStep = function() return true, { chains = { { id = "new" } } } end } }
            s._incActiveModule = "production"
            s.accumulateHusbandryTotalsForPlaceable = function() error("failed follow-up") end
            g_time = 9000
            s:runIncrementalActiveStep({"production"})
            s:husbandryTotalsStep()
            local data = s:assembleDataFromModuleCache()
            return data.production.chains[1].id .. "|" .. data.sectionOutcomes.production.outcome .. "|" .. tostring(data.sectionOutcomes.production.sampledAt)
        `)).toBe("old|failed|111");
        expect(run(`
            local s = subject({ stock = { enabled = true, byFarm = { ["1"] = {} } } })
            s:finishModuleSlice("stock", {"stock"}, false, false)
            return tostring(s.data.sectionOutcomes.stock.outcome ~= "zero")
        `)).toBe("true");
        expect(run(`
            local s = subject({ animals = { { animalCount = 4, lod = "agg", animals = {} }, { lod = "agg", animals = {} } } })
            s:finishModuleSlice("animals", {"animals"}, false, false)
            return tostring(s.data.sectionOutcomes.animals.coverage ~= "complete")
        `)).toBe("true");
        expect(run(`
            local s = subject({ production = { chains = "unavailable" } })
            s:finishModuleSlice("production", {"production"}, false, false)
            return tostring(s.data.sectionOutcomes.production.outcome ~= "empty")
        `)).toBe("true");
        expect(run(`
            local s = subject({ production = { chains = { { id = "old" } } } })
            g_time = 111
            s:finishModuleSlice("production", {"production"}, false, false)
            g_currentMission.husbandrySystem.placeables = { { id = 1 } }
            s.collectors = { production = { collectStep = function() return true, { chains = { { id = "new" } } } end } }
            s._incActiveModule = "production"
            g_time = 9000
            s:runIncrementalActiveStep({"production"})
            s:husbandryTotalsStep()
            local data = s:assembleDataFromModuleCache()
            return data.production.chains[1].id .. "|" .. data.sectionOutcomes.production.outcome .. "|" .. tostring(data.sectionOutcomes.production.sampledAt)
        `)).toBe("new|ok|9000");
    });

    test("D01 through D04 reject malformed admission and keep the last sample", () => {
        expect(run(`
            local s = subject({ fields = { { id = 1, hectares = 2 } } })
            g_time = 111
            s:finishModuleSlice("fields", {"fields"}, false, false)
            g_time = 9000
            s.collectors = { fields = { collectStep = function() return true, "unavailable" end } }
            s._incActiveModule = "fields"
            s:runIncrementalActiveStep({"fields"})
            local data = s:assembleDataFromModuleCache()
            return tostring(data.fields[1] and data.fields[1].id) .. "|" .. data.sectionOutcomes.fields.outcome .. "|" .. tostring(data.sectionOutcomes.fields.sampledAt)
        `)).toBe("1|failed|111");
        expect(run(`
            local s = subject({ stock = { enabled = true, byFarm = { ["1"] = { items = { { totalLiters = 50 } } } } } })
            g_time = 111
            s:finishModuleSlice("stock", {"stock"}, false, false)
            g_time = 9000
            s.collectors = { stock = { collectStep = function() return true, { enabled = true, byFarm = { ["1"] = { items = { function() end } } } } end } }
            s._incActiveModule = "stock"
            s:runIncrementalActiveStep({"stock"})
            local data = s:assembleDataFromModuleCache()
            return tostring(data.sectionOutcomes.stock.outcome ~= "zero") .. "|" .. tostring(data.stock.byFarm["1"].items[1].totalLiters) .. "|" .. tostring(data.sectionOutcomes.stock.sampledAt)
        `)).toBe("true|50|111");
        expect(run(`
            local s = subject({ animals = { { animalCount = 4, lod = "agg", animals = {} } } })
            g_time = 111
            s:finishModuleSlice("animals", {"animals"}, false, false)
            g_time = 9000
            local row = setmetatable({ animalCount = 5, lod = "agg", animals = {} }, { __index = {} })
            s.collectors = { animals = { collectStep = function() return true, { row } end } }
            s._incActiveModule = "animals"
            s:runIncrementalActiveStep({"animals"})
            local data = s:assembleDataFromModuleCache()
            return tostring(data.sectionOutcomes.animals.outcome ~= "empty") .. "|" .. tostring(data.animals[1].animalCount) .. "|" .. tostring(data.sectionOutcomes.animals.sampledAt)
        `)).toBe("true|4|111");
        expect(run(`
            local s = subject({ fields = { { id = 1 } } })
            g_time = 111
            s:finishModuleSlice("fields", {"fields"}, false, false)
            g_time = 9000
            s.collectors = { fields = { collect = function() return "unavailable" end } }
            s:runLegacyModuleSlice("fields", {"fields"})
            local data = s:assembleDataFromModuleCache()
            return tostring(data.fields[1] and data.fields[1].id) .. "|" .. data.sectionOutcomes.fields.outcome .. "|" .. tostring(data.sectionOutcomes.fields.sampledAt)
        `)).toBe("1|failed|111");
        expect(run(`
            local s = subject({ fields = { { id = 1, hectares = 2 } } })
            g_time = 111
            s:finishModuleSlice("fields", {"fields"}, false, false)
            g_time = 9000
            local bad = setmetatable({ { id = 9 } }, { __index = {} })
            s.collectors = { fields = { collectStep = function() return true, bad end } }
            s._incActiveModule = "fields"
            s:runIncrementalActiveStep({"fields"})
            local data = s:assembleDataFromModuleCache()
            return tostring(data.fields[1].id) .. "|" .. data.sectionOutcomes.fields.outcome .. "|" .. tostring(data.sectionOutcomes.fields.sampledAt)
        `)).toBe("1|failed|111");
        expect(run(`
            local s = subject({ fields = { { id = 1, hectares = 2 } } })
            g_time = 111
            s:finishModuleSlice("fields", {"fields"}, false, false)
            g_time = 9000
            local row = { id = 9, hectares = 1 }
            row.soil = row
            s.collectors = { fields = { collectStep = function() return true, { row } end } }
            s._incActiveModule = "fields"
            s:runIncrementalActiveStep({"fields"})
            local data = s:assembleDataFromModuleCache()
            return tostring(data.fields[1].id) .. "|" .. data.sectionOutcomes.fields.outcome .. "|" .. tostring(data.sectionOutcomes.fields.sampledAt)
        `)).toBe("1|failed|111");
        expect(run(`
            local function nest(count, leaf)
                local top = leaf
                for _ = 1, count do
                    top = { child = top }
                end
                return top
            end
            local s = subject({})
            g_time = 111
            s.collectors = { fields = { collectStep = function() return true, nest(32, { id = 3 }) end } }
            s._incActiveModule = "fields"
            s:runIncrementalActiveStep({"fields"})
            local allowed = s:assembleDataFromModuleCache()
            local deep = subject({ fields = { { id = 1, hectares = 2 } } })
            g_time = 111
            deep:finishModuleSlice("fields", {"fields"}, false, false)
            g_time = 9000
            deep.collectors = { fields = { collectStep = function() return true, nest(33, { id = 9 }) end } }
            deep._incActiveModule = "fields"
            deep:runIncrementalActiveStep({"fields"})
            local data = deep:assembleDataFromModuleCache()
            return allowed.sectionOutcomes.fields.outcome .. "|" .. tostring(data.fields[1].id) .. "|" .. data.sectionOutcomes.fields.outcome .. "|" .. tostring(data.sectionOutcomes.fields.sampledAt)
        `)).toBe("ok|1|failed|111");
        expect(run(`
            local s = subject({ production = { chains = { { id = "old" } } } })
            g_time = 111
            s:finishModuleSlice("production", {"production"}, false, false)
            g_currentMission.husbandrySystem.placeables = { { id = 1 } }
            g_time = 9000
            s.collectors = { production = { collectStep = function() return true, { chains = { { id = "new" }, function() end } } end } }
            s._incActiveModule = "production"
            s:runIncrementalActiveStep({"production"})
            local data = s:assembleDataFromModuleCache()
            return data.production.chains[1].id .. "|" .. data.sectionOutcomes.production.outcome .. "|" .. tostring(data.sectionOutcomes.production.sampledAt) .. "|" .. tostring(s._productionCandidate) .. "|" .. tostring(s._husbandryJob)
        `)).toBe("old|failed|111|nil|nil");
        expect(run(`
            local s = subject({})
            g_time = 9000
            s.collectors = { fields = { collectStep = function() return true, "unavailable" end } }
            s._incActiveModule = "fields"
            s:runIncrementalActiveStep({"fields"})
            local data = s:assembleDataFromModuleCache()
            return data.sectionOutcomes.fields.outcome .. "|" .. tostring(data.sectionOutcomes.fields.sampledAt) .. "|" .. tostring(data.sectionOutcomes.fields.outcome ~= "empty")
        `)).toBe("failed|nil|true");
        expect(run(`
            local s = subject({ fields = { { id = 1, hectares = 2 } } })
            g_time = 111
            s:finishModuleSlice("fields", {"fields"}, false, false)
            g_time = 9000
            s.collectors = { fields = { collectStep = function() return true, "unavailable" end } }
            s._incActiveModule = "fields"
            s:runIncrementalActiveStep({"fields"})
            g_time = 12000
            s.collectors = { fields = { collectStep = function() return true, { { id = 7, hectares = 4 } } end } }
            s._incActiveModule = "fields"
            s:runIncrementalActiveStep({"fields"})
            local data = s:assembleDataFromModuleCache()
            return tostring(data.fields[1].id) .. "|" .. data.sectionOutcomes.fields.outcome .. "|" .. tostring(data.sectionOutcomes.fields.sampledAt)
        `)).toBe("7|ok|12000");
        expect(run(`
            local s = subject({})
            g_time = 0
            s.collectors = {
                fields = { collectStep = function() return true, {} end },
                stock = { collectStep = function() return true, { enabled = true, byFarm = {} } end },
                animals = { collectStep = function() return true, { { animalCount = 4, animals = {}, lod = "agg" } } end },
            }
            s._incActiveModule = "fields"
            s:runIncrementalActiveStep({"fields"})
            local fields = s:assembleDataFromModuleCache()
            s.collectors.stock = { collectStep = function() return true, { enabled = true, byFarm = { ["1"] = { items = {} } } } end }
            s._incActiveModule = "stock"
            s:runIncrementalActiveStep({"stock"})
            local stock = s:assembleDataFromModuleCache()
            s._incActiveModule = "animals"
            s:runIncrementalActiveStep({"animals"})
            local animals = s:assembleDataFromModuleCache()
            return fields.sectionOutcomes.fields.outcome .. "|" .. tostring(fields.sectionOutcomes.fields.sampledAt) .. "|" .. stock.sectionOutcomes.stock.outcome .. "|" .. animals.sectionOutcomes.animals.outcome
        `)).toBe("empty|0|zero|ok");
    });

    test("serialized assembler bytes stay empty through hold and the cache", () => {
        const encoded = run(`
            g_time = 5000
            local s = subject({ animals = { { animalCount = 4, animals = {}, lod = "agg" } }, fields = { { id = 1, hectares = 2 } }, stock = { enabled = true, byFarm = { ["1"] = { items = { { fillTypeIndex = 2, totalLiters = 50 } } } } } })
            s:finishModuleSlice("animals", {"animals"}, false, false)
            s:finishModuleSlice("fields", {"fields"}, false, false)
            s:finishModuleSlice("stock", {"stock"}, false, false)
            g_time = 9000
            s.moduleCache.animals = {}
            s.moduleCache.fields = {}
            s.moduleCache.stock = { enabled = true, byFarm = {} }
            s:finishModuleSlice("animals", {"animals"}, false, false)
            s:finishModuleSlice("fields", {"fields"}, false, false)
            s:finishModuleSlice("stock", {"stock"}, false, false)
            return s:toJSON(s.data, 0)
        `);
        const current = JSON.parse(encoded);
        expect(current.sectionOutcomes.animals.outcome).toBe("empty");
        expect(current.sectionOutcomes.fields.outcome).toBe("empty");
        expect(current.sectionOutcomes.stock.outcome).toBe("zero");
        expect(shouldIgnoreMinimalLuaExport(current, {
            lastGoodMergedSnapshot: { animals: [{ animalCount: 4 }], fields: [{ id: 1, hectares: 2 }] },
        })).toBe(false);
        const state = {
            lastGoodMergedSnapshot: {
                animals: [{ animalCount: 4, lod: "agg" }],
                fields: [{ id: 1, hectares: 2 }],
                stock: { enabled: true, byFarm: { "1": { items: [{ totalLiters: 50 }] } } },
            },
        };
        const held = applyLiveSectionHold(current, state, current, null);
        expect(held.animals).toHaveLength(0);
        expect(held.fields).toHaveLength(0);
        expect(held.stock.byFarm["1"]).toBeUndefined();
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fh010-cache-"));
        saveServerCache(dir, "local", {
            mergedSnapshot: state.lastGoodMergedSnapshot,
            sectionAge: "current",
            savedAt: new Date().toISOString(),
        });
        const disk = loadServerCache(dir, "local");
        expect(disk.mergedSnapshot.animals).toHaveLength(0);
        const offline = buildHeldPayloadFromState({ lastGoodMergedSnapshot: disk.mergedSnapshot });
        expect(offline == null || offline.animals.length === 0).toBe(true);
        expect(liftSectionOutcomes({ animals: [], sectionOutcomes: current.sectionOutcomes }).sectionOutcomes.animals.outcome).toBe("empty");
    });

    test("real processLuaData and mergeData keep a serialized empty export empty", () => {
        const encoded = run(`
            g_time = 9000
            local s = subject({
                animals = {},
                fields = {},
                stock = { enabled = true, byFarm = {} },
                vehicles = { { id = "v1" } },
            })
            s:finishModuleSlice("animals", {"animals"}, false, false)
            s:finishModuleSlice("fields", {"fields"}, false, false)
            s:finishModuleSlice("stock", {"stock"}, false, false)
            s:finishModuleSlice("vehicles", {"vehicles"}, false, false)
            return s:toJSON(s.data, 0)
        `);
        const current = JSON.parse(encoded);
        expect(current.sectionOutcomes.animals.outcome).toBe("empty");
        const serverStates = {
            local: {
                active: true,
                lastGoodMergedSnapshot: {
                    animals: [{ animalCount: 4 }],
                    fields: [{ id: 1, hectares: 2 }],
                    vehicles: [{ id: "v1" }],
                },
                mergedData: {
                    animals: [{ animalCount: 4 }],
                    fields: [{ id: 1, hectares: 2 }],
                    vehicles: [{ id: "v1" }],
                },
            },
        };
        const mergedCalls = [];
        const api = productionFunctions("FS25_FarmDashboard_App/main.js", [
            "stripUtf8Bom",
            "parseLuaJsonObject",
            "processLuaData",
        ], {
            serverStates,
            getServersFromStore: () => [{ id: "local", mode: "local" }],
            isExplicitReplicaXmlSource: () => false,
            mergeData,
            exportIngress,
            ingressOrchestration,
            shouldIgnoreMinimalLuaExport: shouldIgnoreMinimalLuaExport,
            liftSectionOutcomes,
            applyLiveSectionHold,
            buildHeldPayloadFromState,
            updateLiveSectionBackup: () => {},
            updateLastGoodMergedSnapshot: () => {},
            applyMergedSnapshotIfStaleExport: (merged) => merged,
            console,
            buildFieldLiveFingerprints: () => ({}),
            appendFieldHistory: (history) => history || {},
            safeFsIdentity: { sanitizeSaveSlot: (value, fallback) => value || fallback },
            triggerXmlPoll: () => {},
            broadcast: () => {},
            schedulePersistServerCache: () => {},
            rebuildMerged: async (serverId) => {
                const state = serverStates[serverId];
                const merged = mergeData(state.luaData, null, {});
                mergedCalls.push(merged);
                state.mergedData = applyLiveSectionHold(merged, state, state.luaData, null);
            },
        });
        api.processLuaData("local", encoded, { sessionId: "current", careerId: "career", sourceId: "local" });
        expect(serverStates.local.luaData.sectionOutcomes.animals.outcome).toBe("empty");
        expect(serverStates.local.luaData.animals).toHaveLength(0);
        expect(mergedCalls.length).toBe(1);
        expect(serverStates.local.mergedData.animals).toHaveLength(0);
        const recovered = run(`
            g_time = 12000
            local s = subject({ animals = { { animalCount = 2, animals = {}, lod = "agg" } }, vehicles = { { id = "v1" } } })
            s:finishModuleSlice("animals", {"animals"}, false, false)
            s:finishModuleSlice("vehicles", {"vehicles"}, false, false)
            return s:toJSON(s.data, 0)
        `);
        api.processLuaData("local", recovered, { sessionId: "current", careerId: "career", sourceId: "local" });
        expect(serverStates.local.luaData.sectionOutcomes.animals.outcome).toBe("ok");
        expect(serverStates.local.luaData.animals[0].animalCount).toBe(2);
    });

    test("a rejected section does not erase the last sample through processLuaData and mergeData", () => {
        const packed = run(`
            local s = subject({ fields = { { id = 1, hectares = 2 } }, animals = { { animalCount = 4, animals = {}, lod = "agg" } } })
            g_time = 111
            s:finishModuleSlice("fields", {"fields"}, false, false)
            s:finishModuleSlice("animals", {"animals"}, false, false)
            local first = s:toJSON(s.data, 0)
            g_time = 9000
            s.collectors = { fields = { collectStep = function() return true, "unavailable" end } }
            s._incActiveModule = "fields"
            s:runIncrementalActiveStep({"fields"})
            local second = s:toJSON(s.data, 0)
            g_time = 12000
            s.collectors = { fields = { collectStep = function() return true, { { id = 7, hectares = 4 } } end } }
            s._incActiveModule = "fields"
            s:runIncrementalActiveStep({"fields"})
            return first .. "\\n---FH-SPLIT---\\n" .. second .. "\\n---FH-SPLIT---\\n" .. s:toJSON(s.data, 0)
        `);
        const parts = packed.split("\n---FH-SPLIT---\n");
        expect(parts).toHaveLength(3);
        const serverStates = {
            local: {
                active: true,
                lastGoodMergedSnapshot: null,
                mergedData: null,
            },
        };
        const api = productionFunctions("FS25_FarmDashboard_App/main.js", [
            "stripUtf8Bom",
            "parseLuaJsonObject",
            "processLuaData",
        ], {
            serverStates,
            getServersFromStore: () => [{ id: "local", mode: "local" }],
            isExplicitReplicaXmlSource: () => false,
            mergeData,
            exportIngress,
            ingressOrchestration,
            shouldIgnoreMinimalLuaExport,
            liftSectionOutcomes,
            applyLiveSectionHold,
            buildHeldPayloadFromState,
            updateLiveSectionBackup: () => {},
            updateLastGoodMergedSnapshot: () => {},
            applyMergedSnapshotIfStaleExport: (merged) => merged,
            console,
            buildFieldLiveFingerprints: () => ({}),
            appendFieldHistory: (history) => history || {},
            safeFsIdentity: { sanitizeSaveSlot: (value, fallback) => value || fallback },
            triggerXmlPoll: () => {},
            broadcast: () => {},
            schedulePersistServerCache: () => {},
            rebuildMerged: async (serverId) => {
                const state = serverStates[serverId];
                const merged = mergeData(state.luaData, null, {});
                state.mergedData = applyLiveSectionHold(merged, state, state.luaData, null);
            },
        });
        api.processLuaData("local", parts[0], { sessionId: "current", careerId: "career", sourceId: "local" });
        expect(serverStates.local.mergedData.fields[0].id).toBe(1);
        api.processLuaData("local", parts[1], { sessionId: "current", careerId: "career", sourceId: "local" });
        expect(serverStates.local.luaData.sectionOutcomes.fields.outcome).toBe("failed");
        expect(serverStates.local.luaData.sectionOutcomes.fields.sampledAt).toBe(111);
        expect(serverStates.local.luaData.fields[0].id).toBe(1);
        expect(serverStates.local.mergedData.fields[0].id).toBe(1);
        expect(serverStates.local.mergedData.animals[0].animalCount).toBe(4);
        api.processLuaData("local", parts[2], { sessionId: "current", careerId: "career", sourceId: "local" });
        expect(serverStates.local.luaData.sectionOutcomes.fields.outcome).toBe("ok");
        expect(serverStates.local.luaData.fields[0].id).toBe(7);
        expect(serverStates.local.mergedData.fields[0].id).toBe(7);
    });
});
