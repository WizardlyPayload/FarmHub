"use strict";

const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");
const mod = require("../companionPages/realSilo.js");

const modules = new Map([[mod.key, mod]]);

describe("realSilo merge", () => {
    test("module is auto-discovered by the lead merger", () => {
        expect(loadModules().get(mod.key)).toBeDefined();
        expect(loadModules().get(mod.key).arrays).toEqual(mod.arrays);
    });

    test("keeps the farm's silos, sorts slots and coerces empty tables", () => {
        const out = normalizeCompanionPages({
            pages: {
                realSilo: {
                    detected: true,
                    byFarm: { "1": { siloCount: 1, byFillType: {} } },
                    silos: [
                        { farmId: 1, id: "rs_1", configured: true, slots: [
                            { index: 2, fillLevel: 10, capacity: 100 },
                            { index: 1, fillLevel: -3, isActive: 1 },
                        ] },
                        { farmId: 1, id: "rs_2", slots: {} },
                        { farmId: 2, id: "rs_x", slots: [] },
                    ],
                },
            },
        }, { modules });
        const page = out.pages.realSilo;
        expect(page.silos.map((s) => s.id)).toEqual(["rs_1", "rs_2"]);
        expect(page.silos[0].slots.map((s) => s.index)).toEqual([1, 2]);
        expect(page.silos[0].slots[0]).toMatchObject({ fillLevel: 0, capacity: 0, isActive: false, isExtension: false });
        expect(page.silos[1]).toMatchObject({ configured: false, slots: [] });
        expect(page.byFarm["1"].byFillType).toEqual([]);
    });
});
