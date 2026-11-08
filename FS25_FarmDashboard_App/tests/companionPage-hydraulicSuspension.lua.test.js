"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "HydraulicSuspensionCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { KM_82643_Hydraulic_Suspension_System = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "KM_82643_Hydraulic_Suspension_System", version = "2.0.0.0" }
  } end }
  local function vehicle(id, owner, kind, mode, offset, enabled)
    return { uniqueId = id, getOwnerFarmId = function() return owner end,
      getFullName = function() return id end,
      spec_hydraulicSuspension = { enabled = enabled, kind = kind,
        mode = mode, manualOffset = offset } }
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      vehicle("tractor-manual", 1, 0, 2, 0.07, true),
      vehicle("loader-locked", 1, 2, 1, 0, true),
      vehicle("truck-auto", 1, 3, 0, nil, true),
      vehicle("disabled", 1, nil, nil, nil, false),
      vehicle("foreign", 2, 0, 2, 0.09, true),
    } } }
`;

test("reads exact-farm current mode and requested offset without foreign state", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { enabledCount: 3, manualCount: 1, lockedCount: 1 } } });
  expect(page.rows).toEqual([
    expect.objectContaining({ vehicleId: "loader-locked", kind: "loader", mode: "locked" }),
    expect.objectContaining({ vehicleId: "tractor-manual", kind: "level", mode: "manual", requestedOffsetCm: 7 }),
    expect.objectContaining({ vehicleId: "truck-auto", kind: "air", mode: "auto" }),
  ]);
  expect(JSON.stringify(page)).not.toMatch(/foreign|disabled/);
  const merged = normalizeCompanionPages({ pages: { hydraulicSuspension: page } },
    { modules: loadModules() });
  expect(merged.pages.hydraulicSuspension.rows).toHaveLength(3);
});

test("withholds duplicate and invalid state and hides uncertain totals", () => {
  const duplicate = runCompanionPage(FILE,
    SETUP.replace('vehicle("loader-locked"', 'vehicle("tractor-manual"'), { farmId: 1 });
  expect(duplicate).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(duplicate.rows).toHaveLength(1);
  expect(duplicate.byFarm["1"]).not.toHaveProperty("enabledCount");
  const invalid = runCompanionPage(FILE,
    SETUP.replace('vehicle("tractor-manual", 1, 0, 2, 0.07',
      'vehicle("tractor-manual", 1, 0, 2, nil'), { farmId: 1 });
  expect(invalid).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(invalid.rows).toHaveLength(2);
  const wrongKindMode = runCompanionPage(FILE,
    SETUP.replace('vehicle("loader-locked", 1, 2, 1',
      'vehicle("loader-locked", 1, 2, 2'), { farmId: 1 });
  expect(wrongKindMode).toMatchObject({ readState: "partial" });
});

test("gates unreviewed version and client state", () => {
  expect(runCompanionPage(FILE, SETUP.replace('version = "2.0.0.0"',
    'version = "2.0.1.0"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE, SETUP.replace('getIsServer = function() return true end',
    'getIsServer = function() return false end'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-vehicle-state-only" });
});
