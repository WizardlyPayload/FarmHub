"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "ProductionBoosterSystemCollector.lua";
const GAME = `
    _G.g_modIsLoaded = { KM_82331_Production_Booster_System = true }
    _G.g_fillTypeManager = { getFillTypeNameByIndex = function(_, id) return id == 17 and "BREAD" or "FLOUR" end }
    local owned = { ownerFarmId = 1, owningPlaceable = { getOwnerFarmId = function() return 1 end },
        getName = function() return "Bakery" end, productions = {
        { id = "BREAD", name = "Bread", pbsUsesCustomUpdate = true,
          pbsStatistics = { outputs = { [17] = { base = 100, actual = 125, bonus = 25 },
                                      [18] = { base = 0, actual = 0, bonus = 0 } } } },
    } }
    local foreign = { ownerFarmId = 2, getName = function() return "Other farm" end, productions = {
        { id = "SECRET", pbsUsesCustomUpdate = true,
          pbsStatistics = { outputs = { [17] = { base = 1000, actual = 1500, bonus = 500 } } } },
    } }
    _G.g_currentMission = { getFarmId = function() return 1 end,
        getIsServer = function() return true end,
        productionChainManager = { getProductionPointsForFarmId = function() return { owned, foreign } end } }
`;

test("reads recorded output for exactly the export farm", () => {
    const page = runCompanionPage(FILE, GAME, { farmId: 1 });
    expect(page.readState).toBe("ok");
    expect(page.byFarm["1"]).toMatchObject({ activeLineCount: 1, outputCount: 1 });
    expect(page.rows).toEqual([{ farmId: 1, point: "Bakery", recipe: "Bread", output: "BREAD",
        baseLitres: 100, actualLitres: 125, bonusLitres: 25 }]);
    const merged = normalizeCompanionPages({ pages: { productionBoosterSystem: page } }, { modules: loadModules() });
    expect(merged.pages.productionBoosterSystem.rows).toHaveLength(1);
});

test("withholds client-only statistics", () => {
    const page = runCompanionPage(FILE, GAME.replace("getIsServer = function() return true end", "getIsServer = function() return false end"), { farmId: 1 });
    expect(page).toMatchObject({ readState: "settings-only", reason: "server-statistics-only" });
});

test("withholds full-register counts when an output is unreadable", () => {
    const game = GAME.replace("[18] = { base = 0, actual = 0, bonus = 0 }", "[18] = { base = -1, actual = 0, bonus = 0 }");
    const page = runCompanionPage(FILE, game, { farmId: 1 });
    expect(page).toMatchObject({ readState: "partial", coverage: "partial" });
    expect(page.rows).toHaveLength(1);
    expect(page.byFarm).toBeUndefined();
});

test("withholds full-register counts when output rows exceed the cap", () => {
    const game = GAME + `
        local points = _G.g_currentMission.productionChainManager:getProductionPointsForFarmId()
        local outputs = {}
        for i = 1, 81 do outputs[i] = { base = i, actual = i, bonus = 0 } end
        points[1].productions[1].pbsStatistics.outputs = outputs
    `;
    const page = runCompanionPage(FILE, game, { farmId: 1 });
    expect(page).toMatchObject({ readState: "partial", coverage: "truncated" });
    expect(page.rows).toHaveLength(80);
    expect(page.byFarm).toBeUndefined();
});
