"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");

const FILE = "VehicleYearsCollector.lua";

const SETUP = `
    local items = {
        ["a.xml"] = { specs = { year = 1998 }, categoryName = "TRACTORSM", brandNameRaw = "AGCO", showInStore = true, xmlFilenameLower = "data/vehicles/agco/a.xml" },
        ["b.xml"] = { specs = { year = 2021 }, categoryName = "TRUCKS", brandNameRaw = "LIZARD", showInStore = true, xmlFilenameLower = "data/vehicles/lizard/b.xml" },
        ["c.xml"] = { specs = {}, categoryName = "TRAILERS", showInStore = true, xmlFilenameLower = "data/vehicles/x/c.xml" },
        ["d.xml"] = { specs = { year = 1955 }, showInStore = true, xmlFilenameLower = "data/handtools/d.xml" },
        ["e.xml"] = { specs = { year = 2000 }, showInStore = true, xmlFilenameLower = "data/placeables/e.xml" },
    }
    local list = {}
    for _, v in pairs(items) do list[#list + 1] = v end
    _G.g_storeManager = {
        getItemByXMLFilename = function(self, f) return items[f] end,
        getItems = function(self) return list end,
        addPackItem = function() error("write") end,
    }
    local function veh(owner, name, file)
        local v = { ownerFarmId = owner, uniqueId = "veh-" .. name, configFileName = file, getFullName = function() return name end }
        v.rootVehicle = v
        return v
    end
    _G.g_modIsLoaded = { FS25_Vehicle_Years = true }
    _G.FS25_Vehicle_Years = { VehicleYears = { modActivated = true } }
    _G.g_currentMission = { vehicleSystem = { vehicles = {
        veh(1, "Old tractor", "a.xml"), veh(1, "New truck", "b.xml"), veh(1, "Mystery trailer", "c.xml"), veh(2, "Neighbour", "a.xml"),
    } } }
`;

describe("Vehicle Years page collector", () => {
    test("not detected without the mod", () => {
        expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
    });

    test("exports model years oldest first, decade counts and shop coverage", () => {
        const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
        expect(page.readState).toBe("ok");
        expect(page.activated).toBe(true);
        expect(page.store).toMatchObject({ shopItems: 4, withYear: 3 });
        const farm = page.byFarm["1"];
        expect(farm).toMatchObject({ vehicleCount: 3, knownCount: 2, unknownCount: 1, oldestYear: 1998, newestYear: 2021, averageYear: 2010 });
        expect(farm.vehicles.map((v) => v.name)).toEqual(["Old tractor", "New truck", "Mystery trailer"]);
        expect(farm.vehicles[0]).toMatchObject({ year: 1998, decade: "1990s", brand: "AGCO", category: "TRACTORSM" });
        expect(farm.vehicles[2].year).toBeUndefined();
        expect(farm.byDecade).toEqual([{ decade: "1990s", count: 1 }, { decade: "2020s", count: 1 }]);
        expect(JSON.stringify(page)).not.toContain("Neighbour");
    });

    test("without the store manager only detection is reported", () => {
        const page = runCompanionPage(FILE, `_G.g_modIsLoaded = { FS25_Vehicle_Years = true }`, { farmId: 1 });
        expect(page.readState).toBe("detection-only");
    });
});
