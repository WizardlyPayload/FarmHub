"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");

describe("Everything Constructable companion page", () => {
    test("reads a live project when the mission global is inherited by the mod environment", () => {
        const page = runCompanionPage("EverythingConstructableCollector.lua", `
            _G.g_modIsLoaded = { KM_78834_Everything_Constructable = true }
            local project = {
                id = 7, farmId = 1, completed = false, mode = "automatic",
                phases = { {}, {} }, currentPhaseIndex = 1,
                totalPrice = 44000, totalPaid = 4400,
                position = { -794.3, 47, 190.9 },
                materials = { { fillTypeName = "PLANKS", amount = 2400, delivered = 100 } },
                getProgress = function() return 0.25 end,
                getTotalRemainingCost = function() return 500 end,
                getStoreItemName = function() return "Open Wooden Garage" end,
            }
            local mission = { ecProjectManager = { projects = { [7] = project } } }
            _G.g_currentMission = nil
            setmetatable(_G, { __index = function(_, key)
                if key == "g_currentMission" then return mission end
            end })
            CompanionModsDataCollector.helpers.activeExportFarmId = function() return 1 end
        `, { key: "everythingConstructable" });

        expect(page.detected).toBe(true);
        expect(page.readState).toBe("ok");
        expect(page.byFarm["1"].siteCount).toBe(1);
        expect(page.projects[0].name).toBe("Open Wooden Garage");
        expect(page.projects[0].progress).toBe(0.25);
        expect(page.projects[0].materials[0]).toEqual({
            fillType: "PLANKS", required: 2400, delivered: 100, remaining: 2300,
        });
    });
});
