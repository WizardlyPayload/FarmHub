"use strict";

const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");
const mod = require("../companionPages/smartCropControl.js");

const modules = new Map([[mod.key, mod]]);

describe("smartCropControl merge", () => {
    test("module is auto-discovered by the lead merger", () => {
        expect(loadModules().get(mod.key)).toBeDefined();
    });

    test("clamps chances, orders bands and drops unknown rows", () => {
        const out = normalizeCompanionPages({
            pages: {
                smartCropControl: {
                    detected: true,
                    chances: { root: [0, 40.4, 180, -5, 0], vegetable: { 1: 15, 2: 65, 3: 30, 4: 0, 5: 0 } },
                    bands: [
                        { band: "30_plus", fields: 1, growing: { root: 1 } },
                        { band: "0_3", fields: 2, growing: { root: -1, vegetable: 2 }, planned: {} },
                        { band: "huge", fields: 9 },
                    ],
                    fields: [
                        { band: "0_3", category: "root", crop: "POTATO" },
                        { band: "0_3", category: "grain", crop: "WHEAT" },
                    ],
                    crops: { root: [{ crop: "POTATO", onMap: true }, { onMap: true }], vegetable: {} },
                },
            },
        }, { modules });
        const page = out.pages.smartCropControl;
        expect(page.chances).toEqual({
            root: [0, 40, 100, 0, 0],
            vegetable: [15, 65, 30, 0, 0],
            special: [null, null, null, null, null],
        });
        expect(page.bands.map((b) => b.band)).toEqual(["0_3", "30_plus"]);
        expect(page.bands[0].growing).toEqual({ root: 0, vegetable: 2, special: 0 });
        expect(page.bands[1].planned).toEqual({ root: 0, vegetable: 0, special: 0 });
        expect(page.fields).toEqual([{ band: "0_3", category: "root", crop: "POTATO" }]);
        expect(page.crops.root).toEqual([{ crop: "POTATO", onMap: true }]);
        expect(page.crops.vegetable).toEqual([]);
        expect(page.crops.special).toEqual([]);
    });

    test("settings-only page keeps the grid and gets empty lists", () => {
        const out = normalizeCompanionPages({
            pages: { smartCropControl: { detected: true, readState: "settings-only", chances: { special: [0, 0, 20, 30, 0] } } },
        }, { modules });
        const page = out.pages.smartCropControl;
        expect(page.chances.special).toEqual([0, 0, 20, 30, 0]);
        expect(page.bands).toEqual([]);
        expect(page.fields).toEqual([]);
        expect(page.crops).toBeUndefined();
    });
});
