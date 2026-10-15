"use strict";

/**
 * Production collectors under the environment FS25 gives an ordinary script mod
 * (extract/decompiled/scripts/mods.lua:300-322):
 *   modEnv = {}; _G[modName] = modEnv; setmetatable(modEnv, { __index = _G }); modEnv._G = modEnv
 *   modEnv.getfenv returns modEnv where the engine would return the global table.
 * Engine classes, managers and mission state are inherited, never own keys. Another mod's globals
 * live in that mod's own environment (_G[otherModName]), never on the engine table.
 * "own" mode copies every engine name onto modEnv: the flat layout older Fengari suites used.
 */
const fs = require("fs");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");

const modSrc = path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src");

function longString(text) {
    let level = 0;
    while (text.includes("]" + "=".repeat(level) + "]")) level += 1;
    const eq = "=".repeat(level);
    return "[" + eq + "[\n" + text + "]" + eq + "]";
}

const prelude = `
unpack = unpack or table.unpack
LOG = {}
Logging = {
    info = function(f, ...) LOG[#LOG + 1] = "I " .. string.format(f, ...) end,
    warning = function(f, ...) LOG[#LOG + 1] = "W " .. string.format(f, ...) end,
}
FarmDashLog = { devWarn = function() end, dev = function() end, error = function(f, ...) LOG[#LOG + 1] = "E " .. string.format(f, ...) end, warn = function() end, info = function() end, isVerbose = function() return false end }
g_time = 1000
g_modIsLoaded = {}
function makeModEnv(name, symbols)
    local env = setmetatable({}, { __index = _G })
    env._G = env
    for k, v in pairs(symbols or {}) do rawset(env, k, v) end
    _G[name] = env
    return env
end
NODEPOS = { [101] = { 10, 10 } }
function getWorldTranslation(node) local p = NODEPOS[node]; if p then return p[1], 0, p[2] end return nil end
FARMLAND = { id = 5, farmId = 1 }
g_farmlandManager = {
    getFarmlandIdAtWorldPosition = function(self, x, z) return 5 end,
    getFarmlandAtWorldPosition = function(self, x, z) return FARMLAND end,
    getFarmlandById = function(self, id) if id == 5 then return FARMLAND end end,
}
g_fieldManager = { fields = { { farmland = FARMLAND, areaHa = 1, posX = 10, posZ = 10, fieldId = 1 } } }
FT = {
    [2] = { index = 2, name = "WHEAT", title = "Wheat", pricePerLiter = 0.4, economy = { factors = {}, history = {} } },
    [3] = { index = 3, name = "STRAW", title = "Straw" },
    [7] = { index = 7, name = "TARP", title = "Tarp" },
    [8] = { index = 8, name = "CHAFF", title = "Chaff" },
    [11] = { index = 11, name = "SILAGE", title = "Silage" },
}
g_fillTypeManager = {
    fillTypes = { FT[2], FT[3], FT[7], FT[8], FT[11] },
    getFillTypes = function(self) return self.fillTypes end,
    getFillTypeByIndex = function(self, i) return FT[i] end,
    getFillTypeNameByIndex = function(self, i) return FT[i] and FT[i].name or nil end,
    getFillTypeIndexByName = function(self, n) for i, ft in pairs(FT) do if ft.name == n then return i end end end,
}
g_currentMission = {
    getFarmId = function() return 1 end,
    missionInfo = { savegameDirectory = "savegame1", mapId = "MapUS" },
}
`;

// Engine classes as FS25 1.20 defines them (extract/decompiled/scripts paths in the report).
const engineClasses = `
SlotSystem = { LIMITED_OBJECT_BALE = 1 }
FieldGroundType = { STUBBLE_TILLAGE = 2, RIDGE = 7 }
BunkerSilo = { STATE_FILL = 0, STATE_CLOSED = 1, STATE_FERMENTED = 2, STATE_DRAIN = 3 }
SeasonPeriod = { EARLY_SPRING = 1, MID_SPRING = 2, LATE_SPRING = 3, EARLY_SUMMER = 4, MID_SUMMER = 5, LATE_SUMMER = 6, EARLY_AUTUMN = 7, MID_AUTUMN = 8, LATE_AUTUMN = 9, EARLY_WINTER = 10, MID_WINTER = 11, LATE_WINTER = 12 }
AccessHandler = { EVERYONE = 0 }
SellingStation = {}
VehiclePropertyState = { NONE = 1, OWNED = 2, LEASED = 3, MISSION = 4, SHOP_CONFIG = 5 }
FillType = { STRAW = 3, TARP = 7, CHAFF = 8 }
DensityMapHeightUtil = { getFillLevelAtArea = function(fillTypeIndex, x0, z0, x1, z1, x2, z2) return 0 end }
g_densityMapHeightManager = {
    getIsValid = function(self) return true end,
    getDensityMapHeightTypes = function(self) return { { fillTypeIndex = 7 }, { fillTypeIndex = 8 } } end,
}
`;

const helpers = `
function dump(v, d)
    d = d or 0
    if type(v) ~= "table" then return tostring(v) end
    if d > 5 then return "{..}" end
    local keys = {}
    for k in pairs(v) do keys[#keys + 1] = k end
    table.sort(keys, function(a, b) return tostring(a) < tostring(b) end)
    local parts = {}
    for _, k in ipairs(keys) do parts[#parts + 1] = tostring(k) .. "=" .. dump(v[k], d + 1) end
    return "{" .. table.concat(parts, ",") .. "}"
end
`;

function run({ files, engine = "", body, mode = "inherited", classes = true }) {
    const L = lauxlib.luaL_newstate();
    try {
        lualib.luaL_openlibs(L);
        const sources = files.map((file) => `{ name = ${JSON.stringify(file)}, text = ${longString(fs.readFileSync(path.join(modSrc, file), "utf8"))} }`);
        const chunk = [
            "local BEFORE = {}",
            "for k in pairs(_G) do BEFORE[k] = true end",
            prelude,
            classes ? engineClasses : "",
            engine,
            "ENGINE = _G",
            "ENGINE_NAMES = {}",
            "for k in pairs(_G) do if not BEFORE[k] and k ~= 'ENGINE' and k ~= 'ENGINE_NAMES' then ENGINE_NAMES[#ENGINE_NAMES + 1] = k end end",
            "local modEnv = {}",
            "FS25_FarmDashboard = modEnv",
            "setmetatable(modEnv, { __index = _G })",
            "modEnv._G = modEnv",
            "function modEnv.getfenv(obj) return modEnv end",
            `if ${JSON.stringify(mode)} == "own" then for _, n in ipairs(ENGINE_NAMES) do rawset(modEnv, n, _G[n]) end end`,
            `local SOURCES = { ${sources.join(",\n")} }`,
            "for i = 1, #SOURCES do local fn = assert(load(SOURCES[i].text, '=' .. SOURCES[i].name, 't', modEnv)); fn() end",
            `local body = assert(load(${longString(helpers + "\n" + body)}, '=body', 't', modEnv))`,
            "return body()",
        ].join("\n");
        const status = lauxlib.luaL_dostring(L, to_luastring(chunk));
        if (status !== lua.LUA_OK) {
            const err = lua.lua_tostring(L, -1);
            throw new Error(err ? to_jsstring(err) : `lua error ${status}`);
        }
        return to_jsstring(lua.lua_tostring(L, -1));
    } finally {
        lua.lua_close(L);
    }
}

const FIELD_FILES = ["FillTypeUtils.lua", "collectors/FieldDataCollector.lua"];
const BALE_FILES = ["FillTypeUtils.lua", "InventoryScan.lua", "collectors/BaleInventoryCollector.lua"];
const STOCK_FILES = ["FillTypeUtils.lua", "InventoryScan.lua", "collectors/StockDataCollector.lua"];
const ECON_FILES = ["FillTypeUtils.lua", "collectors/EconomyDataCollector.lua"];
const VEHICLE_FILES = ["collectors/VehicleDataCollector.lua"];
const COMPANION_FILES = ["MissionActiveRegistry.lua", "collectors/CompanionModsDataCollector.lua"];
const COMPANION_FLAT_FILES = ["collectors/CompanionModsDataCollector.lua"];
const CROP_FILES = ["collectors/rf/RfCropStressDataCollector.lua"];
const DAIRY_FILES = ["collectors/rf/RfDairyDataCollector.lua"];

const slotBale = `
BALE = { uniqueId = "b1", nodeId = 101, fillType = 3, fillLevel = 4000, ownerFarmId = 1, className = "Bale" }
g_currentMission.slotSystem = { objectLimits = { [1] = { objects = { BALE } } } }
`;

const fieldBody = `
local res = FieldDataCollector:collect()
local f = res[1] or {}
return "bales=" .. tostring(f.baleCountOnField) .. "|registered=" .. tostring(f.windrowFillTypesRegistered)
`;

describe("098 field and soil collectors under the native mod environment", () => {
    test("slot-system bales and engine height types reach the field export", () => {
        expect(run({ files: FIELD_FILES, engine: slotBale, body: fieldBody })).toBe("bales=1|registered=2");
    });

    test("flat layout control gives the same field export", () => {
        expect(run({ files: FIELD_FILES, engine: slotBale, body: fieldBody, mode: "own" })).toBe("bales=1|registered=2");
    });

    test("a later mission's FillType table and height manager are read on the next collection", () => {
        const body = `
local first = FieldDataCollector:collect()[1]
ENGINE.FillType = { STRAW = 3, TARP = 8 }
ENGINE.g_densityMapHeightManager = {
    getIsValid = function(self) return true end,
    getDensityMapHeightTypes = function(self) return { { fillTypeIndex = 7 }, { fillTypeIndex = 8 }, { fillTypeIndex = 11 } } end,
}
local second = FieldDataCollector:collect()[1]
ENGINE.g_densityMapHeightManager = nil
local third = FieldDataCollector:collect()[1]
return first.windrowFillTypesRegistered .. "|" .. second.windrowFillTypesRegistered .. "|" .. third.windrowFillTypesRegistered
`;
        // first: STRAW + CHAFF (TARP skipped); second: STRAW + TARP + SILAGE (new TARP id 8 skipped);
        // third: manager unloaded, STRAW only.
        expect(run({ files: FIELD_FILES, engine: slotBale, body })).toBe("2|3|1");
    });

    test("absent and wrong-typed engine globals degrade without throwing", () => {
        const absent = run({ files: FIELD_FILES, engine: slotBale, body: fieldBody, classes: false });
        expect(absent).toBe("bales=0|registered=0");
        const wrong = `
${slotBale}
SlotSystem = "slots"
FillType = true
g_densityMapHeightManager = 42
GameSettings = 7
FieldGroundType = "x"
Bale = 3
DensityMapHeightUtil = { getFillLevelAtArea = function() return 0 end }
`;
        expect(run({ files: FIELD_FILES, engine: wrong, body: fieldBody, classes: false })).toBe("bales=0|registered=1");
    });

    test("a throwing height-manager validity probe skips that source only", () => {
        const engine = `${slotBale}
g_densityMapHeightManager = { getIsValid = function() error("not ready") end, getDensityMapHeightTypes = function() return {} end }
`;
        expect(run({ files: FIELD_FILES, engine, body: fieldBody })).toBe("bales=1|registered=1");
    });
});

describe("098 inventory and bale collectors under the native mod environment", () => {
    const baleBody = `
local res = BaleInventoryCollector:collect()
local fill, closed, fermented, drain = InventoryScan.bunkerStateConstants()
local names = {}
for s = 0, 3 do names[#names + 1] = tostring(InventoryScan.bunkerStateName(s, fill, closed, fermented, drain)) end
local onField = res.onField or {}
local n = (onField.straw or 0) + (onField.other or 0) + (onField.grass or 0) + (onField.hay or 0) + (onField.silage or 0)
return "onField=" .. n .. "|states=" .. table.concat(names, ",")
`;

    test("slot-system bales are counted and BunkerSilo states use the engine constants", () => {
        expect(run({ files: BALE_FILES, engine: slotBale, body: baleBody })).toBe("onField=1|states=fill,closed,fermented,drain");
    });

    test("flat layout control gives the same inventory reading", () => {
        expect(run({ files: BALE_FILES, engine: slotBale, body: baleBody, mode: "own" })).toBe("onField=1|states=fill,closed,fermented,drain");
    });

    test("without BunkerSilo the fallback still matches the engine numbering", () => {
        expect(run({ files: BALE_FILES, engine: slotBale, body: baleBody, classes: false })).toBe("onField=0|states=fill,closed,fermented,drain");
    });

    const stockEngine = `
FARM_MANAGER_FARMS = { { farmId = 1, name = "Farm A" }, { farmId = 2, name = "Farm B" } }
g_farmManager = { farms = FARM_MANAGER_FARMS }
BUNKER = { getName = function() return "Clamp" end, ownerFarmId = 1,
    spec_bunkerSilo = { bunkerSilo = { state = 1, fillLevel = 1000, inputFillType = 8, outputFillType = 11, fermentingPercent = 0.5 } } }
BUNKER2 = { getName = function() return "Clamp B" end, ownerFarmId = 2,
    spec_bunkerSilo = { bunkerSilo = { state = 0, fillLevel = 500, inputFillType = 8, outputFillType = 11, compactedPercent = 40 } } }
g_currentMission.placeableSystem = { placeables = { BUNKER, BUNKER2 } }
BUYER = { ownerFarmId = 0, acceptedFillTypes = { [11] = true, [8] = true },
    isa = function(self, cls) return cls == SellingStation end,
    getName = function() return "Silage Buyer" end,
    getEffectiveFillTypePrice = function(self, i) return 0.8 end }
g_currentMission.economyManager = { sellingStations = { BUYER }, getPricePerLiter = function(self, i) return 0.3 end }
`;
    // Engine prices are money per litre; the export keeps them unrounded.
    const stockPriceBody = `
local res = StockDataCollector:collect()
local out = {}
for _, fid in ipairs({ 1, 2 }) do
    local bucket = res.byFarm[fid] or res.byFarm[tostring(fid)] or {}
    for _, item in ipairs(bucket.items or {}) do out[#out + 1] = fid .. ":" .. string.format("%.14g", item.bestSellPrice) end
end
return table.concat(out, ";")
`;
    const stockBody = `
local res = StockDataCollector:collect()
local out = {}
for _, fid in ipairs({ 1, 2 }) do
    local bucket = res.byFarm[fid] or res.byFarm[tostring(fid)] or {}
    for _, item in ipairs(bucket.items or {}) do
        local loc = item.locations and item.locations[1] or {}
        out[#out + 1] = fid .. ":" .. tostring(item.fillType) .. ":" .. tostring(loc.bunkerState) .. ":" .. tostring(item.bestSellStation)
    end
end
return table.concat(out, ";")
`;

    test("bunker silo state and selling-station prices resolve per farm", () => {
        expect(run({ files: STOCK_FILES, engine: stockEngine, body: stockBody })).toBe("1:SILAGE:closed:Silage Buyer;2:CHAFF:fill:Silage Buyer");
        expect(run({ files: STOCK_FILES, engine: stockEngine, body: stockPriceBody })).toBe("1:0.8;2:0.8");
    });

    test("flat layout control gives the same stock reading", () => {
        expect(run({ files: STOCK_FILES, engine: stockEngine, body: stockBody, mode: "own" })).toBe("1:SILAGE:closed:Silage Buyer;2:CHAFF:fill:Silage Buyer");
        expect(run({ files: STOCK_FILES, engine: stockEngine, body: stockPriceBody, mode: "own" })).toBe("1:0.8;2:0.8");
    });
});

describe("098 prices and season periods under the native mod environment", () => {
    const econEngine = `
for p = 1, 12 do FT[2].economy.factors[p] = (p == 7) and 1.3 or 1.0; FT[2].economy.history[p] = (p == 2) and 0.9 or 0.4 end
STATION = { id = 9, acceptedFillTypes = { [2] = true }, getName = function() return "Mill" end, getEffectiveFillTypePrice = function(self, i) return 0.5 end }
g_currentMission.economyManager = { sellingStations = { STATION }, getPricePerLiter = function(self, i) return 0.45 end }
`;
    const econBody = `
local w = EconomyDataCollector:collect().marketPrices.crops.WHEAT
local h = w.priceHistory
return tostring(w.maxPriceMonth) .. "|" .. tostring(h.MID_SPRING) .. "|" .. tostring(h.EARLY_AUTUMN)
`;

    test("price history and best month come from the engine season-period history", () => {
        expect(run({ files: ECON_FILES, engine: econEngine, body: econBody })).toBe("Apr|0.9|0.4");
    });

    test("flat layout control gives the same price reading", () => {
        expect(run({ files: ECON_FILES, engine: econEngine, body: econBody, mode: "own" })).toBe("Apr|0.9|0.4");
    });

    test("a history that moves between collections is read fresh", () => {
        const body = `
local first = EconomyDataCollector:collect().marketPrices.crops.WHEAT.priceHistory.MID_SPRING
FT[2].economy.history[2] = 0.7
EconomyDataCollector.lastCollectTime = nil
local second = EconomyDataCollector:collect().marketPrices.crops.WHEAT.priceHistory.MID_SPRING
return tostring(first) .. "|" .. tostring(second)
`;
        expect(run({ files: ECON_FILES, engine: econEngine, body })).toBe("0.9|0.7");
    });

    test("a wrong-typed SeasonPeriod falls back to period-indexed factors", () => {
        expect(run({ files: ECON_FILES, engine: econEngine + "\nSeasonPeriod = 12\n", body: econBody })).toBe("Sep|1.0|1.3");
    });
});

describe("098 vehicle ownership under the native mod environment", () => {
    const vehicleBody = `
local out = {}
for _, ps in ipairs({ 2, 3, 5 }) do
    local v = { propertyState = ps }
    out[#out + 1] = ps .. ":" .. tostring(VehicleDataCollector:_propertyStateIsPlayerOwned(v)) .. ":" .. tostring(VehicleDataCollector:_serializePropertyState(v))
end
return table.concat(out, ";")
`;

    test("leased and shop-configuration vehicles keep their engine property state", () => {
        expect(run({ files: VEHICLE_FILES, body: vehicleBody })).toBe("2:true:OWNED;3:true:LEASED;5:false:SHOP_CONFIG");
    });

    test("flat layout control gives the same ownership reading", () => {
        expect(run({ files: VEHICLE_FILES, body: vehicleBody, mode: "own" })).toBe("2:true:OWNED;3:true:LEASED;5:false:SHOP_CONFIG");
    });

    test("a wrong-typed VehiclePropertyState keeps the string and numeric fallbacks", () => {
        expect(run({ files: VEHICLE_FILES, engine: 'VehiclePropertyState = "bad"', body: vehicleBody })).toBe("2:true:OWNED;3:true:OWNED;5:true:OWNED");
    });
});

describe("098 companion readers under the native mod environment", () => {
    const companionEngine = `
g_modIsLoaded.FS25_AutomaticLoanRepay = true
g_modIsLoaded.FS25_BetterContracts = true
makeModEnv("FS25_AutomaticLoanRepay", { g_automaticLoanRepay = { minimumBalance = 5000, repaymentHour = 6 } })
makeModEnv("FS25_BetterContracts", { BetterContracts = { config = { lazyNPC = true, hardMode = false } } })
ACTIVE = { { modName = "FS25_AutomaticLoanRepay" }, { modName = "FS25_BetterContracts" } }
g_modManager = { getActiveMods = function(self) return ACTIVE end }
g_missionManager = { missions = { {}, {} } }
`;
    const companionBody = `
local _, out = CompanionModsDataCollector:collectStep({})
local alr = out.automaticLoanRepay or {}
local bc = out.betterContracts or {}
return tostring(alr.minimumBalance) .. "|" .. tostring(alr.repaymentHour) .. "|" .. tostring(alr.readState) .. "|" .. tostring(bc.lazyNPC) .. "|" .. tostring(bc.hardMode) .. "|" .. tostring(bc.missionCount)
`;

    test("loaded companions are read from their own mod environment", () => {
        expect(run({ files: COMPANION_FILES, engine: companionEngine, body: companionBody })).toBe("5000|6|nil|true|false|2");
    });

    test("a same-named table on the dashboard environment is a shadow and is ignored", () => {
        const body = `rawset(_G, "BetterContracts", { config = { lazyNPC = false, hardMode = true } })
rawset(_G, "g_automaticLoanRepay", { minimumBalance = 1 })
${companionBody}`;
        expect(run({ files: COMPANION_FILES, engine: companionEngine, body })).toBe("5000|6|nil|true|false|2");
    });

    test("an installed but unchecked companion is not read", () => {
        const engine = `${companionEngine}
g_modIsLoaded.FS25_AutomaticLoanRepay = nil
ACTIVE = { { modName = "FS25_BetterContracts" } }
`;
        const body = `
local _, out = CompanionModsDataCollector:collectStep({})
return tostring(out.automaticLoanRepay) .. "|" .. tostring(out.betterContracts and out.betterContracts.lazyNPC)
`;
        expect(run({ files: COMPANION_FILES, engine, body })).toBe("nil|true");
    });

    test("a throwing companion reader fails alone and keeps its neighbour", () => {
        const engine = `${companionEngine}
FS25_AutomaticLoanRepay.g_automaticLoanRepay = setmetatable({}, { __index = function() error("boom") end })
`;
        expect(run({ files: COMPANION_FILES, engine, body: companionBody })).toBe("nil|nil|failed|true|false|2");
    });

    test("flat layout control keeps the older single-environment readers", () => {
        const engine = `
g_modIsLoaded.FS25_AutomaticLoanRepay = true
g_modIsLoaded.FS25_BetterContracts = true
g_automaticLoanRepay = { minimumBalance = 5000, repaymentHour = 6 }
BetterContracts = { config = { lazyNPC = true, hardMode = false } }
g_missionManager = { missions = { {}, {} } }
`;
        expect(run({ files: COMPANION_FLAT_FILES, engine, body: companionBody, mode: "own" })).toBe("5000|6|nil|true|false|2");
    });

    const cropBody = `
local loaded = RfCropStressDataCollector.isModLoaded()
RfCropStressDataCollector:collectBegin()
local _, payload = RfCropStressDataCollector:collectStep({ rfLandFieldsPerFrame = 99 })
return tostring(loaded) .. "|" .. tostring(payload.enabled) .. "|" .. tostring(payload.fieldCount)
`;
    const authority = `rawset(_G, "FarmDashboard", { isAuthority = function() return AUTH end })\n`;

    test("Seasonal Crop Stress is loaded before its mission manager attaches", () => {
        const engine = `g_modIsLoaded.FS25_SeasonalCropStress = true\nAUTH = true\n`;
        expect(run({ files: CROP_FILES, engine, body: authority + cropBody })).toBe("true|false|0");
    });

    test("the late Crop Stress manager is read, clients stay disabled, and unload clears it", () => {
        const engine = `
g_modIsLoaded.FS25_SeasonalCropStress = true
AUTH = true
MANAGER = { getMoisture = function(self, id) return 0.2 end, getStress = function(self, id) return 0.1 end }
`;
        const body = `${authority}
local out = {}
RfCropStressDataCollector:collectBegin()
local _, p0 = RfCropStressDataCollector:collectStep({ rfLandFieldsPerFrame = 99 })
out[#out + 1] = tostring(p0.enabled)
g_currentMission.cropStressManager = MANAGER
RfCropStressDataCollector:collectBegin()
local _, p1 = RfCropStressDataCollector:collectStep({ rfLandFieldsPerFrame = 99 })
out[#out + 1] = tostring(p1.enabled) .. ":" .. tostring(p1.fieldCount)
ENGINE.AUTH = false
RfCropStressDataCollector:collectBegin()
local _, p2 = RfCropStressDataCollector:collectStep({ rfLandFieldsPerFrame = 99 })
out[#out + 1] = tostring(p2.enabled)
ENGINE.AUTH = true
g_currentMission.cropStressManager = nil
g_modIsLoaded.FS25_SeasonalCropStress = nil
out[#out + 1] = tostring(RfCropStressDataCollector.isModLoaded())
return table.concat(out, "|")
`;
        expect(run({ files: CROP_FILES, engine, body })).toBe("false|true:1|false|false");
    });

    test("an unchecked Crop Stress install stays unloaded", () => {
        expect(run({ files: CROP_FILES, engine: "AUTH = true\n", body: authority + cropBody })).toBe("false|false|0");
    });

    test("flat layout control reports the same Crop Stress state", () => {
        const engine = `g_modIsLoaded.FS25_SeasonalCropStress = true\nAUTH = true\n`;
        expect(run({ files: CROP_FILES, engine, body: authority + cropBody, mode: "own" })).toBe("true|false|0");
    });

    const dairyEngine = `
g_modIsLoaded.FS25_DairyCore = true
makeModEnv("FS25_DairyCore", { DairyConstants = { CONTRACTS = { TYPES = { standard = { key = "standard", name = "Standard Dairy Contract" } } } } })
DAIRY = {
    contracts = { [4] = { type = "standard", delivered = 100, volumeTarget = 8000, daysRemaining = 10 } },
    barns = { b1 = { activeContractId = 4, farmId = 1 }, b2 = { farmId = 2 } },
    getBarnRows = function(self)
        return { { barnId = "b1", farmId = 1, herdHealth = 90, qualityTier = "premium" }, { barnId = "b2", farmId = 2, herdHealth = 70, qualityTier = "standard" } }
    end,
}
g_currentMission.dairyCoreManager = DAIRY
`;
    const dairyBody = `
local _, p = RfDairyDataCollector:collectStep({})
local out = {}
for _, fid in ipairs({ "1", "2" }) do
    local farm = p.byFarm and p.byFarm[fid]
    local barn = farm and farm.barns[1] or {}
    out[#out + 1] = fid .. ":" .. tostring(barn.barnId) .. ":" .. tostring(barn.milkQualityTier) .. ":" .. tostring(barn.contractSummary)
end
return tostring(p.enabled) .. "|" .. table.concat(out, "|")
`;
    const dairyExpected = "true|1:b1:Premium:Standard Dairy Contract · 10d left · 100/8000 L|2:b2:Standard:nil";

    test("Dairy Core contract names come from its own environment and farms stay separate", () => {
        expect(run({ files: DAIRY_FILES, engine: dairyEngine, body: dairyBody })).toBe(dairyExpected);
    });

    test("a dashboard DairyConstants shadow is ignored", () => {
        const body = `rawset(_G, "DairyConstants", { CONTRACTS = { TYPES = { standard = { name = "Shadow" } } } })\n${dairyBody}`;
        expect(run({ files: DAIRY_FILES, engine: dairyEngine, body })).toBe(dairyExpected);
    });

    test("an unchecked Dairy Core keeps the raw contract key", () => {
        const engine = `${dairyEngine}\ng_modIsLoaded.FS25_DairyCore = nil\n`;
        expect(run({ files: DAIRY_FILES, engine, body: dairyBody })).toBe("true|1:b1:Premium:standard · 10d left · 100/8000 L|2:b2:Standard:nil");
    });

    test("flat layout control reads the same Dairy Core names", () => {
        expect(run({ files: DAIRY_FILES, engine: dairyEngine, body: dairyBody, mode: "own" })).toBe(dairyExpected);
    });
});
