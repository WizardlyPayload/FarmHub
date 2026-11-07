"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");
const FILE = "FieldToDoPlannedCropCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_FieldToDoList = true }
  _G.g_currentMission = { getIsServer = function() return true end }
  _G.FS25_FieldToDoList = {
    FieldPlannedCrop = { byFieldId = {
      [36] = 7, [37] = 8, [1000040] = -1, [1000041] = 9,
    } },
    FieldAdvisor = { getLocalizedFruitTitle = function(index)
      if index == 7 then return "Sorghum" end
      if index == 8 then return "Wheat" end
      return nil
    end },
  }
  _G.g_farmlandManager = {
    getFarmlandOwner = function(self, id)
      return ({ [36]=1, [37]=2, [40]=1, [41]=2 })[id] or 0
    end,
  }
`;

test("shows only saved plans on currently owned land including a pseudo field", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({readState:"ok",coverage:"complete",
    byFarm:{"1":{plannedCountScanned:2}}});
  expect(page.rows).toEqual([
    {farmId:1,fieldId:36,farmlandId:36,fruitTypeIndex:7,plannedCrop:"Sorghum"},
    {farmId:1,fieldId:1000040,farmlandId:40,plannedCrop:"farmyard"},
  ]);
  expect(JSON.stringify(page)).not.toMatch(/Wheat|1000041/);
  const merged = normalizeCompanionPages({pages:{fieldToDoPlannedCrops:page}},
    {modules:loadModules()});
  expect(merged.pages.fieldToDoPlannedCrops.rows).toHaveLength(2);
});

test("withholds plan rows when ownership cannot be established", () => {
  const missing = SETUP.replace("getFarmlandOwner = function(self, id)",
    "getFarmlandOwnerMissing = function(self, id)");
  expect(runCompanionPage(FILE, missing, {farmId:1}))
    .toMatchObject({readState:"settings-only",reason:"no-ownership-api"});
  const failing = SETUP.replace("return ({ [36]=1, [37]=2, [40]=1, [41]=2 })[id] or 0",
    "if id == 36 then error('not ready') end; return ({ [37]=2, [40]=1, [41]=2 })[id] or 0");
  const partial = runCompanionPage(FILE, failing, {farmId:1});
  expect(partial).toMatchObject({readState:"partial",coverage:"partial"});
  expect(partial.rows).toHaveLength(1);
  expect(partial.rows[0]).toMatchObject({fieldId:1000040});
});

test("withholds client and absent mod", () => {
  const client = SETUP.replace("getIsServer = function() return true end",
    "getIsServer = function() return false end");
  expect(runCompanionPage(FILE, client, {farmId:1}))
    .toMatchObject({readState:"settings-only",reason:"server-register-only"});
  expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", {farmId:1})).toBeUndefined();
});
