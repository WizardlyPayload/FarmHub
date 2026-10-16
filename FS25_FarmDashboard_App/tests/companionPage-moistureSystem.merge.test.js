"use strict";

const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");
const mod = require("../companionPages/moistureSystem.js");

const modules = new Map([[mod.key, mod]]);

describe("moistureSystem merge", () => {
    test("module is auto-discovered by the lead merger", () => {
        expect(loadModules().get(mod.key)).toBeDefined();
    });

    test("keeps this farm's rows, validates crops, months and bale counts", () => {
        const out = normalizeCompanionPages({
            pages: {
                moistureSystem: {
                    detected: true,
                    month: 13,
                    crops: [
                        { fillType: "WHEAT", idealMinPercent: 11, idealMaxPercent: 13, state: "soggy" },
                        { fillType: "BARLEY", idealMinPercent: 12, idealMaxPercent: 14, state: "ideal" },
                        { fillType: "BROKEN" },
                    ],
                    silos: [
                        { farmId: 1, name: "Mine", crops: {} },
                        { farmId: 2, name: "Theirs", crops: [{ fillType: "WHEAT" }] },
                    ],
                    irrigationJobs: [{ farmId: 1, farmlandId: 7 }, { farmId: 2, farmlandId: 9 }],
                    irrigationBoosts: {},
                    byFarm: { 1: { bales: { gettingWet: -2, rotting: 3 } } },
                    weather: {
                        forecast: [
                            { offset: 2, months: [{ month: 12 }] },
                            { offset: 0, months: [{ month: 6 }, { month: 0 }] },
                            { offset: 7, months: [] },
                        ],
                    },
                },
            },
        }, { modules });
        const page = out.pages.moistureSystem;
        expect(page.month).toBeUndefined();
        expect(page.crops.map((c) => [c.fillType, c.state])).toEqual([["BARLEY", "ideal"], ["WHEAT", undefined]]);
        expect(page.silos).toEqual([{ farmId: 1, name: "Mine", crops: [] }]);
        expect(page.irrigationJobs).toEqual([{ farmId: 1, farmlandId: 7 }]);
        expect(page.irrigationBoosts).toEqual([]);
        expect(page.byFarm["1"].bales).toEqual({ gettingWet: 0, drying: 0, rottingSlowly: 0, rotting: 3, rottingQuickly: 0 });
        expect(page.weather.forecast.map((s) => s.offset)).toEqual([0, 2]);
        expect(page.weather.forecast[0].months).toEqual([{ month: 6 }]);
    });

    test("settings-only page gets empty lists and no weather object", () => {
        const out = normalizeCompanionPages({
            pages: { moistureSystem: { detected: true, readState: "settings-only", pending: true, settings: { weatherProfile: "ukwest" } } },
        }, { modules });
        const page = out.pages.moistureSystem;
        expect(page.crops).toEqual([]);
        expect(page.silos).toEqual([]);
        expect(page.weather).toBeUndefined();
    });
});
