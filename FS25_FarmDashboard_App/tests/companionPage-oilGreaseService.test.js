"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "OilGreaseServiceCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { FS25_358863_Oil_And_Grease_Service = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_358863_Oil_And_Grease_Service", version = "1.1.0.0" }
  } end }
  local own = { ownerFarmId = 1, uniqueId = "oil-1", getFullName = function() return "John Deere 6R" end }
  local other = { ownerFarmId = 2, uniqueId = "oil-2", getName = function() return "Other farm" end }
  _G.g_currentMission = { isMissionStarted = true, getIsServer = function() return true end,
    vehicleSystem = { vehicles = { own, other } } }
  _G.FS25_358863_Oil_And_Grease_Service = {
    VehicleOil = { stateByVehicle = { [own] = { enabled = true, level = 25, capacity = 100 },
      [other] = { enabled = true, level = 1, capacity = 100 } } },
    VehicleGrease = { stateByVehicle = { [own] = { enabled = true, level = 80, capacity = 80 },
      [other] = { enabled = true, level = 1, capacity = 100 } } },
  }
`;

test("shows actionable oil deficit on exactly owned vehicles without creating state", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { monitoredVehicles: 1, serviceNeeded: 1 } } });
  expect(page.rows).toHaveLength(1);
  expect(page.rows[0]).toMatchObject({ vehicleId: "oil-1", vehicle: "John Deere 6R",
    oil: { levelLitres: 25, capacityLitres: 100, percent: 25, serviceNeeded: true },
    grease: { levelLitres: 80, capacityLitres: 80, percent: 100, serviceNeeded: false } });
  expect(JSON.stringify(page)).not.toMatch(/Other farm|oil-2/);
  const merged = normalizeCompanionPages({ pages: { oilGreaseService: page } }, { modules: loadModules() });
  expect(merged.pages.oilGreaseService.rows).toHaveLength(1);
});

test("withholds totals when a live reservoir is missing or malformed", () => {
  const missing = GAME.replace("[own] = { enabled = true, level = 80, capacity = 80 },", "");
  expect(runCompanionPage(FILE, missing, { farmId: 1 })).toMatchObject({
    readState: "partial", coverage: "partial", byFarm: { "1": {} },
  });
  const invalid = GAME.replace("level = 25, capacity = 100", "level = 125, capacity = 100");
  expect(runCompanionPage(FILE, invalid, { farmId: 1 })).toMatchObject({
    readState: "partial", coverage: "partial", byFarm: { "1": {} },
  });
});

test("does not read unreviewed or client-side state", () => {
  expect(runCompanionPage(FILE, GAME.replace('version = "1.1.0.0"', 'version = "9.0.0.0"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE, GAME.replace("getIsServer = function() return true end", "getIsServer = function() return false end"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-state-only" });
});
