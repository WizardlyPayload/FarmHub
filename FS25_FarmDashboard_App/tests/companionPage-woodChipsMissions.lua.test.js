"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "WoodChipsMissionsCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_351625_Wood_Chips_Missions = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_351625_Wood_Chips_Missions", version = "1.1.0.0" }
  } end }
  _G.MissionStatus = { CREATED = 1, RUNNING = 3, FINISHED = 4 }
  _G.g_currentMission = { getIsServer = function() return true end }
  _G.g_missionManager = { missions = {
    { isWoodChipsMission = true, status = 3, farmId = 1, missionId = 7,
      contractorFarmId = 2, expectedLiters = 20000, depositedLiters = 7500,
      sellingStation = { getName = function() return "Sawmill" end } },
    { isWoodChipsMission = true, status = 1, contractorFarmId = 1,
      expectedLiters = 18000, depositedLiters = 0 },
    { isWoodChipsMission = true, status = 3, farmId = 2,
      expectedLiters = 15000, depositedLiters = 2500 },
    { isWoodChipsMission = true, status = 4, farmId = 1,
      expectedLiters = 10000, depositedLiters = 10000 },
    { status = 3, farmId = 1, expectedLiters = 40000, depositedLiters = 5000 },
  } }
`;

test("shows only accepted running wood-chip delivery for the selected farm", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { runningCount: 1 } } });
  expect(page.rows).toHaveLength(1);
  expect(page.rows[0]).toMatchObject({ missionId: "7", station: "Sawmill",
    expectedLitres: 20000, deliveredLitres: 7500,
    remainingLitres: 12500, progressPercent: 37.5 });
  const merged = normalizeCompanionPages({ pages: { woodChipsMissions: page } }, { modules: loadModules() });
  expect(merged.pages.woodChipsMissions.rows).toHaveLength(1);
});

test("withholds invalid running progress and client or unreviewed state", () => {
  const invalid = SETUP.replace("depositedLiters = 7500", "depositedLiters = 25000");
  expect(runCompanionPage(FILE, invalid, { farmId: 1 }))
    .toMatchObject({ readState: "partial", reason: "invalid-running-mission-progress" });
  const client = SETUP.replace("getIsServer = function() return true end", "getIsServer = function() return false end");
  expect(runCompanionPage(FILE, client, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-mission-state-only" });
  const newer = SETUP.replace('version = "1.1.0.0"', 'version = "1.1.1.0"');
  expect(runCompanionPage(FILE, newer, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
});
