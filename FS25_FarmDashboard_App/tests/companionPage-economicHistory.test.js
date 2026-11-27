"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "EconomicHistoryCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_367175_Economic_History = true }
  _G.FS25_367175_Economic_History = { FinancialLogger = { history = {
    { year = 2, period = 4, data = {
      [1] = { total = 1200, balance = 90200, loanBalance = 10000 },
      [2] = { total = 999999, balance = 999999, loanBalance = 999999 },
    } },
    { year = 2, period = 5, data = { [2] = { total = 888888 } } },
    { year = 2, period = 6, data = { [1] = { total = -450.5, balance = 89749.5, loanBalance = 9500 } } },
  } } }
  _G.g_currentMission = { getIsServer = function() return true end }
`;

test("exports completed finance months for the active farm only", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { recordedMonths: 2 } } });
  expect(page.rows).toEqual([
    expect.objectContaining({ farmId: 1, year: 2, period: 6,
      financeTotal: -450.5, balance: 89749.5, loanBalance: 9500 }),
    expect.objectContaining({ farmId: 1, year: 2, period: 4,
      financeTotal: 1200, balance: 90200, loanBalance: 10000 }),
  ]);
  expect(JSON.stringify(page)).not.toContain("999999");
  expect(JSON.stringify(page)).not.toContain("888888");
  expect(normalizeCompanionPages({ pages: { economicHistory: page } }, { modules: loadModules() })
    .pages.economicHistory.rows).toHaveLength(2);
});

test("withholds history on clients and ignores unrelated globals", () => {
  const client = SETUP.replace("return true", "return false");
  expect(runCompanionPage(FILE, client, { farmId: 1 })).toMatchObject({
    readState: "settings-only", reason: "server-history-only",
  });
  const shadow = `
    _G.g_modIsLoaded = { FS25_367175_Economic_History = true }
    _G.FinancialLogger = { history = { { year = 2, period = 6, data = { [1] = { total = 99 } } } } }
    _G.g_currentMission = { getIsServer = function() return true end }
  `;
  expect(runCompanionPage(FILE, shadow, { farmId: 1 })).toMatchObject({
    readState: "settings-only", reason: "no-history",
  });
});
