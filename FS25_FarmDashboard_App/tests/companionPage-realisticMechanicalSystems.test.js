"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "RealisticMechanicalSystemsCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { FS25_RealisticMechanicalSystems = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_RealisticMechanicalSystems", version = "0.12.0.0" }
  } end }
  _G.g_currentMission = { vehicleSystem = { vehicles = {
    { ownerFarmId = 1, uniqueId = "owned", getFullName = function() return "My tractor" end,
      spec_RealisticMechanicalSystems = { serviceLevel = 0.6, conditionLevel = 0.8,
        activeBreakdowns = { engine = {}, hydraulic = {} },
        maintenanceLog = {
          { type = "INSPECTION", price = 75, isCompleted = true },
          { type = "HIDDEN_INTERNAL", price = 999, isVisible = "false" },
        },
      },
      saveToXMLFile = function() error("must not save") end,
      updateThermalSystems = function() error("must not update") end },
    { ownerFarmId = 2, uniqueId = "foreign", getFullName = function() return "Neighbour" end,
      spec_RealisticMechanicalSystems = { serviceLevel = 0.1, conditionLevel = 0.1,
        maintenanceLog = { { type = "REPAIR", price = 500 } } } },
    { ownerFarmId = 1, uniqueId = "new", spec_RealisticMechanicalSystems = { isNewToRMS = true } },
  } } }
`;

test("reads only captured owned machines without updating the mod or treating log price as a payment", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page.readState).toBe("ok");
  expect(page.reason).toBeUndefined();
  expect(page.byFarm["1"]).toMatchObject({ vehicleCount: 1, breakdownVehicleCount: 1, loggedVehicleCount: 1 });
  expect(page.rows).toHaveLength(1);
  expect(page.rows[0]).toMatchObject({
    vehicleId: "owned", serviceLevel: 0.6, conditionLevel: 0.8,
    breakdownCount: 2, logCount: 1, lastLogType: "INSPECTION", lastLogPrice: 75,
    lastLogCompleted: true,
  });
  const merged = normalizeCompanionPages({ pages: { realisticMechanicalSystems: page } }, { modules: loadModules() });
  expect(merged.pages.realisticMechanicalSystems.rows).toHaveLength(1);
});

test("without the exact mod, no page is emitted", () => {
  expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
});

test("reports the mod's explicit Advanced Damage System conflict instead of an uncaptured machine", () => {
  const page = runCompanionPage(FILE, `
    _G.g_modIsLoaded = { FS25_RealisticMechanicalSystems = true, FS25_AdvancedDamageSystem = true }
    _G.g_modManager = { getActiveMods = function() return {
      { modName = "FS25_RealisticMechanicalSystems", version = "0.12.0.0" }
    } end }
    _G.g_currentMission = { vehicleSystem = { vehicles = {
      { ownerFarmId = 1, uniqueId = "owned", spec_RealisticMechanicalSystems = {
        serviceLevel = 0.6, conditionLevel = 0.8,
      } },
    } } }
  `, { farmId: 1 });
  expect(page).toMatchObject({
    readState: "partial",
    reason: "advanced-damage-system-conflict",
    coverage: "unavailable",
  });
  expect(Object.keys(page.rows)).toHaveLength(0);
  expect(page.byFarm).toBeUndefined();
});

test("detects the older vault build but withholds its unreviewed vehicle schema", () => {
  const page = runCompanionPage(FILE, `
    _G.g_modIsLoaded = { KM_82113_Realistic_Mechanical_Systems = true }
    _G.g_modManager = { getActiveMods = function() return {
      { modName = "KM_82113_Realistic_Mechanical_Systems", version = "0.10.0.0" }
    } end }
    _G.g_currentMission = { vehicleSystem = { vehicles = {
      { ownerFarmId = 1, uniqueId = "owned", spec_RealisticMechanicalSystems = {
        serviceLevel = 0.6, conditionLevel = 0.8,
      } },
    } } }
  `, { farmId: 1 });
  expect(page).toMatchObject({
    detected: true,
    modName: "KM_82113_Realistic_Mechanical_Systems",
    version: "0.10.0.0",
    readState: "settings-only",
    reason: "unreviewed-version",
  });
  expect(page.rows).toBeUndefined();
  expect(page.byFarm).toBeUndefined();
});
