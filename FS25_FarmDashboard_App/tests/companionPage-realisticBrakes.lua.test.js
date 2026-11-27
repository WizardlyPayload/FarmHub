"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "RealisticBrakesCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_RealisticBrakes = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_RealisticBrakes", version = "1.2.0.0" }
  } end }
  local function vehicle(id, farm, damage, temperature, parked)
    return { uniqueId = id, ownerFarmId = farm,
      getFullName = function() return "Tractor " .. id end,
      spec_realisticBrakes = { brakeDamage = damage,
        brakeTempC = temperature, parkBrakeOn = parked } }
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      vehicle("owned-a", 1, 0.12, 130, true),
      vehicle("owned-b", 1, 0, 20, false),
      vehicle("foreign", 2, 0.5, 230, true),
    } } }
`;

test("exports current farm brake damage, temperature and parking state", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { supportedVehicleCount: 2,
      damagedVehicleCount: 1, parkedVehicleCount: 1 } } });
  expect(page.rows.find((row) => row.vehicleId === "owned-a"))
    .toMatchObject({ brakeDamageFraction: 0.12, brakeTempC: 130,
      parkBrakeOn: true });
  expect(JSON.stringify(page)).not.toMatch(/foreign/);
  const merged = normalizeCompanionPages({ pages: { realisticBrakes: page } },
    { modules: loadModules() });
  expect(merged.pages.realisticBrakes.rows).toHaveLength(2);
});

test("withholds totals for duplicate identity and invalid brake state", () => {
  for (const altered of [
    SETUP.replace('vehicle("owned-b", 1, 0, 20, false)',
      'vehicle("owned-a", 1, 0, 20, false)'),
    SETUP.replace('vehicle("owned-a", 1, 0.12, 130, true)',
      'vehicle("owned-a", 1, 0.8, 130, true)'),
  ]) {
    const page = runCompanionPage(FILE, altered, { farmId: 1 });
    expect(page).toMatchObject({ readState: "partial", coverage: "partial" });
    expect(page.byFarm).toBeUndefined();
  }
});

test("gates unreviewed version and client-only state", () => {
  expect(runCompanionPage(FILE,
    SETUP.replace('version = "1.2.0.0"', 'version = "1.3.0.0"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE,
    SETUP.replace('getIsServer = function() return true end',
      'getIsServer = function() return false end'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-brake-state-only" });
});
