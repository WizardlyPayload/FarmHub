"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "AdvancedDamageSystemCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { FS25_AdvancedDamageSystem = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_AdvancedDamageSystem", version = "0.9.2.4" }
  } end }
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      { ownerFarmId = 1, uniqueId = "tractor-1", getFullName = function() return "Owned tractor" end,
        spec_AdvancedDamageSystem = {
          serviceLevel = 0.42, conditionLevel = 0.67,
          currentState = "ads_spec_state_broken",
          activeBreakdowns = { engine = { isVisible = true, isActive = true },
            hydraulic = { isVisible = true, isActive = true },
            hidden = { isVisible = false, isActive = true },
            suspended = { isVisible = true, isActive = false } },
          maintenanceLog = {
            { type = "ads_spec_state_inspection", price = 80, isVisible = true, isCompleted = true },
            { type = "ads_spec_state_repair", price = 900, isVisible = false, isCompleted = false },
          },
        },
        saveToXMLFile = function() error("must not save") end,
        setNewStatus = function() error("must not mutate") end },
      { ownerFarmId = 2, uniqueId = "foreign", getFullName = function() return "Neighbour" end,
        spec_AdvancedDamageSystem = { serviceLevel = 0.1, conditionLevel = 0.1,
          maintenanceLog = { { type = "secret", price = 5000 } } } },
      { ownerFarmId = 1, uniqueId = "excluded", spec_AdvancedDamageSystem = {
        isExcludedVehicle = true, serviceLevel = 0.3, conditionLevel = 0.2 } },
    } } }
`;

test("reads owned ADS condition and visible active faults without mutating vehicles", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { vehicleCount: 1, breakdownVehicleCount: 1, loggedVehicleCount: 1 } } });
  expect(page.rows).toHaveLength(1);
  expect(page.rows[0]).toMatchObject({ vehicleId: "tractor-1", serviceLevel: 0.42,
    conditionLevel: 0.67, breakdownCount: 2, lastLogType: "ads_spec_state_inspection",
    lastLogPrice: 80 });
  expect(JSON.stringify(page)).not.toMatch(/Neighbour|secret|excluded|900|5000/);
  const merged = normalizeCompanionPages({ pages: { advancedDamageSystem: page } },
    { modules: loadModules() });
  expect(merged.pages.advancedDamageSystem.rows).toHaveLength(1);
});

test("withholds totals when the breakdown register is too large", () => {
  const page = runCompanionPage(FILE, `${GAME}
    for i = 1, 101 do
      _G.g_currentMission.vehicleSystem.vehicles[1].spec_AdvancedDamageSystem.activeBreakdowns[i] = {}
    end
  `, { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(page.byFarm).toBeUndefined();
  expect(page.rows[0].breakdownCount).toBeUndefined();
});

test("withholds malformed breakdown entries rather than reporting an active count", () => {
  const page = runCompanionPage(FILE, GAME.replace("suspended = { isVisible = true, isActive = false }",
    "suspended = 1"), { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(page.byFarm).toBeUndefined();
  expect(page.rows[0].breakdownCount).toBeUndefined();
});

test("does not warn about latent faults absent from the ADS workshop", () => {
  const page = runCompanionPage(FILE, GAME.replace(
    'engine = { isVisible = true, isActive = true },',
    'engine = { isVisible = false, isActive = true },').replace(
    'hydraulic = { isVisible = true, isActive = true },',
    'hydraulic = { isVisible = false, isActive = true },'), { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { vehicleCount: 1, breakdownVehicleCount: 0 } } });
  expect(page.rows[0].breakdownCount).toBe(0);
});

test("withholds a malformed maintenance log instead of implying no completed work", () => {
  const page = runCompanionPage(FILE, GAME.replace(
    '{ type = "ads_spec_state_repair", price = 900, isVisible = false, isCompleted = false },',
    '"bad entry",'), { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(page.byFarm).toBeUndefined();
  expect(page.rows[0].lastLogType).toBeUndefined();
  expect(page.rows[0].logCount).toBeUndefined();
});

test("requires the reviewed version and server vehicle ownership", () => {
  const old = runCompanionPage(FILE, GAME.replace('version = "0.9.2.4"',
    'version = "9.9.9.9"'), { farmId: 1 });
  expect(old).toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  const client = runCompanionPage(FILE, GAME.replace("getIsServer = function() return true end",
    "getIsServer = function() return false end"), { farmId: 1 });
  expect(client).toMatchObject({ readState: "settings-only", reason: "server-vehicles-only" });
});

test("reads the exact as-found v0.9.2.8 schema and excludes its player-excluded vehicles", () => {
  const newer = GAME.replace('version = "0.9.2.4"', 'version = "0.9.2.8"')
    .replace('uniqueId = "tractor-1", getFullName',
      'uniqueId = "tractor-1", getIsADSExcluded = function() return false end, getFullName')
    .replace('uniqueId = "excluded", spec_AdvancedDamageSystem',
      'uniqueId = "excluded", getIsADSExcluded = function() return true end, spec_AdvancedDamageSystem');
  const page = runCompanionPage(FILE, newer, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { vehicleCount: 1, breakdownVehicleCount: 1 } } });
  expect(page.rows).toHaveLength(1);
  expect(page.rows[0]).toMatchObject({ vehicleId: "tractor-1", breakdownCount: 2,
    serviceLevel: 0.42, conditionLevel: 0.67 });
});

test("withholds v0.9.2.8 totals if its exclusion method is missing", () => {
  const newer = GAME.replace('version = "0.9.2.4"', 'version = "0.9.2.8"');
  const page = runCompanionPage(FILE, newer, { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(page.byFarm).toBeUndefined();
  expect(page.rows[0]).toBeUndefined();
});
