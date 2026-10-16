"use strict";

const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");
const losses = require("../companionPages/realisticAnimalLosses.js");

const merge = (page) => normalizeCompanionPages(
    { enabled: true, schema: 1, pages: { realisticAnimalLosses: { detected: true, ...page } } },
    { modules: new Map([[losses.key, losses]]) },
).pages.realisticAnimalLosses;

describe("Realistic Animal Losses merge module", () => {
    test("is auto-discovered by the companion pages merger", () => {
        expect(loadModules().get("realisticAnimalLosses")).toBeDefined();
    });

    test("detection-only page still gets empty rules and settings objects", () => {
        const page = merge({ readState: "detection-only" });
        expect(page.rules).toEqual({ riskAges: [] });
        expect(page.settings).toEqual({});
    });

    test("percentages clamp to 0-100 and empty lists become arrays", () => {
        const page = merge({
            readState: "ok",
            settings: { foodEffectivityThreshold: 140 },
            rules: { riskAges: { 1: { animalType: "COW", months: 50 }, 2: { animalType: 3 } }, waterLossRatePercent: 15 },
            byFarm: {
                1: {
                    pens: [{ name: "Barn", careRiskPercentPerCheck: 250, foodEffectivity: -4, oldAnimals: -1, noWater: "yes" }],
                },
                2: { pens: {} },
            },
        });
        expect(page.settings.foodEffectivityThreshold).toBe(100);
        expect(page.rules.riskAges).toEqual([{ animalType: "COW", months: 50 }]);
        expect(page.rules.waterLossRatePercent).toBe(15);
        const pen = page.byFarm["1"].pens[0];
        expect(pen).toMatchObject({ careRiskPercentPerCheck: 100, foodEffectivity: 0, noWater: false, belowThreshold: false });
        expect(pen.oldAnimals).toBeUndefined();
        expect(page.byFarm["2"].pens).toEqual([]);
    });
});
