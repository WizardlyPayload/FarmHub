"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "AdjustableFillLevelAdvancedCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { FS25_adjustableFillLevelAdvanced = true }
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      { ownerFarmId = 1, uniqueId = "own-good", getFullName = function() return "Owned tanker" end,
        configurations = { adjustableFillLevel = 3 },
        spec_fillUnit = { fillUnits = {
          { _afcOriginalCapacity = 1000, capacity = 2000 },
          { capacity = 200 },
        } } },
      { ownerFarmId = 1, uniqueId = "own-selection", getFullName = function() return "Unobserved trailer" end,
        configurations = { adjustableFillLevel = 2 } },
      { ownerFarmId = 1, uniqueId = "own-stock", configurations = { adjustableFillLevel = 1 } },
      { ownerFarmId = 2, uniqueId = "foreign-secret", configurations = { adjustableFillLevel = 8 },
        spec_fillUnit = { fillUnits = { { _afcOriginalCapacity = 1000, capacity = 10000 } } } },
    } } }
`;

test("keeps owned selection separate from observed eligible fill-unit capacity", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "complete",
    byFarm: { "1": { selectedVehicleCount: 2, observedFillUnitCount: 1 } } });
  expect(page.rows.find((row) => row.vehicleId === "own-good")).toMatchObject({
    fillUnitIndex: 1, selectedMultiplier: 2, originalCapacityLitres: 1000,
    selectedCapacityLitres: 2000, currentCapacityLitres: 2000,
    capacityMatchesSelection: true,
  });
  expect(page.rows.find((row) => row.vehicleId === "own-selection")).toMatchObject({
    selectedMultiplier: 1.5,
  });
  expect(JSON.stringify(page)).not.toMatch(/foreign-secret|own-stock/);
  const merged = normalizeCompanionPages({ pages: { adjustableFillLevelAdvanced: page } }, { modules: loadModules() });
  expect(merged.pages.adjustableFillLevelAdvanced.rows).toHaveLength(2);
});

test("reports mismatched capacity without presenting it as applied", () => {
  const page = runCompanionPage(FILE, GAME.replace("capacity = 2000", "capacity = 1500"), { farmId: 1 });
  expect(page.rows.find((row) => row.vehicleId === "own-good"))
    .toMatchObject({ capacityMatchesSelection: false, currentCapacityLitres: 1500 });
  expect(page.readState).toBe("partial");
});

test("withholds client and invalid configuration state", () => {
  const client = GAME.replace("getIsServer = function() return true end", "getIsServer = function() return false end");
  expect(runCompanionPage(FILE, client, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-vehicle-state-only" });
  const invalid = GAME.replace("adjustableFillLevel = 3", "adjustableFillLevel = 9")
    .replace("adjustableFillLevel = 2", "adjustableFillLevel = 0");
  expect(runCompanionPage(FILE, invalid, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "no-nonstock-owned-selection" });
});

test("recognises the exact vault archive identity", () => {
  const exact = GAME.replace("FS25_adjustableFillLevelAdvanced = true",
    "FS25_367048_FS25_adjustableFillLevelAdvanced = true");
  expect(runCompanionPage(FILE, exact, { farmId: 1 }).byFarm["1"].selectedVehicleCount).toBe(2);
});
