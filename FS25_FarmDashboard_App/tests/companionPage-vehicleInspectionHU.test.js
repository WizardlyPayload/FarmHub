"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "VehicleInspectionHUCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { FS25_373915_Vehicle_Inspection_HU = true }
  _G.FS25_373915_Vehicle_Inspection_HU = { g_huManager = { initialized = true, records = {
    ["own-valid"] = { farmId = 1, vehicleName = "Tractor", className = "tractor", intervalMonths = 24, remainingMonths = 4 },
    ["own-due"] = { farmId = 1, vehicleName = "Trailer", className = "trailer", intervalMonths = 24, customIntervalMonths = 6, remainingMonths = 0 },
    ["own-overdue"] = { farmId = 1, vehicleName = "Truck", className = "truck", intervalMonths = 12, remainingMonths = -2, decommissioned = true },
    ["foreign"] = { farmId = 2, vehicleName = "Secret", remainingMonths = -4 },
    ["sold"] = { farmId = 1, vehicleName = "Sold", remainingMonths = -4 },
  } } }
  _G.g_currentMission = { getFarmId = function() return 1 end,
    vehicleSystem = { vehicles = {
      { ownerFarmId = 1, uniqueId = "own-valid" },
      { ownerFarmId = 1, uniqueId = "own-due" },
      { ownerFarmId = 1, uniqueId = "own-overdue" },
      { ownerFarmId = 2, uniqueId = "foreign" },
    } } }
`;

test("shows due status only for current owned vehicles and ignores sold or foreign records", () => {
    const page = runCompanionPage(FILE, GAME, { farmId: 1 });
    expect(page.readState).toBe("ok");
    expect(page.byFarm["1"]).toMatchObject({ vehicleCount: 3, dueCount: 1, overdueCount: 1, decommissionedCount: 1 });
    expect(page.rows.map((row) => row.vehicleId)).toEqual(["own-overdue", "own-due", "own-valid"]);
    expect(page.rows[1]).toMatchObject({ customIntervalMonths: 6, remainingMonths: 0 });
    const merged = normalizeCompanionPages({ pages: { vehicleInspectionHU: page } }, { modules: loadModules() });
    expect(merged.pages.vehicleInspectionHU.rows).toHaveLength(3);
});

test("no loaded HU mod produces no page", () => {
    expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
});

test("does not read a shadow register in the shared engine environment", () => {
    const page = runCompanionPage(FILE, `
      _G.g_modIsLoaded = { FS25_373915_Vehicle_Inspection_HU = true }
      _G.g_huManager = { initialized = true, records = { leaked = { farmId = 1, remainingMonths = -1 } } }
    `, { farmId: 1 });
    expect(page).toMatchObject({ readState: "settings-only", reason: "no-inspection-register" });
});
