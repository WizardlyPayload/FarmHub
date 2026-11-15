"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "WhiteysFarmStaffCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { FS25_WhiteysFarmStaff_5_2_3 = true }
  _G.g_currentMission = {
    missionDynamicInfo = { isMultiplayer = false },
    getFarmId = function() return 1 end,
    getIsServer = function() return true end,
  }
  _G.g_inGameMenu = { pageWhiteysFarmStaff = { manager = {
    reputationPoints = 42, unpaidWages = 225, lateWageDays = 1,
    employees = {
      { name = "Emily", skill = 4, experience = 30, morale = 91,
        assignedJob = "none", busy = false, absenceType = "none",
        pendingCourse = "none", licences = { fieldwork = true, harvest = true } },
      { name = "Oliver", skill = 2, experience = 8, morale = 76,
        assignedJob = "fieldwork", busy = true, absenceType = "none",
        pendingCourse = "none", licences = { fieldwork = true } },
    },
    isEmployeeAvailable = function(_, employee) return not employee.busy end,
    countLicences = function(_, employee)
      local n = 0
      for _, allowed in pairs(employee.licences) do if allowed then n = n + 1 end end
      return n
    end,
    changeMoney = function() error("must not change wages") end,
    saveData = function() error("must not save staff") end,
  } } }
`;

test("reads one single-player farm's saved staff and unpaid wages without changing them", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete", scope: "singleplayer-farm-one",
    byFarm: { "1": { employeeCount: 2, availableCount: 1,
      reputationPoints: 42, unpaidWages: 225, lateWageDays: 1 } } });
  expect(page.rows).toHaveLength(2);
  expect(page.rows[0]).toMatchObject({ farmId: 1, name: "Emily", skill: 4,
    morale: 91, available: true, licenceCount: 2 });
  expect(page.rows[1]).toMatchObject({ farmId: 1, name: "Oliver", busy: true,
    available: false, assignedJob: "fieldwork", licenceCount: 1 });
  const merged = normalizeCompanionPages({ pages: { whiteysFarmStaff: page } }, { modules: loadModules() });
  expect(merged.pages.whiteysFarmStaff.rows).toHaveLength(2);
});

test("detects the later 5_2_4 archive name with the same live roster schema", () => {
  const laterArchive = GAME.replace("FS25_WhiteysFarmStaff_5_2_3", "FS25_WhiteysFarmStaff_5_2_4");
  const page = runCompanionPage(FILE, laterArchive, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { employeeCount: 2, unpaidWages: 225 } } });
  expect(page.rows.map((row) => row.name)).toEqual(["Emily", "Oliver"]);
});

test("withholds multiplayer and mismatched export farm", () => {
  const multiplayer = GAME.replace("isMultiplayer = false", "isMultiplayer = true");
  expect(runCompanionPage(FILE, multiplayer, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "singleplayer-farm-one-only" });
  const changedFarm = GAME.replace("getFarmId = function() return 1 end", "getFarmId = function() return 2 end");
  expect(runCompanionPage(FILE, changedFarm, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "singleplayer-farm-one-only" });
});

test("withholds when the mod's Esc page did not register", () => {
  const noPage = GAME.replace("_G.g_inGameMenu = { pageWhiteysFarmStaff", "_G.g_inGameMenu = { absentPage");
  expect(runCompanionPage(FILE, noPage, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "staff-menu-manager-unavailable" });
});

test("does not export staff if the exact mod is absent", () => {
  expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
});
