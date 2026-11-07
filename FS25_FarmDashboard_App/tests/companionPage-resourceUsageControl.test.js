"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "ResourceUsageControlCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { KM_82082_resource_usage_control = true }
  _G.g_currentMission = {
    getIsServer = function() return true end,
    missionInfo = { savegameDirectory = "C:/Users/laura/Documents/My Games/FarmingSimulator2025/savegame20/" },
  }
  _G.KM_82082_resource_usage_control = { ResourceUsageControl = {
    catalogBuilt = true, savegameKey = "savegame20", individualEnabled = true,
    globalMultiplier = 1, seedMultiplier = 1, seedPerCropEnabled = true,
    resourceCategoryEnabled = true,
    cropMultipliers = { WHEAT = 1.5, BARLEY = 1 },
    resourceMultipliers = { FERTILIZER = 0.75, HERBICIDE = 1 },
    applyCurrentSettings = function() error("must not apply policy") end,
    saveSettings = function() error("must not save policy") end,
  } }
`;

test("reads changed live policy for the selected save without assigning it to one farm", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ scope: "save-wide", readState: "ok", coverage: "complete",
    individualMode: true, seedPerCropEnabled: true, resourceCategoryEnabled: true,
    changedOverrideCount: 2 });
  expect(page.cropOverrides).toEqual([{ name: "WHEAT", multiplier: 1.5 }]);
  expect(page.resourceOverrides).toEqual([{ name: "FERTILIZER", multiplier: 0.75 }]);
  expect(page.byFarm).toBeUndefined();
  const otherFarm = runCompanionPage(FILE, SETUP, { farmId: 2 });
  expect(otherFarm).toEqual(page);
  const merged = normalizeCompanionPages({ pages: { resourceUsageControl: page } }, { modules: loadModules() });
  expect(merged.pages.resourceUsageControl.cropOverrides).toHaveLength(1);
});

test("withholds another save slot and client policy", () => {
  expect(runCompanionPage(FILE, SETUP.replace('savegameKey = "savegame20"', 'savegameKey = "savegame19"')))
    .toMatchObject({ readState: "unavailable", reason: "save-slot-mismatch" });
  expect(runCompanionPage(FILE, SETUP.replace("return true end", "return false end")))
    .toMatchObject({ readState: "settings-only", reason: "server-policy-only" });
});

test("default global mode is not a nondefault policy", () => {
  const global = SETUP.replace("individualEnabled = true", "individualEnabled = false")
    .replace("globalMultiplier = 1", "globalMultiplier = 1.3");
  expect(runCompanionPage(FILE, global)).toMatchObject({
    scope: "save-wide", readState: "ok", globalMultiplier: 1.3,
    changedOverrideCount: 0, cropOverrides: {}, resourceOverrides: {},
  });
  expect(runCompanionPage(FILE, global.replace("globalMultiplier = 1.3", "globalMultiplier = 1")))
    .toMatchObject({ readState: "settings-only", reason: "default-policy" });
});
