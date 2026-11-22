"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "WorkplanCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { FS25_352974_Workplan = true }
  _G.g_modManager = { getActiveMods = function() return { { modName = "FS25_352974_Workplan", version = "1.0.0.0" } } end }
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
    byFarm: { "1": { withheldOwnership: 1 } } });
  expect(page.byFarm["1"].ownedPlanCount).toBeUndefined();
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
    byFarm: { "1": { withheldOwnership: 2 } } });
  expect(page.byFarm["1"].ownedPlanCount).toBeUndefined();
  const merged = normalizeCompanionPages({ pages: { workplan: page } }, { modules: loadModules() });
  expect(merged.pages.workplan.rows).toHaveLength(0);
});

test("scan cap withholds the full plan count while a row-only cap keeps it", () => {
  const capGame = GAME.replace("{ farmId = 2, fieldId = 31, currentFruit = 3, plannedFruit = 2,",
    "{ farmId = 2, fieldId = 31, currentFruit = 3, plannedFruit = 2,");
  const fullEntry = `{ farmId = 1, fieldId = 11, currentFruit = 2, plannedFruit = 3,
    stateLime = 1, stateMulching = 2, statePlow = 3, stateRoller = 5,
    stateFert1_type = 4, stateFert1_state = 1, stateFert2_type = 1,
    stateFert2_state = 5, stateWeed_grooming = 2, stateWeed_spray = 4, stateStone = 3 },`;
  const entryBlock = Array.from({ length: 81 }, (_, i) => fullEntry.replace("fieldId = 11", `fieldId = ${11 + i}`)).join("\n");
  const rowsGame = capGame.replace(/\{ farmId = 1, fieldId = 11,[\s\S]*?stateWeed_grooming = 2, stateWeed_spray = 4, stateStone = 3 \},/, entryBlock)
    .replace(/\{ farmId = 1, fieldId = 12, currentFruit = 2, plannedFruit = 3 \},/, "")
    .replace("if fieldId == 11 or fieldId == 12 or fieldId == 31 then return fieldId end", "if fieldId >= 11 and fieldId <= 91 then return fieldId end")
    .replace("return farmId == 1 and fieldId == 11 or farmId == 2 and fieldId == 31", "return farmId == 1 and fieldId >= 11 and fieldId <= 91");
  const rowCapped = runCompanionPage(FILE, rowsGame, { farmId: 1 });
  expect(rowCapped.coverage).toBe("truncated");
  expect(rowCapped.rows).toHaveLength(80);
  expect(rowCapped.byFarm["1"].ownedPlanCount).toBe(81);
  const lastEntry = fullEntry.replace("fieldId = 11", "fieldId = 91");
  const invalidBlock = entryBlock.replace(lastEntry, lastEntry.replace("stateStone = 3", "stateStone = 9"));
  const invalidAfterDisplayCap = runCompanionPage(FILE,
    rowsGame.replace(entryBlock, invalidBlock), { farmId: 1 });
  expect(invalidAfterDisplayCap.coverage).toBe("truncated");
  expect(invalidAfterDisplayCap.byFarm["1"].ownedPlanCount).toBeUndefined();
  const scanGame = rowsGame.replace(entryBlock, Array.from({ length: 501 }, (_, i) => fullEntry.replace("fieldId = 11", `fieldId = ${11 + i}`)).join("\n"))
    .replace("fieldId <= 91", "fieldId <= 511").replace("fieldId <= 91", "fieldId <= 511");
  const scanCapped = runCompanionPage(FILE, scanGame, { farmId: 1 });
  expect(scanCapped.coverage).toBe("truncated");
  expect(scanCapped.byFarm["1"].ownedPlanCount).toBeUndefined();
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
