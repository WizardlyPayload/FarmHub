"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");

const FILE = "TimeSavingStockCheckCollector.lua";

function setup(farmId) {
    return `
        _G.g_modIsLoaded = { FS25_TSStockCheck = true }
        _G.InGameMenu = {}
        _G.InGameMenuStockCheck = {}
        _G.g_gui = { screenControllers = {
            [InGameMenu] = { ingameMenuTSStockCheck = { inStockData = {} } }
        } }
        _G.g_currentMission = { getFarmId = function() return ${farmId} end }
    `;
}

describe("companion page: Time Saving Stock Check farm identity", () => {
    test("unavailable farm identity is not reported as a different farm", () => {
        const page = runCompanionPage(FILE, setup("nil"));
        expect(page).toMatchObject({ detected: true, readState: "settings-only", reason: "farm-unknown" });
        expect(page.byFarm).toBeUndefined();
    });

    test("a confirmed matching farm may export the last menu table", () => {
        const page = runCompanionPage(FILE, setup("1"), { farmId: 1 });
        expect(page).toMatchObject({ detected: true, readState: "ok", menuFarmId: 1, collectorFarmId: 1 });
        expect(page.byFarm["1"]).toMatchObject({ itemCount: 0, totalLiters: 0 });
    });
});
