"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "SupplyTransportContractsCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_311954_Supply_Transport_Contracts = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_311954_Supply_Transport_Contracts", version = "1.0.3.0" }
  } end }
  _G.MissionStatus = { CREATED = 1, RUNNING = 3, FINISHED = 4 }
  _G.g_currentMission = { getIsServer = function() return true end }
  _G.g_fillTypeManager = { getFillTypeByIndex = function(_, index)
    return index == 7 and { title = "Wheat" } or nil end }
  local function station(name) return { getName = function() return name end } end
  _G.g_missionManager = { missions = {
    { type = { name = "supplyTransportMission" }, status = 3, farmId = 1,
      uniqueId = "mine", expectedLiters = 20000, depositedLiters = 7500,
      fillTypeIndex = 7, sellingStation = station("Grain mill"), reward = 4000,
      getDetails = function() error("mutating details called") end },
    { type = { name = "supplyTransportMission" }, status = 1, farmId = nil,
      uniqueId = "offer", expectedLiters = 25000, depositedLiters = 0,
      fillTypeIndex = 7, sellingStation = station("Offer point"), reward = 5000 },
    { type = { name = "supplyTransportMission" }, status = 3, farmId = 2,
      uniqueId = "foreign", expectedLiters = 30000, depositedLiters = 10000,
      fillTypeIndex = 7, sellingStation = station("Foreign point"), reward = 6000 },
    { type = { name = "supplyTransportMission" }, status = 4, farmId = 1,
      uniqueId = "finished", expectedLiters = 10000, depositedLiters = 10000,
      fillTypeIndex = 7, sellingStation = station("Finished point"), reward = 3000 },
    { type = { name = "mowMission" }, status = 3, farmId = 1,
      uniqueId = "other", expectedLiters = 50000, depositedLiters = 1000,
      fillTypeIndex = 7, sellingStation = station("Other contract"), reward = 2000 },
  } }
`;

test("reads only accepted running delivery on the exact farm without calling mutating details", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { runningCount: 1 } } });
  expect(page.rows).toEqual([expect.objectContaining({ missionId: "mine",
    destination: "Grain mill", fillType: "Wheat", expectedLitres: 20000,
    deliveredLitres: 7500, remainingLitres: 12500, listedReward: 4000 })]);
  const merged = normalizeCompanionPages({ pages: { supplyTransportContracts: page } },
    { modules: loadModules() });
  expect(merged.pages.supplyTransportContracts.rows).toHaveLength(1);
  expect(JSON.stringify(page)).not.toMatch(/Offer point|Foreign point|Finished point|Other contract/);
});

test("withholds invalid and duplicate missions and does not publish an uncertain total", () => {
  const invalid = SETUP.replace("depositedLiters = 7500", "depositedLiters = 25000");
  const page = runCompanionPage(FILE, invalid, { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(Object.keys(page.rows)).toHaveLength(0);
  expect(page.byFarm["1"]).not.toHaveProperty("runningCount");
  const duplicate = SETUP.replace('uniqueId = "foreign"', 'uniqueId = "mine"')
    .replace("status = 3, farmId = 2", "status = 3, farmId = 1");
  const duplicated = runCompanionPage(FILE, duplicate, { farmId: 1 });
  expect(duplicated).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(Object.keys(duplicated.rows)).toHaveLength(0);
});

test("requires exact reviewed version, farm and server mission state", () => {
  expect(runCompanionPage(FILE, SETUP.replace('version = "1.0.3.0"',
    'version = "1.0.3.1"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE, SETUP.replace("getIsServer = function() return true end",
    "getIsServer = function() return false end"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-mission-state-only" });
  expect(runCompanionPage(FILE, SETUP, { farmId: 0 }))
    .toMatchObject({ readState: "settings-only", reason: "no-farm" });
});
