"use strict";

const fs = require("fs");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");

const source = fs.readFileSync(path.resolve(
    __dirname,
    "../../FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua",
), "utf8");

test("every dedicated page has both a detector and a UI catalog entry", () => {
    const registry = fs.readFileSync(path.resolve(__dirname,
        "../../NEW APP/src/sections/mods/registry.ts"), "utf8");
    const uiCatalog = fs.readFileSync(path.resolve(__dirname,
        "../../NEW APP/src/lib/companionMods/catalog.ts"), "utf8");
    const pageIds = [...registry.matchAll(/\bkey: "([A-Za-z0-9_]+)", catalogId:/g)]
        .map((match) => match[1]);
    const detectorIds = new Set([...source.matchAll(/\bid = "([A-Za-z0-9_]+)"/g)]
        .map((match) => match[1]));
    const uiIds = new Set([...uiCatalog.matchAll(/\bid: "([A-Za-z0-9_]+)"/g)]
        .map((match) => match[1]));
    expect(pageIds.length).toBeGreaterThan(50);
    expect(pageIds.filter((id) => !detectorIds.has(id))).toEqual([]);
    expect(pageIds.filter((id) => !uiIds.has(id))).toEqual([]);
});

test("TUV vault filename is detected as its dedicated page catalog ID", () => {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    const chunk = [
        'g_modIsLoaded={ ["KM_81230_T_V_HU_System"]=true }',
        "FarmDashLog={error=function() end}",
        source,
        "local p=CompanionModsDataCollector:collect()",
        "return tostring(#p.mods)..'|'..tostring(p.mods[1] and p.mods[1].id)",
    ].join("\n");
    if (lauxlib.luaL_dostring(L, to_luastring(chunk)) !== lua.LUA_OK) {
        throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
    }
    expect(to_jsstring(lua.lua_tostring(L, -1))).toBe("1|tuvSystem");
});

test("every active catalogued companion is exported when the whole catalog is loaded", () => {
    const catalog = source.slice(source.indexOf("local CATALOG = {"), source.indexOf("\nlocal function envGet"));
    const names = [...catalog.matchAll(/\bid = "[^"]+"[\s\S]*?names = \{\s*"([^"]+)"/g)]
        .map((match) => match[1]);
    expect(names.length).toBeGreaterThan(64);

    const loaded = names.map((name) => `["${name}"]=true`).join(",");
    const chunk = [
        `g_modIsLoaded={${loaded}}`,
        "FarmDashLog={error=function() end}",
        source,
        "local p=CompanionModsDataCollector:collect()",
        "return tostring(#p.mods)..'|'..tostring(p.mods[#p.mods] and p.mods[#p.mods].id)",
    ].join("\n");
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    if (lauxlib.luaL_dostring(L, to_luastring(chunk)) !== lua.LUA_OK) {
        throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
    }
    expect(to_jsstring(lua.lua_tostring(L, -1)))
        .toBe(`${names.length}|farmOperationsDashboard`);
});

test("Everything Constructable's vault filename is detected only when loaded", () => {
    const run = (loaded) => {
        const L = lauxlib.luaL_newstate();
        lualib.luaL_openlibs(L);
        const chunk = [
            `g_modIsLoaded={${loaded ? '["KM_78834_Everything_Constructable"]=true' : ""}}`,
            "FarmDashLog={error=function() end}",
            source,
            "local p=CompanionModsDataCollector:collect()",
            "return tostring(#p.mods)..'|'..tostring(p.mods[1] and p.mods[1].id)",
        ].join("\n");
        if (lauxlib.luaL_dostring(L, to_luastring(chunk)) !== lua.LUA_OK) {
            throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
        }
        return to_jsstring(lua.lua_tostring(L, -1));
    };
    expect(run(true)).toBe("1|everythingConstructable");
    expect(run(false)).toBe("0|nil");
});

test("current Statistics Extended ModHub filename is detected only when loaded", () => {
    const run = (name) => {
        const L = lauxlib.luaL_newstate();
        lualib.luaL_openlibs(L);
        const loaded = name ? `["${name}"]=true` : "";
        const chunk = [
            `g_modIsLoaded={${loaded}}`,
            "FarmDashLog={error=function() end}",
            source,
            "local p=CompanionModsDataCollector:collect()",
            "return tostring(#p.mods)..'|'..tostring(p.mods[1] and p.mods[1].id)",
        ].join("\n");
        if (lauxlib.luaL_dostring(L, to_luastring(chunk)) !== lua.LUA_OK) {
            throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
        }
        return to_jsstring(lua.lua_tostring(L, -1));
    };
    expect(run("FS25_364343_FS25_statsExtended")).toBe("1|statisticsExtended");
    expect(run("FS25_statsExtended")).toBe("1|statisticsExtended");
    expect(run(null)).toBe("0|nil");
});

test("current vault filenames for the reference cohort are detected together", () => {
    const expected = [
        ["iNeedALoan", "FS25_365743_I_Need_A_Loan"],
        ["noCredit", "FS25_339204_No_Credit"],
        ["dynamicMarket", "FS25_366174_Dynamic_Market"],
        ["marketPriceHelper", "FS25_362332_Market_Price_Helper"],
        ["enhancedSeasonalPrices", "FS25_310803_Enhanced_Seasonal_Prices"],
        ["statisticsExtended", "FS25_364343_FS25_statsExtended"],
        ["dynamicFieldPrices", "FS25_348187_Dynamic_Field_Prices"],
        ["missionsExpanded", "FS25_307801_Missions_Expanded"],
        ["additionalContracts", "FS25_328503_Additional-Contracts"],
        ["realisticMilkingTimes", "FS25_303654_Realistic_Milking_Times"],
        ["animalTrader", "FS25_339284_Animal_Trader"],
        ["stallRental", "FS25_339275_Stall_Rental"],
        ["productionControl", "FS25_319198_Production_Control"],
        ["contractManager", "FS25_ContractManager"],
        ["productionsManager", "FS25_346503_Productions_Manager"],
        ["puncturedTires", "FS25_358517_Punctured_Tires"],
        ["implementUsageCounter", "FS25_310419_Implement_Usage_Counter"],
        ["ingameTimeOperatingHours", "FS25_311491_Ingame_Time_Operating_Hours"],
        ["imperialSystem", "FS25_ImperialSystem"],
    ];
    const loaded = expected.map(([, name]) => `["${name}"]=true`).join(",");
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    const chunk = [
        `g_modIsLoaded={${loaded}}`,
        "FarmDashLog={error=function() end}",
        source,
        "local p=CompanionModsDataCollector:collect()",
        "local ids={} for _,m in ipairs(p.mods) do table.insert(ids,m.id) end",
        "return table.concat(ids,',')",
    ].join("\n");
    if (lauxlib.luaL_dostring(L, to_luastring(chunk)) !== lua.LUA_OK) {
        throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
    }
    const ids = to_jsstring(lua.lua_tostring(L, -1)).split(",");
    expect(ids.sort()).toEqual(expected.map(([id]) => id).sort());
});
