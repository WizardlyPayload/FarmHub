"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "FarmLimitManagerCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_FarmLimitManager = true }
  _G.g_currentMission = { getIsServer = function() return true end }
  _G.g_farmLimitManager = {
    settingsSynchronized = true,
    settings = { maxAIWorkers = 2, maxHusbandries = 1, maxGreenhouses = 3,
      maxFactories = 1, maxContracts = 4 },
    saveSettings = function() error("must not save") end,
    countOwnedPlaceables = function() error("must not count") end,
  }
`;

test("reads the nondefault server policy as save-wide without claiming farm use", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ scope: "save-wide", readState: "ok", coverage: "complete",
    limits: { maxAIWorkers: 2, maxHusbandries: 1, maxGreenhouses: 3,
      maxFactories: 1, maxContracts: 4 } });
  expect(page.byFarm).toBeUndefined();
  expect(runCompanionPage(FILE, SETUP, { farmId: 2 })).toEqual(page);
  expect(normalizeCompanionPages({ pages: { farmLimitManager: page } }, { modules: loadModules() })
    .pages.farmLimitManager.limits).toMatchObject(page.limits);
});

test("withholds client, pending and invalid settings", () => {
  expect(runCompanionPage(FILE, SETUP.replace("return true end", "return false end")))
    .toMatchObject({ readState: "settings-only", reason: "server-policy-only" });
  expect(runCompanionPage(FILE, SETUP.replace("settingsSynchronized = true", "settingsSynchronized = false")))
    .toMatchObject({ readState: "unavailable", reason: "live-policy-unavailable" });
  expect(runCompanionPage(FILE, SETUP.replace("maxContracts = 4", "maxContracts = 11")))
    .toMatchObject({ readState: "partial", reason: "invalid-limit" });
});

test("marks default policy as settings only", () => {
  const defaults = SETUP.replace("maxAIWorkers = 2", "maxAIWorkers = 1")
    .replace("maxGreenhouses = 3", "maxGreenhouses = 1")
    .replace("maxContracts = 4", "maxContracts = 1");
  expect(runCompanionPage(FILE, defaults)).toMatchObject({
    readState: "settings-only", reason: "default-policy", scope: "save-wide",
  });
});

test("reads the manager from the mod environment when it is not global", () => {
  const namespaced = SETUP.replace("_G.g_farmLimitManager = {",
    "_G.FS25_FarmLimitManager = { g_farmLimitManager = {")
    .replace("  }\n", "  } }\n");
  expect(runCompanionPage(FILE, namespaced)).toMatchObject({
    readState: "ok", limits: { maxAIWorkers: 2, maxContracts: 4 },
  });
});
