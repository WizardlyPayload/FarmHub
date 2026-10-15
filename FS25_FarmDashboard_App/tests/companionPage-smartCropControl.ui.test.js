/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");

const ENTRY = { catalogId: "smartCropControl", title: "Smart Crop Control", group: "fields" };

function payload(page) {
    return {
        companionMods: { mods: [{ id: "smartCropControl", detected: true, version: "1.2.0.0" }] },
        companionPages: page ? { pages: { smartCropControl: { key: "smartCropControl", detected: true, ...page } } } : { pages: {} },
    };
}

const zero = { root: 0, vegetable: 0, special: 0 };

describe("smartCropControl page", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    test("renders the chance grid, size table, crop chips and field list", () => {
        const ui = loadCompanionPage("smartCropControl", ENTRY);
        const host = ui.renderPage(
            payload({
                readState: "ok",
                debug: false,
                chances: { root: [0, 40, 80, 30, 0], vegetable: [15, 65, 30, 0, 0], special: [0, 0, 20, 100, 0] },
                crops: {
                    root: [{ crop: "POTATO", onMap: true }, { crop: "ONION", onMap: false }],
                    vegetable: [{ crop: "CARROT", onMap: true }],
                    special: [{ crop: "COTTON", onMap: false }],
                },
                npcFieldCount: 4,
                bands: [
                    { band: "0_3", fields: 1, areaHa: 2.5, growing: { ...zero, root: 1 }, planned: zero },
                    { band: "3_8", fields: 1, areaHa: 5, growing: zero, planned: { ...zero, vegetable: 1 } },
                    { band: "8_20", fields: 0, areaHa: 0, growing: zero, planned: zero },
                    { band: "20_30", fields: 1, areaHa: 25, growing: { ...zero, root: 1 }, planned: zero },
                    { band: "30_plus", fields: 1, areaHa: 40, growing: zero, planned: zero },
                ],
                fields: [
                    { fieldId: 1, name: "1", areaHa: 2.5, band: "0_3", crop: "POTATO", category: "root", stage: "growing", keepChance: 0 },
                    { fieldId: 2, name: "2", areaHa: 5, band: "3_8", crop: "CARROT", category: "vegetable", stage: "planned", keepChance: 65 },
                ],
                coverage: "complete",
            }),
            { farmId: 1 },
        );
        expect(host.querySelector('[data-stat="npcFields"]').textContent).toContain("4");
        expect(host.querySelector('[data-stat="growing"]').textContent).toContain("2");
        expect(host.querySelector('[data-stat="planned"]').textContent).toContain("1");
        expect(host.querySelector('[data-stat="onMap"]').textContent).toContain("2 of 4");

        const root = host.querySelector('[data-row="root"]');
        expect(root.textContent).toContain("Root crops");
        expect(root.textContent).toContain("80%");
        expect(host.querySelector('[data-row="special"] .fd-badge--accent').textContent).toBe("100%");

        expect(host.querySelector('[data-row="3_8"]').textContent).toContain("0 (+1 planned)");
        expect(host.querySelector('[data-row="20_30"]').textContent).toContain("25.0 ha");

        expect(host.querySelector('[data-category="root"] [data-crop="POTATO"] .fd-badge--accent')).not.toBeNull();
        expect(host.querySelector('[data-category="root"] [data-crop="ONION"]').textContent).toContain("Onion");

        const f2 = host.querySelector('[data-row="field-2"]');
        expect(f2.textContent).toContain("Carrot · Vegetables");
        expect(f2.textContent).toContain("Planned");
        expect(f2.textContent).toContain("65%");
    });

    test("settings-only reading shows the grid and waiting map", () => {
        const ui = loadCompanionPage("smartCropControl", ENTRY);
        const host = ui.renderPage(payload({ readState: "settings-only", chances: { root: [0, 40, 80, 30, 0], vegetable: [], special: [] }, bands: [], fields: [] }), { farmId: 1 });
        expect(host.querySelector(".fd-mod-page__notice.is-limited")).not.toBeNull();
        expect(host.querySelector('[data-row="root"]').textContent).toContain("40%");
        expect(host.textContent).toContain("The map's fields were not readable on this export.");
        expect(host.querySelector('[data-stat="npcFields"]')).toBeNull();
    });

    test("not-loaded state", () => {
        const ui = loadCompanionPage("smartCropControl", ENTRY);
        const host = ui.renderPage(payload(null), { farmId: 1 });
        expect(host.querySelector(".fd-mod-page__notice.is-waiting")).not.toBeNull();
        expect(host.textContent).toContain("The mod's settings appear after the next export.");
    });
});
