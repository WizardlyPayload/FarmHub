"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "AdvancedVehicleFunctionsCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_AdvancedVehicleFunctions = true }
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      { ownerFarmId = 1, uniqueId = "own-tractor", getFullName = function() return "Owned tractor" end,
        vdcSettings = { ABS = true, ASR = false, ESP = true },
        frcHandbrakeActive = false, frcDrivetrainInitialized = true,
        frcFourWheelDriveActive = true, frcFrontDifferentialLockActive = false,
        frcRearDifferentialLockActive = true },
      { ownerFarmId = 1, uniqueId = "own-combine", getFullName = function() return "Owned combine" end,
        vdcSettings = { ABS = false, ASR = true, ESP = false } },
      { ownerFarmId = 2, uniqueId = "foreign", vdcSettings = { ABS = true, ASR = true, ESP = true } },
      { ownerFarmId = 1, uniqueId = "not-applicable", vdcSettings = nil },
    } } }
`;

test("reads only owned AVF switches and preserves false versus unavailable", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  if (page?.readState === "failed") throw new Error(JSON.stringify(page));
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { vehicleCount: 2, absOnCount: 1, asrOnCount: 1, espOnCount: 1 } } });
  expect(page.rows).toHaveLength(2);
  expect(page.rows.find((row) => row.vehicleId === "own-tractor"))
    .toMatchObject({ absOn: true, asrOn: false, espOn: true, handbrakeOn: false,
      fourWheelDriveOn: true, frontDifferentialLockOn: false, rearDifferentialLockOn: true });
  const combine = page.rows.find((row) => row.vehicleId === "own-combine");
  expect(combine).toMatchObject({ absOn: false, asrOn: true, espOn: false });
  expect(combine).not.toHaveProperty("handbrakeOn");
  expect(combine).not.toHaveProperty("fourWheelDriveOn");
  expect(JSON.stringify(page)).not.toMatch(/foreign|not-applicable/);
  const merged = normalizeCompanionPages({ pages: { advancedVehicleFunctions: page } }, { modules: loadModules() });
  expect(merged.pages.advancedVehicleFunctions.rows).toHaveLength(2);
});

test("withholds client state and absent mod", () => {
  const client = SETUP.replace("getIsServer = function() return true end", "getIsServer = function() return false end");
  expect(runCompanionPage(FILE, client, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-vehicle-state-only" });
  expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
});
