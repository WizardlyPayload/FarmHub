"use strict";

const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");
const mod = require("../companionPages/bushelPlus.js");

const modules = new Map([[mod.key, mod]]);

describe("bushelPlus merge", () => {
    test("module is auto-discovered by the lead merger", () => {
        expect(loadModules().get(mod.key)).toBeDefined();
    });

    test("keeps this farm's rows and puts fitted combines first", () => {
        const out = normalizeCompanionPages({
            pages: {
                bushelPlus: {
                    detected: true,
                    byFarm: { 1: { unitCount: 1 } },
                    units: [{ farmId: 1, name: "Unit", onCombine: 1 }, { farmId: 2, name: "Other" }, { farmId: 1 }],
                    combines: [
                        { farmId: 1, name: "B combine", equipped: false },
                        { farmId: 1, name: "A combine" },
                        { farmId: 1, name: "Z combine", equipped: true },
                    ],
                },
            },
        }, { modules });
        const page = out.pages.bushelPlus;
        expect(page.units).toEqual([{ farmId: 1, name: "Unit", onCombine: false, attached: false }]);
        expect(page.combines.map((c) => [c.name, c.equipped])).toEqual([["Z combine", true], ["A combine", false], ["B combine", false]]);
    });

    test("empty tables become empty lists", () => {
        const out = normalizeCompanionPages({ pages: { bushelPlus: { detected: true, units: {}, byFarm: { 1: {} } } } }, { modules });
        expect(out.pages.bushelPlus.units).toEqual([]);
        expect(out.pages.bushelPlus.combines).toEqual([]);
    });
});
