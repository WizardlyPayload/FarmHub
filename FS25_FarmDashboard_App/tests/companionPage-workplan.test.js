"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "WorkplanCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { FS25_352974_Workplan = true }
  _G.g_fruitTypeManager = {
    getFruitTypeNameByIndex = function(self, id)
      if id == 2 then return "SORGHUM" end
      if id == 3 then return "WHEAT" end
    end,
  }
  _G.g_currentMission = {
    getIsServer = function() return true end,
    workplan = {
      getFarmlandIdByFieldId = function(self, fieldId)
        if fieldId == 11 or fieldId == 12 or fieldId == 31 then return fieldId end
        return 0
      end,
      getIsFieldOwnedByPlayer = function(self, fieldId, farmId)
        return farmId == 1 and fieldId == 11 or farmId == 2 and fieldId == 31
      end,
      addRow = function() error("must not create a field plan") end,
      saveToXmlFile = function() error("must not save a field plan") end,
      fieldEntries = {
        { farmId = 1, fieldId = 11, currentFruit = 2, plannedFruit = 3,
          stateLime = 1, stateMulching = 2, statePlow = 3, stateRoller = 5,
          stateFert1_type = 4, stateFert1_state = 1,
          stateFert2_type = 1, stateFert2_state = 5,
          stateWeed_grooming = 2, stateWeed_spray = 4, stateStone = 3 },
        { farmId = 1, fieldId = 12, currentFruit = 2, plannedFruit = 3 },
        { farmId = 2, fieldId = 31, currentFruit = 3, plannedFruit = 2,
          stateLime = 3, stateMulching = 2, statePlow = 2, stateRoller = 2,
          stateFert1_type = 1, stateFert1_state = 5,
          stateFert2_type = 1, stateFert2_state = 5,
          stateWeed_grooming = 2, stateWeed_spray = 2, stateStone = 2 },
      },
    },
  }
`;

test("reads current owned farm plan, maps crop and exact task states", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial",
    byFarm: { "1": { ownedPlanCount: 1, withheldOwnership: 1 } } });
  expect(page.rows).toHaveLength(1);
  expect(page.rows[0]).toMatchObject({ farmId: 1, fieldId: 11, farmlandId: 11,
    currentCrop: "SORGHUM", plannedCrop: "WHEAT",
    tasks: { lime: 1, mulching: 2, plow: 3, roller: 5,
      fertilizer1: 1, fertilizer2: 5, weedSpray: 4, stone: 3 },
    fertilizer1Type: 4 });
  const merged = normalizeCompanionPages({ pages: { workplan: page } }, { modules: loadModules() });
  expect(merged.pages.workplan.rows).toHaveLength(1);
});

test("other farm sees only its own currently owned entry", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 2 });
  expect(page).toMatchObject({ readState: "ok", byFarm: { "2": { ownedPlanCount: 1 } } });
  expect(page.rows).toHaveLength(1);
  expect(page.rows[0]).toMatchObject({ fieldId: 31, currentCrop: "WHEAT", plannedCrop: "SORGHUM" });
});

test("a missing field-to-farmland mapping is withheld even if an owner helper says true", () => {
  const unmapped = GAME.replace("if fieldId == 11 or fieldId == 12 or fieldId == 31 then return fieldId end",
    "if fieldId == 12 or fieldId == 31 then return fieldId end");
  const page = runCompanionPage(FILE, unmapped, { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial",
    byFarm: { "1": { ownedPlanCount: 0, withheldOwnership: 2 } } });
  const merged = normalizeCompanionPages({ pages: { workplan: page } }, { modules: loadModules() });
  expect(merged.pages.workplan.rows).toHaveLength(0);
});

test("client, missing ownership helper and absent mod yield no farm plan", () => {
  const client = GAME.replace("getIsServer = function() return true end", "getIsServer = function() return false end");
  expect(runCompanionPage(FILE, client, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-plan-only" });
  const noOwner = GAME.replace("getIsFieldOwnedByPlayer = function(self, fieldId, farmId)", "otherMethod = function(self, fieldId, farmId)");
  expect(runCompanionPage(FILE, noOwner, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "plan-register-unavailable" });
  expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
});
