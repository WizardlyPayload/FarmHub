"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "HandPlantSaplingsCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { KM_71329_Hand_Plant_Saplings = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "KM_71329_Hand_Plant_Saplings", version = "1.0.0.0" }
  } end }
  _G.g_handPlantSaplingsManager = { treeTypes = {
    ["1_1"] = { name = "PINE", variationName = "DEFAULT", title = "Pine" },
    ["2_1"] = { name = "OAK", variationName = "DEFAULT", title = "Oak" },
  } }
  local function area(owner, capacity, levels)
    return { capacity = capacity, fillLevels = levels,
      getOwnerFarmId = function() return owner end }
  end
  local function site(id, owner, storage, backpacks)
    return { uniqueId = id,
      getOwnerFarmId = function() return owner end,
      getName = function() return id end,
      spec_handPlantSaplings = { isValid = true, storage = storage, backpacks = backpacks } }
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    placeableSystem = { placeables = {
      site("own-rack", 1, area(1, 10, { ["1_1"] = 4, ["2_1"] = 2 }),
        { area(1, 5, { ["2_1"] = 3 }) }),
      site("foreign", 2, area(2, 100, { ["1_1"] = 99 }), {}),
    } } }
`;

test("exports only the current farm's tree pieces in racks and linked backpacks", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { rackCount: 1, backpackCount: 1, recordedPieces: 9 } } });
  expect(page.rows).toEqual([
    expect.objectContaining({ placeableId: "own-rack", area: "backpack", backpackIndex: 1,
      tree: "Oak", pieces: 3, areaCapacityPieces: 5 }),
    expect.objectContaining({ placeableId: "own-rack", area: "rack",
      tree: "Pine", pieces: 4, areaCapacityPieces: 10 }),
    expect.objectContaining({ placeableId: "own-rack", area: "rack",
      tree: "Oak", pieces: 2, areaCapacityPieces: 10 }),
  ]);
  expect(JSON.stringify(page)).not.toContain("foreign");
  const merged = normalizeCompanionPages({ pages: { handPlantSaplings: page } }, { modules: loadModules() });
  expect(merged.pages.handPlantSaplings.rows).toHaveLength(3);
});

test("withholds ambiguous IDs, foreign backpack ownership and invalid piece counts", () => {
  const duplicate = runCompanionPage(FILE,
    SETUP.replace('site("foreign", 2,', 'site("own-rack", 1,'), { farmId: 1 });
  expect(duplicate).toMatchObject({ readState: "partial" });
  expect(Object.keys(duplicate.rows)).toHaveLength(0);
  const foreignArea = runCompanionPage(FILE,
    SETUP.replace('area(1, 5,', 'area(2, 5,'), { farmId: 1 });
  expect(foreignArea).toMatchObject({ readState: "partial" });
  expect(foreignArea.rows).toHaveLength(2);
  const invalid = runCompanionPage(FILE,
    SETUP.replace('["1_1"] = 4', '["1_1"] = -4'), { farmId: 1 });
  expect(invalid).toMatchObject({ readState: "partial" });
  expect(invalid.rows).toHaveLength(1);
});

test("requires the reviewed version and server-side loaded state", () => {
  expect(runCompanionPage(FILE,
    SETUP.replace('version = "1.0.0.0"', 'version = "1.0.0.1"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE,
    SETUP.replace('getIsServer = function() return true end', 'getIsServer = function() return false end'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-state-only" });
});
