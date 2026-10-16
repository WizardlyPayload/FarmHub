"use strict";

const path = require("path");
const fs = require("fs");
const { lauxlib, lualib, lua, to_luastring } = require("fengari");
const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");

const FILE = "BushelPlusCollector.lua";

// Mirrors the BushelPlus specialization (Bushel Plus 1.0.0.0) and FS25 Combine vehicles.
const MOD_ENV = `
    _G.g_modIsLoaded = { FS25_BushelPlus = true }
    _G.g_modManager = { getActiveMods = function() return { { modName = "FS25_BushelPlus", version = "1.0.0.0" } } end }
    local function combine(name, farm, scale)
        return {
            ownerFarmId = farm, spec_combine = { threshingScale = scale }, verifyCombine = function() end,
            getFullName = function() return name end,
        }
    end
    local c1 = combine("Lexion 8900", 1, 1.1)
    local c2 = combine("S7 850", 1, 1)
    local c3 = combine("Theirs", 2, 1.1)
    local tractor = { ownerFarmId = 1, getFullName = function() return "Fendt 942" end }
    local function unit(farm, host, scale)
        return {
            ownerFarmId = farm, spec_BushelPlus = { bushelYieldScale = scale },
            getFullName = function() return "Loss measurement system" end,
            getAttacherVehicle = function() return host end,
        }
    end
    _G.g_currentMission = {
        getFarmId = function() return 1 end,
        vehicleSystem = { vehicles = { c1, c2, c3, tractor, unit(1, c1, 0.1), unit(1, tractor, 0.1), unit(1, nil, 0.1), unit(2, c3, 0.1) } },
    }
`;

describe("Bushel Plus page collector", () => {
    test("not detected without the mod", () => {
        expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
    });

    test("lists this farm's units and which combines carry one", () => {
        const page = runCompanionPage(FILE, MOD_ENV, { farmId: 1 });
        expect(page.readState).toBe("ok");
        expect(page.version).toBe("1.0.0.0");
        expect(page.units).toHaveLength(3);
        expect(page.units.filter((u) => u.onCombine)).toEqual([
            { farmId: 1, name: "Loss measurement system", bonusPercent: 10, attached: true, onCombine: true, attachedTo: "Lexion 8900" },
        ]);
        expect(page.units.find((u) => u.attachedTo === "Fendt 942")).toMatchObject({ attached: true, onCombine: false });
        expect(page.units.find((u) => !u.attached)).toBeDefined();
        expect(page.combines).toEqual([
            { farmId: 1, name: "Lexion 8900", equipped: true, bonusPercent: 10, threshingScale: 1.1 },
            { farmId: 1, name: "S7 850", equipped: false, threshingScale: 1 },
        ]);
        expect(page.byFarm).toEqual({ 1: { unitCount: 3, onCombineCount: 1, combineCount: 2, equippedCombines: 1 } });
        expect(page.coverage).toBe("complete");
    });

    test("settings-only without a farm; detection-only without a vehicle system", () => {
        const noFarm = runCompanionPage(FILE, `${MOD_ENV}
            g_currentMission.getFarmId = function() return 0 end
        `);
        expect(noFarm.readState).toBe("settings-only");
        expect(noFarm.units).toBeUndefined();
        const none = runCompanionPage(FILE, `${MOD_ENV}
            g_currentMission.vehicleSystem = nil
        `, { farmId: 1 });
        expect(none.readState).toBe("detection-only");
    });

    test("collector parses as Lua", () => {
        const src = fs.readFileSync(path.join(__dirname, "../../FS25_FarmDashboard_Mod/src/companionPages", FILE), "utf8");
        const L = lauxlib.luaL_newstate();
        lualib.luaL_openlibs(L);
        expect(lauxlib.luaL_loadstring(L, to_luastring(src))).toBe(lua.LUA_OK);
    });
});
