"use strict";

const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");
const overview = require("../companionPages/animalFoodOverview.js");

const merge = (page) => normalizeCompanionPages(
    { enabled: true, schema: 1, pages: { animalFoodOverview: { detected: true, ...page } } },
    { modules: new Map([[overview.key, overview]]) },
).pages.animalFoodOverview;

describe("Animal Food Overview merge module", () => {
    test("is auto-discovered by the companion pages merger", () => {
        expect(loadModules().get("animalFoodOverview")).toBeDefined();
    });

    test("settings-only page gets empty feed lists", () => {
        const page = merge({ readState: "settings-only", keybindAction: "ShowAnimalFoodDlg" });
        expect(page.animals).toEqual([]);
        expect(page.recipes).toEqual([]);
        expect(page.animalTypeCount).toBe(0);
    });

    test("re-joins aligned mixture arrays and coerces nested empty lists", () => {
        const page = merge({
            readState: "ok",
            animals: [{
                title: "Cows",
                consumption: "weird",
                groups: [{ title: "Base", productionWeight: 0.4, foods: {} }],
                mixtures: [{ title: "TMR", ingredientWeights: [50, 25, 10], ingredientFoods: ["Silage", "Hay"] }],
            }],
            recipes: [{ title: "TMR", ingredients: {} }],
        });
        const cows = page.animals[0];
        expect(cows.consumption).toBe("parallel");
        expect(cows.groups[0].foods).toEqual([]);
        expect(cows.mixtures).toEqual([{
            title: "TMR",
            ingredients: [{ weightPercent: 50, foods: "Silage" }, { weightPercent: 25, foods: "Hay" }],
        }]);
        expect(page.recipes[0].ingredients).toEqual([]);
        expect(page.animalTypeCount).toBe(1);
    });
});
