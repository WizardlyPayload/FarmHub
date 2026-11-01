"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "RealisticFarmFinanceLoansCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { KM_82429_Realistic_Farm_Finance = true }
  _G.g_currentMission = { getFarmId = function() return 1 end,
    realisticFarmFinance = { repository = { loaded = true, loans = {
      { id = 17, farmId = 1, type = "TERM", paidOff = false, principal = 25000.568,
        arrearsBalance = 300.4, interestRate = 5.5, remainingMonths = 18, paymentsMade = 6 },
      { id = 18, farmId = 1, type = "BULLET", paidOff = false, principal = 10000,
        arrearsBalance = 0, interestRate = 6.0, remainingMonths = 10, paymentsMade = 2 },
      { id = 19, farmId = 1, type = "REVOLVING", paidOff = false, principal = 0,
        drawnAmount = 8000, arrearsBalance = 0 },
      { id = 20, farmId = 1, type = "TERM", paidOff = true, principal = 0, arrearsBalance = 0 },
      { id = 21, farmId = 2, type = "TERM", paidOff = false, principal = 900000,
        arrearsBalance = 1000 },
    } } } }
`;

test("exports only supported active loans for the selected farm", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete" });
  expect(page.byFarm["1"]).toMatchObject({ loanCount: 2, arrearsCount: 1, otherProductCount: 1 });
  expect(page.rows.map((row) => row.id)).toEqual([17, 18]);
  expect(page.rows[0]).toMatchObject({ kind: "TERM", principal: 25000.57, arrears: 300.4 });
  expect(page.rows.some((row) => row.farmId === 2 || row.id === 19 || row.id === 20)).toBe(false);
  const merged = normalizeCompanionPages({ pages: { realisticFarmFinanceLoans: page } }, { modules: loadModules() });
  expect(merged.pages.realisticFarmFinanceLoans.rows).toHaveLength(2);
});

test("withholds an unloaded repository and an unloaded mod", () => {
  expect(runCompanionPage(FILE, GAME.replace("loaded = true", "loaded = false"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "finance-repository-unavailable" });
  expect(runCompanionPage(FILE, GAME.replace("KM_82429_Realistic_Farm_Finance = true", "OtherMod = true"), { farmId: 1 })).toBeUndefined();
});
