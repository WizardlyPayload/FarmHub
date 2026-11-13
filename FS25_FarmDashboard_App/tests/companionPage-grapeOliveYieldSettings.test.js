"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "GrapeOliveYieldSettingsCollector.lua";
const LIVE = `
  _G.g_modIsLoaded = { FS25_366544_Grape_And_Olive_Yield_Settings = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_366544_Grape_And_Olive_Yield_Settings", version = "1.0.0.0" }
  } end }
  _G.FS25_366544_Grape_And_Olive_Yield_Settings = {
    grapeOliveYield = { isInitialized = true, isPatched = true,
      settings = { grapeMultiplier = 2.5, oliveMultiplier = 1.75 } }
  }
  _G.g_currentMission = { getIsServer = function() return true end }
  _G.g_fruitTypeManager = { getFruitTypeByName = function(self, name)
    if name == "grape" then return { literPerSqm = 1.25 } end
    if name == "olive" then return { literPerSqm = 0.8 } end
  end }
`;

test("exports applied live save-wide settings and current game parameters", () => {
  const page = runCompanionPage(FILE, LIVE, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", scope: "save-wide",
    grapeMultiplier: 2.5, oliveMultiplier: 1.75,
    grapeLitresPerSqm: 1.25, oliveLitresPerSqm: 0.8 });
  const merged = normalizeCompanionPages({ pages: { grapeOliveYieldSettings: page } }, { modules: loadModules() });
  expect(merged.pages.grapeOliveYieldSettings.grapeMultiplier).toBe(2.5);
  expect(JSON.stringify(page)).not.toMatch(/harvest|farmId/);
});

test("does not present an unapplied, client or unreviewed rule as live", () => {
  expect(runCompanionPage(FILE, LIVE.replace("isPatched = true", "isPatched = false"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "rule-not-applied" });
  expect(runCompanionPage(FILE, LIVE.replace("return true end", "return false end"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-rule-only" });
  expect(runCompanionPage(FILE, LIVE.replace("1.0.0.0", "9.9.9.9"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE, LIVE.replace("grapeMultiplier = 2.5", "grapeMultiplier = 12"), { farmId: 1 }))
    .toMatchObject({ readState: "partial", reason: "invalid-multiplier" });
});

test("default multipliers remain settings-only and do not claim changed yield", () => {
  const game = LIVE.replace("grapeMultiplier = 2.5", "grapeMultiplier = 1")
    .replace("oliveMultiplier = 1.75", "oliveMultiplier = 1");
  expect(runCompanionPage(FILE, game, { farmId: 1 })).toMatchObject({
    readState: "settings-only", grapeMultiplier: 1, oliveMultiplier: 1,
  });
});
