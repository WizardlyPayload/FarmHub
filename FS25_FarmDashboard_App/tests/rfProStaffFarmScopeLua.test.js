"use strict";

const fs = require("fs");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");

const source = fs.readFileSync(path.resolve(__dirname,
    "../../FS25_FarmDashboard_Mod/src/collectors/rf/RfProStaffDataCollector.lua"), "utf8");

function collect(setup, result) {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    const chunk = [
        "g_modIsLoaded={FS25_ProStaffCoOp=true}",
        setup,
        source,
        "local p=RfProStaffDataCollector:collect()",
        `return ${result}`,
    ].join("\n");
    if (lauxlib.luaL_dostring(L, to_luastring(chunk)) !== lua.LUA_OK) {
        throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
    }
    return to_jsstring(lua.lua_tostring(L, -1));
}

test("reads only the Pro Staff farm register, not a visible farm or farm 1 fallback", () => {
    const setup = [
        "g_farmManager={farms={{farmId=1,name='Visible farm'}}}",
        "g_currentMission={getIsServer=function() return true end,",
        "proStaffManager={farms={[2]={level=3,investmentTotal=900,membershipActive=true}},",
        "getLevel=function(self,id) return self.farms[id].level end}}",
    ].join("\n");
    expect(collect(setup,
        "tostring(p.byFarm['1'])..'|'..tostring(p.byFarm['2'].level)..'|'..tostring(p.byFarm['2'].investmentTotal)"))
        .toBe("nil|3|900");
});

test("withholds a fabricated level when no Pro Staff farm record exists", () => {
    const setup = [
        "g_farmManager={farms={{farmId=1,name='Visible farm'}}}",
        "g_currentMission={getIsServer=function() return true end,",
        "proStaffManager={farms={}}}",
    ].join("\n");
    expect(collect(setup, "tostring(next(p.byFarm))")).toBe("nil");
});

test("does not export partial client state as an authoritative farm reading", () => {
    const setup = "g_currentMission={getIsServer=function() return false end, proStaffManager={farms={[1]={level=4}}}}";
    expect(collect(setup, "tostring(next(p.byFarm))")).toBe("nil");
});

test("withholds an invalid investment rather than displaying fabricated progress", () => {
    const setup = "g_currentMission={getIsServer=function() return true end, proStaffManager={farms={[1]={level=4,investmentTotal=-1,membershipActive=true}}}}";
    expect(collect(setup, "tostring(next(p.byFarm))..'|'..tostring(p.coverage)"))
        .toBe("nil|partial");
});
