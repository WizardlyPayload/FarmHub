"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "VIPOrderManagerCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { KM_65282_VIP_Order_Manager = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "KM_65282_VIP_Order_Manager", version = "1.2.2.0" }
  } end }
  _G.KM_65282_VIP_Order_Manager = { VIPOrderManager = {
    InitDone = true, VIPOrders = {
      { level = 3, entries = {
        WHEAT = { fillTypeName = "WHEAT", title = "Wheat", quantity = 10000,
          fillLevel = 2500, payout = 3000, isAnimal = false },
        COW = { fillTypeName = "COW", title = "Dairy cow", quantity = 4,
          fillLevel = 1, payout = 2000, isAnimal = true, neededAgeInMonths = 12 },
      } },
      { level = 4, entries = { SECRET = { fillTypeName = "SECRET",
          quantity = 100, fillLevel = 0, payout = 999999 } } },
    },
    UpdateOutputLines = function() error("reader must not update") end,
    RestockVIPOrders = function() error("reader must not restock") end,
    MakePayout = function() error("reader must not pay") end,
  } }
  _G.g_currentMission = { isMissionStarted = true,
    missionDynamicInfo = { isMultiplayer = false },
    getFarmId = function() return 1 end,
    getIsServer = function() return true end,
    getIsClient = function() return true end }
`;

test("reads only the current local order without calling mutating hooks", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { currentLevel: 3, itemCount: 2 } } });
  expect(page.rows).toEqual([
    expect.objectContaining({ farmId: 1, fillType: "COW",
      quantity: 4, delivered: 1, remaining: 3,
      potentialPayout: 2000, isAnimal: true, neededAgeInMonths: 12 }),
    expect.objectContaining({ farmId: 1, fillType: "WHEAT",
      quantity: 10000, delivered: 2500, remaining: 7500,
      potentialPayout: 3000, isAnimal: false }),
  ]);
  expect(JSON.stringify(page)).not.toContain("SECRET");
  expect(normalizeCompanionPages({ pages: { vipOrderManager: page } },
    { modules: loadModules() }).pages.vipOrderManager.rows).toHaveLength(2);
});

test("withholds unreviewed, multiplayer and mismatched farm readings", () => {
  expect(runCompanionPage(FILE, GAME.replace('version = "1.2.2.0"',
    'version = "1.2.2.1"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE, GAME.replace('isMultiplayer = false',
    'isMultiplayer = true'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "single-player-only" });
  expect(runCompanionPage(FILE, GAME + `
    _G.FarmDashboardDataCollector = {
      _companionFarmScopeReady = true, _companionExportFarmId = 2 }
  `, { farmId: 2 }))
    .toMatchObject({ readState: "settings-only", reason: "local-farm-mismatch" });
});

test("waits for loaded mod and requires the combined single-player host", () => {
  expect(runCompanionPage(FILE, GAME.replace('InitDone = true',
    'InitDone = false'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "orders-not-loaded" });
  expect(runCompanionPage(FILE, GAME.replace('getIsClient = function() return true',
    'getIsClient = function() return false'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "single-player-world-not-ready" });
});

test("invalid current progress withholds item totals", () => {
  const page = runCompanionPage(FILE,
    GAME.replace('fillLevel = 2500', 'fillLevel = 11000'), { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial",
    reason: "invalid-current-order" });
  expect(page.byFarm).toBeUndefined();
});
