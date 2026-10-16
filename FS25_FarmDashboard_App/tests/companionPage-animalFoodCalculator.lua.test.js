"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");

function runPage(collectorFile, key, setup) {
    return runCompanionPage(collectorFile, setup, { key });
}

const run = (setup) => runPage("AnimalFoodCalculatorCollector.lua", "animalFoodCalculator", setup);

const SCALING = `
    AFCConsumptionScaling = {
        enabled = true, autoScaleByDays = true,
        getModeName = function() return "auto" end,
        getCustomMultiplier = function() return 1 end,
        getReferenceSourceName = function() return "effective" end,
        isAnimalPackageRestricted = function() return false end,
        getScaleFactor = function(_, input, days) return input == "straw" and 1 or days end,
        setReferenceSource = function() error("writer called") end,
    },
`;

const FULL_SETUP = `
    local function pen(id, owner, name)
        return {
            id = id, ownerFarmId = owner, spec_husbandryAnimals = {},
            getOwnerFarmId = function(self) return self.ownerFarmId end,
            getName = function() return name end,
            getNumOfAnimals = function() return 30 end,
        }
    end
    g_currentMission = {
        getFarmId = function() return 1 end,
        environment = { daysPerPeriod = 2 },
        husbandrySystem = { placeables = { pen(7, 1, "Cow Barn"), pen(8, 1, "Pig Barn"), pen(9, 2, "Neighbour") } },
    }
    g_modIsLoaded = { FS25_AnimalFoodCalculator = true }
    FS25_AnimalFoodCalculator = {
        ${SCALING}
        AnimalFoodCalculator = {
            isEAS = false,
            foodHookInstalled = true, waterHookInstalled = true, strawHookInstalled = false,
            milkHookInstalled = true, liquidManureHookInstalled = true, palletHookInstalled = false,
            data = {
                placeable_7 = {
                    referenceSource = "effective",
                    inputs = {
                        food = { daily = 100, yearly = 36000, supported = true },
                        water = { daily = 50, yearly = 18000, supported = true },
                        straw = { daily = 0, yearly = 0, supported = false },
                    },
                    outputs = { milk = { title = "Milk", daily = 400, yearly = 146000, supported = true } },
                },
                placeable_9 = { inputs = { food = { daily = 999, yearly = 1, supported = true } } },
            },
            getDisplayScaleFactor = function(_, input) return input == "food" and 2 or 1 end,
            onAnimalsChanged = function() error("recalculated") end,
            getOrCalculatePlaceableEntry = function() error("recalculated") end,
        },
    }
`;

describe("Animal Food Calculator companion page collector", () => {
    test("is not exported when the mod is not loaded", () => {
        expect(run(`g_modIsLoaded = {} g_currentMission = {}`)).toBeUndefined();
    });

    test("scaling only is settings-only", () => {
        const page = run(`
            g_modIsLoaded = { FS25_338159_Animal_Food_Calculator = true }
            g_currentMission = { getFarmId = function() return 1 end, environment = { daysPerPeriod = 3 } }
            FS25_338159_Animal_Food_Calculator = { ${SCALING} }
        `);
        expect(page.readState).toBe("settings-only");
        expect(page.settings).toMatchObject({
            enabled: true, autoScaleByDays: true, mode: "auto", customMultiplier: 1, referenceSource: "effective",
            animalPackageRestricted: false, foodScale: 3, waterScale: 3, strawScale: 1,
        });
        expect(page.byFarm).toBeUndefined();
    });

    test("reads the mod's own per-pen cache for own-farm pens without recalculating", () => {
        const page = run(FULL_SETUP);
        expect(page.readState).toBe("ok");
        expect(page.daysPerPeriod).toBe(2);
        expect(page.hooks).toMatchObject({ food: true, water: true, straw: false, milk: true, pallets: false });
        expect(page.enhancedAnimalSystem).toBe(false);
        expect(Object.keys(page.byFarm)).toEqual(["1"]);
        const farm = page.byFarm["1"];
        expect(farm.pens.map((p) => p.name).sort()).toEqual(["Cow Barn", "Pig Barn"]);
        const cow = farm.pens.find((p) => p.name === "Cow Barn");
        expect(cow).toMatchObject({
            calculated: true, animals: 30, referenceSource: "effective",
            foodDaily: 200, foodYearly: 72000, waterDaily: 50, waterYearly: 18000,
        });
        expect(cow.strawDaily).toBeUndefined();
        expect(cow.outputTitles).toEqual(["Milk"]);
        expect(cow.outputDaily).toEqual([400]);
        expect(cow.outputYearly).toEqual([146000]);
        const pig = farm.pens.find((p) => p.name === "Pig Barn");
        expect(pig.calculated).toBe(false);
        expect(pig.foodDaily).toBeUndefined();
        expect(farm).toMatchObject({ penCount: 2, calculatedPens: 1, foodDaily: 200, waterDaily: 50, strawDaily: 0 });
    });
});
