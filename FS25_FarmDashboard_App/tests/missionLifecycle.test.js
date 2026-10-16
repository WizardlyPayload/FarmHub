"use strict";

const fs = require("fs");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");

const registry = fs.readFileSync(
    path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src/MissionActiveRegistry.lua"),
    "utf8",
);
const collector = fs.readFileSync(
    path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua"),
    "utf8",
);

function run(setup, expression) {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    const chunk = [registry, collector, setup, "return " + expression].join("\n");
    if (lauxlib.luaL_dostring(L, to_luastring(chunk)) !== lua.LUA_OK) {
        throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
    }
    return to_jsstring(lua.lua_tostring(L, -1));
}

const mission = (slot) => `
    _G.g_currentMission = { missionInfo = { savegameDirectory = ${JSON.stringify(slot)}, mapId = 'map' } }
`;

describe("mission lifecycle and per-reader isolation", () => {
    test("installed inventory is not active, and a save switch clears membership", () => {
        const first = run(`
            ${mission("savegame1")}
            _G.g_modManager = {
                mods = { { modName = 'FS25_EnhancedLoanSystem' } },
                getActiveMods = function() return { { modName = 'FS25_EnhancedLoanSystem' } } end,
            }
        `, "tostring(FarmDashboardMissionRegistry.isActive('FS25_EnhancedLoanSystem'))");
        expect(first).toBe("true");
        const switched = run(`
            ${mission("savegame1")}
            _G.g_modManager = {
                mods = { { modName = 'FS25_EnhancedLoanSystem' } },
                getActiveMods = function() return { { modName = 'FS25_EnhancedLoanSystem' } } end,
            }
            FarmDashboardMissionRegistry.activeNames()
            FarmDashboardMissionRegistry.clear()
            _G.g_currentMission = { missionInfo = { savegameDirectory = 'savegame2', mapId = 'map' } }
            _G.g_modManager.getActiveMods = function() return {} end
        `, "tostring(FarmDashboardMissionRegistry.isActive('FS25_EnhancedLoanSystem'))");
        expect(switched).toBe("false");
    });

    test("one throwing reader does not erase a successful reader or native data", () => {
        const result = run(`
            ${mission("savegame1")}
            _G.nativeFields = { count = 2 }
            _G.g_server = { getIsServer = function() return true end }
            _G.g_modManager = { getActiveMods = function()
                return {
                    { modName = 'FS25_EnhancedLoanSystem' },
                    { modName = 'FS25_RestrictedPeriods' },
                }
            end }
            _G.FS25_EnhancedLoanSystem = { g_els_loanManager = { loans = {
                ['1'] = { { restAmount = 0, paidOff = false } },
            } } }
            _G.FS25_RestrictedPeriods = { SlurryBan = { isBanActive = function() error('down') end } }
        `, "tostring(_G.nativeFields.count) .. '|' .. tostring(select(2, CompanionModsDataCollector:collectStep({})).loans.readState) .. '|' .. tostring(select(2, CompanionModsDataCollector:collectStep({})).restrictedPeriods.readState) .. '|' .. tostring(select(2, CompanionModsDataCollector:collectStep({})).availability.role)");
        expect(result).toBe("2|ok|failed|server");
    });

    test("a late manager is not cached as inactive, and assembly failure is not an empty success", () => {
        const late = run(`
            ${mission("savegame3")}
            _G.g_modManager = nil
            local before = select(2, FarmDashboardMissionRegistry.activeNames())
            _G.g_modManager = { getActiveMods = function() return { { modName = 'FS25_EnhancedLoanSystem' } } end }
            local after = tostring(FarmDashboardMissionRegistry.isActive('FS25_EnhancedLoanSystem'))
        `, "tostring(before) .. '|' .. after");
        expect(late.startsWith("unready|")).toBe(true);
        expect(late.endsWith("|true")).toBe(true);
        const failed = run(`
            ${mission("savegame3")}
        `, "tostring(select(2, CompanionModsDataCollector.finishCollect(false, 'err')).readState) .. '|' .. tostring(select(2, CompanionModsDataCollector.finishCollect(false, 'err')).assembly)");
        expect(failed).toBe("failed|failed");
    });

    test("a dedicated host is labelled dedicated and does not assume a player UI", () => {
        const role = run(`
            ${mission("savegame1")}
            _G.g_dedicatedServer = {}
            _G.g_modManager = { getActiveMods = function() return {} end }
            local _done, payload = CompanionModsDataCollector:collectStep({})
            _G.__availability = payload.availability.role .. '|' .. tostring(payload.availability.playerUiAssumed) .. '|' .. tostring(payload.availability.exportAuthority)
        `, "_G.__availability");
        expect(role).toBe("dedicated|false|true");
    });
});