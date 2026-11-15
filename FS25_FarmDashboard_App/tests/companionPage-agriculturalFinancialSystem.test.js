"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "AgriculturalFinancialSystemCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { ["KM_80824_agricultural-financial-system"] = true }
  _G.g_currentMission = { getIsServer = function() return true end,
    gnFinanzas = { loadState = 2, ledger = {
      bankBalances = { [1] = 3500, [2] = 95000 },
      entries = {
        a = { id = "P-1", farmId = 1, kind = 1, status = 2,
          instrument = 2, counterpartName = "Seed order", providerName = "Supplier",
          amount = 1000, balance = 1030, createdDay = 10, dueDay = 14 },
        b = { id = "R-1", farmId = 1, kind = 2, status = 4,
          instrument = 1, counterpartName = "Grain sale", providerName = "Mill",
          amount = 600, balance = 600, createdDay = 12 },
        paid = { id = "P-2", farmId = 1, kind = 1, status = 3,
          amount = 100, balance = 0 },
        other = { id = "P-9", farmId = 2, kind = 1, status = 1,
          amount = 90000, balance = 90000, dueDay = 17 },
      },
    } },
  }
`;

test("reads loaded server ledger for only the selected farm, preserving accrued overdue balance", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { bankBalance: 3500, entryCount: 2, overdueCount: 1,
      payableBalance: 1030, receivableBalance: 600 } } });
  expect(page.rows).toHaveLength(2);
  expect(page.rows[0]).toMatchObject({ id: "R-1", status: "pending" });
  expect(page.rows[0]).not.toHaveProperty("dueDay");
  expect(page.rows[1]).toMatchObject({ id: "P-1", balance: 1030, dueDay: 14 });
  const merged = normalizeCompanionPages({ pages: { agriculturalFinancialSystem: page } }, { modules: loadModules() });
  expect(merged.pages.agriculturalFinancialSystem.rows).toHaveLength(2);
});

test("does not expose another farm, an unloaded book, or a client-side copy", () => {
  const other = runCompanionPage(FILE, GAME, { farmId: 2 });
  expect(other.rows).toHaveLength(1);
  expect(other.rows[0]).toMatchObject({ id: "P-9", farmId: 2 });
  expect(other.byFarm["2"].bankBalance).toBe(95000);
  expect(runCompanionPage(FILE, GAME.replace("loadState = 2", "loadState = 1"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "finance-book-unavailable" });
  expect(runCompanionPage(FILE, GAME.replace("getIsServer = function() return true end", "getIsServer = function() return false end"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-book-only" });
  expect(runCompanionPage(FILE, GAME.replace('KM_80824_agricultural-financial-system', 'OtherMod'), { farmId: 1 }))
    .toBeUndefined();
});

test("invalid farm entry withholds totals rather than presenting a complete obligation balance", () => {
  const corrupt = GAME.replace('balance = 1030, createdDay', 'balance = "bad", createdDay');
  const page = runCompanionPage(FILE, corrupt, { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(page.byFarm["1"]).not.toHaveProperty("payableBalance");
  expect(page.byFarm["1"]).not.toHaveProperty("receivableBalance");
  expect(page.rows).toHaveLength(1);
});
