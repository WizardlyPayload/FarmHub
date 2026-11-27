"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "DynamicMolehillsCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_DynamicMolehills = true }
  _G.g_currentMission = { getIsServer = function() return true end }
  _G.FS25_DynamicMolehills = { DynamicMolehills = { manager = { molehills = {
    { id = 1, farmlandId = 11, state = 1 },
    { id = 2, farmlandId = 11, state = 2 },
    { id = 3, farmlandId = 12, state = 3 },
    { id = 4, farmlandId = 13, state = 3 },
    { id = 5, farmlandId = 11, state = 4 },
  } } } }
  local owners = { [11] = 1, [12] = 2, [13] = 1 }
  _G.g_farmlandManager = {
    getFarmlandOwner = function(_, id) return owners[id] end,
    getFarmlandById = function(_, id) return { name = "Land " .. tostring(id) } end,
  }
`;

test("counts only current owned farmland and current nonremoved states", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  if (page?.readState === "failed") throw new Error(JSON.stringify(page));
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { current: 3, active: 1, compressed: 1, smoothed: 1 } } });
  expect(page.farmlands).toEqual([
    { farmlandId: 11, name: "Land 11", active: 1, compressed: 1, smoothed: 0 },
    { farmlandId: 13, name: "Land 13", active: 0, compressed: 0, smoothed: 1 },
  ]);
  expect(JSON.stringify(page)).not.toMatch(/Land 12/);
  const merged = normalizeCompanionPages({ pages: { dynamicMolehills: page } }, { modules: loadModules() });
  expect(merged.pages.dynamicMolehills.farmlands).toHaveLength(2);
});

test("withholds client-only state and absent-mod data", () => {
  const client = SETUP.replace("getIsServer = function() return true end",
    "getIsServer = function() return false end");
  expect(runCompanionPage(FILE, client, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-state-only" });
  expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
});

test("reports partial coverage when a saved parcel has no current ownership reading", () => {
  const noOwner = SETUP.replace("[13] = 1", "[13] = nil");
  const page = runCompanionPage(FILE, noOwner, { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial",
    byFarm: { "1": { current: 2, active: 1, compressed: 1, smoothed: 0 } } });
  expect(page.farmlands).toHaveLength(1);
});
