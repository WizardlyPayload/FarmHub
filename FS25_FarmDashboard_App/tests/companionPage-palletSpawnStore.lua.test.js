"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "PalletSpawnStoreCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_PalletSpawnStore = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_PalletSpawnStore", version = "1.0.0.0" }
  } end }
  _G.FS25_PalletSpawnStore = { PalletSpawnMode = { psmHasLoaded = true } }
  _G.ProductionPoint = { OUTPUT_MODE = { KEEP = 0, DIRECT_SELL = 1, AUTO_DELIVER = 2 } }
  _G.g_fillTypeManager = {
    getFillTypeNameByIndex = function(_, id)
      return ({ "TOMATO", "LETTUCE", "STRAWBERRY", "BREAD" })[id]
    end,
    getFillTypeByIndex = function(_, id)
      return { title = ({ "Tomatoes", "Lettuce", "Strawberries", "Bread" })[id] }
    end,
  }
  local function point(id, placeableOwner)
    return { owningPlaceable = {
      uniqueId = id, ownerFarmId = placeableOwner,
      getOwnerFarmId = function(self) return self.ownerFarmId end,
      getName = function() return "Greenhouse " .. id end,
    }, outputFillTypeIds = { [1] = true, [2] = true, [3] = true, [4] = true },
    outputFillTypeIdsArray = { 1, 2, 3, 4 },
    psm_spawnDisabled = { [1] = true, [2] = false, [3] = true, [4] = true },
    getOutputDistributionMode = function(_, fill)
      if fill == 3 then return 1 end
      if fill == 4 then return 2 end
      return 0
    end }
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    productionChainManager = {
      getProductionPointsForFarmId = function() return {
        point("owned", 1), point("foreign", 2),
      } end,
    },
  }
`;

test("reads four routing choices on owned outputs without counting foreign stock", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { outputCount: 4, storeCount: 1, spawnCount: 1 } } });
  expect(page.rows).toHaveLength(4);
  expect(page.rows.map((row) => row.mode).sort()).toEqual(["distribute", "sell", "spawn", "store"]);
  expect(page.rows.find((row) => row.fillType === "TOMATO")).toMatchObject({
    placeableId: "owned", fillTitle: "Tomatoes", mode: "store",
  });
  expect(JSON.stringify(page)).not.toMatch(/foreign|psm_spawnDisabled|palletSpawnStore.xml/);
  const merged = normalizeCompanionPages({ pages: { palletSpawnStore: page } },
    { modules: loadModules() });
  expect(merged.pages.palletSpawnStore.rows).toHaveLength(4);
});

test("skips foreign access and withholds totals on duplicate or bad owned output", () => {
  const wrong = runCompanionPage(FILE,
    SETUP.replace('point("owned", 1)', 'point("owned", 2)'), { farmId: 1 });
  expect(wrong).toMatchObject({ readState: "settings-only", coverage: "complete",
    byFarm: { "1": { outputCount: 0 } } });
  const unknown = runCompanionPage(FILE,
    SETUP.replace('point("owned", 1)', 'point("owned", nil)'), { farmId: 1 });
  expect(unknown).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(unknown.byFarm).toBeUndefined();
  const duplicate = runCompanionPage(FILE,
    SETUP.replace('point("foreign", 2)', 'point("owned", 1)'), { farmId: 1 });
  expect(duplicate).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(Object.keys(duplicate.rows)).toHaveLength(0);
  const bad = runCompanionPage(FILE,
    SETUP.replace('outputFillTypeIdsArray = { 1, 2, 3, 4 }',
      'outputFillTypeIdsArray = { 1, 2, 999, 4 }'), { farmId: 1 });
  expect(bad).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(bad.byFarm).toBeUndefined();
});

test("requires the reviewed version, server and loaded production state", () => {
  expect(runCompanionPage(FILE,
    SETUP.replace('version = "1.0.0.0"', 'version = "1.0.0.1"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE,
    SETUP.replace('getIsServer = function() return true end',
      'getIsServer = function() return false end'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-production-state-only" });
  expect(runCompanionPage(FILE,
    SETUP.replace('psmHasLoaded = true', 'psmHasLoaded = false'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "pallet-spawn-state-not-loaded" });
});
