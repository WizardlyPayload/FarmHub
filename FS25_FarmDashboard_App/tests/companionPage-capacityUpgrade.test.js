"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "CapacityUpgradeCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_CapacityUpgrade = true }
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      { ownerFarmId = 1, uniqueId = "trailer", getFullName = function() return "Owned trailer" end,
        configurations = { capacityUpgrade = 2 },
        spec_cuUpgrade = { level = 2, stockCapacity = { [1] = 1000 } },
        getFillUnitCapacity = function(self, index) return index == 1 and 1250 or 0 end },
      { ownerFarmId = 1, uniqueId = "planter", getFullName = function() return "Owned planter" end,
        configurations = { capacityUpgrade = 4 },
        spec_cuUpgrade = { level = 4, slowed = { [2] = 2 } } },
      { ownerFarmId = 1, uniqueId = "stock", configurations = { capacityUpgrade = 1 },
        spec_cuUpgrade = { level = 1 } },
      { ownerFarmId = 2, uniqueId = "foreign", configurations = { capacityUpgrade = 7 },
        spec_cuUpgrade = { level = 7, stockCapacity = { [1] = 100 } },
        getFillUnitCapacity = function() return 600 end },
      { ownerFarmId = 1, uniqueId = "mismatch", configurations = { capacityUpgrade = 7 },
        spec_cuUpgrade = { level = 2, stockCapacity = { [1] = 100 } },
        getFillUnitCapacity = function() return 600 end },
    } } }
`;

test("reports applied capacity and slower-use effects separately for owned units", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { vehicleCount: 2, capacityUnitCount: 1, slowedUnitCount: 1 } } });
  expect(page.rows).toHaveLength(2);
  expect(page.rows.find((row) => row.vehicleId === "trailer"))
    .toMatchObject({ effect: "capacity", factor: 1.25, stockCapacity: 1000, currentCapacity: 1250 });
  expect(page.rows.find((row) => row.vehicleId === "planter"))
    .toMatchObject({ effect: "usage-slowed", factor: 2, fillUnitIndex: 2 });
  expect(page.rows.map((row) => row.vehicleId)).not.toEqual(expect.arrayContaining(["stock", "foreign", "mismatch"]));
  const merged = normalizeCompanionPages({ pages: { capacityUpgrade: page } }, { modules: loadModules() });
  expect(merged.pages.capacityUpgrade.rows).toHaveLength(2);
});

test("withholds client state and absent mod", () => {
  const client = SETUP.replace("getIsServer = function() return true end", "getIsServer = function() return false end");
  expect(runCompanionPage(FILE, client, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-vehicle-state-only" });
  expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
});
