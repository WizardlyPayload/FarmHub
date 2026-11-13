"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "ParkingBrakeCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_ParkingBrake = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_ParkingBrake", version = "1.0.1.5" }
  } end }
  local function tractor(id, farm, installed, engaged)
    return { uniqueId = id, ownerFarmId = farm, spec_motorized = {},
      spec_enterable = {}, spec_drivable = {},
      getFullName = function() return "Tractor " .. id end,
      scgParkingBrake = { installed = installed, is = engaged } }
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      tractor("owned-a", 1, true, true),
      tractor("owned-b", 1, false, false),
      tractor("foreign", 2, true, true),
    } } }
`;

test("exports only owned vehicles with current brake state", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { supportedVehicleCount: 2, installedBrakeCount: 1,
      engagedBrakeCount: 1 } } });
  expect(page.rows.find((row) => row.vehicleId === "owned-a"))
    .toMatchObject({ brakeInstalled: true, brakeEngaged: true });
  expect(JSON.stringify(page)).not.toMatch(/foreign/);
  const merged = normalizeCompanionPages({ pages: { parkingBrake: page } },
    { modules: loadModules() });
  expect(merged.pages.parkingBrake.rows).toHaveLength(2);
});

test("withholds totals for contradictory engaged or duplicate vehicle state", () => {
  for (const altered of [
    SETUP.replace('tractor("owned-b", 1, false, false)',
      'tractor("owned-b", 1, false, true)'),
    SETUP.replace('tractor("owned-b", 1, false, false)',
      'tractor("owned-a", 1, false, false)'),
  ]) {
    const page = runCompanionPage(FILE, altered, { farmId: 1 });
    expect(page).toMatchObject({ readState: "partial", coverage: "partial" });
    expect(page.byFarm).toBeUndefined();
  }
});

test("withholds unreviewed version and client state", () => {
  expect(runCompanionPage(FILE,
    SETUP.replace('version = "1.0.1.5"', 'version = "1.0.1.6"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE,
    SETUP.replace('getIsServer = function() return true end',
      'getIsServer = function() return false end'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-brake-state-only" });
});
