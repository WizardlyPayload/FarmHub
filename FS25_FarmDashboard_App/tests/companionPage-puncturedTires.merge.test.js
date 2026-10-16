"use strict";

const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");
const mod = require("../companionPages/puncturedTires.js");

const modules = new Map([[mod.key, mod]]);

describe("puncturedTires merge", () => {
    test("module is auto-discovered by the lead merger", () => {
        expect(loadModules().get(mod.key)).toBeDefined();
    });

    test("validates cycle periods and tyre fields, punctured then armed first", () => {
        const out = normalizeCompanionPages({
            pages: {
                puncturedTires: {
                    detected: true,
                    cycle: { count: 1, startPeriod: 3, dangerPeriod1: 13, currentPeriod: 4, dangerNow: 1 },
                    byFarm: {
                        "1": {
                            vehicles: [
                                { id: "fine", punctured: false },
                                { id: "armed", armed: true, metersToPuncture: -5 },
                                { id: "flat", punctured: true, pressurePct: 140, punctureType: 7, axle: "front", side: "up" },
                            ],
                        },
                    },
                },
            },
        }, { modules });
        const page = out.pages.puncturedTires;
        expect(page.cycle).toMatchObject({ startPeriod: 3, dangerPeriod1: undefined, currentPeriod: 4, dangerNow: false });
        const rows = page.byFarm["1"].vehicles;
        expect(rows.map((r) => r.id)).toEqual(["flat", "armed", "fine"]);
        expect(rows[0]).toMatchObject({ pressurePct: 100, punctureType: undefined, axle: "front", side: undefined });
        expect(rows[1].metersToPuncture).toBe(0);
    });

    test("a farm row without vehicles gets an empty list", () => {
        const out = normalizeCompanionPages({ pages: { puncturedTires: { detected: true, byFarm: { "1": {} } } } }, { modules });
        expect(out.pages.puncturedTires.byFarm["1"].vehicles).toEqual([]);
    });
});
