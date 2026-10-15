"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");

const FILE = "VehicleMileageCollector.lua";

const SETUP = `
    local function veh(owner, name, odo, trip, mode, opMs)
        local v = {
            ownerFarmId = owner, uniqueId = "veh-" .. name,
            nxMileage = { odoMeter = odo, tripMeter = trip, odoMode = mode, dirtyFlag = 4 },
            getFullName = function() return name end,
            getOperatingTime = function() return opMs end,
            raiseDirtyFlags = function() error("write") end,
        }
        v.rootVehicle = v
        return v
    end
    local implement = { ownerFarmId = 1, uniqueId = "tool", nxMileage = { odoMeter = 999999 } }
    implement.rootVehicle = {}
    _G.g_modIsLoaded = { FS25_VehicleMileage = true }
    _G.FS25_VehicleMileage = { NXMileageSpec = {} }
    _G.g_gameSettings = { getValue = function(self, name) if name == "useMiles" then return true end end }
    _G.g_currentMission = { vehicleSystem = { vehicles = {
        veh(1, "Tractor", 125500, 2500, 0, 7200000),
        veh(1, "Pickup", 480000, 0, 1, 3600000),
        veh(2, "Neighbour", 1000, 0, 0, 0),
        { ownerFarmId = 1, uniqueId = "no-mileage" },
        implement,
    } } }
`;

describe("Vehicle Mileage page collector", () => {
    test("not detected without the mod", () => {
        expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
    });

    test("exports odometer and trip per root vehicle, highest first, and the game's miles setting", () => {
        const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
        expect(page.readState).toBe("ok");
        expect(page.useMiles).toBe(true);
        const farm = page.byFarm["1"];
        expect(farm.trackedCount).toBe(2);
        expect(farm.vehicles.map((v) => v.name)).toEqual(["Pickup", "Tractor"]);
        expect(farm.vehicles[0]).toMatchObject({ odoKm: 480, tripKm: 0, hudMode: "trip", operatingHours: 1 });
        expect(farm.vehicles[1]).toMatchObject({ odoKm: 125.5, tripKm: 2.5, hudMode: "mileage", operatingHours: 2 });
        expect(farm.totalKm).toBe(605.5);
        expect(farm.highestKm).toBe(480);
        expect(farm.averageKm).toBe(302.75);
        expect(JSON.stringify(page)).not.toContain("Neighbour");
        expect(JSON.stringify(page)).not.toContain("999");
    });

    test("no vehicle list gives a detection-only reading", () => {
        const page = runCompanionPage(FILE, `_G.g_modIsLoaded = { FS25_VehicleMileage = true }; _G.g_currentMission = {}`, { farmId: 1 });
        expect(page.readState).toBe("detection-only");
        expect(page.reason).toBe("no-vehicle-list");
    });
});
