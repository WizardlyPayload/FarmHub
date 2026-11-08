"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");

const FILE = "CropRotationPlannerCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_347316_Crop_Rotation = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_347316_Crop_Rotation", version = "1.0.1.0" }
  } end }
  _G.g_currentMission = {
    getFarmId = function() return 1 end,
    getIsServer = function() return true end,
  }
  _G.FS25_347316_Crop_Rotation = {
    g_cropRotation = {
      possibleCropStates = {
        { cropIndex = 0, name = "Fallow" },
        { cropIndex = 4, name = "Wheat" },
        { cropIndex = 9, name = "Canola" },
      },
      possibleCatchCropStates = {
        { cropIndex = 0, name = "None" },
        { cropIndex = 2, name = "Oilseed Radish" },
      },
    },
    g_cropRotationPlanner = { cropRotations = {
      { farmId = 1, index = 7, name = "North farm", rotations = {
        { state = 4, catchCropState = 2, yieldValue = 150 },
        { state = 9, catchCropState = 0, yieldValue = 120 },
      } },
      { farmId = 2, index = 8, name = "Secret other farm", rotations = {
        { state = 4, catchCropState = 0 },
      } },
    } },
  }
`;

test("reads named template steps for only the selected farm without transient yield", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete" });
  expect(page.byFarm["1"]).toEqual({ planCount: 1, stepCount: 2 });
  expect(page.rows).toMatchObject([
    { farmId: 1, planIndex: 7, planName: "North farm", step: 1, crop: "Wheat", catchCrop: "Oilseed Radish" },
    { farmId: 1, planIndex: 7, planName: "North farm", step: 2, crop: "Canola", catchCrop: "None" },
  ]);
  expect(JSON.stringify(page)).not.toMatch(/Secret other farm|yieldValue|150/);
});

test("withholds unknown crop indices and client-only state", () => {
  const bad = runCompanionPage(FILE, SETUP.replace("state = 4, catchCropState = 2", "state = 444, catchCropState = 2"), { farmId: 1 });
  expect(bad).toMatchObject({ readState: "partial", reason: "unresolved-state" });
  expect(bad.rows).toBeUndefined();
  const client = runCompanionPage(FILE, SETUP.replace("getIsServer = function() return true", "getIsServer = function() return false"), { farmId: 1 });
  expect(client).toMatchObject({ readState: "settings-only", reason: "server-plans-only" });
});
