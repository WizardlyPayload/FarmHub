"use strict";

const fs = require("fs");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");

const collector = fs.readFileSync(path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua"), "utf8");
const luaQuote = (s) => {
    let marks = "";
    while (s.includes("]" + marks + "]")) marks += "=";
    return "[" + marks + "[" + s + "]" + marks + "]";
};

function run(body) {
    const L = lauxlib.luaL_newstate();
    try {
        lualib.luaL_openlibs(L);
        const script = `
unpack = unpack or table.unpack
g_time = 1000
FarmDashLog = { devWarn=function() end, dev=function() end, error=function() end, warn=function() end, info=function() end, isVerbose=function() return false end }
Logging = { info=function() end, warning=function() end }
FieldGroundType = { STUBBLE_TILLAGE=2, RIDGE=7 }
local farmland = { id=5, farmId=1 }
g_farmlandManager = {
    getFarmlandAtWorldPosition=function(_, x) if x > 140 then return nil end return farmland end,
    getFarmlandIdAtWorldPosition=function() return 5 end,
    getFarmlandById=function() return farmland end,
}
local field = { farmland=farmland, areaHa=1, posX=100, posZ=100, fieldId=1 }
g_fieldManager = { fields = { field } }
g_currentMission = { getFarmId=function() return 1 end, missionInfo={ savegameDirectory="ring-cache-test" } }
local fruits = {
    [2]={ index=2, name="WHEAT", title="Wheat", numGrowthStates=5 },
    [3]={ index=3, name="GRASS", title="Grass", numGrowthStates=5 },
    [4]={ index=4, name="MEADOW", title="Meadow", numGrowthStates=5 },
}
g_fruitTypeManager = { getFruitTypeByIndex=function(_, i) return fruits[i] end }
local calls = { probe=0, field=0 }
local seen = { probe={}, field={} }
local scenario = "wheat"
local failCenterOnce = false
local function point(kind, x, z)
    local center = x == 100 and z == 100
    local grass = scenario == "grass"
    local empty = scenario == "empty"
    local delayedCrop = scenario == "unowned"
    local splitCrop = scenario == "center"
    local cultivatedMeadow = scenario == "cultivatedMeadow"
    local outsidePrepared = scenario == "outsidePrepared"
    local innerPrepared = cultivatedMeadow and not center and math.abs(x - 100) < 23 and math.abs(z - 100) < 23
    local otherFieldPrepared = outsidePrepared and (math.abs(x - 100) > 20 or math.abs(z - 100) > 20)
    return {
        fruitTypeIndex = empty and 0 or ((cultivatedMeadow or outsidePrepared) and ((innerPrepared or otherFieldPrepared) and 0 or 4) or (delayedCrop and (x > 120 and 3 or 0) or (splitCrop and (center and 2 or 3) or (grass and 3 or 2)))),
        growthState = grass and (center and 4 or (x < 80 and 2 or 5)) or (empty and 0 or 3),
        sprayLevel = 2, plowLevel=1, limeLevel=1,
        weedState = x < 80 and 4 or (kind == "field" and 2 or 1),
        stubbleShredLevel = (cultivatedMeadow or outsidePrepared) and 0 or (x < 80 and (kind == "field" and 5 or 3) or 1),
        groundType=(cultivatedMeadow or outsidePrepared) and ((innerPrepared or otherFieldPrepared) and 3 or 1) or (empty and 3 or 8),
        rollerLevel = kind == "field" and (z > 130 and 1 or 0.2) or 0.3,
        stoneLevel = kind == "field" and (x < 80 and 9 or 1) or (x < 80 and 6 or 2),
        waterLevel = kind == "field" and (x < 80 and 0.9 or 0.1) or (x < 80 and 0.7 or 0.2),
    }
end
local function state(kind)
    return { update=function(self, x, z)
        calls[kind] = calls[kind] + 1
        local key = tostring(x) .. "|" .. tostring(z)
        seen[kind][key] = (seen[kind][key] or 0) + 1
        if kind == "probe" and x == 100 and z == 100 and failCenterOnce then
            failCenterOnce = false
            error("temporary probe failure")
        end
        for k, v in pairs(point(kind, x, z)) do self[k] = v end
    end }
end
FieldState = { new=function() return state("probe") end }
field.fieldState = state("field")
local modEnv = setmetatable({}, { __index=_G })
modEnv._G = modEnv
assert(load(${luaQuote(collector)}, "=FieldDataCollector.lua", "t", modEnv))()
local function eq(actual, expected, name)
    assert(actual == expected, name .. ": expected " .. tostring(expected) .. ", got " .. tostring(actual))
end
local function near(actual, expected, name)
    assert(math.abs(actual - expected) < 0.00001, name .. ": expected " .. expected .. ", got " .. tostring(actual))
end
local function freshCalls()
    calls.probe, calls.field = 0, 0
    seen.probe, seen.field = {}, {}
end
local function uniqueOnce(kind, expected)
    eq(calls[kind], expected, kind .. " update calls")
    local n = 0
    for _, count in pairs(seen[kind]) do eq(count, 1, kind .. " point repeat"); n = n + 1 end
    eq(n, expected, kind .. " unique points")
end
${body}
return "ok"
`;
        const status = lauxlib.luaL_dostring(L, to_luastring(script));
        if (status !== lua.LUA_OK) throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
        return to_jsstring(lua.lua_tostring(L, -1));
    } finally {
        lua.lua_close(L);
    }
}

test("owned wheat keeps center crop and ring extrema with one update per valid point", () => {
    expect(run(`
scenario = "center"
local f = modEnv.FieldDataCollector:collect()[1]
eq(f.fruitTypeIndex, 2, "center wheat")
eq(f.growthState, 3, "wheat growth")
eq(f.weedLevel, 4, "max weed")
eq(f.mulchLevel, 1, "crop mulch")
near(f.rollerLevel, 0, "least rolled")
eq(f.stoneLevel, 9, "max stone")
near(f.waterLevel, 0.9, "max water")
uniqueOnce("probe", 14)
uniqueOnce("field", 14)
`)).toBe("ok");
});

test("empty field retains maximum mulch, while grass uses the minimum of a mixed ring", () => {
    expect(run(`
scenario = "empty"
local empty = modEnv.FieldDataCollector:collect()[1]
eq(empty.fruitTypeIndex, 0, "empty crop")
eq(empty.mulchLevel, 5, "max mulch from field state")
uniqueOnce("probe", 14)
uniqueOnce("field", 14)
freshCalls()
scenario = "grass"
local grass = modEnv.FieldDataCollector:collect()[1]
eq(grass.fruitTypeIndex, 3, "center grass")
eq(grass.growthState, 2, "mixed grass minimum")
uniqueOnce("probe", 14)
uniqueOnce("field", 14)
`)).toBe("ok");
});

test("owned cultivated field is not labelled meadow from surrounding forage", () => {
    expect(run(`
scenario = "cultivatedMeadow"
local f = modEnv.FieldDataCollector:collect()[1]
eq(f.fruitTypeIndex, 0, "prepared field crop")
eq(f.fruitType, "empty", "prepared field fruit")
eq(f.groundType, 3, "cultivated ground")
eq(f.groundTypeName, "CULTIVATED", "ground label")
eq(f.stateName, "Cultivated", "field status")
`)).toBe("ok");
});

test("prepared ground outside this field's polygon does not clear a real meadow", () => {
    expect(run(`
scenario = "outsidePrepared"
field.densityMapPolygon = { pointsX={90, 110, 110, 90}, pointsZ={90, 90, 110, 110} }
local f = modEnv.FieldDataCollector:collect()[1]
eq(f.fruitTypeIndex, 4, "meadow crop stays")
eq(f.fruitType, "MEADOW", "meadow label stays")
eq(f.groundType, 1, "meadow ground")
`)).toBe("ok");
});

test("unowned field keeps its lighter crop choice and late FieldState activation works", () => {
    expect(run(`
farmland.farmId = 0
scenario = "unowned"
local unowned = modEnv.FieldDataCollector:collect()[1]
eq(unowned.isOwned, false, "unowned")
eq(unowned.fruitTypeIndex, 3, "first noncenter crop")
eq(unowned.weedLevel, 1, "unowned weed")
uniqueOnce("probe", 14)
uniqueOnce("field", 14)
freshCalls()
FieldState = nil
local without = modEnv.FieldDataCollector:collect()[1]
eq(without.fruitTypeIndex, 0, "missing probe")
eq(calls.probe, 0, "missing probe calls")
freshCalls()
FieldState = { new=function() return state("probe") end }
local active = modEnv.FieldDataCollector:collect()[1]
eq(active.fruitTypeIndex, 3, "late probe crop")
uniqueOnce("probe", 14)
`)).toBe("ok");
});

test("precision soil sampling still exports its own ring values", () => {
    expect(run(`
modEnv._G.g_precisionFarming = {
    soilMap={ getTypeIndexAtWorldPos=function() return 2 end },
    nitrogenMap={
        getLevelAtWorldPos=function() return 10 end,
        getTargetLevelAtWorldPos=function() return 20 end,
    },
    pHMap={
        getLevelAtWorldPos=function() return 6.5 end,
        getOptimalPHValueForSoilTypeIndex=function() return 7 end,
    },
}
local f = modEnv.FieldDataCollector:collect()[1]
eq(f.isScanned, true, "soil scanned")
eq(f.nitrogenLevel, 45, "nitrogen decoded")
eq(f.targetNitrogen, 95, "target nitrogen decoded")
near(f.phValue, 6.5, "soil pH")
eq(f.soilReadState, "ok", "soil read state")
uniqueOnce("probe", 14)
uniqueOnce("field", 14)
`)).toBe("ok");
});

test("a failed point update remains retryable later in the same collection", () => {
    expect(run(`
failCenterOnce = true
local f = modEnv.FieldDataCollector:collect()[1]
eq(f.fruitTypeIndex, 2, "crop after one failed center update")
eq(calls.probe, 15, "probe retries failed center")
local repeated = 0
for _, count in pairs(seen.probe) do if count == 2 then repeated = repeated + 1 end end
eq(repeated, 1, "one failed point retried exactly once")
eq(calls.field, 14, "field state successful points")
`)).toBe("ok");
});
