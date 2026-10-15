"use strict";

const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");
const mod = require("../companionPages/enhancedLoanSystem.js");

const modules = new Map([[mod.key, mod]]);
const run = (page) => normalizeCompanionPages({ pages: { enhancedLoanSystem: { detected: true, ...page } } }, { modules }).pages.enhancedLoanSystem;

describe("enhancedLoanSystem merge", () => {
    test("module is auto-discovered by the lead merger", () => {
        expect(loadModules().get(mod.key)).toBeDefined();
    });

    test("empty loan tables become arrays and open loans sort by remaining balance", () => {
        const page = run({ byFarm: { "1": { loans: [{ restAmount: 10 }, { restAmount: 90 }], paidOff: {} }, "2": { loans: {} } } });
        expect(page.byFarm["1"].loans.map((l) => l.restAmount)).toEqual([90, 10]);
        expect(page.byFarm["1"].paidOff).toEqual([]);
        expect(page.byFarm["2"].loans).toEqual([]);
    });
});
