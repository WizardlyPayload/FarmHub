"use strict";

const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");
const mod = require("../companionPages/iNeedALoan.js");

const modules = new Map([[mod.key, mod]]);
const run = (page) => normalizeCompanionPages({ pages: { iNeedALoan: { detected: true, ...page } } }, { modules }).pages.iNeedALoan;

describe("iNeedALoan merge", () => {
    test("module is auto-discovered by the lead merger", () => {
        expect(loadModules().get(mod.key)).toBeDefined();
    });

    test("popup toggles are an array even when the mod has none", () => {
        expect(run({ popups: {} }).popups).toEqual([]);
        expect(run({ popups: { 1: { key: "a", enabled: true } } }).popups).toEqual([{ key: "a", enabled: true }]);
    });
});
