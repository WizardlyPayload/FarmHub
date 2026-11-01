"use strict";

const { runCompanionPage, runCompanionLua } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "VeterinarianCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_Veterinarian = true }
  _G.getWorldTranslation = function(node)
    if node == 1 then return 10, 0, 20 end
    if node == 2 then return 30, 0, 40 end
    return nil
  end
  _G.FS25_Veterinarian = { g_veterinarian = { states = {
    ["barn.xml@10.0@20.0"] = { sick = 2, disease = 4, animalNames = { "A", "B" } },
    ["foreign.xml@30.0@40.0"] = { sick = 9, disease = 2 },
  } } }
  _G.g_currentMission = {
    getIsServer = function() return true end,
    placeableSystem = { placeables = {
      { rootNode = 1, configFileName = "barn.xml", spec_husbandryAnimals = {},
        getOwnerFarmId = function() return 1 end,
        getName = function() return "Cow barn" end,
        getNumOfAnimals = function() return 16 end },
      { rootNode = 2, configFileName = "foreign.xml", spec_husbandryAnimals = {},
        getOwnerFarmId = function() return 2 end,
        getName = function() return "Foreign barn" end,
        getNumOfAnimals = function() return 20 end },
    } }
  }
`;

test("joins disease state only to a currently owned husbandry", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { ownedPens: 1, observedPens: 1, sickAnimals: 2 } } });
  expect(page.rows).toEqual([expect.objectContaining({
    farmId: 1, pen: "Cow barn", animals: 16, sick: 2, diseaseIndex: 4,
  })]);
  expect(JSON.stringify(page)).not.toContain("Foreign barn");
  expect(JSON.stringify(page)).not.toContain("animalNames");
  expect(normalizeCompanionPages({ pages: { veterinarian: page } }, { modules: loadModules() })
    .pages.veterinarian.rows).toHaveLength(1);

  const outcome = runCompanionLua([FILE], SETUP, `
    local state = _G.FS25_Veterinarian.g_veterinarian.states["barn.xml@10.0@20.0"]
    local before = state.sick
    CompanionPages.collectEntry(CompanionPages.entries.veterinarian, 1)
    return __fdEncode({ unchanged = state.sick == before, names = #state.animalNames })
  `, { farmId: 1 });
  expect(outcome).toMatchObject({ unchanged: true, names: 2 });
});

test("withholds client state and marks an unmatched owned pen incomplete", () => {
  const client = SETUP.replace("return true end", "return false end");
  expect(runCompanionPage(FILE, client, { farmId: 1 })).toMatchObject({
    readState: "settings-only", reason: "server-state-only",
  });
  const missing = SETUP.replace("[\"barn.xml@10.0@20.0\"] = { sick = 2, disease = 4, animalNames = { \"A\", \"B\" } },", "");
  expect(runCompanionPage(FILE, missing, { farmId: 1 })).toMatchObject({
    readState: "settings-only", reason: "no-owned-pen-state",
  });
  const extraPen = SETUP.replace('placeableSystem = { placeables = {', `placeableSystem = { placeables = {
      { rootNode = 3, configFileName = "other.xml", spec_husbandryAnimals = {},
        getOwnerFarmId = function() return 1 end,
        getNumOfAnimals = function() return 5 end },`);
  expect(runCompanionPage(FILE, extraPen, { farmId: 1 })).toMatchObject({
    readState: "partial", reason: "pen-states-incomplete",
    byFarm: { "1": { ownedPens: 2, observedPens: 1 } },
  });
});
