"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "VillageBankCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { KM_82435_Village_Bank = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "KM_82435_Village_Bank", version = "1.6.0.0" }
  } end }
  _G.g_currentMission = { getIsServer = function() return true end }
  _G.KM_82435_Village_Bank = { g_villageBank = {
    getFarmData = function() error("must not create or normalize accounts") end,
    getAccountBalance = function() error("must not call mutable account helper") end,
    farms = {
      [1] = {
        accounts = {
          { id = 0, name = "Farm account", isMain = true, balance = 0 },
          { id = 2, name = "Fleet reserve", isMain = false, balance = 14250.5 },
        },
        savingsDeposits = { { id = 1, balance = 8000, principal = 7500,
          annualRate = 0.04, maturityDay = 50 } },
        loans = { { id = 5, vehicleName = "Tractor", status = "active", monthsLeft = 18,
          outstanding = 12000, monthlyRate = 720, arrearsCount = 1 } },
        leases = { { id = 6, vehicleName = "Trailer", status = "purchaseOption",
          monthsLeft = 0, residual = 1000, monthlyRate = 0, arrearsCount = 0 } },
        transactions = { { transactionType = "Deposit", source = "Farm account",
          target = "Fleet reserve", amount = 500, day = 24 } },
      },
      [2] = { accounts = { { id = 3, name = "Other farm", balance = 90000 } },
        savingsDeposits = {}, loans = {}, leases = {}, transactions = {} },
    },
  } }
`;

test("reads selected farm's mod-owned books without duplicating native main money", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { subaccountCount: 1, depositCount: 1,
      financeCount: 1, leaseCount: 1, transactionCount: 1 } } });
  expect(page.accounts).toEqual([{ farmId: 1, id: 2, name: "Fleet reserve", balance: 14250.5 }]);
  expect(page.deposits[0]).toMatchObject({ balance: 8000, annualRate: 0.04 });
  expect(page.contracts).toHaveLength(2);
  expect(page.contracts[1]).toMatchObject({ kind: "lease", status: "purchaseOption", residual: 1000 });
  expect(page.transactions[0]).toMatchObject({ amount: 500, day: 24 });
  const merged = normalizeCompanionPages({ pages: { villageBank: page } }, { modules: loadModules() });
  expect(merged.pages.villageBank.accounts).toHaveLength(1);
  expect(merged.pages.villageBank.contracts).toHaveLength(2);
});

test("the other farm gets only its own account; client and missing farm are withheld", () => {
  const other = runCompanionPage(FILE, GAME, { farmId: 2 });
  expect(other.accounts).toEqual([{ farmId: 2, id: 3, name: "Other farm", balance: 90000 }]);
  const merged = normalizeCompanionPages({ pages: { villageBank: other } }, { modules: loadModules() });
  expect(merged.pages.villageBank.contracts).toEqual([]);
  const client = GAME.replace("getIsServer = function() return true end", "getIsServer = function() return false end");
  expect(runCompanionPage(FILE, client, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-book-only" });
  expect(runCompanionPage(FILE, GAME, { farmId: 3 }))
    .toMatchObject({ readState: "settings-only", reason: "farm-book-unavailable" });
});

test("does not read a shared-global bank shadow outside the loaded mod", () => {
  const shadow = GAME.replace("_G.KM_82435_Village_Bank = { g_villageBank = {", "_G.g_villageBank = {")
    .replace("  } }\n", "  }\n");
  expect(runCompanionPage(FILE, shadow, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "farm-book-unavailable" });
});

test("withholds an unreviewed Village Bank version", () => {
  const newer = GAME.replace('version = "1.6.0.0"', 'version = "1.6.0.1"');
  expect(runCompanionPage(FILE, newer, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
});

test("main-account-only farm is settings-only and absent mod has no page", () => {
  const mainOnly = GAME.replace("{ id = 2, name = \"Fleet reserve\", isMain = false, balance = 14250.5 },", "")
    .replace("savingsDeposits = { { id = 1, balance = 8000, principal = 7500,\n          annualRate = 0.04, maturityDay = 50 } },", "savingsDeposits = {},")
    .replace(/loans = \{ \{ id = 5[^\n]+\n[^\n]+ \} \},/, "loans = {},")
    .replace(/leases = \{ \{ id = 6[^\n]+\n[^\n]+ \} \},/, "leases = {},")
    .replace(/transactions = \{ \{ transactionType = "Deposit"[^\n]+\n[^\n]+ \} \},/, "transactions = {},");
  expect(runCompanionPage(FILE, mainOnly, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "no-mod-owned-bank-records" });
  expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
});
