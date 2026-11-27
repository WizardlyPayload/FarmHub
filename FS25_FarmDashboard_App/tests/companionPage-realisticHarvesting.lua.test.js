"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "RealisticHarvestingCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_RealisticHarvesting = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_RealisticHarvesting", version = "1.6.0.0" }
  } end }
  local function machine(id, owner, mode, crop, fan)
    return { uniqueId = id, getOwnerFarmId = function() return owner end,
      getFullName = function() return id end,
      spec_rhm_Combine = { machineType = "grain", packageLevel = 4,
        combineMemory = { mode = mode, currentCrop = crop, autoSwitchEnabled = mode == "AUTO",
          isCalibrated = true,
          currentSettings = { fan = fan, rotor = 60, upperSieve = 40,
            lowerSieve = 45, feeder = 55, targetEngineLoad = 92 } },
        data = { tonPerHour = 12, cropLoss = 5 } } }
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      machine("farm-combine", 1, "AUTO", "WHEAT", 73),
      machine("other-farm", 2, "MANUAL", "BARLEY", 28),
    } } }
`;

test("exports owned combine tuning without a foreign combine or stale live rates", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { combineCount: 1, calibratedCount: 1, autoCount: 1 } } });
  expect(page.rows).toEqual([expect.objectContaining({
    farmId: 1, vehicleId: "farm-combine", machineType: "grain", packageLevel: 4,
    mode: "AUTO", autoSwitch: true, tuningCrop: "WHEAT", fan: 73,
    rotor: 60, upperSieve: 40, lowerSieve: 45, feeder: 55, targetEngineLoad: 92,
  })]);
  expect(JSON.stringify(page)).not.toContain("other-farm");
  expect(JSON.stringify(page)).not.toContain("tonPerHour");
  expect(JSON.stringify(page)).not.toContain("cropLoss");
  const merged = normalizeCompanionPages({ pages: { realisticHarvesting: page } }, { modules: loadModules() });
  expect(merged.pages.realisticHarvesting.rows).toHaveLength(1);
});

test("withholds totals and duplicate rows for malformed memory or repeated identity", () => {
  const malformed = runCompanionPage(FILE,
    SETUP.replace('machine("other-farm", 2, "MANUAL", "BARLEY", 28)',
      'machine("bad", 1, "MANUAL", "BARLEY", 201)'), { farmId: 1 });
  expect(malformed).toMatchObject({ readState: "partial", coverage: "partial",
    reason: "invalid-combine-memory" });
  expect(malformed.byFarm["1"]).not.toHaveProperty("combineCount");
  expect(malformed.rows).toHaveLength(1);
  const duplicate = runCompanionPage(FILE,
    SETUP.replace('machine("other-farm", 2, "MANUAL", "BARLEY", 28)',
      'machine("farm-combine", 1, "MANUAL", "BARLEY", 28)'), { farmId: 1 });
  expect(duplicate).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(Object.keys(duplicate.rows)).toHaveLength(0);
});

test("gates unreviewed version, client context and absent mod", () => {
  expect(runCompanionPage(FILE, SETUP.replace('version = "1.6.0.0"', 'version = "1.6.0.1"'),
    { farmId: 1 })).toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE, SETUP.replace('getIsServer = function() return true end',
    'getIsServer = function() return false end'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-combine-state-only" });
  expect(runCompanionPage(FILE, '_G.g_modIsLoaded = {}', { farmId: 1 })).toBeUndefined();
});
