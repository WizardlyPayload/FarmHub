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
