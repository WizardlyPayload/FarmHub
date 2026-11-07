"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "PersonnelManagementCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { KM_79440_Personnel_Management = true }
  _G.g_currentMission = { getIsServer = function() return true end }
  _G.g_helperPersonnelApp = { manager = {
    refreshFarmContext = function() error("must not mutate farm/applicant state") end,
    getOrCreateFarmData = function() error("must not create a farm") end,
    storeCurrentFarmData = function() error("must not write farm state") end,
    farms = {
      [1] = { farmId = 1, employerReputation = 67,
        workers = {
          { id = 3, farmId = 1, firstName = "Ada", lastName = "Mills",
            experience = 55, reliability = 80, loyalty = 72,
            specializationPrimary = "harvest", wage = 2100,
            jobsCompleted = 9, totalWorkMinutes = 360, busy = true },
          { id = 4, farmId = 2, firstName = "Foreign", wage = 9999 },
        },
        applicants = { { id = 10, farmId = 1 }, { id = 11, farmId = 1 } },
      },
      [2] = { farmId = 2, employerReputation = 40,
        workers = { { id = 5, farmId = 2, firstName = "Bob", wage = 900 } },
        applicants = {},
      },
    },
  } }
`;

test("reads only the selected farm's existing personnel and reports withheld foreign rows", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial",
    byFarm: { "1": { employeeCount: 1, applicantCount: 2, employerReputation: 67 } } });
  expect(page.rows).toHaveLength(1);
  expect(page.rows[0]).toMatchObject({ farmId: 1, name: "Ada Mills", experience: 55,
    specialization: "harvest", wage: 2100, jobsCompleted: 9, totalWorkMinutes: 360 });
  const merged = normalizeCompanionPages({ pages: { personnelManagement: page } }, { modules: loadModules() });
  expect(merged.pages.personnelManagement.rows).toHaveLength(1);
});

test("reads the other farm's separate book", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 2 });
  expect(page).toMatchObject({ readState: "ok", byFarm: { "2": { employeeCount: 1, applicantCount: 0 } } });
  expect(page.rows[0].name).toBe("Bob");
});

test("withholds client, absent book, and undetected mod", () => {
  const client = GAME.replace("getIsServer = function() return true end", "getIsServer = function() return false end");
  expect(runCompanionPage(FILE, client, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-roster-only" });
  expect(runCompanionPage(FILE, GAME, { farmId: 3 }))
    .toMatchObject({ readState: "settings-only", reason: "farm-roster-unavailable" });
  expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
});
