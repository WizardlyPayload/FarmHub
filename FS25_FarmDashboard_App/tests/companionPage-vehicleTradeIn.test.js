"use strict";

const { runCompanionPage, runCompanionLua } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "VehicleTradeInCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_TradeInMenu = true }
  local mod = { statistics = { transactions = {
    { farmId = 1, vehicleName = "MF 8570", brand = "Massey Ferguson",
      baseValue = 45000, finalValue = 42000, date = "2026-11-01" },
    { farmId = 2, vehicleName = "Foreign tractor", baseValue = 60000,
      finalValue = 57000, date = "2026-11-01" },
    { vehicleName = "Unknown farm", finalValue = 9000 },
    { farmId = 1, vehicleName = "Claas Arion", baseValue = 20000,
      finalValue = 18000, date = "2026-10-31" },
  } } }
  _G.FS25_TradeInMenu = { TradeInMod = mod }
  _G.g_currentMission = { getIsServer = function() return true end,
    tradeInMod = mod }
`;

test("reads only exact-farm completed trade credit without mutating the mod", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { tradeCount: 2, totalCredit: 60000 } } });
  expect(page.reason).toBeUndefined();
  expect(page.rows.map((row) => row.vehicle)).toEqual(["Claas Arion", "MF 8570"]);
  expect(page.rows[0]).toMatchObject({ tradeCredit: 18000, baseAppraisal: 20000 });
  expect(JSON.stringify(page)).not.toContain("Foreign tractor");
  expect(JSON.stringify(page)).not.toContain("Unknown farm");
  expect(normalizeCompanionPages({ pages: { vehicleTradeIn: page } }, { modules: loadModules() })
    .pages.vehicleTradeIn.rows).toHaveLength(2);

  const outcome = runCompanionLua([FILE], SETUP, `
    local before = _G.FS25_TradeInMenu.TradeInMod.statistics.transactions[1].finalValue
    local page = CompanionPages.collectEntry(CompanionPages.entries.vehicleTradeIn, 1)
    return __fdEncode({ unchanged = before ==
      _G.FS25_TradeInMenu.TradeInMod.statistics.transactions[1].finalValue,
      count = #_G.FS25_TradeInMenu.TradeInMod.statistics.transactions,
      credit = page.byFarm["1"].totalCredit })
  `, { farmId: 1 });
  expect(outcome).toMatchObject({ unchanged: true, count: 4, credit: 60000 });
});

test("withholds client and unbound or shadow trade registers", () => {
  const client = SETUP.replace("return true end", "return false end");
  expect(runCompanionPage(FILE, client, { farmId: 1 })).toMatchObject({
    readState: "settings-only", reason: "server-ledger-only",
  });
  const shadow = SETUP.replace("tradeInMod = mod }", "tradeInMod = {} }");
  expect(runCompanionPage(FILE, shadow, { farmId: 1 })).toMatchObject({
    readState: "settings-only", reason: "no-trade-ledger",
  });
  expect(runCompanionPage(FILE, SETUP, { farmId: 3 })).toMatchObject({
    readState: "settings-only", reason: "no-farm-trades",
  });
  const multiplayer = SETUP.replace("tradeInMod = mod }", "tradeInMod = mod, missionDynamicInfo = { isMultiplayer = true } }");
  expect(runCompanionPage(FILE, multiplayer, { farmId: 1 })).toMatchObject({
    readState: "settings-only", reason: "legacy-owner-ambiguous",
  });
});
