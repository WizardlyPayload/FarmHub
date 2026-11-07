"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "AgriCreditSolutionsCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { KM_81927_AgriCredit_Solutions = true }
  _G.g_currentMission = {
    getFarmId = function() return 1 end,
    getIsServer = function() return true end,
    agriCreditManager = { financeDataLoaded = true, financeAgreements = {
      { id = "barn-1", agreementType = 1, farmId = 1, placeableUniqueId = "barn-id",
        buildingName = "Stale barn name", baseCost = 90000, deposit = 10000,
        termMonths = 24, paymentsMade = 4, finalPayment = 10000,
        latePaymentCount = 1, collectionsActive = false,
        getUniqueId = function() error("mutating agreement link called") end,
        getScheduledPaymentDue = function() return 3600 end,
        getPayoffAmount = function() return 71000 end },
      { id = "foreign", agreementType = 1, farmId = 2, placeableUniqueId = "other-id",
        baseCost = 200000, deposit = 20000, termMonths = 36,
        paymentsMade = 0, finalPayment = 0, latePaymentCount = 0 },
      { id = "sold", agreementType = 1, farmId = 1, placeableUniqueId = "sold-id",
        baseCost = 70000, deposit = 5000, termMonths = 12,
        paymentsMade = 1, finalPayment = 0, latePaymentCount = 0 },
      { id = "other-owned", agreementType = 1, farmId = 1, placeableUniqueId = "other-id",
        baseCost = 70000, deposit = 5000, termMonths = 12,
        paymentsMade = 1, finalPayment = 0, latePaymentCount = 0 },
    } },
    placeableSystem = { placeables = {
      { ownerFarmId = 1, uniqueId = "barn-id",
        getOwnerFarmId = function() return 1 end,
        getUniqueId = function() return "barn-id" end,
        getName = function() return "Milking barn" end },
      { ownerFarmId = 2, uniqueId = "other-id",
        getOwnerFarmId = function() return 2 end,
        getUniqueId = function() return "other-id" end },
    } },
  }
`;

test("reads a linked owned building and withholds sold and foreign buildings", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(page.byFarm["1"]).toMatchObject({ linkedCount: 1, unlinkedCount: 2 });
  expect(page.rows).toEqual([expect.objectContaining({
    farmId: 1, id: "barn-1", placeableId: "barn-id", building: "Milking barn",
    termMonths: 24, paymentsMade: 4, deposit: 10000,
    scheduledDue: 3600, payoffAmount: 71000, latePaymentCount: 1,
  })]);
  const merged = normalizeCompanionPages({ pages: { agriCreditSolutions: page } }, { modules: loadModules() });
  expect(merged.pages.agriCreditSolutions.rows).toHaveLength(1);
});

test("withholds unready, client and absent-mod state", () => {
  expect(runCompanionPage(FILE, GAME.replace("financeDataLoaded = true", "financeDataLoaded = false"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "agreement-register-unavailable" });
  expect(runCompanionPage(FILE, GAME.replace("getIsServer = function() return true end", "getIsServer = function() return false end"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-state-only" });
  expect(runCompanionPage(FILE, GAME.replace("KM_81927_AgriCredit_Solutions = true", "OtherMod = true"), { farmId: 1 }))
    .toBeUndefined();
});

test("marks malformed agreement terms partial rather than reporting a payoff", () => {
  const bad = GAME.replace("paymentsMade = 4", "paymentsMade = 25");
  const page = runCompanionPage(FILE, bad, { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(Object.keys(page.rows)).toHaveLength(0);
  expect(page.byFarm["1"].linkedCount).toBe(0);
});

test("collections agreements show a payoff but no scheduled debit", () => {
  const page = runCompanionPage(FILE, GAME.replace("collectionsActive = false", "collectionsActive = true"), { farmId: 1 });
  expect(page.rows[0]).toMatchObject({ collectionsActive: true, payoffAmount: 71000 });
  expect(page.rows[0].scheduledDue).toBeUndefined();
});
