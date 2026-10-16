"use strict";

const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");
const mod = require("../companionPages/realisticDieselPrice.js");

const modules = new Map([[mod.key, mod]]);
const run = (page) => normalizeCompanionPages({ pages: { realisticDieselPrice: { detected: true, ...page } } }, { modules }).pages.realisticDieselPrice;

describe("realisticDieselPrice merge", () => {
    test("module is auto-discovered by the lead merger", () => {
        expect(loadModules().get(mod.key)).toBeDefined();
    });

    test("regions and their countries are arrays", () => {
        const page = run({ regions: [{ name: "Europe", countries: {} }, { name: "Asia", countries: { 1: { label: "Japan" } } }] });
        expect(page.regions[0].countries).toEqual([]);
        expect(page.regions[1].countries).toEqual([{ label: "Japan" }]);
        expect(run({}).regions).toEqual([]);
    });
});
