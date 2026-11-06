"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "AutomaticMilkDistributionCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { FS25_356022_Automatic_Milk_Distribution = true }
  _G.g_fillTypeManager = { getFillTypeIndexByName = function(_, name)
    return ({ MILK = 1, BUFFALOMILK = 2 })[name]
  end }
  local function barn(name, owner, active, milkCapacity, buffaloCapacity)
    local fillTypes = {}
    if milkCapacity > 0 then fillTypes[#fillTypes + 1] = 1 end
    if buffaloCapacity > 0 then fillTypes[#fillTypes + 1] = 2 end
    return { autoMilkActive = active, getOwnerFarmId = function() return owner end,
      getName = function() return name end, spec_husbandryAnimals = {},
      spec_husbandryMilk = { hasMilkProduction = true, fillTypes = fillTypes },
      spec_husbandry = { storage = { getCapacity = function(_, index)
        return index == 1 and milkCapacity or buffaloCapacity end } },
      getHusbandryIsFillTypeSupported = function(_, index)
        return (index == 1 and milkCapacity or buffaloCapacity) > 0 end,
      getFillUnitIndexFromFillTypeIndex = function() return 0 end }
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    placeableSystem = { placeables = {
      barn("Dairy Barn", 1, true, 2000, 0),
      barn("Buffalo Barn", 1, false, 0, 1000),
      barn("Foreign Barn", 2, true, 5000, 0),
      barn("Calf Shed Without Milk", 1, false, 0, 0),
      { getOwnerFarmId = function() return 1 end, spec_husbandryAnimals = {} },
    } } }
  _G.AutoMilk = { executeDistribution = function() error("must not move milk") end,
    saveConfig = function() error("must not change settings") end }
`;

test("reports only this farm's milk barn switches without moving milk", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { barnCount: 2, enabledCount: 1, unreadableCount: 0 } } });
  expect(page.rows).toHaveLength(2);
  expect(page.rows).toEqual([
    { farmId: 1, barn: "Buffalo Barn", enabled: false, milkTypes: ["BUFFALOMILK"] },
    { farmId: 1, barn: "Dairy Barn", enabled: true, milkTypes: ["MILK"] },
  ]);
  expect(JSON.stringify(page)).not.toMatch(/Foreign Barn|Calf Shed Without Milk/);
  const merged = normalizeCompanionPages({ pages: { automaticMilkDistribution: page } }, { modules: loadModules() });
  expect(merged.pages.automaticMilkDistribution.rows).toHaveLength(2);
});

test("withholds client state and foreign-owned state", () => {
  const client = GAME.replace("getIsServer = function() return true end", "getIsServer = function() return false end");
  expect(runCompanionPage(FILE, client, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-barn-state-only" });
  const foreign = GAME.replace("barn(\"Dairy Barn\", 1", "barn(\"Dairy Barn\", 2")
    .replace("barn(\"Buffalo Barn\", 1", "barn(\"Buffalo Barn\", 2");
  expect(runCompanionPage(FILE, foreign, { farmId: 1 }))
    .toMatchObject({ readState: "ok", coverage: "complete",
      byFarm: { "1": { barnCount: 0, enabledCount: 0, unreadableCount: 0 } } });
});

test("does not silently show an unreadable barn switch as off", () => {
  const unreadable = GAME.replace("barn(\"Dairy Barn\", 1, true, 2000, 0)",
    "barn(\"Dairy Barn\", 1, nil, 2000, 0)");
  const page = runCompanionPage(FILE, unreadable, { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", reason: "barn-switch-unavailable",
    byFarm: { "1": { barnCount: 1, enabledCount: 0, unreadableCount: 1 } } });
  expect(page.rows).toHaveLength(1);
  expect(page.rows[0].barn).toBe("Buffalo Barn");
});

test("does not export a page when the exact mod is absent", () => {
  expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
});
