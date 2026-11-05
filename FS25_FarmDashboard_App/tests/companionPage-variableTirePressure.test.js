"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "VariableTirePressureCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_VariableTirePressure = true }
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      { ownerFarmId = 1, uniqueId = "field", getFullName = function() return "Owned field tractor" end,
        spec_variableTirePressure = { hasVTPXml = true, isConfigEnabled = true },
        vtpGetDashboardMode = function() return 1 end,
        vtpGetDashboardPressureBar = function() return 1.12 end,
        vtpGetDashboardPressureTarget = function() return 1.0 end },
      { ownerFarmId = 1, uniqueId = "split", getFullName = function() return "Owned split tractor" end,
        spec_variableTirePressure = { hasVTPXml = true, isConfigEnabled = true },
        vtpGetDashboardMode = function() return 2 end,
        vtpGetDashboardPressureBar = function() return 1.5 end,
        vtpGetDashboardPressureTarget = function() return 1.5 end },
      { ownerFarmId = 2, uniqueId = "foreign", spec_variableTirePressure = { hasVTPXml = true, isConfigEnabled = true },
        vtpGetDashboardMode = function() return 1 end,
        vtpGetDashboardPressureBar = function() return 1 end,
        vtpGetDashboardPressureTarget = function() return 1 end },
      { ownerFarmId = 1, uniqueId = "opted-out", spec_variableTirePressure = { hasVTPXml = true, isConfigEnabled = false } },
      { ownerFarmId = 1, uniqueId = "bad", spec_variableTirePressure = { hasVTPXml = true, isConfigEnabled = true },
        vtpGetDashboardMode = function() return 1 end,
        vtpGetDashboardPressureBar = function() return 0 end,
        vtpGetDashboardPressureTarget = function() return 1 end },
    } } }
`;

test("exports only equipped owned live pressure and preserves mixed-axle mode", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { equippedCount: 2, fieldOrMixedCount: 2 } } });
  expect(page.rows.find((row) => row.vehicleId === "field"))
    .toMatchObject({ mode: 1, currentBar: 1.12, targetBar: 1 });
  expect(page.rows.find((row) => row.vehicleId === "split"))
    .toMatchObject({ mode: 2, currentBar: 1.5, targetBar: 1.5 });
  expect(JSON.stringify(page)).not.toMatch(/foreign|opted-out|bad/);
  const merged = normalizeCompanionPages({ pages: { variableTirePressure: page } }, { modules: loadModules() });
  expect(merged.pages.variableTirePressure.rows).toHaveLength(2);
});

test("withholds client state and absent mod", () => {
  const client = SETUP.replace("getIsServer = function() return true end", "getIsServer = function() return false end");
  expect(runCompanionPage(FILE, client, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-vehicle-state-only" });
  expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
});
