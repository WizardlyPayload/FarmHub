"use strict";

const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");
const mod = require("../companionPages/timeSavingStockCheck.js");

const modules = new Map([[mod.key, mod]]);

describe("timeSavingStockCheck merge", () => {
    test("module is auto-discovered by the lead merger", () => {
        expect(loadModules().get(mod.key)).toBeDefined();
        expect(loadModules().get(mod.key).arrays).toEqual(mod.arrays);
    });

    test("coerces items, validates guide and period values", () => {
        const out = normalizeCompanionPages({
            pages: {
                timeSavingStockCheck: {
                    detected: true,
                    currentPeriod: 14,
                    byFarm: {
                        "1": { items: [
                            { fillType: "WHEAT", guide: "great", bestPeriod: 3, greatDemand: true },
                            { fillType: "OAT", guide: "amazing", bestPeriod: 0 },
                        ] },
                        "2": { items: {} },
                    },
                },
            },
        }, { modules });
        const page = out.pages.timeSavingStockCheck;
        expect(page.currentPeriod).toBeUndefined();
        expect(page.byFarm["1"].items[0]).toMatchObject({ guide: "great", bestPeriod: 3, greatDemand: true, noSellPoint: false });
        expect(page.byFarm["1"].items[1].guide).toBeUndefined();
        expect(page.byFarm["1"].items[1].bestPeriod).toBeUndefined();
        expect(page.byFarm["2"].items).toEqual([]);
    });
});
