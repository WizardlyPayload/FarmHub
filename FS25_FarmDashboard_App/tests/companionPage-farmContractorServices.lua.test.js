"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "FarmContractorServicesCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { KM_82945_Farm_Contractor_Services = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "KM_82945_Farm_Contractor_Services", version = "3.0.1.1" }
  } end }
  _G.KM_82945_Farm_Contractor_Services = { ContractorHarvesting = {
    workOrders = {
      [8] = { id = 8, farmId = 1, farmlandId = 36,
        fieldName = "Field 36", state = "BOOKED", operations = {
          { serviceType = "HARVEST", record = { farmId = 1, price = 2400,
            areaHa = 4.75 } } } },
      [9] = { id = 9, farmId = 2, farmlandId = 37,
        fieldName = "Private foreign order", state = "RUNNING", operations = {
          { serviceType = "FORAGE", record = { farmId = 2, price = 9000,
            areaHa = 8 } } } },
    },
    refreshWorkOrders = function() error("reader must not rebuild register") end,
    savePersistenceToXML = function() error("reader must not write save") end,
  } }
  _G.g_currentMission = { isMissionStarted = true,
    missionDynamicInfo = { isMultiplayer = false },
    getIsServer = function() return true end }
`;

test("copies current exact-farm order without rebuilding or writing mod state", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { currentOrderCount: 1 } },
    rows: [{ farmId: 1, orderId: 8, farmlandId: 36,
      fieldName: "Field 36", service: "HARVEST", state: "BOOKED",
      bookedPrice: 2400, areaHa: 4.75 }],
  });
  expect(JSON.stringify(page)).not.toContain("Private foreign order");
  expect(normalizeCompanionPages({ pages: { farmContractorServices: page } },
    { modules: loadModules() }).pages.farmContractorServices.rows).toHaveLength(1);
});

test("requires exact reviewed version, single player and server register", () => {
  expect(runCompanionPage(FILE, GAME.replace('version = "3.0.1.1"',
    'version = "3.0.1.2"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE, GAME.replace('isMultiplayer = false',
    'isMultiplayer = true'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "single-player-only" });
  expect(runCompanionPage(FILE, GAME.replace('return true end }',
    'return false end }'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-world-not-ready" });
});

test("no current-farm order is an explicit empty reading", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 3 });
  expect(page).toMatchObject({ readState: "settings-only",
    reason: "no-current-farm-orders" });
});

test("invalid farm order and persistence recovery withhold totals", () => {
  const invalid = runCompanionPage(FILE,
    GAME.replace('price = 2400', 'price = -1'), { farmId: 1 });
  expect(invalid).toMatchObject({ readState: "partial",
    reason: "invalid-or-ambiguous-order", coverage: "partial" });
  expect(invalid.byFarm).toBeUndefined();
  const recovery = runCompanionPage(FILE,
    GAME.replace('workOrders = {', 'persistenceRecoveryError = "bad save", workOrders = {'),
    { farmId: 1 });
  expect(recovery).toMatchObject({ readState: "partial",
    reason: "persistence-recovery-error" });
  expect(recovery.rows).toBeUndefined();
});
