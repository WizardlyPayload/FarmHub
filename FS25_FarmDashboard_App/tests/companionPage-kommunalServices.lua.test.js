"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "KommunalServicesCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_KommunalServices = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_KommunalServices", version = "1.1.0.0" }
  } end }
  _G.MissionStatus = { RUNNING = 2, STOPPED = 3 }
  local function mission(id, farm, status, kind)
    return { uniqueId = id, farmId = farm, status = status,
      getMissionTypeName = function() return kind end,
      area_tot = 650, area_trimmed = 175 }
  end
  _G.g_missionManager = { missions = {
    mission("accepted", 1, 2, "kommunalMission"),
    mission("other-farm", 2, 2, "kommunalMission"),
    mission("offer", 1, 3, "kommunalMission"),
    mission("other-type", 1, 2, "harvestMission")
  } }
  _G.g_currentMission = { getIsServer = function() return true end }
`;

test("exports accepted running farm mission area progress, not offers or foreign jobs", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { runningCount: 1 } } });
  expect(page.rows).toEqual([{ farmId: 1, missionId: "accepted",
    targetSquareMeters: 650, trimmedSquareMeters: 175,
    remainingSquareMeters: 475, progressPercent: 26.92 }]);
  expect(JSON.stringify(page)).not.toContain("other-farm");
  expect(JSON.stringify(page)).not.toContain("offer");
  const merged = normalizeCompanionPages({ pages: { kommunalServices: page } },
    { modules: loadModules() });
  expect(merged.pages.kommunalServices.rows).toHaveLength(1);
});

test("caps overrun progress and withholds counts on invalid or duplicate mission", () => {
  const overrun = runCompanionPage(FILE,
    SETUP.replace("area_trimmed = 175", "area_trimmed = 700"), { farmId: 1 });
  expect(overrun.rows[0]).toMatchObject({ trimmedSquareMeters: 700,
    remainingSquareMeters: 0, progressPercent: 100 });
  const numericId = runCompanionPage(FILE,
    SETUP.replace('mission("accepted", 1, 2, "kommunalMission")',
      'mission(42, 1, 2, "kommunalMission")'), { farmId: 1 });
  expect(numericId.rows[0].missionId).toBe("42");
  const bad = runCompanionPage(FILE,
    SETUP.replace("area_tot = 650", "area_tot = 0"), { farmId: 1 });
  expect(bad).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(bad.byFarm["1"]).not.toHaveProperty("runningCount");
  const duplicate = runCompanionPage(FILE,
    SETUP.replace('mission("other-farm", 2, 2, "kommunalMission")',
      'mission("accepted", 1, 2, "kommunalMission")'), { farmId: 1 });
  expect(duplicate).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(Object.keys(duplicate.rows)).toHaveLength(0);
});

test("gates unreviewed version, client and absent mod", () => {
  expect(runCompanionPage(FILE,
    SETUP.replace('version = "1.1.0.0"', 'version = "1.1.0.1"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE,
    SETUP.replace('getIsServer = function() return true end',
      'getIsServer = function() return false end'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-mission-state-only" });
  expect(runCompanionPage(FILE, '_G.g_modIsLoaded = {}', { farmId: 1 })).toBeUndefined();
});
