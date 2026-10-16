"use strict";

const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");
const mod = require("../companionPages/outOfFuel.js");

const modules = new Map([[mod.key, mod]]);

describe("outOfFuel merge", () => {
    test("module is auto-discovered by the lead merger", () => {
        expect(loadModules().get(mod.key)).toBeDefined();
        expect(loadModules().get(mod.key).arrays).toEqual(mod.arrays);
    });

    test("clamps fuel percents, sorts lowest first and coerces settings to booleans", () => {
        const out = normalizeCompanionPages({
            pages: {
                outOfFuel: {
                    detected: true,
                    settings: { patched: true, keepVanillaRefill: 1 },
                    byFarm: {
                        "1": {
                            topUpCost: -4,
                            vehicles: {
                                1: { id: "b", lowestPct: 55, fuels: [{ fillType: "DIESEL", pct: 55 }] },
                                2: { id: "a", lowestPct: -3, empty: true, fuels: [{ fillType: "DIESEL", pct: -3, topUpLitres: 20 }] },
                            },
                        },
                    },
                },
            },
        }, { modules });
        const page = out.pages.outOfFuel;
        const farm = page.byFarm["1"];
        expect(farm.vehicles.map((v) => v.id)).toEqual(["a", "b"]);
        expect(farm.vehicles[0]).toMatchObject({ lowestPct: 0, empty: true, belowFloor: false });
        expect(farm.vehicles[0].fuels[0]).toMatchObject({ pct: 0, topUpLitres: 20 });
        expect(farm.topUpCost).toBe(0);
        expect(page.settings).toEqual({ patched: true, keepVanillaRefill: false });
    });

    test("a farm row without vehicles gets an empty list", () => {
        const out = normalizeCompanionPages({ pages: { outOfFuel: { detected: true, byFarm: { "1": { motorizedCount: 0 } } } } }, { modules });
        expect(out.pages.outOfFuel.byFarm["1"].vehicles).toEqual([]);
    });
});
