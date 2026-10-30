"use strict";

const fs = require("fs");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");

const source = fs.readFileSync(path.resolve(
    __dirname,
    "../../FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua",
), "utf8");

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
