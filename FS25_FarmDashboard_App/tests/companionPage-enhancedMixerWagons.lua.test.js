"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "EnhancedMixerWagonsCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_308285_Enhanced_Mixer_Wagons = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_308285_Enhanced_Mixer_Wagons", version = "1.0.1.0" }
  } end }
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      { ownerFarmId = 1, uniqueId = "owned-progress", getFullName = function() return "Mixer one" end,
        spec_mixerWagon = { requiredMixingTime = 120, currentMixingTime = 60000, fillUnitIndex = 2 },
        getFillUnitFillLevel = function(self, index) return index == 2 and 8500 end },
      { ownerFarmId = 1, uniqueId = "owned-empty", getFullName = function() return "Mixer two" end,
        spec_mixerWagon = { requiredMixingTime = 120, currentMixingTime = 0, fillUnitIndex = 1 },
        getFillUnitFillLevel = function() return 0 end },
      { ownerFarmId = 2, uniqueId = "foreign", spec_mixerWagon = {
        requiredMixingTime = 120, currentMixingTime = 30000, fillUnitIndex = 1 } },
      { ownerFarmId = 1, uniqueId = "disabled", spec_mixerWagon = {
        requiredMixingTime = 0, currentMixingTime = 0, fillUnitIndex = 1 } },
    } } }
`;

test("reads owned mixer milliseconds as seconds and withholds foreign or disabled wagons", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { wagonCount: 2, inProgressCount: 1 } } });
  expect(page.rows.find((row) => row.vehicleId === "owned-progress"))
    .toMatchObject({ elapsedSeconds: 60, requiredSeconds: 120, progressPercent: 50,
      currentFillLitres: 8500 });
  expect(page.rows.find((row) => row.vehicleId === "owned-empty"))
    .toMatchObject({ elapsedSeconds: 0, progressPercent: 0 });
  expect(JSON.stringify(page)).not.toMatch(/foreign|disabled/);
  const merged = normalizeCompanionPages({ pages: { enhancedMixerWagons: page } }, { modules: loadModules() });
  expect(merged.pages.enhancedMixerWagons.rows).toHaveLength(2);
});

test("withholds unreviewed version, client state and absent mod", () => {
  const newer = SETUP.replace('version = "1.0.1.0"', 'version = "1.0.2.0"');
  expect(runCompanionPage(FILE, newer, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  const client = SETUP.replace("getIsServer = function() return true end", "getIsServer = function() return false end");
  expect(runCompanionPage(FILE, client, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-vehicle-state-only" });
  expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
});
