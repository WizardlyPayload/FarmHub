"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "AutoGroveCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { KM_82201_Auto_Grove = true }
  _G.g_currentMission = { getIsServer = function() return true end }
  local function field(id)
    return { farmland = { id = id }, getId = function(self) return self.farmland.id end }
  end
  _G.g_fieldManager = { getFieldById = function(self, id)
    if id == 11 or id == 22 or id == 33 or id == 55 then return field(id) end
  end }
  _G.g_farmlandManager = { getFarmlandOwner = function(self, id)
    if id == 11 or id == 55 then return 1 end
    if id == 22 or id == 33 then return 2 end
    return 0
  end }
  _G.FSCoreAutoPlant = { initialized = true, Data = { _loading = false,
    plantings = {
      ["11"] = { farmId = 1, crop = "grape", count = 234,
        headingDeg = 90, rowSpacing = 3, plantSpacing = 1.5,
        useTrees = false, placeableId = "grove-11" },
      ["22"] = { farmId = 2, crop = "olive", count = 100,
        headingDeg = 0, rowSpacing = 5, plantSpacing = 2, useTrees = true },
      ["33"] = { farmId = 1, crop = "grape", count = 40,
        headingDeg = 0, rowSpacing = 3, plantSpacing = 1 },
      ["44"] = { farmId = 1, crop = "olive", count = 12,
        headingDeg = 0, rowSpacing = 5, plantSpacing = 2 },
      ["55"] = { farmId = 1, crop = "rice", count = 1,
        headingDeg = 0, rowSpacing = 0, plantSpacing = 0 },
    },
    recordPlanting = function() error("must not record planting") end,
    clearPlanting = function() error("must not clear planting") end,
  } }
  _G["KM_82201_Auto_Grove"] = { FSCoreAutoPlant = _G.FSCoreAutoPlant }
  _G.FSCoreAutoPlant = nil
`;

test("shows last planting only for currently owned fields of selected farm", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial",
    byFarm: { "1": { recordedFieldCount: 2, recordedUnitCount: 235,
      withheldOwnership: 2 } } });
  expect(page.rows).toHaveLength(2);
  expect(page.rows[0]).toMatchObject({ farmId: 1, fieldId: 11, crop: "grape",
    plantedCount: 234, rowSpacing: 3, plantSpacing: 1.5,
    placeableLinked: true });
  expect(page.rows[1]).toMatchObject({ fieldId: 55, crop: "rice",
    plantedCount: 1, rowSpacing: 0, plantSpacing: 0 });
  const merged = normalizeCompanionPages({ pages: { autoGrovePlantings: page } },
    { modules: loadModules() });
  expect(merged.pages.autoGrovePlantings.rows).toHaveLength(2);
});

test("other farm has only its recorded and currently owned field", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 2 });
  expect(page).toMatchObject({ readState: "ok",
    byFarm: { "2": { recordedFieldCount: 1, recordedUnitCount: 100,
      withheldOwnership: 0 } } });
  expect(page.rows).toHaveLength(1);
  expect(page.rows[0]).toMatchObject({ fieldId: 22, crop: "olive", treeMode: true });
});

test("FSCore edition, client and missing ownership mapping never claim plantings", () => {
  const both = GAME.replace("KM_82201_Auto_Grove = true",
    "KM_82201_Auto_Grove = true, FS25_FSCoreAutoPlant = true");
  expect(runCompanionPage(FILE, both, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "other-edition-loaded" });
  const client = GAME.replace("getIsServer = function() return true end",
    "getIsServer = function() return false end");
  expect(runCompanionPage(FILE, client, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-plantings-only" });
  const noMap = GAME.replace("id == 11 or id == 22 or id == 33 or id == 55",
    "id == 22 or id == 33 or id == 55");
  const page = runCompanionPage(FILE, noMap, { farmId: 1 });
  expect(page.byFarm["1"]).toMatchObject({ recordedFieldCount: 1,
    withheldOwnership: 3 });
  expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
});
