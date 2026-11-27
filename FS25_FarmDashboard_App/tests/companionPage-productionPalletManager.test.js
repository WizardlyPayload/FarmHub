"use strict";

const { runCompanionPage, runCompanionLua } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "ProductionPalletManagerCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_ProductionPalletManager = true }
  local owned = { ownerFarmId = 1, getOwnerFarmId = function() return 1 end }
  local foreign = { ownerFarmId = 2, getOwnerFarmId = function() return 2 end }
  _G.FS25_ProductionPalletManager = {
    PalletManager = {
      isInitialized = true, DEFAULT_CAPACITY = 2000,
      farmDefaults = { [1] = 3000, [2] = 5000 },
      farmNormalWeight = { [1] = false, [2] = true },
      rules = { ["owned-a|1"] = 5000, ["owned-b|2"] = -1,
        ["foreign|1"] = 10000, ["removed|1"] = 4000 },
      collectEntries = function(_, farmId)
        if farmId ~= 1 then return {} end
        return {
          { farmId = 1, object = owned, sourceKey = "owned-a",
            fillTypeIndex = 1, sourceName = "Greenhouse", outputName = "Tomatoes" },
          { farmId = 1, object = owned, sourceKey = "owned-b",
            fillTypeIndex = 2, sourceName = "Cow Shed", outputName = "Milk" },
          { farmId = 2, object = foreign, sourceKey = "foreign",
            fillTypeIndex = 1, sourceName = "Foreign Plant", outputName = "Chili" },
        }
      end,
    },
  }
  _G.g_currentMission = {
    getIsServer = function() return true end,
    placeableSystem = { placeables = { owned, foreign } },
  }
`;

test("reads exact-farm defaults and live source overrides without exporting orphan keys", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial",
    byFarm: { "1": { defaultCapacityLitres: 3000, normalWeight: false,
      sourceCount: 2, overrideCount: 2 } } });
  expect(page.rows).toEqual(expect.arrayContaining([
    expect.objectContaining({ source: "Greenhouse", product: "Tomatoes", capacityLitres: 5000 }),
    expect.objectContaining({ source: "Cow Shed", product: "Milk", disabled: true }),
  ]));
  expect(JSON.stringify(page)).not.toMatch(/Foreign Plant|foreign|removed|owned-a|owned-b/);
  expect(normalizeCompanionPages({ pages: { productionPalletManager: page } },
    { modules: loadModules() }).pages.productionPalletManager.rows).toHaveLength(2);
  const result = runCompanionLua([FILE], SETUP, `
    local before = FS25_ProductionPalletManager.PalletManager.rules["owned-a|1"]
    local page = CompanionPages.collectEntry(CompanionPages.entries.productionPalletManager, 1)
    return __fdEncode({ unchanged = before ==
      FS25_ProductionPalletManager.PalletManager.rules["owned-a|1"], count = #page.rows })
  `, { farmId: 1 });
  expect(result).toMatchObject({ unchanged: true, count: 2 });
});

test("withholds client state and reports default-only state honestly", () => {
  const client = SETUP.replace("getIsServer = function() return true end",
    "getIsServer = function() return false end");
  expect(runCompanionPage(FILE, client, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-pallet-state-only" });
  const defaults = SETUP.replace("[1] = 3000, [2] = 5000", "[1] = 2000, [2] = 5000")
    .replace("[1] = false, [2] = true", "[1] = true, [2] = true")
    .replace('["owned-a|1"] = 5000, ["owned-b|2"] = -1,', "")
    .replace(`          { farmId = 2, object = foreign, sourceKey = "foreign",
            fillTypeIndex = 1, sourceName = "Foreign Plant", outputName = "Chili" },`, "");
  const page = runCompanionPage(FILE, defaults, { farmId: 1 });
  expect(page).toMatchObject({ readState: "settings-only", coverage: "complete",
    byFarm: { "1": { defaultCapacityLitres: 2000, overrideCount: 0 } } });
  expect(Object.keys(page.rows)).toHaveLength(0);
});
