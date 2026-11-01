"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "ProductionSupplyManagerCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { KM_82199_Production_Supply_Manager = true }
  _G.g_productionSupplyManager = {
    loadedSettingsFarmId = 2,
    autoPurchaseEnabled = true,
    autoPurchaseHistory = { { production = "Foreign farm", product = "Diesel", liters = 999, cost = 999 } },
    savedFarmSettings = {
      [1] = { autoPurchaseEnabled = true, autoPurchaseHistory = {
        { daySerial = 17, production = "Bakery", product = "Flour", liters = 1250.5,
          cost = 420.75, station = "Grain mill" },
      } },
      [2] = { autoPurchaseEnabled = true, autoPurchaseHistory = {
        { production = "Foreign cached", product = "Oil", liters = 200, cost = 90 },
      } },
    },
  }
`;

test("reads only the requested farm's recorded purchase, not the local active farm", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { autoPurchaseEnabled: true, historyCount: 1 } },
  });
  expect(page.purchases).toEqual([expect.objectContaining({
    farmId: 1, daySerial: 17, production: "Bakery", product: "Flour",
    liters: 1250.5, cost: 420.75, station: "Grain mill",
  })]);
  expect(JSON.stringify(page)).not.toContain("Foreign");
  const merged = normalizeCompanionPages({ pages: { productionSupplyManager: page } },
    { modules: loadModules() });
  expect(merged.pages.productionSupplyManager.purchases).toHaveLength(1);
});

test("uses active history only for its matching loaded farm", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 2 });
  expect(page.purchases).toEqual([expect.objectContaining({
    farmId: 2, production: "Foreign farm", liters: 999,
  })]);
  expect(JSON.stringify(page)).not.toContain("Foreign cached");
});

test("withholds an absent farm record and rejects invalid purchase amounts", () => {
  expect(runCompanionPage(FILE, GAME, { farmId: 3 })).toMatchObject({
    readState: "settings-only", reason: "no-farm-history",
  });
  const invalid = GAME.replace("liters = 1250.5", "liters = -1");
  const page = runCompanionPage(FILE, invalid, { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", reason: "no-purchase-history" });
  const merged = normalizeCompanionPages({ pages: { productionSupplyManager: page } },
    { modules: loadModules() });
  expect(merged.pages.productionSupplyManager.purchases).toEqual([]);
});
