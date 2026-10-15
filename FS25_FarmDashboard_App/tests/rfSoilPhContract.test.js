"use strict";

const fs = require("fs");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");

const collectorSource = fs.readFileSync(path.resolve(__dirname,
    "../../FS25_FarmDashboard_Mod/src/collectors/rf/RfSoilFertilizerDataCollector.lua"), "utf8");
const baseInfo = "nitrogen={value=50},phosphorus={value=40},potassium={value=40}," +
    "organicMatter=4.5,weedPressure=0,pestPressure=0,shownDiseasePressure=0,fieldArea=1";

function longString(value) {
    let level = 0;
    while (value.includes("]" + "=".repeat(level) + "]")) level += 1;
    const eq = "=".repeat(level);
    return "[" + eq + "[\n" + value + "]" + eq + "]";
}

function collectPH(extra = "") {
    const L = lauxlib.luaL_newstate();
    try {
        lualib.luaL_openlibs(L);
        const script = `
g_modIsLoaded = { FS25_SoilFertilizer = true }
g_fieldManager = { fields = { { farmland = { id = 5 } } } }
SOIL_INFO = { ${baseInfo}${extra ? "," + extra : ""} }
g_currentMission = { soilFertilityManager = {
    settings = { enabled = true },
    soilSystem = { isInitialized = true, getFieldInfo = function() return SOIL_INFO end }
} }
local env = setmetatable({}, { __index = _G })
env._G = env
env.getfenv = function() return env end
env.FarmDashboard = { isAuthority = function() return true end }
local loadCollector = assert(load(${longString(collectorSource)}, "@RfSoilFertilizerDataCollector", "t", env))
loadCollector()
local payload = env.RfSoilFertilizerDataCollector:collect()
local row = assert(payload.byField["5"])
local phRow = nil
for _, treatment in ipairs(row.treatmentPlan or {}) do
    if treatment.key == "ph" then phRow = treatment end
end
return table.concat({ tostring(row.pH), tostring(row.pHStatus), tostring(row.pHLastKnown),
    tostring(phRow and phRow.priority), tostring(phRow and phRow.text) }, "|")
`;
        const result = lauxlib.luaL_dostring(L, to_luastring(script));
        if (result !== lua.LUA_OK) {
            throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
        }
        return to_jsstring(lua.lua_tostring(L, -1));
    } finally {
        lua.lua_close(L);
    }
}

describe("RF pH collector contract", () => {
    test("current and legacy readings retain real pH advice", () => {
        expect(collectPH('pH=5.8,pHStatus="FIELD_REPORT",pHReportValid=true'))
            .toContain("5.8|FIELD_REPORT|nil|urgent|Apply LIME");
        expect(collectPH('pH=7.8')).toContain("7.8|nil|nil|watch|Apply GYPSUM");
        expect(collectPH('pH=7.0,pHStatus="LOCAL"')).toBe("7.0|LOCAL|nil|nil|nil");
    });

    test("missing, stale and partial reports never fabricate 7.0 or treatment", () => {
        expect(collectPH()).toContain("nil|UNKNOWN|nil|info|pH reading unavailable");
        expect(collectPH('pH=7.8,pHStatus="STALE",pHLastKnown=5.8'))
            .toContain("nil|STALE|5.8|info|pH report is stale");
        expect(collectPH('pH=5.8,pHStatus="PARTIAL"'))
            .toContain("nil|PARTIAL|nil|info|pH reading unavailable");
        expect(collectPH('pH=5.8,pHStatus="EMPTY"'))
            .toContain("nil|EMPTY|nil|info|pH reading unavailable");
        expect(collectPH('pH=5.8,pHReportValid=false'))
            .toContain("nil|WITHHELD|nil|info|pH reading unavailable");
    });

    test("unknown status and contradictory valid flag fail closed", () => {
        expect(collectPH('pH=5.8,pHStatus="FUTURE_STATUS"'))
            .toContain("nil|FUTURE_STATUS|nil|info|pH reading unavailable");
        expect(collectPH('pH=5.8,pHStatus="FIELD_REPORT",pHReportValid=false'))
            .toContain("nil|WITHHELD|nil|info|pH reading unavailable");
        expect(collectPH('pHStatus="FIELD_REPORT"'))
            .toContain("nil|UNKNOWN|nil|info|pH reading unavailable");
    });
});
