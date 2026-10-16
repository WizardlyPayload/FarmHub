"use strict";

const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");
const milk = require("../companionPages/seasonalMilkProduction.js");

const merge = (page) => normalizeCompanionPages(
    { enabled: true, schema: 1, pages: { seasonalMilkProduction: { detected: true, ...page } } },
    { modules: new Map([[milk.key, milk]]) },
).pages.seasonalMilkProduction;

describe("Seasonal Milk Production merge module", () => {
    test("is auto-discovered by the companion pages merger", () => {
        expect(loadModules().get("seasonalMilkProduction")).toBeDefined();
    });

    test("Lua empty tables become arrays and bad months are dropped", () => {
        const page = merge({
            readState: "ok",
            monthlyPercent: [1, 2, 3],
            basePatternPercent: {},
            currentPeriod: 13,
            nextPeakPeriod: 0,
            hemisphere: "east",
            byFarm: { 1: { pens: {}, penCount: 0 } },
        });
        expect(page.monthlyPercent).toBeUndefined();
        expect(page.basePatternPercent).toBeUndefined();
        expect(page.currentPeriod).toBeUndefined();
        expect(page.nextPeakPeriod).toBeUndefined();
        expect(page.hemisphere).toBeUndefined();
        expect(page.byFarm["1"].pens).toEqual([]);
        expect(page.settings).toEqual({});
    });

    test("keeps a valid curve, recomputes the current percent and cleans pen rows", () => {
        const curve = [91, 61, 20, 10, 10, 203, 203, 173, 132, 132, 51, 112];
        const page = merge({
            readState: "ok",
            monthlyPercent: curve,
            currentPeriod: 6,
            currentPercent: 1,
            hemisphere: "north",
            byFarm: {
                1: {
                    pens: [
                        { name: "Cow Barn", kind: "milk", baselineLph: 40, currentLph: 50, appliedRatio: 1.25, fillTypes: {} },
                        { name: "Weird", kind: "robot", baselineLph: -1, avgHealth: "x" },
                    ],
                },
            },
        });
        expect(page.monthlyPercent).toEqual(curve);
        expect(page.currentPercent).toBe(203);
        const [cow, weird] = page.byFarm["1"].pens;
        expect(cow).toMatchObject({ kind: "milk", baselineLph: 40, currentLph: 50, baselineCaptured: false, fillTypes: [] });
        expect(weird.kind).toBe("milk");
        expect(weird.baselineLph).toBeUndefined();
        expect(weird.avgHealth).toBeUndefined();
    });
});
