"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "HandToolsCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_369801_Hand_Tools = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_369801_Hand_Tools", version = "1.0.0.0" }
  } end }
  local prefix = "spec_FS25_369801_Hand_Tools."
  _G.FS25_369801_Hand_Tools = {
    HandToolBase = { SPEC_TABLE_NAME = prefix .. "handToolBase" },
    HandToolStickable = { SPEC_TABLE_NAME = prefix .. "handToolStickable" },
    HandToolInputActions = { SPEC_TABLE_NAME = prefix .. "handToolInputActions" },
    HandToolBalePicker = { SPEC_TABLE_NAME = prefix .. "handToolBalePicker" },
  }
  local function vehicle(id, farm, stuck, boosted, actions)
    local v = { uniqueId = id, ownerFarmId = farm,
      getFullName = function() return "Tool " .. id end,
      getIsOverloaded = function() return boosted end }
    v[prefix .. "handToolBase"] = {}
    if stuck ~= nil then v[prefix .. "handToolStickable"] = { isSticked = stuck } end
    if boosted ~= nil then v[prefix .. "handToolBalePicker"] = {} end
    if actions ~= nil then v[prefix .. "handToolInputActions"] = { inputActions = actions } end
    return v
  end
  local converter = { id = "fillTypeConverter", allowSaving = true,
    isToggleAction = true, isActive = true }
  local transient = { id = "use", allowSaving = false,
    isToggleAction = false, isActive = true }
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      vehicle("owned-picker", 1, true, true, { converter, transient }),
      vehicle("owned-rake", 1, false, nil, { { id = "tedding", allowSaving = true,
        isToggleAction = true, isActive = false } }),
      vehicle("foreign", 2, true, true, { converter }),
      { uniqueId = "ordinary", ownerFarmId = 1 },
    } } }
`;

test("reports only current mod states on owned tool vehicles", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { handToolCount: 2, stuckCount: 1,
      activeModeCount: 1, boostedPickerCount: 1 } } });
  expect(page.rows.find((row) => row.vehicleId === "owned-picker"))
    .toMatchObject({ farmId: 1, stuck: true, pickerBoosted: true,
      activeModes: ["fillTypeConverter"] });
  expect(page.rows.find((row) => row.vehicleId === "owned-rake"))
    .toMatchObject({ farmId: 1, stuck: false });
  expect(JSON.stringify(page)).not.toMatch(/foreign|ordinary|"use"/);
  const merged = normalizeCompanionPages({ pages: { handTools: page } },
    { modules: loadModules() });
  expect(merged.pages.handTools.rows).toHaveLength(2);
});

test("rejects malformed saved modes and duplicate tool identity", () => {
  const invalid = runCompanionPage(FILE,
    SETUP.replace('isToggleAction = true, isActive = true',
      'isToggleAction = true, isActive = "yes"'), { farmId: 1 });
  expect(invalid).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(invalid.byFarm).toBeUndefined();
  const duplicate = runCompanionPage(FILE,
    SETUP.replace('vehicle("owned-rake", 1,', 'vehicle("owned-picker", 1,'),
    { farmId: 1 });
  expect(duplicate).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(Object.keys(duplicate.rows ?? {})).toHaveLength(0);
  expect(duplicate.byFarm).toBeUndefined();
});

test("withholds malformed current picker reading and truncated owned scan", () => {
  const malformed = runCompanionPage(FILE,
    SETUP.replace('getIsOverloaded = function() return boosted end',
      'getIsOverloaded = function() return "unknown" end'), { farmId: 1 });
  expect(malformed).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(malformed.byFarm).toBeUndefined();
  const many = runCompanionPage(FILE, SETUP + `
    for i = 5, 405 do
      g_currentMission.vehicleSystem.vehicles[i] = {
        uniqueId = "ordinary-" .. i, ownerFarmId = 2 }
    end
  `, { farmId: 1 });
  expect(many).toMatchObject({ readState: "partial", coverage: "truncated" });
  expect(many.byFarm).toBeUndefined();
});

test("gates unreviewed version and client-only state", () => {
  expect(runCompanionPage(FILE,
    SETUP.replace('version = "1.0.0.0"', 'version = "1.0.0.1"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE,
    SETUP.replace("getIsServer = function() return true end",
      "getIsServer = function() return false end"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-tool-state-only" });
});
