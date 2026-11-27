"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");

const FILE = "FlockCameraCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { KM_82460_Flock_Camera = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "KM_82460_Flock_Camera", version = "1.0.0.0" }
  } end }
  _G.g_currentMission = {
    getFarmId = function() return 1 end,
    getIsServer = function() return true end,
    placeableSystem = { placeables = {
      { uniqueId = "camera-owned", getOwnerFarmId = function() return 1 end,
        getName = function() return "North yard camera" end,
        ["spec_KM_82460_Flock_Camera.flockCamera"] = {
          valid = true, ready = true, fallen = false, ledMode = 2, alertMode = 1,
          events = { "Detected MF 8570 (12 km/h)", "Alerts: ALL VEHICLES" },
        } },
      { uniqueId = "camera-foreign", getOwnerFarmId = function() return 2 end,
        getName = function() return "Other farm secret" end,
        ["spec_KM_82460_Flock_Camera.flockCamera"] = {
          valid = true, ready = true, fallen = true, ledMode = 0, alertMode = 2,
          events = { "Other farm event" },
        } },
    } },
  }
  _G.KM_82460_Flock_Camera = {
    FlockCamera = { SPEC_KEY = "spec_KM_82460_Flock_Camera.flockCamera" },
  }
`;

test("reads only ready cameras currently owned by the export farm", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete" });
  expect(page.byFarm["1"]).toEqual({ cameraCount: 1 });
  expect(page.rows).toMatchObject([{
    farmId: 1, placeableId: "camera-owned", name: "North yard camera",
    ledMode: 2, alertMode: 1, fallen: false,
    events: ["Detected MF 8570 (12 km/h)", "Alerts: ALL VEHICLES"],
  }]);
  expect(JSON.stringify(page)).not.toMatch(/Other farm secret|Other farm event/);
});

test("withholds malformed owned state and unreviewed versions", () => {
  const bad = runCompanionPage(FILE, SETUP.replace("ledMode = 2", "ledMode = 8"), { farmId: 1 });
  expect(bad).toMatchObject({ readState: "partial", reason: "invalid-camera-mode" });
  expect(bad.rows).toBeUndefined();
  const unknown = runCompanionPage(FILE, SETUP.replace('version = "1.0.0.0"', 'version = "1.0.1.0"'), { farmId: 1 });
  expect(unknown).toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
});
