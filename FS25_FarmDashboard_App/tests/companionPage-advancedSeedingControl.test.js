"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "AdvancedSeedingControlCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_372286_Advanced_Seeding_Control = true }
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      { ownerFarmId = 1, uniqueId = "own-auto", getFullName = function() return "Own seeder" end,
        spec_advancedSeedingControlVehicle = { mode = 1, followUpWidth = 30, trackWidth = 2.3,
          currentLane = 2, fertilizerEnabled = true } },
      { ownerFarmId = 1, uniqueId = "own-off", getFullName = function() return "Off seeder" end,
        spec_advancedSeedingControlVehicle = { mode = 0, followUpWidth = 24, trackWidth = 2.5,
          currentLane = 1, fertilizerEnabled = false } },
      { ownerFarmId = 1, uniqueId = "invalid", spec_advancedSeedingControlVehicle = {
          mode = 1, followUpWidth = 30, trackWidth = 2.3, currentLane = 1 } },
      { ownerFarmId = 2, uniqueId = "foreign", spec_advancedSeedingControlVehicle = {
          mode = 2, followUpWidth = 30, trackWidth = 2.3, currentLane = 1, fertilizerEnabled = true } },
    } } }
`;

test("reads current settings only on owned, complete seeder records", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  if (page?.readState === "failed") throw new Error(JSON.stringify(page));
  expect(page).toMatchObject({ readState: "partial", coverage: "partial",
    byFarm: { "1": { seederCount: 2, modeOnCount: 1 } } });
  expect(page.rows).toHaveLength(2);
  expect(page.rows.find((row) => row.vehicleId === "own-auto"))
    .toMatchObject({ mode: 1, followUpWidth: 30, trackWidth: 2.3,
      currentLane: 2, fertilizerEnabled: true });
  expect(page.rows.find((row) => row.vehicleId === "own-off"))
    .toMatchObject({ mode: 0, fertilizerEnabled: false });
  expect(JSON.stringify(page)).not.toMatch(/foreign|invalid/);
  const merged = normalizeCompanionPages({ pages: { advancedSeedingControl: page } }, { modules: loadModules() });
  expect(merged.pages.advancedSeedingControl.rows).toHaveLength(2);
});

test("withholds client-only and absent-mod readings", () => {
  const client = SETUP.replace("getIsServer = function() return true end", "getIsServer = function() return false end");
  expect(runCompanionPage(FILE, client, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-vehicles-only" });
  expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
});
