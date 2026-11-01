"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "HarvestLedgerCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { KM_82914_Harvest_Ledger = true }
  _G.g_currentMission = { harvestLedger = { data = { events = {
    { id = 7, farmId = 1, scope = "farm", fieldLabel = "Field 36", cropTitle = "Wheat", closed = true,
      slices = { ["2-06"] = { year = 2, month = 6, products = {
        WHEAT = { title = "Wheat", liters = 4210, areaSqm = 12000 },
        STRAW = { title = "Straw", liters = 3200, areaSqm = 12000 },
      } } } },
    { id = 8, farmId = 2, scope = "farm", fieldLabel = "Private", cropTitle = "Barley",
      slices = { ["2-06"] = { year = 2, month = 6, products = {
        BARLEY = { title = "Barley", liters = 99999, areaSqm = 10000 },
      } } } },
  } } } }
`;

test("reads only this farm's measured product volumes and keeps area per product", () => {
    const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
    expect(page).toMatchObject({ readState: "ok", coverage: "complete",
        byFarm: { "1": { eventCount: 1, openCount: 0 } } });
    expect(page.rows).toHaveLength(2);
    expect(page.rows).toEqual(expect.arrayContaining([
        expect.objectContaining({ farmId: 1, field: "Field 36", crop: "Wheat",
            scope: "farm", product: "Wheat", liters: 4210, areaSqm: 12000 }),
        expect.objectContaining({ farmId: 1, product: "Straw", liters: 3200, areaSqm: 12000 }),
    ]));
    expect(normalizeCompanionPages({ pages: { harvestLedger: page } }, { modules: loadModules() })
        .pages.harvestLedger.rows).toHaveLength(2);
});

test("withholds legacy-ambiguous multiplayer history and unloaded mod", () => {
    const multiplayer = SETUP + "\n_G.g_currentMission.missionDynamicInfo = { isMultiplayer = true }";
    expect(runCompanionPage(FILE, multiplayer, { farmId: 1 })).toMatchObject({
        readState: "settings-only", reason: "legacy-farm-identity-unproved",
    });
    expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
});
