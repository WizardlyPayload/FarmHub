/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");

const ENTRY = { catalogId: "moistureSystem", title: "Moisture System", group: "fields" };

function payload(page) {
    return {
        companionMods: {
            mods: [{ id: "moistureSystem", detected: true, version: "2.0.0.8" }],
            moistureSystem: { enabled: true, readState: "ok", scope: "map", baseMoisturePercent: 11.6 },
            storedGoods: { enabled: true, readState: "unavailable", reason: "no-farm" },
        },
        companionPages: { pages: page ? { moistureSystem: { key: "moistureSystem", detected: true, ...page } } : {} },
    };
}

describe("Moisture System reading status", () => {
    afterEach(() => { document.body.innerHTML = ""; });

    test("settings-only page with map and crop values describes its limited live reading", () => {
        const ui = loadCompanionPage("moistureSystem", ENTRY);
        const host = ui.renderPage(payload({
            readState: "settings-only",
            baseMoisturePercent: 11.6,
            crops: [{ fillType: "WHEAT", idealMinPercent: 11, idealMaxPercent: 13, qualityNow: 80 }],
            settings: { baleRotEnabled: true },
        }), { farmId: 1 });
        const notice = host.querySelector(".fd-mod-page__notice.is-limited");
        expect(notice.textContent).toContain("Map moisture and crop estimates are available");
        expect(notice.textContent).toContain("Farm-specific silo, bale and irrigation readings are not available");
        expect(notice.textContent).not.toContain("Live figures stay in the game");
        expect(host.querySelector('[data-stat="moisture"]').textContent).toContain("11.6%");
        expect(host.querySelector('[data-row="WHEAT"]')).not.toBeNull();
        expect(host.textContent).toContain("Silo readings are not available for this farm");
        expect(host.textContent).toContain("Bale readings are not available for this farm");
        expect(host.textContent).toContain("Irrigation bookings are not available for this farm");
        expect(host.textContent).not.toContain("No irrigation booked");
        expect(host.textContent).not.toContain("None of your silos hold a crop");
    });

    test("a genuinely settings-only page keeps the generic limited notice", () => {
        const ui = loadCompanionPage("moistureSystem", ENTRY);
        const host = ui.renderPage(payload({ readState: "settings-only", settings: { weatherProfile: "ukwest" } }), { farmId: 1 });
        const notice = host.querySelector(".fd-mod-page__notice.is-limited");
        expect(notice.textContent).toContain("Only this mod's settings are readable");
        expect(notice.textContent).not.toContain("Map moisture and crop estimates are available");
        expect(host.querySelector('[data-stat="moisture"]')).toBeNull();
        expect(host.textContent).not.toContain("No irrigation booked");
    });

    test("a missing page waits for farm-scoped readings instead of calling them unavailable", () => {
        const ui = loadCompanionPage("moistureSystem", ENTRY);
        const host = ui.renderPage(payload(null), { farmId: 1 });
        expect(host.textContent).toContain("Your silos appear after the next export.");
        expect(host.textContent).toContain("Bale readings appear after the next export.");
        expect(host.textContent).toContain("Irrigation bookings may appear after the next export.");
        expect(host.textContent).not.toContain("Silo readings are not available for this farm.");
        expect(host.textContent).not.toContain("No irrigation booked.");
    });

    test("a complete selected-farm read may confirm empty silos and irrigation", () => {
        const ui = loadCompanionPage("moistureSystem", ENTRY);
        const host = ui.renderPage(payload({
            readState: "ok", baseMoisturePercent: 11.6, crops: [], silos: [], irrigationJobs: [],
            byFarm: { "1": { siloCount: 0, bales: { gettingWet: 0, drying: 0, rottingSlowly: 0, rotting: 0, rottingQuickly: 0 }, irrigation: { jobCount: 0 } } },
        }), { farmId: 1 });
        expect(host.textContent).toContain("None of your silos hold a crop the mod tracks");
        expect(host.textContent).toContain("No irrigation booked");
        expect(host.textContent).not.toContain("Silo readings are not available for this farm");
    });
});
