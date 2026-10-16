"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");

const FILE = "FactoryProfitCalculatorCollector.lua";

// FactoryProfitMath copied from the mod's contract: cycles/month = cyclesPerHour * 24, upkeep = costsPerActiveMonth.
const MOD_ENV = `
    _G.g_modIsLoaded = { FS25_FactoryProfitCalculator = true }
    _G.g_fillTypeManager = {
        names = { [1] = "WHEAT", [2] = "FLOUR", [3] = "SUGARBEET", [4] = "SUGAR" },
        getFillTypeNameByIndex = function(self, i) return self.names[i] end,
        getFillTypeByIndex = function(self, i) return self.names[i] and { name = self.names[i], title = self.names[i] } or nil end,
    }
    local purchase = { [1] = 300 }
    local peak = { [1] = 400, [2] = 900, [3] = 50, [4] = 100 }
    _G.FS25_FactoryProfitCalculator = {
        FactoryProfitMath = {
            getCyclesPerMonth = function(p) return (p.cyclesPerHour or 0) * 24 end,
            getUpkeepPerMonth = function(p) return p.costsPerActiveMonth or 0 end,
            getPurchasePrice = function(ft) return purchase[ft] end,
            getPeakPrice = function(ft) return peak[ft] or 0 end,
            calculateProduction = function() error("icons") end,
        },
        FactoryAdminPersistence = {
            entries = {
                k1 = { factoryTitle = "Grain Mill", lineTitle = "Flour", original = { cyclesPerHour = 1 },
                       values = { cyclesPerHour = 2, inputs = { {}, {} }, outputs = { {} }, capacities = {} } },
            },
            save = function() error("write") end,
        },
        FactoryDataProvider = { getProductionPoints = function() error("stamps") end },
    }
    local mill = {
        getName = function() return "Grain Mill" end,
        productions = {
            { id = "flour", name = "Flour", status = 1, cyclesPerHour = 1, costsPerActiveMonth = 100,
              inputs = { { type = 1, amount = 10 } }, outputs = { { type = 2, amount = 8 } } },
        },
    }
    local sugar = {
        getName = function() return "Sugar Mill" end,
        productions = {
            { id = "sugar", name = "Sugar", status = 0, cyclesPerHour = 1, costsPerActiveMonth = 500,
              inputs = { { type = 3, amount = 10 } }, outputs = { { type = 4, amount = 1 } } },
        },
    }
    _G.g_currentMission = {
        getFarmId = function() return 1 end,
        productionChainManager = {
            getProductionPointsForFarmId = function(self, farmId) if farmId == 1 then return { mill, sugar } end return {} end,
        },
    }
`;

describe("Factory Profit Calculator page collector", () => {
    test("not detected without the mod", () => {
        expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
    });

    test("applies the mod's monthly projection to the farm's lines", () => {
        const page = runCompanionPage(FILE, MOD_ENV, { farmId: 1 });
        expect(page.readState).toBe("ok");
        expect(page.period).toBe("month");
        expect(page.lines).toHaveLength(2);
        const flour = page.lines[0];
        // 24 cycles: input 240 L at 300/1000 (purchase) = 72; output 192 L at 900/1000 = 172.8; upkeep 100
        expect(flour).toMatchObject({
            farmId: 1,
            point: "Grain Mill",
            recipe: "Flour",
            running: true,
            cyclesPerMonth: 24,
            upkeepPerMonth: 100,
            inputCost: 72,
            outputValue: 172.8,
            profit: 0.8,
        });
        expect(flour.inputs[0]).toMatchObject({ fillType: "WHEAT", litersPerMonth: 240, pricePer1000: 300, priceSource: "purchase" });
        expect(flour.outputs[0]).toMatchObject({ fillType: "FLOUR", pricePer1000: 900, priceSource: "peak" });
        const sugar = page.lines[1];
        // input 240 L at peak 50 = 12; output 24 L at 100 = 2.4; upkeep 500 -> -509.6
        expect(sugar.inputs[0].priceSource).toBe("peak");
        expect(sugar.profit).toBeCloseTo(-509.6);
        const farm = page.byFarm["1"];
        expect(farm).toMatchObject({ lineCount: 2, runningCount: 1, profitableCount: 1, lossCount: 1, bestLine: "Flour", worstLine: "Sugar" });
        expect(farm.runningProfit).toBeCloseTo(0.8);
        expect(farm.totalProfit).toBeCloseTo(-508.8);
        expect(page.overrides).toEqual([
            { factory: "Grain Mill", line: "Flour", originalCyclesPerHour: 1, cyclesPerHour: 2, inputs: 2, outputs: 1, capacities: 0 },
        ]);
    });

    test("unpriced fill types leave profit empty and mark the page partial", () => {
        const page = runCompanionPage(FILE, `${MOD_ENV}
            _G.g_fillTypeManager.names[5] = "MYSTERY"
            local pts = _G.g_currentMission.productionChainManager
            local base = pts.getProductionPointsForFarmId
            pts.getProductionPointsForFarmId = function(self, f)
                local list = base(self, f)
                list[1].productions[1].outputs = { { type = 5, amount = 1 } }
                return list
            end
        `, { farmId: 1 });
        expect(page.readState).toBe("partial");
        const flour = page.lines.find((line) => line.recipe === "Flour");
        expect(flour.profit).toBeUndefined();
        expect(flour.outputs[0].pricePer1000).toBeUndefined();
    });

    test("settings-only (overrides kept) when there is no production manager", () => {
        const page = runCompanionPage(FILE, `${MOD_ENV}
            _G.g_currentMission.productionChainManager = nil
        `, { farmId: 1 });
        expect(page.readState).toBe("settings-only");
        expect(page.overrides).toHaveLength(1);
    });
});
