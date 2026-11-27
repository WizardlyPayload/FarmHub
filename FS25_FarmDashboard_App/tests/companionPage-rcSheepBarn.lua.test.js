"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "RcSheepBarnCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { KM_82926_Sheep_Barn = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "KM_82926_Sheep_Barn", version = "1.1.1.0" }
  } end }
  local function barn(id, owner, straw)
    return { uniqueId = id, getOwnerFarmId = function() return owner end,
      getName = function() return id end,
      rcCurableManure = { ready = true, capacity = 100000, straw = straw },
      rcRationValid = true,
      rcRationGroups = {
        {weight=0.50, fillTypes={1}}, {weight=0.40, fillTypes={2}},
        {weight=0.05, fillTypes={3,4}}, {weight=0.05, fillTypes={5}}
      },
      spec_husbandryFood = { fillLevels = {
        [1]=500, [2]=400, [3]=20, [4]=30, [5]=50
      } }
    }
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    placeableSystem = { placeables = {
      barn("owned", 1, 2000), barn("foreign", 2, 50000),
    } } }
`;

test("reads owned barn straw and the mod's four ration groups", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { barnCount: 1, storedStrawLitres: 2000 } } });
  expect(page.rows).toHaveLength(1);
  expect(page.rows[0]).toMatchObject({ placeableId: "owned", strawLitres: 2000,
    availableRationLitres: 1000 });
  expect(page.rows[0].groups).toEqual([
    { group: "hay", requiredPercent: 50, storedLitres: 500 },
    { group: "silage", requiredPercent: 40, storedLitres: 400 },
    { group: "grain", requiredPercent: 5, storedLitres: 50 },
    { group: "mineral", requiredPercent: 5, storedLitres: 50 },
  ]);
  expect(JSON.stringify(page)).not.toContain("foreign");
  const merged = normalizeCompanionPages({ pages: { rcSheepBarn: page } }, { modules: loadModules() });
  expect(merged.pages.rcSheepBarn.rows).toHaveLength(1);
});

test("withholds duplicate IDs and invalid owned readings", () => {
  const duplicate = runCompanionPage(FILE,
    SETUP.replace('barn("foreign", 2,', 'barn("owned", 1,'), { farmId: 1 });
  expect(duplicate).toMatchObject({ readState: "partial" });
  expect(Object.keys(duplicate.rows)).toHaveLength(0);
  const excess = runCompanionPage(FILE,
    SETUP.replace('barn("owned", 1, 2000)', 'barn("owned", 1, 200000)'), { farmId: 1 });
  expect(excess).toMatchObject({ readState: "partial" });
  expect(Object.keys(excess.rows)).toHaveLength(0);
  const invalidRation = runCompanionPage(FILE,
    SETUP.replace('[2]=400', '[2]=-400'), { farmId: 1 });
  expect(invalidRation).toMatchObject({ readState: "partial" });
  expect(Object.keys(invalidRation.rows)).toHaveLength(0);
});

test("requires exact version and authoritative server state", () => {
  expect(runCompanionPage(FILE,
    SETUP.replace('version = "1.1.1.0"', 'version = "1.1.1.1"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE,
    SETUP.replace('getIsServer = function() return true end', 'getIsServer = function() return false end'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-barn-state-only" });
});
