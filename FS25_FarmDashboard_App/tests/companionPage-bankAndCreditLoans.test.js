"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "BankAndCreditLoansCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { KM_77828_Bank_And_Credit = true }
  _G.g_currentMission = {
    getFarmId = function() return 1 end,
    getIsServer = function() return true end,
    bankManager = { repository = { loans = {
      { id = 4, farmId = 1, type = 1, amount = 20000, restAmount = 12400.236,
        interestRate = 5.75, monthlyPayment = 620, restDuration = 22, paidOff = false },
      { id = 8, farmId = 1, type = 3, amount = 10000, restAmount = 3200,
        interestRate = 6.5, monthlyPayment = 0, restDuration = 0, paidOff = false },
      { id = 9, farmId = 1, type = 2, amount = 5000, restAmount = 0,
        interestRate = 5, monthlyPayment = 0, restDuration = 0, paidOff = true },
      { id = 10, farmId = 2, type = 2, amount = 900000, restAmount = 800000,
        interestRate = 8, monthlyPayment = 4000, restDuration = 20, paidOff = false },
    } } },
  }
`;

test("reads exact-farm active Bank And Credit loans with revolving drawn balance", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete" });
  expect(page.byFarm["1"].activeCount).toBe(2);
  expect(page.rows.map((row) => row.id)).toEqual([4, 8]);
  expect(page.rows[0]).toMatchObject({ kind: "annuity", creditLimit: 20000, outstanding: 12400.24 });
  expect(page.rows[1]).toMatchObject({ kind: "revolving", creditLimit: 10000, outstanding: 3200 });
  expect(page.rows.some((row) => row.id === 9 || row.id === 10)).toBe(false);
  const merged = normalizeCompanionPages({ pages: { bankAndCreditLoans: page } }, { modules: loadModules() });
  expect(merged.pages.bankAndCreditLoans.rows).toHaveLength(2);
});

test("withholds client and absent repository state", () => {
  expect(runCompanionPage(FILE, GAME.replace("return true end", "return false end"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-unavailable" });
  expect(runCompanionPage(FILE, GAME.replace("bankManager = { repository = { loans = {", "bankManager = { repository = { other = {"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "bank-repository-unavailable" });
  expect(runCompanionPage(FILE, GAME.replace("KM_77828_Bank_And_Credit = true", "OtherMod = true"), { farmId: 1 }))
    .toBeUndefined();
});
