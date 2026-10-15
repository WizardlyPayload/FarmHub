"use strict";

const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");
const mod = require("../companionPages/automaticLoanRepay.js");

const modules = new Map([[mod.key, mod]]);
const run = (page) => normalizeCompanionPages({ pages: { automaticLoanRepay: { detected: true, ...page } } }, { modules }).pages.automaticLoanRepay;

describe("automaticLoanRepay merge", () => {
    test("module is auto-discovered by the lead merger", () => {
        expect(loadModules().get(mod.key)).toBeDefined();
    });

    test("minimum balance options are an array; a missing settings block stays missing", () => {
        expect(run({ settings: { minimumBalanceOptions: {} } }).settings.minimumBalanceOptions).toEqual([]);
        expect(run({ readState: "detection-only" }).settings).toBeUndefined();
    });
});
