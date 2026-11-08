"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "AdjustFuelTankCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { ["KM_80971_adjust-fuel-tank"] = true }
  _G.FillType = { DIESEL = 7, DEF = 8, ELECTRICCHARGE = 9 }
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      { ownerFarmId = 1, uniqueId = "own-tank", getFullName = function() return "Farm tractor" end,
        configurations = { adjustFuelTank = 4, adjustDefTank = 5, adjustElectricTank = 3 },
        spec_fillUnit = { fillUnits = {
          { supportedFillTypes = { [7] = true }, _adjustFuelTankOriginalCapacity = 400, capacity = 500 },
          { supportedFillTypes = { [8] = true }, _adjustFuelTankOriginalCapacityDef = 100, capacity = 150 },
          { supportedFillTypes = { [9] = true }, _adjustFuelTankOriginalCapacityElectric = 200, capacity = 200 },
        } } },
      { ownerFarmId = 1, uniqueId = "own-unobserved", getName = function() return "Other tractor" end,
        configurations = { adjustFuelTank = 6 } },
      { ownerFarmId = 2, uniqueId = "foreign-secret", configurations = { adjustFuelTank = 16 },
        spec_fillUnit = { fillUnits = {
          { supportedFillTypes = { [7] = true }, _adjustFuelTankOriginalCapacity = 1000, capacity = 10000 }
        } } },
    } } }
`;

test("shows selected and observed owned tank capacity separately", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial",
    byFarm: { "1": { selectedVehicleCount: 2, matchingFillUnitCount: 2 } } });
  expect(page.rows).toHaveLength(3);
  expect(page.rows.find((row) => row.kind === "Diesel" && row.vehicleId === "own-tank"))
    .toMatchObject({ selectedPercent: 125, originalCapacityLitres: 400,
      expectedCapacityLitres: 500, currentCapacityLitres: 500,
      capacityMatchesSelection: true });
  expect(page.rows.find((row) => row.kind === "DEF"))
    .toMatchObject({ selectedPercent: 150, expectedCapacityLitres: 150,
      capacityMatchesSelection: true });
  expect(page.rows.find((row) => row.vehicleId === "own-unobserved"))
    .toMatchObject({ selectedPercent: 175 });
  expect(JSON.stringify(page)).not.toMatch(/foreign-secret|Electric/);
  const merged = normalizeCompanionPages({ pages: { adjustFuelTank: page } },
    { modules: loadModules() });
  expect(merged.pages.adjustFuelTank.rows).toHaveLength(3);
});

test("reports a capacity mismatch without claiming the selected effect applied", () => {
  const changed = GAME.replace("capacity = 500", "capacity = 475");
  const page = runCompanionPage(FILE, changed, { farmId: 1 });
  expect(page.rows.find((row) => row.kind === "Diesel" && row.vehicleId === "own-tank"))
    .toMatchObject({ capacityMatchesSelection: false, currentCapacityLitres: 475 });
  expect(page.byFarm["1"].matchingFillUnitCount).toBe(1);
});

test("client, invalid choice and missing mod do not produce tank claims", () => {
  const client = GAME.replace("getIsServer = function() return true end",
    "getIsServer = function() return false end");
  expect(runCompanionPage(FILE, client, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-vehicles-only" });
  const invalid = GAME.replace("adjustFuelTank = 4, adjustDefTank = 5",
    "adjustFuelTank = 20, adjustDefTank = 3")
    .replace("adjustFuelTank = 6", "adjustFuelTank = 3");
  expect(runCompanionPage(FILE, invalid, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "no-nonstock-owned-tank" });
  expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 }))
    .toBeUndefined();
});
