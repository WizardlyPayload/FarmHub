"use strict";

const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");
const mod = require("../companionPages/collisionDamage.js");

const modules = new Map([[mod.key, mod]]);

describe("collisionDamage merge", () => {
    test("module is auto-discovered by the lead merger", () => {
        expect(loadModules().get(mod.key)).toBeDefined();
    });

    test("puts recent hits first and drops hit times for unhit machines", () => {
        const out = normalizeCompanionPages({
            pages: {
                collisionDamage: {
                    detected: true,
                    settings: { multiplierPct: -20, counterpartDamage: "yes" },
                    byFarm: {
                        "1": {
                            machines: [
                                { id: "clean", damagePct: 80, hitThisSession: false, lastHitMinutesAgo: 3 },
                                { id: "old", damagePct: 10, hitThisSession: true, lastHitMinutesAgo: 40 },
                                { id: "fresh", damagePct: 5, hitThisSession: true, lastHitMinutesAgo: 2 },
                            ],
                        },
                    },
                },
            },
        }, { modules });
        const page = out.pages.collisionDamage;
        const farm = page.byFarm["1"];
        expect(farm.machines.map((m) => m.id)).toEqual(["fresh", "old", "clean"]);
        expect(farm.machines[2].lastHitMinutesAgo).toBeUndefined();
        expect(page.settings).toMatchObject({ multiplierPct: 0, counterpartDamage: false });
    });

    test("a farm row without machines gets an empty list", () => {
        const out = normalizeCompanionPages({ pages: { collisionDamage: { detected: true, byFarm: { "1": {} } } } }, { modules });
        expect(out.pages.collisionDamage.byFarm["1"].machines).toEqual([]);
    });
});
