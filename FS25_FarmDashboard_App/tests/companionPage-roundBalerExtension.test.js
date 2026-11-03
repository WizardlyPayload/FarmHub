"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "RoundBalerExtensionCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_roundBalerExtension = true }
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      { ownerFarmId = 1, uniqueId = "owned-baler", getFullName = function() return "Round baler" end,
        spec_baleWrapper = {}, spec_toggleableBaleWrapper = { currentDropModeState = 3, baleWrapperIsActive = true } },
      { ownerFarmId = 1, uniqueId = "owned-off", getFullName = function() return "Wrapper off" end,
        spec_baleWrapper = {}, spec_toggleableBaleWrapper = { currentDropModeState = 2, baleWrapperIsActive = false } },
      { ownerFarmId = 2, uniqueId = "foreign", spec_baleWrapper = {},
        spec_toggleableBaleWrapper = { currentDropModeState = 1, baleWrapperIsActive = true } },
      { ownerFarmId = 1, uniqueId = "native-only", spec_baleWrapper = {} },
      { ownerFarmId = 1, uniqueId = "invalid", spec_baleWrapper = {},
        spec_toggleableBaleWrapper = { currentDropModeState = 8, baleWrapperIsActive = true } },
      { ownerFarmId = 1, uniqueId = "not-ready", spec_baleWrapper = {},
        spec_toggleableBaleWrapper = { currentDropModeState = 1 } },
    } } }
`;

test("reads only current operating modes of compatible owned wrappers", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { wrapperCount: 2, inactiveCount: 1, collectModeCount: 1 } } });
  expect(page.rows).toHaveLength(2);
  expect(page.rows.find((row) => row.vehicleId === "owned-baler"))
    .toMatchObject({ dropMode: 3, wrapperActive: true });
  expect(page.rows.find((row) => row.vehicleId === "owned-off"))
    .toMatchObject({ dropMode: 2, wrapperActive: false });
  expect(JSON.stringify(page)).not.toMatch(/foreign|native-only|invalid|not-ready|wrappedBaleCount/);
  const merged = normalizeCompanionPages({ pages: { roundBalerExtension: page } }, { modules: loadModules() });
  expect(merged.pages.roundBalerExtension.rows).toHaveLength(2);
});

test("withholds client state and absent mod", () => {
  const client = SETUP.replace("getIsServer = function() return true end", "getIsServer = function() return false end");
  expect(runCompanionPage(FILE, client, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-vehicle-state-only" });
  expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
});
