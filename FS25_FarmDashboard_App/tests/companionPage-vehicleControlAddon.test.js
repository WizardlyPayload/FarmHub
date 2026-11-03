"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "VehicleControlAddonCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_vehicleControlAddon = true }
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      { ownerFarmId = 1, uniqueId = "owned-on", getFullName = function() return "Owned tractor" end,
        spec_vca = { isInitialized = true, snapIsOn = true, snapDistance = 6.2,
          speedLimiter = true, diffManual = false, keepSpeed = 42 } },
      { ownerFarmId = 1, uniqueId = "owned-off", getFullName = function() return "Owned combine" end,
        spec_vca = { isInitialized = true, snapIsOn = false, snapDistance = 0,
          speedLimiter = false, diffManual = true } },
      { ownerFarmId = 2, uniqueId = "foreign", spec_vca = { isInitialized = true,
        snapIsOn = true, snapDistance = 9, speedLimiter = true, diffManual = true } },
      { ownerFarmId = 1, uniqueId = "unready", spec_vca = { isInitialized = false,
        snapIsOn = true, snapDistance = 9, speedLimiter = true, diffManual = true } },
    } } }
`;

test("reads current VCA choices only for ready owned vehicles", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { vehicleCount: 2, guidanceOnCount: 1, speedLimiterOnCount: 1 } } });
  expect(page.rows).toHaveLength(2);
  expect(page.rows.find((row) => row.vehicleId === "owned-on"))
    .toMatchObject({ guidanceOn: true, guidanceSpacingM: 6.2,
      speedLimiterOn: true, manualDifferential: false });
  expect(page.rows.find((row) => row.vehicleId === "owned-off"))
    .toMatchObject({ guidanceOn: false, speedLimiterOn: false, manualDifferential: true });
  expect(JSON.stringify(page)).not.toMatch(/foreign|unready|keepSpeed|guidanceSpacingM":0/);
  const merged = normalizeCompanionPages({ pages: { vehicleControlAddon: page } }, { modules: loadModules() });
  expect(merged.pages.vehicleControlAddon.rows).toHaveLength(2);
});

test("withholds client state and absent mod", () => {
  const client = SETUP.replace("getIsServer = function() return true end", "getIsServer = function() return false end");
  expect(runCompanionPage(FILE, client, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-vehicle-state-only" });
  expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
});
