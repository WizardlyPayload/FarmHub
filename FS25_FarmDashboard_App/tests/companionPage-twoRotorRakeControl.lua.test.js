"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "TwoRotorRakeControlCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_UniversalTwoRotorRakeControl = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_UniversalTwoRotorRakeControl", version = "1.0.0.15" }
  } end }
  local specName = "spec_FS25_UniversalTwoRotorRakeControl.universalTwoRotorControl"
  local function rake(id, owner, supported, active, left, right)
    return { uniqueId = id, getOwnerFarmId = function() return owner end,
      getFullName = function() return id end,
      [specName] = { supported = supported, active = active, targets = {left, right} } }
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      rake("split-rake", 1, true, true, true, false),
      rake("both-rake", 1, true, true, false, false),
      rake("inactive-rake", 1, true, false, true, false),
      rake("foreign-rake", 2, true, true, true, false),
    } } }
`;

test("reads owned independent rotor targets without foreign or inactive rakes", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { independentCount: 2, splitTargetCount: 1 } } });
  expect(page.rows).toEqual([
    expect.objectContaining({ vehicleId: "both-rake", leftTarget: "lowered", rightTarget: "lowered" }),
    expect.objectContaining({ vehicleId: "split-rake", leftTarget: "lifted", rightTarget: "lowered" }),
  ]);
  expect(JSON.stringify(page)).not.toMatch(/foreign-rake|inactive-rake/);
  const merged = normalizeCompanionPages({ pages: { twoRotorRakeControl: page } },
    { modules: loadModules() });
  expect(merged.pages.twoRotorRakeControl.rows).toHaveLength(2);
});

test("withholds duplicate IDs and unreadable targets with uncertain totals", () => {
  const duplicate = runCompanionPage(FILE,
    SETUP.replace('rake("both-rake"', 'rake("split-rake"'), { farmId: 1 });
  expect(duplicate).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(duplicate.byFarm["1"]).not.toHaveProperty("independentCount");
  const invalid = runCompanionPage(FILE,
    SETUP.replace('true, true, true, false)', 'true, true, true, nil)'), { farmId: 1 });
  expect(invalid).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(invalid.rows).toHaveLength(1);
});

test("gates unreviewed version and client state", () => {
  expect(runCompanionPage(FILE, SETUP.replace('version = "1.0.0.15"',
    'version = "1.0.0.16"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE, SETUP.replace('getIsServer = function() return true end',
    'getIsServer = function() return false end'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-vehicle-state-only" });
});
