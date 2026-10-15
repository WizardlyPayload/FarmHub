"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");

function runPage(collectorFile, key, setup) {
    return runCompanionPage(collectorFile, setup, { key });
}

const run = (setup) => runPage("RealisticAnimalLossesCollector.lua", "realisticAnimalLosses", setup);

const FULL_SETUP = `
    local function placeable(owner, name, clusters, water, straw)
        return {
            ownerFarmId = owner,
            getOwnerFarmId = function(self) return self.ownerFarmId end,
            getName = function() return name end,
            getClusters = function() return clusters end,
            spec_husbandryWater = { automaticWaterSupply = false, fillType = "WATER" },
            spec_husbandryStraw = { inputFillType = "STRAW" },
            getHusbandryFillLevel = function(_, fillType)
                if fillType == "WATER" then return water end
                if fillType == "STRAW" then return straw end
            end,
        }
    end
    local cowPen = placeable(1, "Dairy Barn", { { numAnimals = 3, age = 55 }, { numAnimals = 5, age = 10 } }, 0, 400)
    local pigPen = placeable(2, "Other Farm Pigs", { { numAnimals = 40, age = 60 } }, 0, 0)
    local cowHusbandry = { animalTypeName = "COW", getPlaceable = function() return cowPen end }
    local pigHusbandry = { animalTypeName = "PIG", getPlaceable = function() return pigPen end }
    g_currentMission = {
        getFarmId = function() return 1 end,
        environment = { daysPerPeriod = 1, currentYear = 2, currentPeriod = 3 },
        husbandrySystem = { clusterHusbandries = { cowHusbandry, pigHusbandry } },
    }
    g_modIsLoaded = { FS25_RealisticAnimalLosses = true }
    FS25_RealisticAnimalLosses = {
        RealisticAnimalLosses = {
            settings = { foodEffectivityThreshold = 90 },
            DEFAULT_FOOD_EFFECTIVITY_THRESHOLD = 90,
            riskAgeLossesRate = 10, riskWaterLossesRate = 15, riskStrawLossesRate = 5,
            riskAnimalAgeInMonths = { HORSE = 60, PIG = 40, COW = 50, UNKNOWN = 36 },
            warningWaitingHours = 4, hourForAction = 18,
            lastMaxProbabilityToLossAnimalsForFood = { [cowHusbandry] = 12.34 },
            lastMaxProbabilityToLossAnimalsForAge = {},
            getFoodEffectivity = function(_, p) if p == cowPen then return 45, false end return 100, false end,
            onHourChanged = function() error("loss roll called") end,
        },
    }
    CheckAllFarmHusbandries = function() error("loss roll called") end
`;

describe("Realistic Animal Losses companion page collector", () => {
    test("is not exported when the mod is not loaded", () => {
        expect(run(`g_modIsLoaded = {} g_currentMission = {}`)).toBeUndefined();
    });

    test("detected without the class table is detection-only", () => {
        const page = run(`g_modIsLoaded = { FS25_324914_Realistic_Animal_Losses = true } g_currentMission = {}`);
        expect(page.readState).toBe("detection-only");
    });

    test("exports rules and own-farm pen risk inputs without rolling losses", () => {
        const page = run(FULL_SETUP);
        expect(page.readState).toBe("ok");
        expect(page.settings).toEqual({ foodEffectivityThreshold: 90, defaultFoodEffectivityThreshold: 90 });
        expect(page.rules).toMatchObject({
            ageLossRatePercent: 10, waterLossRatePercent: 15, strawLossRatePercent: 5, checkHour: 18, warningWaitingHours: 4,
        });
        expect(page.rules.riskAges).toEqual(expect.arrayContaining([{ animalType: "COW", months: 50 }]));
        expect(page.firstSeasonGrace).toBe(false);
        expect(Object.keys(page.byFarm)).toEqual(["1"]);
        const farm = page.byFarm["1"];
        expect(farm.pens).toHaveLength(1);
        const care = Math.round((Math.pow(50, 1.3) * 0.17 + 1 + 15) * 10) / 10;
        expect(farm.pens[0]).toMatchObject({
            name: "Dairy Barn", animalType: "COW", animals: 8, riskAgeMonths: 50, oldAnimals: 3,
            foodEffectivity: 45, belowThreshold: true, noWater: true, noStraw: false,
            careRiskPercentPerCheck: care, ageRiskPercentPerCheck: 10, lastWarnedCareRiskPercent: 12.3,
        });
        expect(farm).toMatchObject({
            animals: 8, oldAnimals: 3, pensAtRisk: 1, pensBelowThreshold: 1, pensNoWater: 1, pensNoStraw: 0, penCount: 1,
        });
    });

    test("first season of year one is flagged as the mod's grace period", () => {
        const page = run(`${FULL_SETUP}
            g_currentMission.environment.currentYear = 1
            g_currentMission.environment.currentPeriod = 4
        `);
        expect(page.firstSeasonGrace).toBe(true);
    });

    test("missing threshold is settings-only and feed risk is not guessed", () => {
        const page = run(`${FULL_SETUP}
            FS25_RealisticAnimalLosses.RealisticAnimalLosses.settings = {}
        `);
        expect(page.readState).toBe("settings-only");
        const pen = page.byFarm["1"].pens[0];
        expect(pen.belowThreshold).toBe(false);
        expect(pen.careRiskPercentPerCheck).toBe(15);
    });

    test("a husbandry whose placeable throws marks the page partial", () => {
        const page = run(`${FULL_SETUP}
            local broken = setmetatable({ getOwnerFarmId = function() return 1 end }, {
                __index = function() error("engine object gone") end,
            })
            table.insert(g_currentMission.husbandrySystem.clusterHusbandries, {
                animalTypeName = "SHEEP", getPlaceable = function() return broken end,
            })
        `);
        expect(page.readState).toBe("partial");
        expect(page.byFarm["1"].pens[0].name).toBe("Dairy Barn");
    });
});
