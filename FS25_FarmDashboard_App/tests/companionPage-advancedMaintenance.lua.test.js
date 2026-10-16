"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");

const FILE = "AdvancedMaintenanceCollector.lua";

const SETUP = `
    local function veh(owner, name, damage, opMs, ai)
        return {
            ownerFarmId = owner, uniqueId = "veh-" .. name, spec_AdvancedMaintenance = {},
            getFullName = function() return name end,
            getDamageAmount = function() return damage end,
            getOperatingTime = function() return opMs end,
            getIsAIActive = function() return ai end,
            stopCurrentAIJob = function() error("write") end,
        }
    end
    _G.g_modIsLoaded = { FS25_AdvancedMaintenance = true }
    _G.FS25_AdvancedMaintenance = { AdvancedMaintenance = { CheckDamage = function() error("random roll") end } }
    _G.g_currentMission = { vehicleSystem = { vehicles = {
        veh(1, "Healthy", 0.1, 36000000, false),
        veh(1, "Worn", 0.5, 36000000, true),
        veh(1, "Dead", 1.0, 1000, false),
        veh(1, "Worn but new", 0.9, 0, false),
        veh(2, "Neighbour", 1.0, 0, false),
        { ownerFarmId = 1, uniqueId = "trailer" },
    } } }
`;

describe("Advanced Maintenance page collector", () => {
    test("not detected without the mod", () => {
        expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
    });

    test("puts machines in the mod's zones with its own stall odds, worst first", () => {
        const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
        expect(page.readState).toBe("ok");
        expect(page.riskThresholdPct).toBe(28.57);
        const farm = page.byFarm["1"];
        expect(farm).toMatchObject({ machineCount: 4, lockedCount: 1, riskCount: 2, aiAtRiskCount: 1, averageDamagePct: 62.5 });
        expect(farm.machines.map((m) => m.name)).toEqual(["Dead", "Worn but new", "Worn", "Healthy"]);
        const byName = Object.fromEntries(farm.machines.map((m) => [m.name, m]));
        expect(byName.Dead).toMatchObject({ zone: "locked", damagePct: 100 });
        expect(byName.Dead.oddsPerCheck).toBeUndefined();
        // 50000 / (0.5 * 10 * 36000000 / 900000000) = 250000
        expect(byName.Worn).toMatchObject({ zone: "risk", oddsPerCheck: 250000, aiActive: true, operatingHours: 10 });
        expect(byName["Worn but new"].oddsPerCheck).toBeUndefined();
        expect(byName.Healthy).toMatchObject({ zone: "ok" });
        expect(JSON.stringify(page)).not.toContain("Neighbour");
    });
});
