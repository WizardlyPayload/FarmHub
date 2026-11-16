"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "FinanceYourFleetCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { KM_81456_Finance_Your_Fleet = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "KM_81456_Finance_Your_Fleet", version = "1.0.0.1" }
  } end }
  _G.g_currentMission = { getFarmId = function() return 1 end,
    financeManager = { financeDataLoaded = true, disabledForSession = false,
      financeAgreements = {
        { id = "owned-1", farmId = 1, agreementType = 1, vehicle = "tractor-id",
          baseCost = 100000, deposit = 20000, termMonths = 24, paymentsMade = 5,
          finalPayment = 10000, latePaymentCount = 1,
          getVehicle = function() error("mutating vehicle link called") end,
          getUniqueId = function() error("mutating ID link called") end,
          getScheduledPaymentDue = function() return 3400 end,
          getPayoffAmount = function() return 73333.33 end },
        { id = "foreign-farm", farmId = 2, agreementType = 1, vehicle = "other-id",
          baseCost = 200000, deposit = 0, termMonths = 24, paymentsMade = 0, finalPayment = 0 },
        { id = "sold", farmId = 1, agreementType = 1, vehicle = "sold-id",
          baseCost = 50000, deposit = 5000, termMonths = 12, paymentsMade = 1, finalPayment = 0 },
        { id = "foreign-vehicle", farmId = 1, agreementType = 1, vehicle = "other-id",
          baseCost = 80000, deposit = 8000, termMonths = 12, paymentsMade = 1, finalPayment = 0 },
      }, pendingMigrationLinks = { { id = "pending", farmId = 1, vehicle = "tractor-id" } } },
    vehicleSystem = { vehicles = {
      { ownerFarmId = 1, uniqueId = "tractor-id", getFullName = function() return "Tractor A" end,
        getUniqueId = function() error("vehicle ID getter called") end },
      { ownerFarmId = 2, uniqueId = "other-id", getFullName = function() return "Other farm" end },
    } } }
`;

test("reads only active, linked agreements for this farm without mutating vehicle IDs", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(page.byFarm["1"]).toMatchObject({ agreementCount: 1, lateCount: 1, recoveryCount: 0, unlinkedCount: 2 });
  expect(page.rows).toEqual([expect.objectContaining({
    id: "owned-1", farmId: 1, vehicleId: "tractor-id", vehicle: "Tractor A",
    paymentsMade: 5, termMonths: 24, scheduledDue: 3400, payoffEstimate: 73333.33,
  })]);
  const merged = normalizeCompanionPages({ pages: { financeYourFleet: page } }, { modules: loadModules() });
  expect(merged.pages.financeYourFleet.rows).toHaveLength(1);
});

test("does not expose an unready register or a mod that is not loaded", () => {
  const unready = runCompanionPage(FILE, GAME.replace("financeDataLoaded = true", "financeDataLoaded = false"), { farmId: 1 });
  expect(unready).toMatchObject({ readState: "settings-only", reason: "finance-register-unavailable" });
  const absent = GAME.replace("KM_81456_Finance_Your_Fleet = true", "OtherMod = true")
    .replace('modName = "KM_81456_Finance_Your_Fleet"', 'modName = "OtherMod"');
  expect(runCompanionPage(FILE, absent, { farmId: 1 })).toBeUndefined();
});

test("withholds agreements from an unreviewed Finance Your Fleet version", () => {
  const newer = GAME.replace('version = "1.0.0.1"', 'version = "9.9.9.9"');
  expect(runCompanionPage(FILE, newer, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
});
