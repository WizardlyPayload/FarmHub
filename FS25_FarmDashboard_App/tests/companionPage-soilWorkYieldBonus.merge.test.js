"use strict";

const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");
const mod = require("../companionPages/soilWorkYieldBonus.js");

const modules = new Map([[mod.key, mod]]);

describe("soilWorkYieldBonus merge", () => {
    test("module is auto-discovered by the lead merger", () => {
        expect(loadModules().get(mod.key)).toBeDefined();
        expect(loadModules().get(mod.key).arrays).toEqual(mod.arrays);
    });

    test("sorts tiers, filters tool names and coerces empty tables", () => {
        const out = normalizeCompanionPages({
            pages: {
                soilWorkYieldBonus: {
                    detected: true,
                    coverage: "truncated",
                    settings: { enabled: true, tools: [{ tool: "plow", bonus: 0.12 }, { tool: "laser", bonus: 1 }] },
                    tiers: [
                        { bonus: 0.04, cells: 3, areaHa: 0.01, tools: ["discHarrow", "hoe"] },
                        { bonus: 0.12, cells: -1, areaHa: 0.02, tools: {} },
                        { bonus: 0, cells: 5 },
                    ],
                },
            },
        }, { modules });
        const page = out.pages.soilWorkYieldBonus;
        expect(page.tiers).toEqual([
            { bonus: 0.12, cells: 0, areaHa: 0.02, tools: [] },
            { bonus: 0.04, cells: 3, areaHa: 0.01, tools: ["discHarrow"] },
        ]);
        expect(page.settings.tools).toEqual([{ tool: "plow", bonus: 0.12 }]);
        expect(page.coverage).toBe("sampled");
    });

    test("settings-only page gets an empty tier list", () => {
        const out = normalizeCompanionPages({
            pages: { soilWorkYieldBonus: { detected: true, readState: "settings-only", settings: { enabled: false, tools: {} } } },
        }, { modules });
        expect(out.pages.soilWorkYieldBonus.tiers).toEqual([]);
        expect(out.pages.soilWorkYieldBonus.settings.tools).toEqual([]);
    });
});
