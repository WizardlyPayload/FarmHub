"use strict";

const { runCompanionPage, runCompanionLua } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "ProductionRevampCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_378044_Production_Revamp = true }
  _G.g_modManager = {
    getActiveMods = function()
      return { { modName = "FS25_378044_Production_Revamp", version = "1.0.0.0" } }
    end
  }
  _G.FS25_378044_Production_Revamp = {
    Revamp = { settings = { storageActive = true, distributionActive = true } }
  }
  _G.g_fillTypeManager = {
    getFillTypeNameByIndex = function(_, id)
      return ({ [1] = "TOMATO", [2] = "LETTUCE" })[id]
    end
  }
  local function placeable(id, name)
    return { getUniqueId = function() return id end,
      getName = function() return name end }
  end
  local source = {
    ownerFarmId = 1, owningPlaceable = placeable("owned-source", "Greenhouse"),
    getName = function() return "Greenhouse" end,
    productions = {
      { id = "tomatoMix", name = "Tomato mix", hasMixChoice = true,
        mixMode = "MOST", hasBoostChoice = true, boostMode = "DESC" },
      { id = "plain", name = "Plain tomato", hasMixChoice = false,
        mixMode = "ASC", hasBoostChoice = false, boostMode = "ASC" },
    },
    outputFillTypeIds = { [1] = true, [2] = true },
    outputFillTypeIdsStorage = { [1] = true },
    outputFillTypeIdsAutoDeliver = { [2] = true },
    getOutputDistributionMode = function(_, fillTypeId)
      if fillTypeId == 1 then
        return _G.FS25_378044_Production_Revamp.Revamp.settings.storageActive and 3 or 0
      end
      return 2
    end,
    distributionTargets = {
      [2] = { ["owned-target"] = { level = "PRIMARY", limit = 1200 } }
    },
  }
  local destination = {
    ownerFarmId = 1, owningPlaceable = placeable("owned-target", "Food Plant"),
    getName = function() return "Food Plant" end,
    productions = {},
    outputFillTypeIds = {}, outputFillTypeIdsStorage = {},
  }
  local foreign = {
    ownerFarmId = 2, owningPlaceable = placeable("foreign", "Foreign Plant"),
    getName = function() return "Foreign Plant" end,
    productions = { { id = "foreign", hasMixChoice = true, mixMode = "LEAST" } },
    outputFillTypeIds = { [1] = true }, outputFillTypeIdsStorage = { [1] = true },
  }
  _G.g_currentMission = {
    getIsServer = function() return true end,
    productionChainManager = {
      getProductionPointsForFarmId = function() return {source, destination, foreign} end,
    },
  }
`;

test("reads owned Store and target settings without claiming a delivery or changing the mod", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { productionCount: 2, storeCount: 1,
      getterStoreCount: 1, targetCount: 1 } } });
  expect(page.rows).toEqual(expect.arrayContaining([
    expect.objectContaining({ source: "Greenhouse", product: "TOMATO",
      kind: "STORE", serverMode: "STORE", storageEnabled: true }),
    expect.objectContaining({ source: "Greenhouse", product: "LETTUCE",
      kind: "TARGET", serverMode: "AUTO_DELIVER",
      destination: "Food Plant", level: "PRIMARY",
      limitLitres: 1200, distributionEnabled: true, autoDeliverFlag: true }),
  ]));
  expect(page.recipeRows).toEqual([{ farmId: 1, source: "Greenhouse",
    recipe: "Tomato mix", mixMode: "MOST", boostMode: "DESC" }]);
  expect(page.byFarm["1"].recipeChoiceCount).toBe(1);
  expect(JSON.stringify(page)).not.toContain("Foreign Plant");
  expect(JSON.stringify(page)).not.toContain("owned-target");
  expect(normalizeCompanionPages({ pages: { productionRevamp: page } },
    { modules: loadModules() }).pages.productionRevamp.rows).toHaveLength(2);
  expect(normalizeCompanionPages({ pages: { productionRevamp: page } },
    { modules: loadModules() }).pages.productionRevamp.recipeRows).toHaveLength(1);
  const result = runCompanionLua([FILE], SETUP, `
    local before = source.distributionTargets[2]["owned-target"].limit
    local beforeMix = source.productions[1].mixMode
    local page = CompanionPages.collectEntry(CompanionPages.entries.productionRevamp, 1)
    return __fdEncode({ unchanged = before ==
      source.distributionTargets[2]["owned-target"].limit and
      beforeMix == source.productions[1].mixMode,
      count = #page.rows })
  `, { farmId: 1 });
  expect(result).toMatchObject({ unchanged: true, count: 2 });
});

test("withholds an invalid recipe mode rather than reporting a false choice", () => {
  const page = runCompanionPage(FILE,
    SETUP.replace('mixMode = "MOST"', 'mixMode = "INVALID"'), { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial",
    byFarm: { "1": { recipeChoiceCount: 0 } }, recipeRows: {} });
});

test("withholds production choices for a changed or unknown mod version", () => {
  const changed = SETUP.replace('version = "1.0.0.0"', 'version = "1.0.0.1"');
  expect(runCompanionPage(FILE, changed, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  const unknown = SETUP.replace(', version = "1.0.0.0"', "");
  expect(runCompanionPage(FILE, unknown, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
});

test("withholds client state and unresolved target; distinguishes saved inactive settings", () => {
  expect(runCompanionPage(FILE,
    SETUP.replace("getIsServer = function() return true end",
      "getIsServer = function() return false end"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-production-state-only" });
  const missing = SETUP.replace('["owned-target"]', '["removed-target"]');
  expect(runCompanionPage(FILE, missing, { farmId: 1 })).toMatchObject({
    readState: "partial", coverage: "partial",
    byFarm: { "1": { storeCount: 1, targetCount: 0 } },
  });
  const off = SETUP.replace("storageActive = true, distributionActive = true",
    "storageActive = false, distributionActive = false");
  const page = runCompanionPage(FILE, off, { farmId: 1 });
  expect(page.rows).toHaveLength(2);
  expect(page.rows.every((row) => row.kind === "STORE"
    ? row.storageEnabled === false : row.distributionEnabled === false)).toBe(true);
  expect(page).toMatchObject({ byFarm: { "1": { storeCount: 1,
    getterStoreCount: 0 } } });
});

test("marks a saved Store flag as partial when the server getter disagrees", () => {
  const mismatched = SETUP.replace("and 3 or 0", "and 0 or 0");
  const page = runCompanionPage(FILE, mismatched, { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial",
    reason: "store-mode-mismatch",
    byFarm: { "1": { storeCount: 1, getterStoreCount: 0 } } });
  expect(page.rows).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: "STORE", product: "TOMATO",
      serverMode: "KEEP", storageEnabled: true }),
  ]));
});
