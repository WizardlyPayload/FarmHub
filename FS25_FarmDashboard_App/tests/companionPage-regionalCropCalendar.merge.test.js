"use strict";

const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");
const mod = require("../companionPages/regionalCropCalendar.js");

const modules = new Map([[mod.key, mod]]);

describe("regionalCropCalendar merge", () => {
    test("module is auto-discovered by the lead merger", () => {
        expect(loadModules().get(mod.key)).toBeDefined();
        expect(loadModules().get(mod.key).arrays).toEqual(mod.arrays);
    });

    test("cleans crop rows, period lists and region lists", () => {
        const out = normalizeCompanionPages({
            pages: {
                regionalCropCalendar: {
                    detected: true,
                    calendarState: "ok",
                    blockedCrops: {},
                    crops: [
                        { crop: "WHEAT", plantingPeriods: [8, 7, 7, 13, 0.5], harvestPeriods: {}, complete: true, source: "region" },
                        { crop: "WHEAT", plantingPeriods: [1], complete: true },
                        { crop: "BARLEY", plantingPeriods: [9], harvestPeriods: [5], complete: 1, source: "map-calendar" },
                        { crop: "" },
                    ],
                    region: {
                        climate: "maritime",
                        signatureCrops: {},
                        unsuitableCrops: ["COTTON", 3],
                        seasons: [{ season: 1, temperatureOffset: -1 }, { season: 9 }],
                        economy: [{ fillType: "WHEAT", priceScale: 1.05 }, { priceScale: 2 }],
                    },
                },
            },
        }, { modules });
        const page = out.pages.regionalCropCalendar;
        expect(page.crops).toEqual([
            { crop: "BARLEY", plantingPeriods: [9], harvestPeriods: [5], complete: false, source: "map-calendar" },
            { crop: "WHEAT", plantingPeriods: [7, 8], harvestPeriods: [], complete: true, source: "region" },
        ]);
        expect(page.blockedCrops).toEqual([]);
        expect(page.region.signatureCrops).toEqual([]);
        expect(page.region.unsuitableCrops).toEqual(["COTTON"]);
        expect(page.region.seasons).toHaveLength(1);
        expect(page.region.economy).toEqual([{ fillType: "WHEAT", priceScale: 1.05 }]);
    });

    test("unknown calendar state falls back to unavailable; missing region stays missing", () => {
        const out = normalizeCompanionPages({
            pages: { regionalCropCalendar: { detected: true, readState: "settings-only", calendarState: "weird" } },
        }, { modules });
        const page = out.pages.regionalCropCalendar;
        expect(page.calendarState).toBe("unavailable");
        expect(page.crops).toEqual([]);
        expect(page.region).toBeUndefined();
    });
});
