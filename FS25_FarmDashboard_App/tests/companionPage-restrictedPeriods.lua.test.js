"use strict";

const path = require("path");
const fs = require("fs");
const { lauxlib, lualib, lua, to_luastring } = require("fengari");
const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");

const FILE = "RestrictedPeriodsCollector.lua";

// Mirrors SlurryBan from Restricted Periods 1.0.0.0 (scr/RestrictedPeriods.lua).
function modEnv(period, temperature) {
    return `
    _G.g_modIsLoaded = { FS25_RestrictedPeriods = true }
    _G.g_modManager = { getActiveMods = function() return { { modName = "FS25_RestrictedPeriods", version = "1.0.0.0" } } end }
    local tanker = { ownerFarmId = 1, fill = "liquid", getFillUnits = function() return {} end, getName = function() return "Slurry tanker" end }
    local spreader = { ownerFarmId = 1, fill = "solid", getFillUnits = function() return {} end, getName = function() return "Manure spreader" end }
    local empty = { ownerFarmId = 1, getFillUnits = function() return {} end, getName = function() return "Tractor" end }
    local foreign = { ownerFarmId = 2, fill = "liquid", getFillUnits = function() return {} end, getName = function() return "Neighbour tanker" end }
    _G.g_currentMission = {
        environment = { currentPeriod = ${period} },
        vehicleSystem = { vehicles = { tanker, spreader, empty, foreign } },
    }
    local temp = ${temperature == null ? "nil" : temperature}
    _G.FS25_RestrictedPeriods = {
        SlurryBan = {
            getCurrentTemperature = function() return temp end,
            isBanActive = function(category)
                local p = g_currentMission.environment.currentPeriod
                if category == "liquid" then
                    if p >= 9 and p <= 11 then return "sperrfrist" end
                    if p == 12 and temp ~= nil and temp < 0 then return "frost" end
                elseif category == "solid" then
                    if p >= 10 and p <= 11 then return "sperrfrist" end
                end
                return nil
            end,
            getVehicleBanCategory = function(vehicle) return vehicle.fill end,
            setIsTurnedOn = function() error("write") end,
        },
    }
`;
}

describe("Restricted Periods page collector", () => {
    test("not detected without the mod", () => {
        expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
    });

    test("closed period: both bans live, farm spreaders counted and blocked", () => {
        const page = runCompanionPage(FILE, modEnv(10, 5), { farmId: 1 });
        expect(page).toMatchObject({
            readState: "ok",
            version: "1.0.0.0",
            currentPeriod: 10,
            temperature: 5,
            liquidBan: "sperrfrist",
            solidBan: "sperrfrist",
            anyActive: true,
        });
        expect(page.byFarm["1"]).toEqual({ liquidVehicles: 1, solidVehicles: 1, blockedVehicles: 2 });
        expect(page.vehicles.map((v) => v.name).sort()).toEqual(["Manure spreader", "Slurry tanker"]);
        expect(page.vehicles.every((v) => v.farmId === 1 && v.blocked === true)).toBe(true);
        expect(page.vehicleCoverage).toBe("complete");
    });

    test("period 12 in frost bans liquids only", () => {
        const page = runCompanionPage(FILE, modEnv(12, -3), { farmId: 1 });
        expect(page.liquidBan).toBe("frost");
        expect(page.solidBan).toBeUndefined();
        expect(page.byFarm["1"].blockedVehicles).toBe(1);
        const solid = page.vehicles.find((v) => v.category === "solid");
        expect(solid.blocked).toBe(false);
    });

    test("open period with no temperature reading", () => {
        const page = runCompanionPage(FILE, modEnv(4, null), { farmId: 1 });
        expect(page.anyActive).toBe(false);
        expect(page.temperature).toBeUndefined();
        expect(page.byFarm["1"].blockedVehicles).toBe(0);
    });

    test("a throwing ban check gives a partial reading", () => {
        const page = runCompanionPage(FILE, `${modEnv(10, 5)}
            _G.FS25_RestrictedPeriods.SlurryBan.isBanActive = function(category)
                if category == "solid" then error("boom") end
                return "sperrfrist"
            end
        `, { farmId: 1 });
        expect(page.readState).toBe("partial");
        expect(page.solidRead).toBe(false);
        expect(page.liquidBan).toBe("sperrfrist");
    });

    test("settings-only without a current period; detection-only without SlurryBan", () => {
        const noPeriod = runCompanionPage(FILE, `${modEnv(4, 1)}
            _G.g_currentMission.environment = nil
        `, { farmId: 1 });
        expect(noPeriod.readState).toBe("settings-only");
        const noClass = runCompanionPage(FILE, `${modEnv(4, 1)}
            _G.FS25_RestrictedPeriods = {}
        `, { farmId: 1 });
        expect(noClass.readState).toBe("detection-only");
    });

    test("collector parses as Lua", () => {
        const src = fs.readFileSync(path.join(__dirname, "../../FS25_FarmDashboard_Mod/src/companionPages", FILE), "utf8");
        const L = lauxlib.luaL_newstate();
        lualib.luaL_openlibs(L);
        expect(lauxlib.luaL_loadstring(L, to_luastring(src))).toBe(lua.LUA_OK);
    });
});
