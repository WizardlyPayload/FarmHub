"use strict";

const fs = require("fs");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");

const collectorPath = path.resolve(
    __dirname,
    "../../FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua",
);
const source = fs.readFileSync(collectorPath, "utf8");
const start = source.indexOf("local function envGet(name)");
const end = source.indexOf("local function detectEntry(entry)");
if (start < 0 || end < start) throw new Error("active-mod helpers were not found");
const fn = source.slice(start, end);

function run(setup) {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    const chunk = [
        fn,
        setup,
        "local name = findLoadedName({ names = { 'FS25_EnhancedLoanSystem' }, substrings = { 'enhancedloan' } })",
        "return name == nil and 'absent' or tostring(name)",
    ].join("\n");
    if (lauxlib.luaL_dostring(L, to_luastring(chunk)) !== lua.LUA_OK) {
        throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
    }
    return to_jsstring(lua.lua_tostring(L, -1));
}

describe("active mod membership", () => {
    test("an installed but unchecked mod is not active", () => {
        const result = run(`
            _G.g_modManager = {
                mods = { { modName = 'FS25_EnhancedLoanSystem' } },
                getActiveMods = function() return {} end,
            }
        `);
        expect(result).toBe("absent");
    });

    test("getActiveMods membership is the loaded name", () => {
        const result = run(`
            _G.g_modManager = {
                getActiveMods = function()
                    return { { modName = 'FS25_EnhancedLoanSystem' } }
                end,
            }
        `);
        expect(result).toBe("FS25_EnhancedLoanSystem");
    });
});
