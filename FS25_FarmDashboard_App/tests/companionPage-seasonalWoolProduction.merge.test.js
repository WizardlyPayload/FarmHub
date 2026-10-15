"use strict";

const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");
const wool = require("../companionPages/seasonalWoolProduction.js");

const merge = (page) => normalizeCompanionPages(
    { enabled: true, schema: 1, pages: { seasonalWoolProduction: { detected: true, ...page } } },
    { modules: new Map([[wool.key, wool]]) },
).pages.seasonalWoolProduction;

describe("Seasonal Wool Production merge module", () => {
    test("is auto-discovered by the companion pages merger", () => {
        expect(loadModules().get("seasonalWoolProduction")).toBeDefined();
    });

    test("settings-only page gets an empty schedule, never a wool total", () => {
        const page = merge({ readState: "settings-only", settings: { shearingCostPerSheep: 5 }, totalWoolSheared: 0 });
        expect(page.shearingPeriods).toEqual([]);
        expect(page.totalWoolSheared).toBeUndefined();
        expect(page.settings.shearingCostPerSheep).toBe(5);
    });

    test("schedule is de-duplicated and sorted; bad pen numbers dropped", () => {
        const page = merge({
            readState: "ok",
            shearingPeriods: { 1: 8, 2: 2, 3: 8, 4: 14 },
            currentPeriod: 5,
            monthsUntilShearing: 3,
            settings: { shearingCostPerSheep: -2 },
            byFarm: { 1: { pens: [{ name: "Meadow", hooked: 1, rawRateLph: 2.5, pendingWoolLiters: -5, lastShearingPeriod: 20 }] } },
        });
        expect(page.shearingPeriods).toEqual([2, 8]);
        expect(page.monthsUntilShearing).toBe(3);
        expect(page.settings.shearingCostPerSheep).toBeUndefined();
        const pen = page.byFarm["1"].pens[0];
        expect(pen).toMatchObject({ name: "Meadow", hooked: false, rawRateLph: 2.5 });
        expect(pen.pendingWoolLiters).toBeUndefined();
        expect(pen.lastShearingPeriod).toBeUndefined();
    });
});
