"use strict";

const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");
const mod = require("../companionPages/betterContracts.js");

const modules = new Map([[mod.key, mod]]);
const run = (page) => normalizeCompanionPages({ pages: { betterContracts: { detected: true, ...page } } }, { modules }).pages.betterContracts;

describe("betterContracts merge", () => {
    test("module is auto-discovered by the lead merger", () => {
        expect(loadModules().get(mod.key)).toBeDefined();
    });

    test("offer lists and per-farm contract lists are arrays", () => {
        const page = run({ offers: { count: 0, best: {}, byType: {} }, byFarm: { "1": { active: {}, npcJobs: {} } } });
        expect(page.offers.best).toEqual([]);
        expect(page.offers.byType).toEqual([]);
        expect(page.byFarm["1"]).toMatchObject({ active: [], npcJobs: [] });
    });
});
