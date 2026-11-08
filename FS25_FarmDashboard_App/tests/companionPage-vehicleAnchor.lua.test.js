"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "VehicleAnchorCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { KM_81498_Vehicle_Anchor = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "KM_81498_Vehicle_Anchor", version = "1.0.0.0" }
  } end }
  local specName = "spec_KM_81498_Vehicle_Anchor.vehicleAnchor"
  local function vehicle(id, owner, anchored, applied)
    local v = { uniqueId = id,
      getOwnerFarmId = function() return owner end,
      getFullName = function() return id end,
    }
    v[specName] = { isSupported = true, isAnchored = anchored, isApplied = applied }
    return v
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      vehicle("own-applied", 1, true, true),
      vehicle("own-pending", 1, true, false),
      vehicle("own-unselected", 1, false, false),
      vehicle("foreign", 2, true, true),
    } } }
`;

test("reads only owned supported saved choices and distinct live joint state", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { supportedCount: 3, anchoredCount: 2, appliedCount: 1 } } });
  expect(page.rows).toEqual([
    expect.objectContaining({ vehicleId: "own-applied", applied: true }),
    expect.objectContaining({ vehicleId: "own-pending", applied: false }),
  ]);
  expect(JSON.stringify(page)).not.toContain("foreign");
  const merged = normalizeCompanionPages({ pages: { vehicleAnchor: page } }, { modules: loadModules() });
  expect(merged.pages.vehicleAnchor.rows).toHaveLength(2);
});

test("withholds duplicate and invalid identity or state", () => {
  const duplicate = runCompanionPage(FILE, SETUP.replace('vehicle("own-pending", 1', 'vehicle("own-applied", 1'), { farmId: 1 });
  expect(duplicate).toMatchObject({ readState: "partial" });
  expect(Object.keys(duplicate.rows)).toHaveLength(0);
  const invalid = runCompanionPage(FILE, SETUP.replace('vehicle("own-pending", 1, true, false)', 'vehicle("own-pending", 1, true, nil)'), { farmId: 1 });
  expect(invalid).toMatchObject({ readState: "partial" });
  expect(invalid.rows).toHaveLength(1);
  const longId = runCompanionPage(FILE, SETUP.replace('vehicle("own-pending", 1', 'vehicle(string.rep("x", 81), 1'), { farmId: 1 });
  expect(longId).toMatchObject({ readState: "partial" });
  expect(longId.rows).toHaveLength(1);
});

test("gates unreviewed version and client state", () => {
  expect(runCompanionPage(FILE, SETUP.replace('version = "1.0.0.0"', 'version = "1.0.1.0"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE, SETUP.replace('getIsServer = function() return true end', 'getIsServer = function() return false end'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-vehicle-state-only" });
});
