"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "NonStopCropCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_NonStopCrop = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_NonStopCrop", version = "1.0.0.0" }
  } end }
  local function machine(id, owner, destId)
    return { uniqueId = id, getOwnerFarmId = function() return owner end,
      getFullName = function() return "Harvester " .. id end,
      nonStopCrop = { enabled = true, destinationType = "silo",
        destinationId = destId } }
  end
  local function target(owner)
    return { getOwnerFarmId = function() return owner end,
      getName = function() return "Farm silo" end }
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      machine("owned", 1, "own-silo"),
      machine("stale", 1, "other-silo"),
      machine("foreign", 2, "own-silo")
    } },
    placeableSystem = { getPlaceableByUniqueId = function(_, id)
      if id == "own-silo" then return target(1) end
      if id == "other-silo" then return target(2) end
      return nil
    end }
  }
`;

test("exports saved routes only for owned source vehicles and resolves same-farm targets", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { sourceCount: 2, enabledCount: 2, ownedTargetCount: 1 } } });
  expect(page.rows).toEqual([
    expect.objectContaining({ vehicleId: "owned", enabled: true,
      destinationType: "silo", destinationStatus: "owned", destination: "Farm silo" }),
    expect.objectContaining({ vehicleId: "stale", destinationStatus: "unavailable" }),
  ]);
  expect(JSON.stringify(page)).not.toContain("other-silo");
  expect(JSON.stringify(page)).not.toContain("foreign");
  const merged = normalizeCompanionPages({ pages: { nonStopCrop: page } },
    { modules: loadModules() });
  expect(merged.pages.nonStopCrop.rows).toHaveLength(2);
});

test("withholds counts on malformed or duplicate source state", () => {
  const bad = runCompanionPage(FILE,
    SETUP.replace('destinationType = "silo"', 'destinationType = "unknown"'), { farmId: 1 });
  expect(bad).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(bad.byFarm["1"]).not.toHaveProperty("sourceCount");
  const duplicate = runCompanionPage(FILE,
    SETUP.replace('machine("stale", 1, "other-silo")',
      'machine("owned", 1, "other-silo")'), { farmId: 1 });
  expect(duplicate).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(Object.keys(duplicate.rows)).toHaveLength(0);
});

test("gates unreviewed version, client and absent mod", () => {
  expect(runCompanionPage(FILE,
    SETUP.replace('version = "1.0.0.0"', 'version = "1.0.0.1"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE,
    SETUP.replace('getIsServer = function() return true end',
      'getIsServer = function() return false end'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-route-state-only" });
  expect(runCompanionPage(FILE, '_G.g_modIsLoaded = {}', { farmId: 1 })).toBeUndefined();
});
