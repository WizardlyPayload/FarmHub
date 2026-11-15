"use strict";

const { runCompanionPage, runCompanionLua } = require("./helpers/companion-page-lua.cjs");
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

test("reviewed vault and runtime ZIP names expose the same current order", () => {
  for (const modName of ["KM_65282_VIP_Order_Manager", "FS25_310861_VIP_Order_Manager", "FS25_VIPOrderManager"]) {
    const setup = GAME.replaceAll("KM_65282_VIP_Order_Manager", modName);
    const page = runCompanionPage(FILE, setup, { farmId: 1 });
    expect(page).toMatchObject({ readState: "ok", byFarm: { "1": { itemCount: 2 } } });
    const detected = runCompanionLua([FILE], setup, `
      local _, payload = CompanionModsDataCollector:collectStep({})
      local found, count = false, 0
      for _, mod in ipairs(payload.mods or {}) do
        if mod.id == "vipOrderManager" then found = true; count = count + 1 end
      end
      return __fdEncode({ found = found, count = count,
        state = payload.vipOrders and payload.vipOrders.readState,
        openCount = payload.vipOrders and payload.vipOrders.orderCount })
    `, { farmId: 1 });
    expect(detected.found).toBe(true);
    expect(detected.count).toBe(1);
    expect(detected.state).toBe("ok");
    expect(detected.openCount).toBe(1);
  }
});

test("shared VIP summary withholds unready, unreviewed, and other-farm orders", () => {
  const sharedState = (setup, farmId = 1) => runCompanionLua([FILE], setup,
    `local _, payload = CompanionModsDataCollector:collectStep({})
     return __fdEncode(payload.vipOrders)`, { farmId });
  expect(sharedState(GAME.replace('InitDone = true', 'InitDone = false')))
    .toMatchObject({ readState: "pending" });
  expect(sharedState(GAME.replace('version = "1.2.2.0"', 'version = "1.2.2.1"')))
    .toMatchObject({ readState: "unavailable", reason: "unreviewed-version" });
  expect(sharedState(GAME.replace('getIsClient = function() return true',
    'getIsClient = function() return false')))
    .toMatchObject({ readState: "unavailable", reason: "single-player-world-not-ready" });
  expect(sharedState(GAME + `
    _G.FarmDashboardDataCollector = {
      _companionFarmScopeReady = true, _companionExportFarmId = 2 }
  `, 2)).toMatchObject({ readState: "unavailable", reason: "local-farm-mismatch" });
  expect(sharedState(GAME.replace('level = 3, entries = {', 'entries = {')))
    .toMatchObject({ readState: "partial", reason: "invalid-current-order" });
  const malformed = sharedState(GAME.replace('fillLevel = 2500', 'fillLevel = 11000'));
  expect(malformed).toMatchObject({ readState: "partial", reason: "invalid-current-order" });
  expect(malformed.currentOrder).toBeUndefined();
  const tooMany = sharedState(GAME + `
    for i = 1, 25 do
      local key = "EXTRA" .. i
      _G.KM_65282_VIP_Order_Manager.VIPOrderManager.VIPOrders[1].entries[key] =
        { fillTypeName = key, quantity = 10, fillLevel = 0, payout = 1 }
    end
  `);
  expect(tooMany).toMatchObject({ readState: "partial", coverage: "truncated" });
  expect(tooMany.currentOrder).toBeUndefined();
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

test("distinguishes an initialized empty order list from an unreadable version", () => {
  const empty = GAME.replace('VIPOrders = {', 'VIPOrders = {}, unusedOrderFixture = {');
  const page = runCompanionPage(FILE, empty, { farmId: 1 });
  expect(page).toMatchObject({ readState: "empty", reason: "no-current-order" });
  expect(page.rows).toBeUndefined();
  const shared = runCompanionLua([FILE],
    empty.replaceAll("KM_65282_VIP_Order_Manager", "FS25_VIPOrderManager"), `
      local _, payload = CompanionModsDataCollector:collectStep({})
      return __fdEncode(payload.vipOrders)
    `, { farmId: 1 });
  expect(shared).toMatchObject({ readState: "empty", orderCount: 0, farmId: 1 });
  expect(shared).not.toHaveProperty("reason");
  expect(shared).not.toHaveProperty("currentOrder");
});

test("invalid current progress withholds item totals", () => {
  const page = runCompanionPage(FILE,
    GAME.replace('fillLevel = 2500', 'fillLevel = 11000'), { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial",
    reason: "invalid-current-order" });
  expect(page.byFarm).toBeUndefined();
});
