"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "CapacityUpgradeCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { ["FS25_373637_Capacity_Upgrade"] = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_373637_Capacity_Upgrade", version = "1.0.0.0" }
  } end }
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      { ownerFarmId = 1, uniqueId = "own-trailer", getFullName = function() return "Farm trailer" end,
        configurations = { cuCapacity = 3 },
        spec_cuUpgrade = { level = 3, stockCapacity = { [1] = 8000 } },
        spec_fillUnit = { fillUnits = { { capacity = 12000, defaultCapacity = 8000 } } } },
      { ownerFarmId = 1, uniqueId = "own-planter", getName = function() return "Farm planter" end,
        configurations = { cuCapacity = 2 },
        spec_cuUpgrade = { level = 2, slowed = { [1] = 1.25 } },
        spec_fillUnit = { fillUnits = { { capacity = 24, defaultCapacity = 24 } } } },
      { ownerFarmId = 2, uniqueId = "foreign-upgrade", getName = function() return "Other farm" end,
        configurations = { cuCapacity = 7 },
        spec_cuUpgrade = { level = 7, stockCapacity = { [1] = 1000 } },
        spec_fillUnit = { fillUnits = { { capacity = 6000 } } } },
    } } }
`;

test("reads only owned physical and slower-use effects without calling either a stock gain", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { vehicleCount: 2, capacityUnitCount: 1, slowedUnitCount: 1 } } });
  expect(page.rows).toEqual(expect.arrayContaining([
    expect.objectContaining({ vehicleId: "own-trailer", effect: "capacity",
      factor: 1.5, stockCapacity: 8000, currentCapacity: 12000 }),
    expect.objectContaining({ vehicleId: "own-planter", effect: "usage-slowed",
      factor: 1.25 }),
  ]));
  expect(JSON.stringify(page)).not.toContain("foreign-upgrade");
  const merged = normalizeCompanionPages({ pages: { capacityUpgrade: page } },
    { modules: loadModules() });
  expect(merged.pages.capacityUpgrade.rows).toHaveLength(2);
});

test("withholds totals when a selected machine's runtime effect is missing", () => {
  const changed = GAME.replace("capacity = 12000", "capacity = 8000");
  const page = runCompanionPage(FILE, changed, { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(page.rows).toHaveLength(1);
  expect(page.byFarm["1"].vehicleCount).toBeUndefined();
  expect(page.byFarm["1"].capacityUnitCount).toBeUndefined();
});

test("does not infer an upgrade from a bad configuration, client or unreviewed version", () => {
  const wrongKey = GAME.replace(/cuCapacity = /g, "capacityUpgrade = ");
  expect(runCompanionPage(FILE, wrongKey, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "no-upgraded-owned-vehicle" });
  const invalid = GAME.replace("cuCapacity = 3", "cuCapacity = 8");
  expect(runCompanionPage(FILE, invalid, { farmId: 1 }))
    .toMatchObject({ readState: "partial", coverage: "partial" });
  const client = GAME.replace("getIsServer = function() return true end",
    "getIsServer = function() return false end");
  expect(runCompanionPage(FILE, client, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-vehicles-only" });
  const newer = GAME.replace('version = "1.0.0.0"', 'version = "9.9.9.9"');
  expect(runCompanionPage(FILE, newer, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
});
