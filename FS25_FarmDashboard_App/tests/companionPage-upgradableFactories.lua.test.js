"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "UpgradableFactoriesCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { FS25_340901_Upgradable_Factories = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_340901_Upgradable_Factories", version = "1.0.0.0" }
  } end }
  local function place(id, owner, name)
    return { uniqueId = id, getOwnerFarmId = function() return owner end,
      getName = function() return name end }
  end
  local points = {
    { ownerFarmId = 1, owningPlaceable = place("bakery", 1, "Bakery"),
      fs25UF = { level = 3 } },
    { ownerFarmId = 1, owningPlaceable = place("mill", 1, "Mill"),
      fs25UF = { level = 0 } },
    { ownerFarmId = 2, owningPlaceable = place("foreign", 2, "Foreign"),
      fs25UF = { level = 10 } },
  }
  _G.g_currentMission = { getIsServer = function() return true end,
    productionChainManager = { getProductionPointsForFarmId = function() return points end } }
`;

test("reads exact-farm saved levels without calling a mod state creator", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { productionCount: 2, upgradedCount: 1 } } });
  expect(page.rows).toEqual([
    expect.objectContaining({ placeableId: "bakery", production: "Bakery", level: 3,
      maxLevel: 10, configuredMultiplier: 1.75 }),
    expect.objectContaining({ placeableId: "mill", production: "Mill", level: 0,
      configuredMultiplier: 1 }),
  ]);
  expect(JSON.stringify(page)).not.toContain("Foreign");
  const merged = normalizeCompanionPages({ pages: { upgradableFactories: page } },
    { modules: loadModules() });
  expect(merged.pages.upgradableFactories.rows).toHaveLength(2);
});

test("withholds ambiguous IDs, missing state and owner mismatches", () => {
  const duplicate = runCompanionPage(FILE,
    GAME.replace('place("mill", 1, "Mill")', 'place("bakery", 1, "Mill")'),
    { farmId: 1 });
  expect(duplicate).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(Object.keys(duplicate.rows)).toHaveLength(0);
  expect(duplicate.byFarm["1"]).not.toHaveProperty("productionCount");
  const missing = runCompanionPage(FILE,
    GAME.replace('fs25UF = { level = 3 }', 'fs25UF = nil'), { farmId: 1 });
  expect(missing).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(missing.rows).toHaveLength(1);
  const mismatched = runCompanionPage(FILE,
    GAME.replace('place("bakery", 1, "Bakery")', 'place("bakery", 2, "Bakery")'),
    { farmId: 1 });
  expect(mismatched).toMatchObject({ readState: "partial" });
  expect(mismatched.rows).toHaveLength(1);
});

test("requires reviewed version and server state", () => {
  expect(runCompanionPage(FILE,
    GAME.replace('version = "1.0.0.0"', 'version = "1.0.0.1"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE,
    GAME.replace('getIsServer = function() return true end',
      'getIsServer = function() return false end'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-productions-only" });
});
