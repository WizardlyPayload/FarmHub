"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");

function runPage(collectorFile, key, setup) {
    return runCompanionPage(collectorFile, setup, { key });
}

const run = (setup) => runPage("SeasonalMilkProductionCollector.lua", "seasonalMilkProduction", setup);

const PATTERN = "{112, 91, 61, 20, 10, 10, 203, 203, 173, 132, 132, 51}";

const FULL_SETUP = `
    local pattern = ${PATTERN}
    local fillNames = { [1] = "MILK", [2] = "GOATMILK", [3] = "WOOL" }
    g_fillTypeManager = {
        getFillTypeNameByIndex = function(_, i) return fillNames[i] end,
        getFillTypeIndexByName = function(_, n) for i, v in pairs(fillNames) do if v == n then return i end end end,
    }
    local function pen(uid, owner, name, extra)
        local p = {
            uid = uid, ownerFarmId = owner,
            getOwnerFarmId = function(self) return self.ownerFarmId end,
            getName = function() return name end,
            getNumOfAnimals = function() return 20 end,
        }
        for k, v in pairs(extra) do p[k] = v end
        return p
    end
    local placeables = {
        pen("cow1", 1, "Cow Barn", { spec_husbandryMilk = { litersPerHour = { [1] = 50 } } }),
        pen("cow2", 2, "Neighbour Barn", { spec_husbandryMilk = { litersPerHour = { [1] = 99 } } }),
        pen("sheep", 1, "Sheep Pen", { spec_husbandryPallets = { litersPerHour = { [3] = 5 } } }),
        pen("goat", 1, "Goat Pen", { spec_husbandryPallets = { litersPerHour = { [2] = 3, [3] = 1 } } }),
    }
    g_currentMission = {
        getFarmId = function() return 1 end,
        husbandrySystem = { placeables = placeables },
    }
    g_modIsLoaded = { FS25_SeasonalMilkProduction = true }
    FS25_SeasonalMilkProduction = {
        SeasonalMilkSettings = { MINIMUM_AGE = 15, SEASONAL_PATTERN = pattern },
        g_seasonalMilkSettings = {
            healthImpactEnabled = true, seasonalCowsEnabled = true, seasonalBuffaloEnabled = false,
            seasonalGoatsEnabled = true, notifySeasonChange = true, notifyPeakSeason = false,
            notifyDryPeriod = true, notifyHealthWarning = true,
        },
        g_seasonalMilkProduction = {
            isInitialized = true,
            hemisphere = "north",
            baselineRates = { cow1 = { [1] = 40 }, cow2 = { [1] = 80 }, goat = { [2] = 4 } },
            healthHistory = { cow1 = { [2] = 92.5 } },
            getPlaceableId = function(_, p) return p.uid end,
            getCurrentPeriod = function() return 2 end,
            getSeasonalModifier = function(_, p) return pattern[((p + 5) % 12) + 1] / 100 end,
            applySeasonalModifiers = function() error("writer called") end,
            getHealthModifier = function() error("notifying reader called") end,
            processAllMilkHusbandries = function() error("writer called") end,
        },
    }
`;

describe("Seasonal Milk Production companion page collector", () => {
    test("is not exported when the mod is not loaded", () => {
        expect(run(`g_modIsLoaded = {} g_currentMission = {}`)).toBeUndefined();
    });

    test("detected without manager or settings is detection-only", () => {
        const page = run(`g_modIsLoaded = { FS25_SeasonalMilkProduction = true } g_currentMission = {}`);
        expect(page.detected).toBe(true);
        expect(page.readState).toBe("detection-only");
    });

    test("uninitialized provider exports settings and the base pattern only", () => {
        const page = run(`
            g_modIsLoaded = { FS25_365513_Seasonal_Milk_Production = true }
            g_currentMission = { getFarmId = function() return 1 end }
            FS25_365513_Seasonal_Milk_Production = {
                SeasonalMilkSettings = { MINIMUM_AGE = 15, SEASONAL_PATTERN = ${PATTERN} },
                g_seasonalMilkSettings = { healthImpactEnabled = false, seasonalCowsEnabled = true },
                g_seasonalMilkProduction = { isInitialized = false },
            }
        `);
        expect(page.readState).toBe("settings-only");
        expect(page.modName).toBe("FS25_365513_Seasonal_Milk_Production");
        expect(page.settings).toEqual({ healthImpactEnabled: false, seasonalCowsEnabled: true });
        expect(page.basePatternPercent).toHaveLength(12);
        expect(page.minimumAgeMonths).toBe(15);
        expect(page.byFarm).toBeUndefined();
    });

    test("exports curve, peak and own-farm pens without calling writers", () => {
        const page = run(FULL_SETUP);
        expect(page.readState).toBe("ok");
        expect(page.hemisphere).toBe("north");
        expect(page.currentPeriod).toBe(2);
        expect(page.monthlyPercent).toHaveLength(12);
        expect(page.currentPercent).toBe(203);
        expect(page.nextPeakPeriod).toBe(2);
        expect(page.settings.seasonalBuffaloEnabled).toBe(false);
        expect(Object.keys(page.byFarm)).toEqual(["1"]);
        const farm = page.byFarm["1"];
        const names = farm.pens.map((p) => p.name);
        expect(names).toEqual(expect.arrayContaining(["Cow Barn", "Goat Pen"]));
        expect(names).not.toContain("Neighbour Barn");
        expect(names).not.toContain("Sheep Pen");
        const cow = farm.pens.find((p) => p.name === "Cow Barn");
        expect(cow).toMatchObject({ kind: "milk", baselineLph: 40, currentLph: 50, appliedRatio: 1.25, avgHealth: 92.5 });
        expect(cow.fillTypes).toEqual(["MILK"]);
        const goat = farm.pens.find((p) => p.name === "Goat Pen");
        expect(goat).toMatchObject({ kind: "pallets", baselineLph: 4, currentLph: 3 });
        expect(farm).toMatchObject({ penCount: 2, pensWithBaseline: 2, baselineLph: 44, currentLph: 53 });
    });

    test("a pen that throws marks the page partial and keeps the rest", () => {
        const page = run(`${FULL_SETUP}
            table.insert(g_currentMission.husbandrySystem.placeables, setmetatable({
                getOwnerFarmId = function() return 1 end,
            }, { __index = function() error("engine object gone") end }))
        `);
        expect(page.readState).toBe("partial");
        expect(page.byFarm["1"].pens.map((p) => p.name)).toContain("Cow Barn");
    });

    test("no export farm leaves byFarm out", () => {
        const page = run(`${FULL_SETUP} g_currentMission.getFarmId = function() return 0 end`);
        expect(page.readState).toBe("ok");
        expect(page.byFarm).toBeUndefined();
    });
});
