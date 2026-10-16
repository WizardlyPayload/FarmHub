"use strict";

const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");
const mod = require("../companionPages/fluctuatingDieselPrice.js");

const modules = new Map([[mod.key, mod]]);
const run = (page) => normalizeCompanionPages({ pages: { fluctuatingDieselPrice: { detected: true, ...page } } }, { modules }).pages.fluctuatingDieselPrice;

describe("fluctuatingDieselPrice merge", () => {
    test("module is auto-discovered by the lead merger", () => {
        expect(loadModules().get(mod.key)).toBeDefined();
    });

    test("observed samples are an array", () => {
        expect(run({ observed: { count: 0, samples: {} } }).observed.samples).toEqual([]);
    });
});
