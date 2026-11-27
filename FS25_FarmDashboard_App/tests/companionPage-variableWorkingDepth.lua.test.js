"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "VariableWorkingDepthCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_VariableWorkingDepth = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_VariableWorkingDepth", version = "1.0.0.0" }
  } end }
  local function vehicle(id, farm, mode, setpoint, enabled, calibrated)
    local v = { uniqueId = id, ownerFarmId = farm,
      getFullName = function() return "Cultivator " .. id end }
    v["spec_FS25_VariableWorkingDepth.variableWorkingDepth"] = {
      controlMode = mode, depthSetpoint = setpoint, enabled = enabled,
      isCalibrated = calibrated,
      nodeHeightNominal = calibrated and 0.24 or nil,
    }
    return v
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      vehicle("owned-wheels", 1, 1, 0.75, true, true),
      vehicle("owned-hitch", 1, 2, 0.25, false, false),
      vehicle("inert", 1, 0, 0.50, true, false),
      vehicle("foreign", 2, 1, 0.60, true, true),
    } } }
`;

test("reports supported owned implement controls, including disabled state", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { implementCount: 2, enabledCount: 1 } } });
  expect(page.rows).toHaveLength(2);
  expect(page.rows.find((row) => row.vehicleId === "owned-wheels"))
    .toMatchObject({ controlMode: "WHEELS", setpointPercent: 75,
      enabled: true, calibrated: true });
  expect(page.rows.find((row) => row.vehicleId === "owned-hitch"))
    .toMatchObject({ controlMode: "HITCH", setpointPercent: 25,
      enabled: false, calibrated: false });
  expect(JSON.stringify(page)).not.toMatch(/foreign|inert/);
  const merged = normalizeCompanionPages({ pages: { variableWorkingDepth: page } },
    { modules: loadModules() });
  expect(merged.pages.variableWorkingDepth.rows).toHaveLength(2);
});

test("withholds totals for malformed setpoint, unknown mode or duplicate identity", () => {
  for (const altered of [
    SETUP.replace('0.75, true, true', '1.75, true, true'),
    SETUP.replace('"inert", 1, 0', '"inert", 1, 9'),
    SETUP.replace('"owned-hitch", 1, 2', '"owned-wheels", 1, 2'),
  ]) {
    const page = runCompanionPage(FILE, altered, { farmId: 1 });
    expect(page).toMatchObject({ readState: "partial", coverage: "partial" });
    expect(page.byFarm).toBeUndefined();
  }
});

test("gates unreviewed version and client state", () => {
  expect(runCompanionPage(FILE,
    SETUP.replace('version = "1.0.0.0"', 'version = "1.0.1.0"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE,
    SETUP.replace("getIsServer = function() return true end",
      "getIsServer = function() return false end"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-implement-state-only" });
});
