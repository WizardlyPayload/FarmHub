"use strict";

const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");
const mod = require("../companionPages/palletDegradation.js");

const modules = new Map([[mod.key, mod]]);

describe("palletDegradation merge", () => {
    test("module is auto-discovered by the lead merger", () => {
        expect(loadModules().get(mod.key)).toBeDefined();
        expect(loadModules().get(mod.key).arrays).toEqual(mod.arrays);
    });

    test("clamps pallet numbers, sorts worst-first and coerces empty lists", () => {
        const out = normalizeCompanionPages({
            pages: {
                palletDegradation: {
                    detected: true,
                    settings: { recoveryRate: 0.005, junk: "x" },
                    byFarm: {
                        "1": {
                            avgCondition: 120,
                            pallets: [
                                { id: "b", condition: 90, saleAdjust: 3 },
                                { id: "a", condition: -5, wear: 150, outside: 1 },
                            ],
                            byFillType: {},
                        },
                    },
                },
            },
        }, { modules });
        const page = out.pages.palletDegradation;
        const farm = page.byFarm["1"];
        expect(farm.pallets.map((p) => p.id)).toEqual(["a", "b"]);
        expect(farm.pallets[0]).toMatchObject({ condition: 0, wear: 100, outside: false, tracked: false });
        expect(farm.pallets[1].saleAdjust).toBe(1);
        expect(farm.byFillType).toEqual([]);
        expect(farm.avgCondition).toBe(100);
        expect(page.settings).toEqual({ recoveryRate: 0.005 });
    });

    test("a farm row without lists gets empty arrays", () => {
        const out = normalizeCompanionPages({ pages: { palletDegradation: { detected: true, byFarm: { "1": { palletCount: 0 } } } } }, { modules });
        expect(out.pages.palletDegradation.byFarm["1"]).toMatchObject({ pallets: [], byFillType: [] });
    });
});
