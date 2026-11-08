"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "BuyUsedEquipmentCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_312631_Buy_Used_Equipment = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_312631_Buy_Used_Equipment", version = "1.0.1.0" }
  } end }
  local owned = { farmId = 1, buyUsedVehicles = {
    { filename = "data/vehicles/tractor.xml", level = 2, ttl = 17, tts = 4 },
    { filename = "data/vehicles/trailer.xml", level = 1, ttl = 2, tts = 3 },
  } }
  local foreign = { farmId = 2, buyUsedVehicles = {
    { filename = "secret-foreign.xml", level = 3, ttl = 6, tts = 1 },
  } }
  _G.g_farmManager = { getFarmById = function(_, id)
    return id == 1 and owned or foreign
  end }
  _G.g_storeManager = { getItemByXMLFilename = function(_, filename)
    if filename == "data/vehicles/tractor.xml" then return { name = "Test tractor" } end
    return nil
  end }
  _G.g_currentMission = { getIsServer = function() return true end }
`;

test("exports only selected farm's pending searches without hidden success timer", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { pendingSearchCount: 2 } } });
  expect(page.rows[0]).toMatchObject({ equipment: "Test tractor",
    searchLevel: "Extended", hoursRemaining: 17, farmId: 1 });
  expect(JSON.stringify(page)).not.toMatch(/secret-foreign|"tts"/);
  const merged = normalizeCompanionPages({ pages: { buyUsedEquipment: page } },
    { modules: loadModules() });
  expect(merged.pages.buyUsedEquipment.rows).toHaveLength(2);
});

test("withholds totals on invalid queue rows", () => {
  const page = runCompanionPage(FILE,
    SETUP.replace('level = 2, ttl = 17', 'level = 9, ttl = 17'), { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial",
    reason: "invalid-search-state" });
  expect(page.byFarm).toBeUndefined();
});

test("requires reviewed version and server farm queue", () => {
  expect(runCompanionPage(FILE,
    SETUP.replace('version = "1.0.1.0"', 'version = "1.1.0.0"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE,
    SETUP.replace('getIsServer = function() return true end',
      'getIsServer = function() return false end'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-queue-only" });
});
