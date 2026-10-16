"use strict";

const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");
const mod = require("../companionPages/advancedMaintenance.js");

const modules = new Map([[mod.key, mod]]);

describe("advancedMaintenance merge", () => {
    test("module is auto-discovered by the lead merger", () => {
        expect(loadModules().get(mod.key)).toBeDefined();
    });

    test("clamps damage, validates zone and odds, sorts worst first", () => {
        const out = normalizeCompanionPages({
            pages: {
                advancedMaintenance: {
                    detected: true,
                    byFarm: {
                        "1": {
                            averageDamagePct: 140,
                            machines: [
                                { id: "ok", damagePct: 5, zone: "ok", oddsPerCheck: 12 },
                                { id: "bad", damagePct: 130, zone: "melted", oddsPerCheck: 450.7, aiActive: 1 },
                            ],
                        },
                    },
                },
            },
        }, { modules });
        const farm = out.pages.advancedMaintenance.byFarm["1"];
        expect(farm.machines.map((m) => m.id)).toEqual(["bad", "ok"]);
        expect(farm.machines[0]).toMatchObject({ damagePct: 100, zone: "ok", oddsPerCheck: 450, aiActive: false });
        expect(farm.machines[1].oddsPerCheck).toBeUndefined();
        expect(farm.averageDamagePct).toBe(100);
    });

    test("a farm row without machines gets an empty list", () => {
        const out = normalizeCompanionPages({ pages: { advancedMaintenance: { detected: true, byFarm: { "1": {} } } } }, { modules });
        expect(out.pages.advancedMaintenance.byFarm["1"].machines).toEqual([]);
    });
});
