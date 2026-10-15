"use strict";

const fs = require("fs");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");
const { productionTs } = require("./helpers/production-source.cjs");

const collectorPath = path.resolve(
    __dirname,
    "../../FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua",
);
const source = fs.readFileSync(collectorPath, "utf8");
const symStart = source.indexOf("local function companionSymbol");
const symEnd = source.indexOf("local function collectElsLoans");
const start = source.indexOf("local function collectRestrictedPeriods()");
const end = source.indexOf("local function collectCropCalendar()");
if (symStart < 0 || symEnd < symStart || start < 0 || end < start) {
    throw new Error("restriction producer was not found");
}
const fn = source.slice(symStart, symEnd) + "\n" + source.slice(start, end);

function activeSlurry(methodBody) {
    return `
        _G.g_modManager = { getActiveMods = function()
            return { { modName = 'FS25_RestrictedPeriods' } }
        end }
        _G.FS25_RestrictedPeriods = { SlurryBan = { isBanActive = ${methodBody} } }
    `;
}
const { restrictionAdvice } = productionTs("NEW APP/src/lib/companionMods/readings.ts");

// The producer only reports a window for a whole in-game period 1..12.
function inPeriod(period, setup) {
    return `_G.g_currentMission = { environment = { currentPeriod = ${period} } }\n${setup}`;
}

function run(setup, extra = "") {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    const chunk = [
        fn,
        setup,
        "local row = collectRestrictedPeriods()",
        "local active = 'missing'",
        "if row.anyActive == true then active = 'true' elseif row.anyActive == false then active = 'false' end",
        "return tostring(row.readState) .. '|' .. active .. '|' .. tostring(row.liquidBan) .. '|' .. tostring(row.solidBan)" + extra,
    ].join("\n");
    if (lauxlib.luaL_dostring(L, to_luastring(chunk)) !== lua.LUA_OK) {
        throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
    }
    return to_jsstring(lua.lua_tostring(L, -1));
}

describe("collectRestrictedPeriods producer", () => {
    test("method absent and a late manager are not a clear ban", () => {
        expect(run("_G.SlurryBan = { isBanActive = function() return false end }")).toBe("unavailable|missing|nil|nil");
        expect(run(`
            _G.g_modManager = { getActiveMods = function()
                return { { modName = 'FS25_RestrictedPeriods' } }
            end }
            _G.FS25_RestrictedPeriods = {}
        `)).toBe("unavailable|missing|nil|nil");
        expect(run("_G.g_modManager = nil")).toBe("unavailable|missing|nil|nil");
    });

    test("a thrown read is not globally allowed", () => {
        const both = run(activeSlurry("function() error('down') end"));
        expect(both.startsWith("failed|")).toBe(true);
        expect(restrictionAdvice({ enabled: true, readState: "failed", anyActive: false })).toBe("unavailable");
        const liquidOnly = run(activeSlurry(`function(kind)
                if kind == 'liquid' then error('down') end
                return 'wet'
            end`));
        expect(liquidOnly).toBe("failed|missing|nil|wet");
    });

    test("nil and false are permitted, and each category keeps its own reason", () => {
        expect(run(inPeriod(4, activeSlurry("function() return nil end")))).toBe("ok|false|nil|nil");
        expect(restrictionAdvice({ enabled: true, readState: "ok", anyActive: false })).toBe("allowed");
        expect(run(inPeriod(10, activeSlurry(`function(kind)
                if kind == 'liquid' then return 'frost' end
                return false
            end`)))).toBe("ok|true|frost|nil");
        expect(run(inPeriod(11, activeSlurry(`function(kind)
                if kind == 'solid' then return true end
                return nil
            end`)))).toBe("ok|true|nil|active");
        expect(run(inPeriod(4, activeSlurry("function() return false end")), " .. '|' .. tostring(row.currentPeriod)"))
            .toBe("ok|false|nil|nil|4");
    });

    test("a missing or invalid period is unavailable, not a clear ban", () => {
        const reason = " .. '|' .. tostring(row.reason)";
        const clear = activeSlurry("function() return nil end");
        expect(run(clear, reason)).toBe("unavailable|missing|nil|nil|period-unavailable");
        expect(run(`_G.g_currentMission = { environment = {} }\n${clear}`, reason))
            .toBe("unavailable|missing|nil|nil|period-unavailable");
        for (const bad of [0, 13, 2.5, -1]) {
            expect(run(inPeriod(bad, clear), reason)).toBe("unavailable|missing|nil|nil|period-unavailable");
        }
        expect(restrictionAdvice({ enabled: true, readState: "unavailable", reason: "period-unavailable" })).toBe("unavailable");
    });
});
