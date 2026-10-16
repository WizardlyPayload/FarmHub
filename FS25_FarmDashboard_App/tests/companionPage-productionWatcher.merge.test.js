"use strict";

const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");
const mod = require("../companionPages/productionWatcher.js");

const modules = new Map([[mod.key, mod]]);

describe("productionWatcher merge", () => {
    test("module is auto-discovered by the lead merger", () => {
        expect(loadModules().get(mod.key)).toBeDefined();
        expect(loadModules().get(mod.key).arrays).toEqual(mod.arrays);
    });

    test("coerces Lua empty tables, whitelists alerts and drops other farms' points", () => {
        const out = normalizeCompanionPages({
            enabled: true,
            pages: {
                productionWatcher: {
                    detected: true,
                    readState: "ok",
                    alertsReadable: true,
                    byFarm: { "1": { pointCount: 2 } },
                    points: [
                        { farmId: 1, name: "Mill", watched: true, inputAlert: "missing", outputAlert: "bogus",
                          storage: [{ role: "input", percent: 140 }, { role: "junk" }] },
                        { farmId: 1, name: "Idle", storage: {} },
                        { farmId: 3, name: "Neighbour", storage: [] },
                    ],
                },
            },
        }, { modules });
        const page = out.pages.productionWatcher;
        expect(page.alertsReadable).toBe(false);
        expect(page.points.map((p) => p.name)).toEqual(["Mill", "Idle"]);
        expect(page.points[0].inputAlert).toBe("missing");
        expect(page.points[0].outputAlert).toBeUndefined();
        expect(page.points[0].storage).toEqual([{ role: "input", percent: 100 }]);
        expect(page.points[1].storage).toEqual([]);
        expect(page.points[1].watched).toBe(false);
    });

    test("settings-only page gets an empty points array", () => {
        const out = normalizeCompanionPages({ pages: { productionWatcher: { detected: true, readState: "settings-only" } } }, { modules });
        expect(out.pages.productionWatcher.points).toEqual([]);
    });
});
