"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "TUVSystemCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { KM_81230_T_V_HU_System = true }
  _G.g_currentMission = { getFarmId = function() return 1 end,
    environment = { currentMonotonicDay = 100, currentDay = 5 },
    vehicleSystem = { vehicles = {
      { ownerFarmId = 1, uniqueId = "initial", getFullName = function() return "New Tractor" end,
        __tuvSystemData = { result = 1, inspectionCount = 0, validUntilDay = 820, lastInspectionDay = 100, lastCost = 0 } },
      { ownerFarmId = 1, uniqueId = "minor", getFullName = function() return "Old Tractor" end,
        __tuvSystemData = { result = 2, inspectionCount = 2, validUntilDay = 106, lastInspectionDay = 92, lastCost = 250 } },
      { ownerFarmId = 1, uniqueId = "unsafe", getFullName = function() return "Truck" end,
        __tuvSystemData = { result = 4, inspectionCount = 1, validUntilDay = 99, lastInspectionDay = 98, lastCost = 500 } },
      { ownerFarmId = 2, uniqueId = "foreign", __tuvSystemData = { result = 4, inspectionCount = 9, validUntilDay = 1 } },
      { ownerFarmId = 1, uniqueId = "unrelated" },
    } } }
`;

test("keeps TUV validity separate from completed inspections and excludes other farms", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete" });
  expect(page.byFarm["1"]).toMatchObject({ vehicleCount: 3, inspectedCount: 2, expiredCount: 1, failedCount: 1 });
  expect(page.rows.map((row) => row.vehicleId)).toEqual(["unsafe", "minor", "initial"]);
  expect(page.rows[0]).toMatchObject({ result: 4, inspectionCount: 1, daysRemaining: -1, lastCost: 500 });
  expect(page.rows[2]).toMatchObject({ result: 1, inspectionCount: 0, daysRemaining: 720 });
  expect(page.rows[2]).not.toHaveProperty("lastCost");
  expect(page.rows.some((row) => row.vehicleId === "foreign")).toBe(false);
  const merged = normalizeCompanionPages({ pages: { tuvSystem: page } }, { modules: loadModules() });
  expect(merged.pages.tuvSystem.rows).toHaveLength(3);
});

test("an unloaded TUV mod cannot expose vehicle state", () => {
  expect(runCompanionPage(FILE, GAME.replace("KM_81230_T_V_HU_System = true", "OtherMod = true"), { farmId: 1 })).toBeUndefined();
});

test("a TUV vehicle with unreadable state is partial, not a false result", () => {
  const setup = GAME.replace("result = 2, inspectionCount = 2", "result = 9, inspectionCount = 2");
  const page = runCompanionPage(FILE, setup, { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(page.byFarm["1"]).toMatchObject({ vehicleCount: 2, inspectedCount: 1 });
});
