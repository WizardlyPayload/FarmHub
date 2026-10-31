"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "ProductionControlCollector.lua";
const GAME = `
    _G.g_modIsLoaded = { FS25_319198_Production_Control = true }
    local owned = {
        ownerFarmId = 1, owningPlaceable = { uniqueId = "bakery-1" },
        getName = function() return "Bakery" end,
        productions = {
            { id = "BREAD", name = "Bread", productionControlSelfSpec_productivity = 150,
              productionControlSelfSpec_baseCyclesPerMonth = 48, cyclesPerMonth = 72,
              productionControlSelfSpec_baseCostsPerActiveMonth = 100, costsPerActiveMonth = 150 },
            { id = "CAKE", name = "Cake", productionControlSelfSpec_productivity = 100,
              productionControlSelfSpec_baseCyclesPerMonth = 24, cyclesPerMonth = 24,
              productionControlSelfSpec_baseCostsPerActiveMonth = 80, costsPerActiveMonth = 80 },
        },
    }
    local foreign = { ownerFarmId = 2, productions = {
        { id = "SECRET", productionControlSelfSpec_productivity = 300 },
    } }
    _G.g_currentMission = { getFarmId = function() return 1 end,
        productionChainManager = { getProductionPointsForFarmId = function() return { owned, foreign } end } }
`;

test("reads only the export farm's chosen speeds and their effective figures", () => {
    const page = runCompanionPage(FILE, GAME, { farmId: 1 });
    expect(page.readState).toBe("ok");
    expect(page.byFarm["1"]).toMatchObject({ lineCount: 2, changedCount: 1 });
    expect(page.lines).toHaveLength(2);
    expect(page.lines[0]).toMatchObject({ point: "Bakery", recipe: "Bread", productivityPercent: 150,
        baseCyclesPerMonth: 48, cyclesPerMonth: 72, baseCostPerMonth: 100, costPerMonth: 150 });
    expect(page.lines.some((line) => line.recipe === "SECRET")).toBe(false);
    const merged = normalizeCompanionPages({ pages: { productionControl: page } }, { modules: loadModules() });
    expect(merged.pages.productionControl.lines).toHaveLength(2);
});

test("no loaded mod produces no page", () => {
    expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
});
