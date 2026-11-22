"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "EmployeesCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { FS25_Employees = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_Employees", version = "2.6.0.0" }
  } end }
  _G.g_currentMission = {
    getFarmId = function() return 1 end,
    getIsServer = function() return true end,
  }
  _G.FS25_Employees = { Employees = {
    enabled = true, isServer = true,
    contracts = { { name = "Part time", temporary = false }, { name = "Temp", temporary = true } },
    staff = {
      { id = 7, farmId = 1, name = "Alice", role = "fieldwork", contract = 1,
        salary = 1600, hours = 12, limit = 80, totalWorkedHours = 40,
        activeTraining = "machinery", trainingRemaining = 3 },
      { id = 8, farmId = 2, name = "Bob", role = "transport", contract = 2,
        salary = 120, hours = 2, limit = 8, illnessKey = "flu", illnessRemaining = 6 },
      { id = 9, name = "Ownerless", role = "animals", contract = 1, salary = 900 },
    },
    getSortedStaff = function() error("must not mutate development") end,
    ensureDevelopment = function() error("must not mutate development") end,
    updateEmployeeStatistics = function() error("must not update statistics") end,
  } }
`;

test("reads only selected farm's saved staff terms without mutating Employees", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { employeeCount: 1 } } });
  expect(page.rows).toHaveLength(1);
  expect(page.rows[0]).toMatchObject({ farmId: 1, id: 7, name: "Alice",
    role: "fieldwork", contract: "Part time", temporary: false,
    salary: 1600, workedHours: 12, periodHours: 80,
    training: "machinery", trainingHoursRemaining: 3 });
  expect(page.rows[0].fixedVehicleId).toBeUndefined();
  const merged = normalizeCompanionPages({ pages: { employees: page } }, { modules: loadModules() });
  expect(merged.pages.employees.rows).toHaveLength(1);
});

test("other farm receives its own temporary staff only", () => {
  const game = GAME.replace("getFarmId = function() return 1 end", "getFarmId = function() return 2 end");
  const page = runCompanionPage(FILE, game, { farmId: 2 });
  expect(page).toMatchObject({ byFarm: { "2": { employeeCount: 1 } } });
  expect(page.rows).toHaveLength(1);
  expect(page.rows[0]).toMatchObject({ name: "Bob", temporary: true, illness: "flu",
    illnessHoursRemaining: 6 });
});

test("withholds client, missing manager and absent mod", () => {
  const client = GAME.replace("getIsServer = function() return true end", "getIsServer = function() return false end");
  expect(runCompanionPage(FILE, client, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-roster-only" });
  const missing = GAME.replace("_G.FS25_Employees = { Employees = {", "_G.FS25_Employees = { Missing = {");
  expect(runCompanionPage(FILE, missing, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "staff-manager-unavailable" });
  expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
});

test("withholds an unreviewed or unavailable Employees version", () => {
  const later = GAME.replace('version = "2.6.0.0"', 'version = "2.7.0.0"');
  expect(runCompanionPage(FILE, later, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  const unavailable = GAME.replace(/_G\.g_modManager = \{ getActiveMods = function\(\) return \{[\s\S]*?\} end \}\n/, "");
  expect(runCompanionPage(FILE, unavailable, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
});

test("caps a large owned roster and reports incomplete coverage", () => {
  const game = `${GAME}
  _G.FS25_Employees.Employees.staff = {}
  for i = 1, 25 do
    _G.FS25_Employees.Employees.staff[i] = { id = i, farmId = 1, name = "Worker" .. i, contract = 1 }
  end
  `;
  const page = runCompanionPage(FILE, game, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "truncated",
    byFarm: { "1": { employeeCount: 25 } } });
  expect(page.rows).toHaveLength(20);
});
