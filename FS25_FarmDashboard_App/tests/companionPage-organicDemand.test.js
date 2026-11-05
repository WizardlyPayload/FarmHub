"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "OrganicDemandCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { FS25_DemandOrientedOrganicApplication = true }
  local live = { ownerFarmId = 1, uniqueId = "own-live", getFullName = function() return "Slurry applicator" end }
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      live,
      { ownerFarmId = 1, uniqueId = "own-saved", getFullName = function() return "Manure applicator" end },
      { ownerFarmId = 1, uniqueId = "own-default" },
      { ownerFarmId = 1, uniqueId = "own-unavailable-crop" },
      { ownerFarmId = 2, uniqueId = "foreign" },
    } } }
  _G.FS25_DemandOrientedOrganicApplication = { PFOrganicCropDemandUnlock = {
    fruitByName = { WHEAT = { name = "WHEAT", index = 1 } },
    deviceSelections = { [live] = { name = "WHEAT", adjustMode = "TARGET_MINUS", adjustValue = 35 } },
    persistedSelectionsByUniqueId = {
      ["own-live"] = { name = "WHEAT", adjustMode = "TARGET_MINUS", adjustValue = 35 },
      ["own-saved"] = { name = nil, adjustMode = "MAX_APPLICATION", adjustValue = 50 },
      ["own-default"] = { name = nil, adjustMode = "NONE", adjustValue = 0 },
      ["own-unavailable-crop"] = { name = "NOT_ON_MAP", adjustMode = "NONE", adjustValue = 0 },
      ["foreign"] = { name = "SECRET", adjustMode = "MAX_APPLICATION", adjustValue = 200 },
      ["sold"] = { name = "BARLEY", adjustMode = "TARGET_MINUS", adjustValue = 100 },
    },
    getSelectionForDevice = function() error("mutating getter must not be called") end,
  } }
`;

test("reads nondefault choices for currently owned applicators only", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "complete",
    byFarm: { "1": { configuredCount: 2, savedOnlyCount: 1 } } });
  expect(page.rows.find((row) => row.vehicleId === "own-live"))
    .toMatchObject({ targetCrop: "WHEAT", adjustMode: "TARGET_MINUS", adjustKgNPerHa: 35, source: "live" });
  expect(page.rows.find((row) => row.vehicleId === "own-saved"))
    .toMatchObject({ adjustMode: "MAX_APPLICATION", adjustKgNPerHa: 50, source: "saved" });
  expect(JSON.stringify(page)).not.toMatch(/SECRET|BARLEY|NOT_ON_MAP|own-default|foreign|sold/);
  const merged = normalizeCompanionPages({ pages: { organicDemand: page } }, { modules: loadModules() });
  expect(merged.pages.organicDemand.rows).toHaveLength(2);
});

test("withholds client state, shadow registers and invalid amounts", () => {
  const client = GAME.replace("getIsServer = function() return true end", "getIsServer = function() return false end");
  expect(runCompanionPage(FILE, client, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-device-state-only" });
  const shadow = GAME.replace('_G.FS25_DemandOrientedOrganicApplication', '_G.shadowOnly');
  expect(runCompanionPage(FILE, shadow, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "no-selection-register" });
  const bad = GAME.replace("adjustValue = 35", "adjustValue = 999");
  const page = runCompanionPage(FILE, bad, { farmId: 1 });
  expect(page.rows.some((row) => row.vehicleId === "own-live")).toBe(false);
});

test("recognises the vault archive's folder-style mod identity", () => {
  const exact = GAME.replace("FS25_DemandOrientedOrganicApplication = true",
    '["FS25_366594_Demand-Oriented_Organic_Application"] = true')
    .replace("_G.FS25_DemandOrientedOrganicApplication =",
      '_G["FS25_366594_Demand-Oriented_Organic_Application"] =');
  const page = runCompanionPage(FILE, exact, { farmId: 1 });
  expect(page.byFarm["1"].configuredCount).toBe(2);
});
