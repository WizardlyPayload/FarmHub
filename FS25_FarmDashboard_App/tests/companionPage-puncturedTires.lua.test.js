"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");

const FILE = "PuncturedTiresCollector.lua";

const SETUP = `
    local function veh(owner, name, spec)
        return {
            ownerFarmId = owner, uniqueId = "uid-" .. name, spec_puncture = spec,
            getFullName = function() return name end,
            spec_wheels = { wheels = { { physics = { radius = 0.9, width = 0.6 } } } },
        }
    end
    local FS25_Puncture = {
        repairTire = function() error("write") end,
        getRepairCost = function(self) return 1488 end,
    }
    _G.g_modIsLoaded = { FS25_PuncturedTires = true }
    _G.Puncture = {
        farmTotalCount = 1, farmStartPeriod = 3, scheduledPeriod1 = 5, scheduledPeriod2 = 10,
        puncturedThisPeriod = 5, veh_id = "uid-Flat tractor",
        generateYearlySchedule = function() error("write") end,
    }
    _G.FS25_PuncturedTires = { Puncture = _G.Puncture, FS25_Puncture = FS25_Puncture }
    _G.g_currentMission = {
        environment = { currentPeriod = 5 },
        vehicleSystem = { vehicles = {
            veh(1, "Flat tractor", { active = true, pressure = 0.25, wheelIndex = 2, punctureType = 3,
                l10n_axle = "puncture_rear", l10n_lat = "puncture_left", tyrePosition = "puncture_outer", new_speed = 0.0 }),
            veh(1, "Armed truck", { active = false, distanceToPuncture = 1500, metersDrivenSinceNail = 400 }),
            veh(1, "Fine car", { active = false, distanceToPuncture = 0 }),
            veh(2, "Neighbour", { active = true }),
            { ownerFarmId = 1, uniqueId = "trailer" },
        } },
    }
`;

describe("Punctured Tires page collector", () => {
    test("not detected without the mod", () => {
        expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
    });

    test("exports the save-wide cycle and each vehicle's puncture state", () => {
        const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
        expect(page.readState).toBe("ok");
        expect(page.defaultSpeedCapKmh).toBe(8);
        expect(page.cycle).toEqual({
            count: 1, limit: 2, remaining: 1, startPeriod: 3, dangerPeriod1: 5, dangerPeriod2: 10,
            puncturedThisPeriod: 5, currentPeriod: 5, dangerNow: true,
        });
        const farm = page.byFarm["1"];
        expect(farm).toMatchObject({ equippedCount: 3, puncturedCount: 1, armedCount: 1, repairCostTotal: 1488 });
        expect(farm.vehicles.map((v) => v.name)).toEqual(["Flat tractor", "Armed truck", "Fine car"]);
        expect(farm.vehicles[0]).toMatchObject({
            punctured: true, lastPunctured: true, pressurePct: 25, wheelIndex: 2, punctureType: 3,
            axle: "rear", side: "left", position: "outer", speedCapKmh: 0, repairCost: 1488,
        });
        expect(farm.vehicles[1]).toMatchObject({ armed: true, metersToPuncture: 1100, punctured: false });
        expect(JSON.stringify(page)).not.toContain("Neighbour");
    });
});
