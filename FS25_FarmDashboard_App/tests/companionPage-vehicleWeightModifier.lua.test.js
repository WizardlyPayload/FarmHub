"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");

const FILE = "VehicleWeightModifierCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_357616_Vehicle_Weight_Modifier = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_357616_Vehicle_Weight_Modifier", version = "1.0.0.1" }
  } end }
  _G.g_currentMission = {
    getFarmId = function() return 1 end,
    getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      { ownerFarmId = 1, uniqueId = "owned-1", configFileName = "owned.xml",
        getOwnerFarmId = function() return 1 end, getFullName = function() return "MF 8570" end },
      { ownerFarmId = 1, uniqueId = "sold-1", configFileName = "sold.xml",
        getOwnerFarmId = function() return 2 end },
      { ownerFarmId = 2, uniqueId = "foreign-1", configFileName = "foreign.xml",
        getOwnerFarmId = function() return 2 end },
      { ownerFarmId = 1, configFileName = "fallback.xml", id = 222,
        getOwnerFarmId = function() return 1 end },
    } },
  }
  _G.FS25_357616_Vehicle_Weight_Modifier = {
    VehicleWeightModifierVehicleSettings = { data = {
      ["owned-1"] = { id = "owned-1", weightFactor = 1.5, brakeFactor = 1.2, engineFactor = 0.9 },
      ["sold-1"] = { id = "sold-1", weightFactor = 9, brakeFactor = 3, engineFactor = 3 },
      ["foreign-1"] = { id = "foreign-1", weightFactor = 10, brakeFactor = 3, engineFactor = 3 },
      ["fallback.xml|1|222"] = { id = "fallback.xml|1|222", weightFactor = 7, brakeFactor = 3, engineFactor = 3 },
    } },
  }
`;

test("reads only saved factors joined to a currently owned stable vehicle ID", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete" });
  expect(page.byFarm["1"]).toEqual({ vehicleCount: 1 });
  expect(page.rows).toMatchObject([
    { farmId: 1, vehicleId: "owned-1", vehicle: "MF 8570",
      weightFactor: 1.5, brakeFactor: 1.2, engineFactor: 0.9 },
  ]);
  expect(JSON.stringify(page)).not.toMatch(/sold-1|foreign-1|fallback.xml/);
});

test("withholds invalid factors and client-only registers", () => {
  const invalid = runCompanionPage(FILE, SETUP.replace("weightFactor = 1.5", "weightFactor = 11"), { farmId: 1 });
  expect(invalid).toMatchObject({ readState: "partial", reason: "invalid-factor" });
  expect(invalid.rows).toBeUndefined();
  const client = runCompanionPage(FILE, SETUP.replace("getIsServer = function() return true", "getIsServer = function() return false"), { farmId: 1 });
  expect(client).toMatchObject({ readState: "settings-only", reason: "server-settings-only" });
});
