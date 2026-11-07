"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "ShopRefundCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { FS25_364635_Shop_Refund = true }
  _G.ShopRefund = { xmlLoadPending = false, refundsByUniqueId = {
    ["tractor-1"] = { farmId = 1, baseOperatingTime = 60000,
      purchaseMonthKey = "2026:4", purchasePrice = 80000, name = "At purchase" },
    ["sold-1"] = { farmId = 1, baseOperatingTime = 0,
      purchaseMonthKey = "2026:4", purchasePrice = 30000 },
    ["foreign-1"] = { farmId = 2, baseOperatingTime = 0,
      purchaseMonthKey = "2026:4", purchasePrice = 200000 },
    ["old-month"] = { farmId = 1, baseOperatingTime = 0,
      purchaseMonthKey = "2026:3", purchasePrice = 20000 },
    ["used-up"] = { farmId = 1, baseOperatingTime = 0,
      purchaseMonthKey = "2026:4", purchasePrice = 20000 },
  } }
  _G.g_currentMission = {
    getFarmId = function() return 1 end,
    getIsServer = function() return true end,
    isMissionStarted = true,
    environment = { currentYear = 2026, currentPeriod = 4 },
    vehicleSystem = { vehicles = {
      { ownerFarmId = 1, uniqueId = "tractor-1", operatingTime = 660000,
        getName = function() return "Current tractor" end },
      { ownerFarmId = 1, uniqueId = "old-month", operatingTime = 60000 },
      { ownerFarmId = 1, uniqueId = "used-up", operatingTime = 1860000 },
      { ownerFarmId = 2, uniqueId = "foreign-1", operatingTime = 0 },
    } },
  }
`;

test("shows only current farm vehicles inside the source time and month window", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(page.byFarm["1"]).toMatchObject({ candidateCount: 1, withheldCount: 3 });
  expect(page.rows).toEqual([expect.objectContaining({
    farmId: 1, vehicleId: "tractor-1", vehicle: "Current tractor",
    recordedPriceBasis: 80000, operatingMinutesUsed: 10, operatingMinutesLeft: 20,
  })]);
  const merged = normalizeCompanionPages({ pages: { shopRefund: page } }, { modules: loadModules() });
  expect(merged.pages.shopRefund.rows).toHaveLength(1);
});

test("withholds client, pending XML load and absent mod", () => {
  expect(runCompanionPage(FILE, GAME.replace("getIsServer = function() return true end", "getIsServer = function() return false end"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-state-only" });
  expect(runCompanionPage(FILE, GAME.replace("xmlLoadPending = false", "xmlLoadPending = true"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "refund-register-unavailable" });
  expect(runCompanionPage(FILE, GAME.replace("isMissionStarted = true", "isMissionStarted = false"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "world-not-started" });
  expect(runCompanionPage(FILE, GAME.replace("FS25_364635_Shop_Refund = true", "OtherMod = true"), { farmId: 1 }))
    .toBeUndefined();
});

test("a record without the purchase-month key follows the mod's open-month rule", () => {
  const page = runCompanionPage(FILE, GAME.replace('purchaseMonthKey = "2026:4", purchasePrice = 80000', 'purchaseMonthKey = "", purchasePrice = 80000'), { farmId: 1 });
  expect(page.rows[0]).toMatchObject({ vehicleId: "tractor-1", operatingMinutesLeft: 20 });
});
