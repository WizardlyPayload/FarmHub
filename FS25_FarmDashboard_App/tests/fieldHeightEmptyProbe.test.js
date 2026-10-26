"use strict";

const fs = require("fs");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");

const source = fs.readFileSync(path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua"), "utf8");
const luaQuote = (text) => {
    let eq = "";
    while (text.includes(`]${eq}]`)) eq += "=";
    return `[${eq}[${text}]${eq}]`;
};

function run(body) {
    const L = lauxlib.luaL_newstate();
    try {
        lualib.luaL_openlibs(L);
        const script = `
unpack = unpack or table.unpack
g_time = 1000
Logging = { info=function() end, warning=function() end }
FarmDashLog = { devWarn=function() end, dev=function() end, error=function() end, warn=function() end, info=function() end, isVerbose=function() return false end }
local land = { id=5, farmId=1 }
g_farmlandManager = {
    getFarmlandAtWorldPosition=function() return land end,
    getFarmlandIdAtWorldPosition=function() return 5 end,
    getFarmlandById=function() return land end,
}
g_fieldManager = { fields={ { farmland=land, areaHa=1, posX=100, posZ=100, fieldId=1 } } }
g_currentMission = { getFarmId=function() return 1 end, missionInfo={ savegameDirectory="empty-height-test" } }
FillType = { STRAW=3, TARP=7 }
g_fillTypeManager = {
    getFillTypeIndexByName=function(_, name) if name == "STRAW" then return 3 end end,
    getFillTypeNameByIndex=function(_, index) return ({ [3]="STRAW", [8]="CHAFF" })[index] end,
}
g_densityMapHeightManager = {
    getIsValid=function() return true end,
    getDensityMapHeightTypes=function() return { {fillTypeIndex=3}, {fillTypeIndex=8} } end,
}
local filtered, unfiltered = 0, 0
local mode = "empty"
DensityMapHeightUtil = {
    getValueAtArea=function()
        unfiltered = unfiltered + 1
        if mode == "fail" then error("height probe unavailable") end
        if mode == "unknown" then return nil end
        return mode == "occupied" and 1 or 0
    end,
    getFillLevelAtArea=function(index)
        filtered = filtered + 1
        if mode == "occupied" and index == 3 then return 120 end
        return 0
    end,
}
local modEnv = setmetatable({}, { __index=_G })
modEnv._G = modEnv
assert(load(${luaQuote(source)}, "=FieldDataCollector.lua", "t", modEnv))()
local function eq(actual, expected, label)
    assert(actual == expected, label .. ": expected " .. tostring(expected) .. ", got " .. tostring(actual))
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

test("empty height rectangles skip type scans without changing sample shape", () => {
    expect(run(`
local f = modEnv.FieldDataCollector:collect()[1]
eq(f.windrowFillTypesRegistered, 2, "registered types")
eq(unfiltered, #f.windrowSamples + 1, "one unfiltered read per rectangle")
eq(filtered, 0, "no per-type reads on empty ground")
eq(f.windrowLiters, 0, "empty litres")
eq(f.windrowCenterProbeTotalL, 0, "empty center")
eq(f.hasWindrow, false, "empty status")
eq(f.windrowByFillName.STRAW, 0, "empty straw entry retained")
eq(f.windrowByFillName.CHAFF, 0, "empty chaff entry retained")
for _, volume in ipairs(f.windrowSamples) do eq(volume, 0, "empty sample") end
`)).toBe("ok");
});

test("occupied ground keeps every type read and rescans after an earlier empty collection", () => {
    expect(run(`
local empty = modEnv.FieldDataCollector:collect()[1]
eq(filtered, 0, "first collection skipped")
mode = "occupied"
local f = modEnv.FieldDataCollector:collect()[1]
eq(filtered, (#f.windrowSamples + 1) * 2, "all types on occupied ground")
eq(f.windrowCenterProbeTotalL, 120, "center straw")
eq(f.windrowLiters, #f.windrowSamples * 120, "sample straw")
eq(f.hasWindrow, true, "occupied status")
`)).toBe("ok");
});

test("missing or failing unfiltered probe falls back to original full scan", () => {
    expect(run(`
for _, kind in ipairs({"unknown", "fail"}) do
    mode = kind
    filtered = 0
    local f = modEnv.FieldDataCollector:collect()[1]
    eq(filtered, (#f.windrowSamples + 1) * 2, kind .. " fallback")
    eq(f.windrowLiters, 0, kind .. " litres")
end
DensityMapHeightUtil.getValueAtArea = nil
filtered = 0
local f = modEnv.FieldDataCollector:collect()[1]
eq(filtered, (#f.windrowSamples + 1) * 2, "missing method fallback")
`)).toBe("ok");
});
