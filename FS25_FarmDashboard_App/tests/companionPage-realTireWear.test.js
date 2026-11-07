"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "RealTireWearCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { KM_82753_Real_Tire_Wear = true }
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      { ownerFarmId = 1, uniqueId = "my-tractor", getFullName = function() return "My tractor" end,
        spec_tireWear = { enabled = true, wheels = {
          { damaged = false, airLoss = 0, rtwPassport = { id = "RTW-00000001", inner = 0.1, center = 0.2, outer = 0.3,
            km = 100, roadKm = 60, fieldKm = 30, repairs = 1, damaged = false, airLoss = 0 } },
          { damaged = true, airLoss = 0.2, rtwPassport = { id = "RTW-00000002", inner = 0.4, center = 0.4, outer = 0.4,
            km = 200, roadKm = 75, fieldKm = 110, repairs = 0, damaged = false, airLoss = 0 } },
        } } },
      { ownerFarmId = 2, uniqueId = "other-tractor", getFullName = function() return "Other tractor" end,
        spec_tireWear = { enabled = true, wheels = {
          { rtwPassport = { id = "FOREIGN", inner = 0.9, center = 0.9, outer = 0.9,
            km = 900, roadKm = 900, fieldKm = 0, repairs = 4 } },
        } } },
      { ownerFarmId = 1, uniqueId = "stale-owner", getOwnerFarmId = function() return 2 end,
        spec_tireWear = { enabled = true, wheels = {
          { rtwPassport = { id = "STALE", inner = 0.9, center = 0.9, outer = 0.9,
            km = 900, roadKm = 900, fieldKm = 0, repairs = 4 } },
        } } },
    } } }
  _G.RTWInventory = { loaded = true, mission = _G.g_currentMission, farms = {
    [1] = { stock = { { id = "RTW-00000003", size = "600/300/example/1",
      inner = 0.3, center = 0.3, outer = 0.3, km = 350, repairs = 2 } } },
    [2] = { stock = { { id = "FOREIGN-STOCK", inner = 0.9, center = 0.9, outer = 0.9,
      km = 1000, repairs = 5 } } },
  } }
`;

test("reads mounted passports and separate spare stock for exact farm", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete", stockState: "ready" });
  expect(page.byFarm["1"]).toMatchObject({ mountedCount: 2, spareCount: 1 });
  expect(page.mounted).toHaveLength(2);
  expect(page.mounted[0]).toMatchObject({ vehicleId: "my-tractor", passportId: "RTW-00000001",
    wearPct: 20, km: 100, roadKm: 60, fieldKm: 30, repairs: 1 });
  expect(page.mounted[1]).toMatchObject({ wearPct: 40, damaged: true, airLossPct: 20 });
  expect(page.spare).toHaveLength(1);
  expect(page.spare[0]).toMatchObject({ passportId: "RTW-00000003", wearPct: 30, km: 350 });
  expect(JSON.stringify(page)).not.toMatch(/FOREIGN|other-tractor|STALE|stale-owner|1000/);
  const merged = normalizeCompanionPages({ pages: { realTireWear: page } }, { modules: loadModules() });
  expect(merged.pages.realTireWear.mounted).toHaveLength(2);
  expect(merged.pages.realTireWear.spare).toHaveLength(1);
});

test("does not present an unloaded or stale inventory as empty farm stock", () => {
  const missing = SETUP.replace("loaded = true", "loaded = false");
  const page = runCompanionPage(FILE, missing, { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial", stockState: "unavailable" });
  expect(page.byFarm["1"].spareCount).toBeUndefined();
  expect(page.mounted).toHaveLength(2);
  const stale = SETUP.replace("mission = _G.g_currentMission", "mission = {}");
  expect(runCompanionPage(FILE, stale, { farmId: 1 })).toMatchObject({ stockState: "unavailable" });
});

test("withholds client state and absent mod", () => {
  const client = SETUP.replace("getIsServer = function() return true end", "getIsServer = function() return false end");
  expect(runCompanionPage(FILE, client, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-state-only" });
  expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
});
