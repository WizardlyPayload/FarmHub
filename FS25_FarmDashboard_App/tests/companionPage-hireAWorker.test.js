"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "HireAWorkerCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { KM_82196_Hire_A_Worker = true }
  _G.g_server = {}
  _G.KM_82196_Hire_A_Worker = { g_hireAWorker = {
    activeJobsByFarmlandId = {
      [36] = { farmId = 1, farmlandId = 36, totalCost = 450,
        currentPhaseIndex = 2, phases = { { operation = "PLOW" }, { operation = "SOW" } },
        saveJobsToSavegame = function() error("must not save") end },
      [40] = { farmId = 2, farmlandId = 40, totalCost = 9999,
        currentPhaseIndex = 1, phases = { { operation = "HARVEST" } } },
    },
    jobHistoryEntries = {
      { farmId = 2, farmlandId = 40, workText = "Secret", cost = 9999 },
      { farmId = 1, farmlandId = 30, farmlandNumber = "30", workText = "Baling", cost = 200, revenue = 25 },
    },
    saveJobsToSavegame = function() error("must not save") end,
    processJobs = function() error("must not process") end,
  } }
`;

test("reads only this farm's active field jobs and recorded history without job actions", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page.readState).toBe("ok");
  expect(page.byFarm["1"]).toMatchObject({ activeFieldJobCount: 1, historyCount: 1 });
  expect(page.activeFieldJobs).toEqual([expect.objectContaining({ farmlandId: 36, phase: "SOW", phaseIndex: 2, startCharge: 450 })]);
  expect(page.history).toEqual([expect.objectContaining({ farmlandId: 30, work: "Baling", cost: 200, revenue: 25 })]);
  const merged = normalizeCompanionPages({ pages: { hireAWorker: page } }, { modules: loadModules() });
  expect(merged.pages.hireAWorker.activeFieldJobs).toHaveLength(1);
});

test("withholds the client register", () => {
  const page = runCompanionPage(FILE, GAME.replace("_G.g_server = {}", "_G.g_server = nil"), { farmId: 1 });
  expect(page).toMatchObject({ readState: "settings-only", reason: "server-only" });
});

test("switching farms exposes only that farm's jobs and history", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 2 });
  expect(page.byFarm["2"]).toMatchObject({ activeFieldJobCount: 1, historyCount: 1 });
  expect(page.activeFieldJobs.map((row) => row.farmlandId)).toEqual([40]);
  expect(page.history.map((row) => row.work)).toEqual(["Secret"]);
});

test("does not use a manager planted in the shared engine environment", () => {
  const page = runCompanionPage(FILE, `
    _G.g_modIsLoaded = { KM_82196_Hire_A_Worker = true }
    _G.g_server = {}
    _G.g_hireAWorker = { activeJobsByFarmlandId = { [99] = { farmId = 1 } }, jobHistoryEntries = {} }
  `, { farmId: 1 });
  expect(page).toMatchObject({ readState: "settings-only", reason: "no-job-register" });
});

test("no loaded mod produces no page", () => {
  expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
});
