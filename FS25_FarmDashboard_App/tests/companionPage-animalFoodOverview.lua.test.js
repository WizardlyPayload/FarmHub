"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");

function runPage(collectorFile, key, setup) {
    return runCompanionPage(collectorFile, setup, { key });
}

const run = (setup) => runPage("AnimalFoodOverviewCollector.lua", "animalFoodOverview", setup);

const FULL_SETUP = `
    local fillTypes = {
        [1] = { name = "GRASS_WINDROW", title = "Grass" },
        [2] = { name = "SILAGE", title = "Silage" },
        [3] = { name = "SLIDER_1", title = "Slider" },
        [4] = { name = "FORAGE", title = "TMR" },
        [5] = { name = "HAY", title = "Hay" },
        [6] = { name = "PIGFOOD", title = "Pig Food" },
    }
    g_fillTypeManager = { getFillTypeByIndex = function(_, i) return fillTypes[i] end }
    local types = { [1] = { name = "COW", groupTitle = "Cows" }, [2] = { name = "PIG", groupTitle = "Pigs" } }
    g_currentMission = {
        getFarmId = function() return 1 end,
        animalSystem = { getTypeByIndex = function(_, i) return types[i] end },
        animalFoodSystem = {
            animalFood = {
                { animalTypeIndex = 1, consumptionType = 2, groups = {
                    { title = "Base", productionWeight = 0.4, eatWeight = 0.5, fillTypes = { 1, 5, 3 } },
                    { title = "Mixed ration", productionWeight = 1, eatWeight = 1, fillTypes = { 4 } },
                } },
                { animalTypeIndex = 2, consumptionType = 1, groups = {
                    { title = "Pig food", productionWeight = 1, eatWeight = 1, fillTypes = { 6 } },
                } },
            },
            animalMixtures = { [1] = { 4 } },
            mixtureFillTypeIndexToMixture = { [4] = { ingredients = {
                { weight = 0.5, fillTypes = { 2 } },
                { weight = 0, fillTypes = { 5 } },
                { weight = 0.25, fillTypes = { 5 } },
            } } },
            recipes = { { fillType = 4, ingredients = {
                { name = "silage", title = "Silage", minPercentage = 0.5, maxPercentage = 0.75 },
            } } },
        },
    }
    g_modIsLoaded = { FS25_AnimalFoodOverview = true }
    FS25_AnimalFoodOverview = { AnimalFoodOverview = { ShowAnimalFoodDlg = function() error("dialog opened") end } }
`;

describe("Animal Food Overview companion page collector", () => {
    test("is not exported when the mod is not loaded", () => {
        expect(run(`g_modIsLoaded = {} g_currentMission = {}`)).toBeUndefined();
    });

    test("without a feed system it reports what the mod is, not numbers", () => {
        const page = run(`
            g_modIsLoaded = { FS25_309457_Animal_Food_Overview = true }
            g_currentMission = {}
            FS25_309457_Animal_Food_Overview = { AnimalFoodOverview = {} }
        `);
        expect(page.readState).toBe("settings-only");
        expect(page.modStateReadable).toBe(true);
        expect(page.keybindAction).toBe("ShowAnimalFoodDlg");
        expect(page.animals).toBeUndefined();
    });

    test("exports the game's feed table the mod lists, without opening its dialog", () => {
        const page = run(FULL_SETUP);
        expect(page.readState).toBe("ok");
        expect(page.source).toBe("animalFoodSystem");
        expect(page.animalTypeCount).toBe(2);
        expect(page.animals.map((a) => a.title)).toEqual(["Cows", "Pigs"]);
        const cows = page.animals[0];
        expect(cows.consumption).toBe("parallel");
        expect(cows.groups[0]).toEqual({ title: "Mixed ration", productionWeight: 1, eatWeight: 1, foods: ["TMR"] });
        expect(cows.groups[1].foods).toEqual(["Grass", "Hay"]);
        expect(cows.mixtures).toEqual([{ title: "TMR", ingredientWeights: [50, 25], ingredientFoods: ["Silage", "Hay"] }]);
        expect(page.animals[1].consumption).toBe("sequential");
        expect(page.recipes).toEqual([{ title: "TMR", ingredients: [{ title: "Silage", minPercent: 50, maxPercent: 75 }] }]);
    });
});
