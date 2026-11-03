"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "BaleCapacityMultiplierCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_BaleCapacityMultiplier = true }
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      { ownerFarmId = 1, uniqueId = "half", getFullName = function() return "Half-capacity baler" end,
        spec_baler = { fillUnitIndex = 1 }, spec_bcmBaler = { multiplierIndex = 8, baseCaps = { [1] = 4000 } },
        getFillUnitCapacity = function() return 2000 end },
      { ownerFarmId = 1, uniqueId = "double", getFullName = function() return "Double-capacity baler" end,
        spec_baler = { fillUnitIndex = 2 }, spec_bcmBaler = { multiplierIndex = 2, baseCaps = { [2] = 5000 } },
        getFillUnitCapacity = function() return 10000 end },
      { ownerFarmId = 2, uniqueId = "foreign", spec_baler = { fillUnitIndex = 1 },
        spec_bcmBaler = { multiplierIndex = 7, baseCaps = { [1] = 4000 } } },
      { ownerFarmId = 1, uniqueId = "bad-index", spec_baler = { fillUnitIndex = 1 },
        spec_bcmBaler = { multiplierIndex = 9, baseCaps = { [1] = 4000 } } },
    } } }
`;

test("reads owned balers and maps index eight to half capacity", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  if (page?.readState === "failed") throw new Error(JSON.stringify(page));
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { balerCount: 2, modifiedCount: 2 } } });
  expect(page.rows.find((row) => row.vehicleId === "half"))
    .toMatchObject({ multiplierIndex: 8, multiplier: 0.5, baseCapacityLitres: 4000,
      selectedCapacityLitres: 2000, currentFillUnitCapacityLitres: 2000 });
  expect(page.rows.find((row) => row.vehicleId === "double"))
    .toMatchObject({ multiplierIndex: 2, multiplier: 2, selectedCapacityLitres: 10000 });
  expect(JSON.stringify(page)).not.toMatch(/foreign|bad-index/);
  const merged = normalizeCompanionPages({ pages: { baleCapacityMultiplier: page } }, { modules: loadModules() });
  expect(merged.pages.baleCapacityMultiplier.rows).toHaveLength(2);
});

test("withholds client state and absent mod", () => {
  const client = SETUP.replace("getIsServer = function() return true end", "getIsServer = function() return false end");
  expect(runCompanionPage(FILE, client, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-vehicle-state-only" });
  expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
});
