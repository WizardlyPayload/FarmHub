"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "MajorServiceCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_318291_Major_Service = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_318291_Major_Service", version = "1.0.0.0" }
  } end }
  local function machine(id, owner, current, last)
    return { uniqueId = id, getOwnerFarmId = function() return owner end,
      getFullName = function() return id end, operatingTime = current,
      spec_MajorService = { lastServiceAt = last } }
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      machine("serviced", 1, 36000000, 14400000),
      machine("never", 1, 18000000, 0),
      machine("foreign", 2, 36000000, 18000000),
    } } }
`;

test("reports exact-farm service time without inventing a service for zero timestamp", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { vehicleCount: 2, recordedCount: 1 } } });
  expect(page.rows).toEqual([
    expect.objectContaining({ vehicleId: "never", operatingHours: 5, serviceRecorded: false }),
    expect.objectContaining({ vehicleId: "serviced", operatingHours: 10,
      lastServiceHours: 4, sinceServiceHours: 6, serviceRecorded: true }),
  ]);
  expect(page.rows[0]).not.toHaveProperty("lastServiceHours");
  expect(JSON.stringify(page)).not.toContain("foreign");
  const merged = normalizeCompanionPages({ pages: { majorService: page } }, { modules: loadModules() });
  expect(merged.pages.majorService.rows).toHaveLength(2);
});

test("withholds totals for duplicate IDs or impossible service time", () => {
  const duplicate = runCompanionPage(FILE,
    SETUP.replace('machine("never", 1, 18000000, 0)', 'machine("serviced", 1, 18000000, 0)'),
    { farmId: 1 });
  expect(duplicate).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(duplicate.byFarm["1"]).not.toHaveProperty("vehicleCount");
  const invalid = runCompanionPage(FILE,
    SETUP.replace('machine("never", 1, 18000000, 0)', 'machine("never", 1, 18000000, 20000000)'),
    { farmId: 1 });
  expect(invalid).toMatchObject({ readState: "partial", reason: "invalid-vehicle-state" });
  expect(invalid.rows.map((row) => row.vehicleId)).toEqual(["serviced"]);
});

test("gates unreviewed version, client state and absent mod", () => {
  expect(runCompanionPage(FILE, SETUP.replace('version = "1.0.0.0"', 'version = "1.0.0.1"'),
    { farmId: 1 })).toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE, SETUP.replace('getIsServer = function() return true end',
    'getIsServer = function() return false end'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-vehicle-state-only" });
  expect(runCompanionPage(FILE, '_G.g_modIsLoaded = {}', { farmId: 1 })).toBeUndefined();
});
