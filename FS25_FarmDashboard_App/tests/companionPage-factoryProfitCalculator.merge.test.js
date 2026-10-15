"use strict";

const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");
const mod = require("../companionPages/factoryProfitCalculator.js");

const modules = new Map([[mod.key, mod]]);

describe("factoryProfitCalculator merge", () => {
    test("module is auto-discovered by the lead merger", () => {
        expect(loadModules().get(mod.key)).toBeDefined();
        expect(loadModules().get(mod.key).arrays).toEqual(mod.arrays);
    });

    test("coerces line lists, whitelists price sources and drops other farms", () => {
        const out = normalizeCompanionPages({
            pages: {
                factoryProfitCalculator: {
                    detected: true,
                    byFarm: { "1": { lineCount: 1 } },
                    lines: [
                        { farmId: 1, recipe: "Flour", running: true, inputs: [{ fillType: "WHEAT", priceSource: "purchase" }], outputs: {} },
                        { farmId: 1, recipe: "Odd", inputs: [{ priceSource: "guess" }], outputs: [] },
                        { farmId: 4, recipe: "Other", inputs: [], outputs: [] },
                    ],
                    overrides: {},
                },
            },
        }, { modules });
        const page = out.pages.factoryProfitCalculator;
        expect(page.lines.map((l) => l.recipe)).toEqual(["Flour", "Odd"]);
        expect(page.lines[0].outputs).toEqual([]);
        expect(page.lines[1].inputs[0].priceSource).toBeUndefined();
        expect(page.lines[1].running).toBe(false);
        expect(page.overrides).toEqual([]);
    });
});
