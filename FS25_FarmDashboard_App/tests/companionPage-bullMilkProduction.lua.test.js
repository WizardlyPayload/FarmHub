"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "BullMilkProductionCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { KM_82260_Bull_milk_production = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "KM_82260_Bull_milk_production", version = "2.8.0.0" }
  } end }
  _G.BullMilkStandalone = { FILL_TYPE_NAME = "BULLMILK" }
  _G.g_fillTypeManager = { getFillTypeIndexByName = function(_, name)
    if name == "BULLMILK" then return 77 end
  end }
  local function barn(id, owner, bulls, rate)
    return { uniqueId = id, getOwnerFarmId = function() return owner end,
      getAnimalTypeIndex = function() return 1 end,
      getName = function() return id end,
      spec_husbandry = { storage = { fillTypes = { [77] = true } } },
      spec_husbandryMilk = { hasMilkProduction = true,
        bullMilkDetectedAnimals = bulls, bullMilkLitersPerHour = rate,
        litersPerHour = { [77] = rate },
      },
    }
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    animalSystem = { getTypeByIndex = function(_, index)
      if index == 1 then return { name = "COW" } end
    end },
    placeableSystem = { placeables = {
      barn("owned", 1, 3, 19.5), barn("foreign", 2, 9, 100),
    } },
  }
`;

test("reads only the farm's captured cow-barn rate without invoking production", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { barnCount: 1, detectedBulls: 3, calculatedLitresPerHour: 19.5 } } });
  expect(page.rows).toEqual([{ farmId: 1, placeableId: "owned", barn: "owned",
    detectedBulls: 3, calculatedLitresPerHour: 19.5 }]);
  expect(JSON.stringify(page)).not.toContain("foreign");
  const merged = normalizeCompanionPages({ pages: { bullMilkProduction: page } },
    { modules: loadModules() });
  expect(merged.pages.bullMilkProduction.rows).toHaveLength(1);
});

test("withholds duplicate IDs and conflicting calculated rates", () => {
  const duplicate = runCompanionPage(FILE,
    SETUP.replace('barn("foreign", 2,', 'barn("owned", 1,'), { farmId: 1 });
  expect(duplicate).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(Object.keys(duplicate.rows)).toHaveLength(0);
  expect(duplicate.byFarm).toBeUndefined();
  const conflict = runCompanionPage(FILE,
    SETUP.replace('litersPerHour = { [77] = rate }', 'litersPerHour = { [77] = rate + 1 }'),
    { farmId: 1 });
  expect(conflict).toMatchObject({ readState: "partial" });
  expect(Object.keys(conflict.rows)).toHaveLength(0);
  expect(conflict.byFarm).toBeUndefined();
});

test("requires reviewed version and server state", () => {
  expect(runCompanionPage(FILE,
    SETUP.replace('version = "2.8.0.0"', 'version = "2.8.0.1"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE,
    SETUP.replace('getIsServer = function() return true end',
      'getIsServer = function() return false end'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-husbandry-state-only" });
});

test("resolves the mod symbol from its loaded mod environment", () => {
  const setup = SETUP.replace(
    '_G.BullMilkStandalone = { FILL_TYPE_NAME = "BULLMILK" }',
    '_G.KM_82260_Bull_milk_production = { BullMilkStandalone = { FILL_TYPE_NAME = "BULLMILK" } }');
  expect(runCompanionPage(FILE, setup, { farmId: 1 }))
    .toMatchObject({ readState: "ok", byFarm: { "1": { detectedBulls: 3 } } });
});
