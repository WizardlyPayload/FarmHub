"use strict";

const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");
const mod = require("../companionPages/dynamicMarket.js");

const modules = new Map([[mod.key, mod]]);
const run = (page) => normalizeCompanionPages({ pages: { dynamicMarket: { detected: true, ...page } } }, { modules }).pages.dynamicMarket;

describe("dynamicMarket merge", () => {
    test("module is auto-discovered by the lead merger", () => {
        expect(loadModules().get(mod.key)).toBeDefined();
    });

    test("groups, curves, pressure and favourites are arrays; pressure sorts strongest first", () => {
        const page = run({ groups: [{ key: "a", curve: {} }], pressure: [{ percent: 2 }, { percent: 9 }], favorites: {} });
        expect(page.groups[0].curve).toEqual([]);
        expect(page.pressure.map((p) => p.percent)).toEqual([9, 2]);
        expect(page.favorites).toEqual([]);
    });
});
