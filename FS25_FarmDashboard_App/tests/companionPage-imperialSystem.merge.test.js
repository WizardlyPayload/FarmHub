"use strict";

const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");
const mod = require("../companionPages/imperialSystem.js");

const modules = new Map([[mod.key, mod]]);

describe("imperialSystem merge", () => {
    test("module is auto-discovered by the lead merger", () => {
        expect(loadModules().get(mod.key)).toBeDefined();
    });

    test("keeps only valid unit choices and positive factors", () => {
        const out = normalizeCompanionPages({
            pages: {
                imperialSystem: {
                    detected: true,
                    settings: { liquid: "gallons", crops: "bushels", weight: "imperial", weightScale: "tons", junk: "x" },
                    factors: { litersPerGallon: 3.785411784, kgPerPound: 0, metersPerFoot: "0.3" },
                    bushelCrops: ["WHEAT", 4, "BARLEY"],
                },
            },
        }, { modules });
        const page = out.pages.imperialSystem;
        expect(page.settings).toEqual({ liquid: "gallons", weight: "imperial", weightScale: "tons" });
        expect(page.factors).toEqual({ litersPerGallon: 3.785411784 });
        expect(page.bushelCrops).toEqual(["BARLEY", "WHEAT"]);
    });

    test("missing crop list becomes an empty array", () => {
        const out = normalizeCompanionPages({ pages: { imperialSystem: { detected: true } } }, { modules });
        expect(out.pages.imperialSystem.bushelCrops).toEqual([]);
    });
});
