"use strict";

const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");
const mod = require("../companionPages/britishFillUnits.js");

const modules = new Map([[mod.key, mod]]);

describe("britishFillUnits merge", () => {
    test("module is auto-discovered by the lead merger", () => {
        expect(loadModules().get(mod.key)).toBeDefined();
    });

    test("keeps known hooks, validates samples and catalog counts", () => {
        const out = normalizeCompanionPages({
            pages: {
                britishFillUnits: {
                    detected: true,
                    hooks: { storeCapacity: true, quantityHud: 1, junk: true },
                    samples: [
                        { fillType: "WHEAT", tonnesPer1000L: 0.79, shownAs: "mass" },
                        { fillType: "DIESEL", tonnesPer1000L: -1, shownAs: "gallons" },
                        { title: "no type" },
                    ],
                    catalog: { mass: 40, litres: -2 },
                },
            },
        }, { modules });
        const page = out.pages.britishFillUnits;
        expect(page.hooks).toEqual({ storeCapacity: true, quantityHud: false, pricesFrame: false, priceMoney: false, textFormatting: false });
        expect(page.samples).toHaveLength(2);
        expect(page.samples[1]).toMatchObject({ fillType: "DIESEL", tonnesPer1000L: undefined, shownAs: undefined });
        expect(page.catalog).toMatchObject({ mass: 40, litres: 0, length: 0 });
    });

    test("missing samples become an empty list", () => {
        const out = normalizeCompanionPages({ pages: { britishFillUnits: { detected: true } } }, { modules });
        expect(out.pages.britishFillUnits.samples).toEqual([]);
    });
});
