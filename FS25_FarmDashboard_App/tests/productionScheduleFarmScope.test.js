"use strict";

const fs = require("fs");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");

const source = fs.readFileSync(path.resolve(__dirname,
    "../../FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua"), "utf8")
    .replace("local function collectEconomicHistory()",
        "TestProductionSchedule = collectProductionSchedule\nlocal function collectEconomicHistory()");

function run(foreignOwner, inheritedMission = false) {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    const chunk = [
        'g_modIsLoaded={ FS25_352788_Production_Schedule=true }',
        'g_modManager={ getActiveMods=function() return { { modName="FS25_352788_Production_Schedule", version="1.1.0.0" } } end }',
        'local place={ getOwnerFarmId=function() return 1 end }',
        'local point={ id="bakery", getOwnerFarmId=function() return 1 end, owningPlaceable=place, name="Bakery", productionsIdToObj={ bread={name="Bread"} } }',
        'local foreign={ id="foreign", getOwnerFarmId=function() return ' + foreignOwner + ' end, owningPlaceable=place, productionsIdToObj={ cake={name="Cake"} } }',
        'g_currentMission={ getFarmId=function() return 1 end, productionChainManager={ getProductionPointsForFarmId=function() return { point } end } }',
        ...(inheritedMission ? ['local mission=g_currentMission; g_currentMission=nil; setmetatable(_G,{__index={g_currentMission=mission}})'] : []),
        'ProductionSchedule={ modName="FS25_352788_Production_Schedule", getPointKey=function(_,p) return p.id end, data={ bakery={ bread={status="aktiv",months={[3]=true,[7]=true}}, ghost={status="aktiv",months={[2]=true}} }, foreign={ cake={status="aktiv",months={[4]=true}} } } }',
        source,
        'local p=TestProductionSchedule()',
        'return table.concat({p.readState,p.coverage,tostring(#p.recipes),p.recipes[1].pointName,p.recipes[1].recipeName,table.concat(p.recipes[1].months,","),tostring(p.recipes[1].ownerFarmId)},"|")',
    ].join("\n");
    if (lauxlib.luaL_dostring(L, to_luastring(chunk)) !== lua.LUA_OK) {
        throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
    }
    return to_jsstring(lua.lua_tostring(L, -1));
}

test("Production Schedule joins a current owned point by the mod key without a runtime map", () => {
    expect(run(0)).toBe("partial|partial|1|Bakery|Bread|3,7|1");
    expect(run(2)).toBe("partial|partial|1|Bakery|Bread|3,7|1");
});

test("Production Schedule reads the engine mission inherited by a mod environment", () => {
    expect(run(2, true)).toBe("partial|partial|1|Bakery|Bread|3,7|1");
});
