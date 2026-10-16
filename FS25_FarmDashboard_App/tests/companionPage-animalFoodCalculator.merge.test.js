"use strict";

const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");
const calculator = require("../companionPages/animalFoodCalculator.js");

const merge = (page) => normalizeCompanionPages(
    { enabled: true, schema: 1, pages: { animalFoodCalculator: { detected: true, ...page } } },
    { modules: new Map([[calculator.key, calculator]]) },
).pages.animalFoodCalculator;

describe("Animal Food Calculator merge module", () => {
    test("is auto-discovered by the companion pages merger", () => {
        expect(loadModules().get("animalFoodCalculator")).toBeDefined();
    });

    test("settings-only page keeps settings and gets empty hooks", () => {
        const page = merge({ readState: "settings-only", settings: { mode: "auto", foodScale: 2, strawScale: -1 } });
        expect(page.settings).toEqual({ mode: "auto", foodScale: 2 });
        expect(page.hooks).toEqual({});
    });

    test("re-joins per-pen outputs; uncalculated pens carry no amounts", () => {
        const page = merge({
            readState: "ok",
            byFarm: {
                1: {
                    pens: [
                        {
                            name: "Cow Barn", calculated: true, foodDaily: 200, waterDaily: -1,
                            outputTitles: ["Milk", "Manure"], outputDaily: [400, 30], outputYearly: [146000],
                        },
                        { name: "Pig Barn", calculated: false, outputTitles: ["x"], outputDaily: [1], outputYearly: [1] },
                    ],
                },
                2: { pens: {} },
            },
        });
        const [cow, pig] = page.byFarm["1"].pens;
        expect(cow.foodDaily).toBe(200);
        expect(cow.waterDaily).toBeUndefined();
        expect(cow.outputs).toEqual([{ title: "Milk", daily: 400, yearly: 146000 }]);
        expect(cow.outputTitles).toBeUndefined();
        expect(pig.outputs).toEqual([]);
        expect(page.byFarm["2"].pens).toEqual([]);
    });
});
