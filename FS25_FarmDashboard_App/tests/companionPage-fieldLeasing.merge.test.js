"use strict";

const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");
const mod = require("../companionPages/fieldLeasing.js");

const modules = new Map([[mod.key, mod]]);

describe("fieldLeasing merge", () => {
    test("module is auto-discovered by the lead merger", () => {
        expect(loadModules().get(mod.key)).toBeDefined();
        expect(loadModules().get(mod.key).arrays).toEqual(mod.arrays);
    });

    test("keeps this farm's leases sorted, clamps periods and coerces empty tables", () => {
        const out = normalizeCompanionPages({
            pages: {
                fieldLeasing: {
                    detected: true,
                    byFarm: { "1": { leaseCount: 2, finance: { today: -5, recentDays: {} } } },
                    leases: [
                        { farmId: 1, farmlandId: 30, periodsPaid: -1, canEnd: 1 },
                        { farmId: 1, farmlandId: 12, periodsPaid: 8, periodsUntilEnd: 0, canEnd: true },
                        { farmId: 2, farmlandId: 40 },
                    ],
                },
            },
        }, { modules });
        const page = out.pages.fieldLeasing;
        expect(page.leases.map((l) => l.farmlandId)).toEqual([12, 30]);
        expect(page.leases[1]).toMatchObject({ periodsPaid: 0, periodsUntilEnd: 0 });
        expect(page.leases[1].canEnd).toBeUndefined();
        expect(page.byFarm["1"].finance.recentDays).toEqual([]);
    });

    test("settings-only page gets an empty lease list", () => {
        const out = normalizeCompanionPages({
            pages: { fieldLeasing: { detected: true, readState: "settings-only", settings: { minDurationPeriods: 6 } } },
        }, { modules });
        expect(out.pages.fieldLeasing.leases).toEqual([]);
    });
});
