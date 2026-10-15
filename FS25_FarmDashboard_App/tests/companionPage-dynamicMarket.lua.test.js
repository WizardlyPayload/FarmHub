"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");

const FILE = "DynamicMarketCollector.lua";

function setup(extra = "") {
    return `
        _G.g_modIsLoaded = { FS25_DynamicMarket = true }
        local fillTypes = {
            [10] = { name = "WHEAT", title = "Wheat" },
            [20] = { name = "MILK", title = "Milk" },
        }
        _G.g_fillTypeManager = {
            getFillTypeByIndex = function(_, i) return fillTypes[i] end,
            getFillTypeByName = function(_, n) for _, ft in pairs(fillTypes) do if ft.name == n then return ft end end end,
        }
        _G.g_currentMission = { environment = { currentPeriod = 4 } }
        local station = { getName = function() return "Grain Mill" end }
        local DM = {
            VERSION = "1.2.9.0",
            GROUP_ORDER = { "cropFarming", "animalProduct" },
            CURVES = {
                cropFarming = { 1.14, 1.10, 1.05, 1.00, 0.95, 0.91, 0.88, 0.91, 0.97, 1.04, 1.10, 1.13 },
                animalProduct = { 1.08, 1.05, 1.02, 0.99, 0.96, 0.94, 0.94, 0.97, 1.01, 1.04, 1.07, 1.08 },
            },
            MARKET_GROUPS = { cropFarming = { volatility = 0.18 }, animalProduct = { volatility = 0.04 } },
            __marketFactors = {
                cropFarming = { factor = 1.0634, weather = 0.2, supply = -0.1, demand = 0.5, seasonalSupplyPressure = 0.07 },
                animalProduct = { factor = 0.9912, weather = 0, supply = 0.1, demand = -0.3, seasonalSupplyPressure = 0.05 },
            },
            __marketDriverReport = { strongestPositiveName = "cropFarming", strongestNegativeName = "animalProduct" },
            __lastSaleMarketReport = { success = true, reason = "applied", stations = 14, adjusted = 220, uniqueFillTypes = 60, skipped = 3, minFactor = 0.9912, maxFactor = 1.0634 },
            __stationPressure = { [station] = { [10] = { percent = 6, peakPercent = 8 }, [20] = { percent = 0, peakPercent = 0 } } },
            __favorites = { WHEAT = true },
            priceBaseMode = 2, dailyRecalcMode = 1, vanillaMode = 1,
            STATION_PRESSURE_ENABLED = true, STATION_PRESSURE_THRESHOLD_LITERS = 25000, STATION_PRESSURE_PERCENT_PER_STEP = 2,
            STATION_PRESSURE_MAX_PERCENT = 15, STATION_PRESSURE_DECAY_PERCENT_PER_HOUR = 15, PLAYER_MARKET_NOTICES = true,
        }
        function DM:getMarketKey() return "map:2:4", 4, 2, "map" end
        function DM:getMarketGroupDisplayName(g) return g == "cropFarming" and "crop farming" or "animal products" end
        function DM:getTrendDirection(g) local f = self.__marketFactors[g].factor return f > 1.005 and "up" or (f < 0.995 and "down" or "stable") end
        function DM:buildMarketFactorForGroup(g, period, year, map)
            if period ~= 5 or year ~= 2 or map ~= "map" then error("unexpected outlook args") end
            return g == "cropFarming" and 0.97 or 1.02, {}
        end
        function DM:getGroup(ft) return ft.name == "WHEAT" and "cropFarming" or "animalProduct" end
        function DM:getBestMonthForFillType(ft) return 1 end
        _G.FS25_DynamicMarket = { DynamicMarket = DM }
        ${extra}
    `;
}

describe("companion page: Dynamic Market (Lua)", () => {
    test("not detected -> no page", () => {
        expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", {})).toBeUndefined();
    });

    test("group factors with drivers, seasonal curve, next-period outlook, pressure and favourites", () => {
        const page = runCompanionPage(FILE, setup());
        expect(page).toMatchObject({ readState: "ok", modVersion: "1.2.9.0", period: 4, year: 2, strongestUp: "cropFarming", strongestDown: "animalProduct" });
        expect(page.settings).toMatchObject({ priceBase: "yearAverage", dailyRecalc: false, vanillaMode: false, stationPressure: true, pressureMaxPercent: 15 });
        expect(page.lastApply).toMatchObject({ success: true, stations: 14, adjusted: 220, fillTypes: 60 });
        const crop = page.groups[0];
        expect(crop).toMatchObject({
            key: "cropFarming", title: "crop farming", factor: 1.0634, changePercent: 6.34, trend: "up",
            weather: 0.2, supply: -0.1, demand: 0.5, seasonalSupply: 0.07, volatility: 0.18, curveNow: 1, nextChangePercent: -3,
        });
        expect(crop.curve).toHaveLength(12);
        expect(page.groups[1]).toMatchObject({ key: "animalProduct", changePercent: -0.88, trend: "down", nextChangePercent: 2 });
        expect(page.pressureActive).toBe(1);
        expect(page.pressure).toEqual([{ station: "Grain Mill", fillType: "WHEAT", title: "Wheat", percent: 6, peakPercent: 8, recovering: true }]);
        expect(page.favorites).toEqual([{ fillType: "WHEAT", title: "Wheat", group: "cropFarming", changePercent: 6.34, bestPeriod: 1 }]);
    });

    test("vanilla mode suppresses the outlook", () => {
        const page = runCompanionPage(FILE, setup("FS25_DynamicMarket.DynamicMarket.vanillaMode = 2"));
        expect(page.settings.vanillaMode).toBe(true);
        expect(page.groups[0].nextChangePercent).toBeUndefined();
    });

    test("module missing -> detection-only", () => {
        const page = runCompanionPage(FILE, setup("FS25_DynamicMarket.DynamicMarket = nil"));
        expect(page.readState).toBe("detection-only");
    });
});
