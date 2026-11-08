"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "RealDieselStartCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_RealDieselStart = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_RealDieselStart", version = "1.3.0.0" }
  } end }
  local function vehicle(id, owner, electric, air, heat, pressure)
    return { uniqueId = id, getOwnerFarmId = function() return owner end,
      getFullName = function() return id end,
      spec_realDieselStart = { isElectric = electric, hasAirSystem = air,
        engineHeat = heat, airPressure = pressure } }
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      vehicle("truck", 1, false, true, 0.25, 6.75),
      vehicle("tractor", 1, false, false, 0.6, 4),
      vehicle("electric", 1, true, false, 0, 4),
      vehicle("foreign", 2, false, true, 0.5, 7),
    } } }
`;

test("reads owned model heat and truck air while excluding foreign/electric vehicles", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { vehicleCount: 2, airSystemCount: 1 } } });
  expect(page.rows).toEqual([
    expect.objectContaining({ vehicleId: "tractor", residualHeatPercent: 60 }),
    expect.objectContaining({ vehicleId: "truck", residualHeatPercent: 25, airPressureBar: 6.75 }),
  ]);
  expect(JSON.stringify(page)).not.toMatch(/foreign|electric/);
  const merged = normalizeCompanionPages({ pages: { realDieselStart: page } },
    { modules: loadModules() });
  expect(merged.pages.realDieselStart.rows).toHaveLength(2);
});

test("withholds ambiguous IDs or out-of-range pressure and totals", () => {
  const duplicate = runCompanionPage(FILE,
    SETUP.replace('vehicle("tractor"', 'vehicle("truck"'), { farmId: 1 });
  expect(duplicate).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(duplicate.byFarm["1"]).not.toHaveProperty("vehicleCount");
  const badAir = runCompanionPage(FILE,
    SETUP.replace('false, true, 0.25, 6.75', 'false, true, 0.25, 11'), { farmId: 1 });
  expect(badAir).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(badAir.rows).toHaveLength(1);
  const badHeat = runCompanionPage(FILE,
    SETUP.replace('false, false, 0.6, 4', 'false, false, -0.2, 4'), { farmId: 1 });
  expect(badHeat).toMatchObject({ readState: "partial", coverage: "partial" });
});

test("gates unreviewed version and client state", () => {
  expect(runCompanionPage(FILE, SETUP.replace('version = "1.3.0.0"',
    'version = "1.3.0.1"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE, SETUP.replace('getIsServer = function() return true end',
    'getIsServer = function() return false end'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-vehicle-state-only" });
});
