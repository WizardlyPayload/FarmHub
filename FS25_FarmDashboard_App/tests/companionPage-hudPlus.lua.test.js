"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "HUDPlusCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { KM_81497_HUD_ = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "KM_81497_HUD_", version = "1.0.0.0" }
  } end }
  local key = "spec_KM_81497_HUD_.hudPlus"
  local function vehicle(id, farm, total, trip, fuel)
    return { uniqueId = id, ownerFarmId = farm,
      getFullName = function() return "Tractor " .. id end,
      [key] = { totalDistanceMeters = total,
        sessionDistanceMeters = trip, sessionFuelUsedLiters = fuel } }
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      vehicle("owned-a", 1, 72110, 12110, 6.25),
      vehicle("owned-b", 1, 0, 0, 0),
      vehicle("foreign", 2, 90000, 20000, 20),
    } } }
`;

test("exports mod trip counters for current farm only with source units", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { supportedVehicleCount: 2, nonzeroTripCount: 1 } } });
  expect(page.rows.find((row) => row.vehicleId === "owned-a"))
    .toMatchObject({ totalDistanceMeters: 72110, tripDistanceMeters: 12110,
      tripFuelUsedLiters: 6.25 });
  expect(JSON.stringify(page)).not.toMatch(/foreign/);
  const merged = normalizeCompanionPages({ pages: { hudPlus: page } },
    { modules: loadModules() });
  expect(merged.pages.hudPlus.rows).toHaveLength(2);
});

test("withholds totals for duplicate identity and impossible counters", () => {
  for (const altered of [
    SETUP.replace('vehicle("owned-b", 1, 0, 0, 0)',
      'vehicle("owned-a", 1, 0, 0, 0)'),
    SETUP.replace('vehicle("owned-a", 1, 72110, 12110, 6.25)',
      'vehicle("owned-a", 1, 72110, 80000, 6.25)'),
  ]) {
    const page = runCompanionPage(FILE, altered, { farmId: 1 });
    expect(page).toMatchObject({ readState: "partial", coverage: "partial" });
    expect(page.byFarm).toBeUndefined();
  }
});

test("gates unreviewed version and client-only readings", () => {
  expect(runCompanionPage(FILE,
    SETUP.replace('version = "1.0.0.0"', 'version = "1.0.1.0"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE,
    SETUP.replace('getIsServer = function() return true end',
      'getIsServer = function() return false end'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-trip-state-only" });
});
