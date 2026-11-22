"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "IncomeModEmergencyDebtCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { FS25_IncomeMod = true }
  _G.g_modManager = { getActiveMods = function() return { { modName = "FS25_IncomeMod", version = "2.2.0.7" } } end }
  _G.g_currentMission = { getIsServer = function() return true end }
  _G.FS25_IncomeMod = { g_IncomeManager = { emergencyLoan = {
    readiness = "READY",
    debts = {
      [1] = { active = true, principal = 12000, accruedInterest = 350.5,
        drawCount = 2, revision = 4, lastSettledMonth = 45,
        interestEligibleFromMonth = 43 },
      [2] = { active = false, principal = 0, accruedInterest = 0,
        drawCount = 3, revision = 8 },
    },
    getView = function() error("must not build a forecast") end,
    applyRepayment = function() error("must not repay") end,
  } } }
`;

test("reads only selected farm emergency debt without calling loan behavior", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { active: true, principal: 12000, accruedInterest: 350.5,
      outstanding: 12350.5, drawCount: 2, lastSettledMonth: 45 } } });
  expect(page.byFarm["2"]).toBeUndefined();
  const merged = normalizeCompanionPages({ pages: { incomeModEmergencyDebt: page } },
    { modules: loadModules() });
  expect(merged.pages.incomeModEmergencyDebt.byFarm["1"].outstanding).toBe(12350.5);
});

test("accepts reviewed Income Mod 2.3.0.0 debt schema and rejects unknown versions", () => {
  const current = GAME.replace('version = "2.2.0.7"', 'version = "2.3.0.0"');
  expect(runCompanionPage(FILE, current, { farmId: 1 })).toMatchObject({
    readState: "ok", byFarm: { "1": { outstanding: 12350.5, drawCount: 2 } },
  });
  const future = GAME.replace('version = "2.2.0.7"', 'version = "2.3.0.1"');
  expect(runCompanionPage(FILE, future, { farmId: 1 })).toMatchObject({
    readState: "settings-only", reason: "unreviewed-version",
  });
});

test("retired record remains a history counter, not active debt", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 2 });
  expect(page).toMatchObject({ readState: "ok",
    byFarm: { "2": { active: false, principal: 0, accruedInterest: 0,
      outstanding: 0, drawCount: 3 } } });
  expect(page.byFarm["1"]).toBeUndefined();
});

test("does not read an Income Mod manager shadow outside the loaded mod", () => {
  const shadow = GAME.replace("_G.FS25_IncomeMod = { g_IncomeManager = { emergencyLoan = {", "_G.g_IncomeManager = { emergencyLoan = {")
    .replace("  } } }\n", "  } }\n");
  expect(runCompanionPage(FILE, shadow, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "debt-register-not-ready" });
});

test("unready, client, invalid and absent state is not presented as a zero balance", () => {
  const unready = GAME.replace('readiness = "READY"', 'readiness = "UNAVAILABLE"');
  expect(runCompanionPage(FILE, unready, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "debt-register-not-ready" });
  const client = GAME.replace("getIsServer = function() return true end",
    "getIsServer = function() return false end");
  expect(runCompanionPage(FILE, client, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-debt-only" });
  const invalid = GAME.replace("principal = 12000", "principal = -1");
  expect(runCompanionPage(FILE, invalid, { farmId: 1 }))
    .toMatchObject({ readState: "partial", reason: "invalid-debt-record" });
  const inconsistent = GAME.replace("[2] = { active = false, principal = 0",
    "[2] = { active = false, principal = 10");
  expect(runCompanionPage(FILE, inconsistent, { farmId: 2 }))
    .toMatchObject({ readState: "partial", reason: "invalid-debt-record" });
  const noRecord = GAME.replace("[1] = { active", "[3] = { active");
  expect(runCompanionPage(FILE, noRecord, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "no-farm-emergency-debt" });
  expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
});
