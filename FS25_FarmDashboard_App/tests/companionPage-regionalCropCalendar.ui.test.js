/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");

const ENTRY = { catalogId: "regionalCropCalendar", title: "Regional Crop Calendar", group: "fields" };

function payload(page) {
    return {
        companionMods: { mods: [{ id: "regionalCropCalendar", detected: true, version: "1.1.0.2" }] },
        companionPages: page ? { pages: { regionalCropCalendar: { key: "regionalCropCalendar", detected: true, ...page } } } : { pages: {} },
    };
}

const FULL = {
    readState: "ok",
    currentPeriod: 7,
    selectedRegion: "uk_temperate",
    regionTitle: "UK (temperate)",
    isVanilla: false,
    regionCount: 15,
    settings: { weatherEnabled: true, yieldEnabled: true, strictSuitabilityEnabled: true },
    calendarState: "ok",
    calendarCoverage: "complete",
    crops: [
        { crop: "WHEAT", plantingPeriods: [7, 8], harvestPeriods: [4, 5], complete: true, source: "region" },
        { crop: "GRASS", plantingPeriods: [1, 2], harvestPeriods: [7], complete: true, source: "map-calendar" },
        { crop: "OAT", plantingPeriods: [], harvestPeriods: [], complete: false, source: "region" },
    ],
    region: {
        climate: "maritime", group: "europe", anchor: "Cambridge", description: "Mild wet winters.",
        yieldMultiplier: 1.03, signatureBonus: 0.02, signatureCrops: ["WHEAT"], unsuitableCrops: ["SUNFLOWER"], calendarCrops: 12,
        seasons: [{ season: 1, temperatureOffset: -1, precipitationRatio: 1.2 }],
        economy: [{ fillType: "BARLEY", priceScale: 0.95 }], economyCount: 1,
    },
    moisture: { active: true, bonusSteps: 0, penaltySteps: 2, dryStreak: 5, snowPack: 0, percent: -12, maxBonusSteps: 5, maxPenaltySteps: 4, droughtAfter: 3 },
    blockedCrops: ["SUNFLOWER"],
};

describe("regionalCropCalendar page", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    test("renders the region, now-lists, the compact crop x period grid and the moisture balance", () => {
        const ui = loadCompanionPage("regionalCropCalendar", ENTRY);
        const host = ui.renderPage(payload(FULL), { farmId: 1 });
        expect(host.querySelector('[data-stat="region"]').textContent).toContain("UK (temperate)");
        expect(host.querySelector('[data-stat="region"]').textContent).toContain("maritime climate");
        expect(host.querySelector('[data-stat="plantNow"]').textContent).toContain("1");
        expect(host.querySelector('[data-stat="harvestNow"]').textContent).toContain("1");
        expect(host.querySelector('[data-stat="weather"]').textContent).toContain("−12%");
        expect(host.querySelector('[data-stat="blocked"]').textContent).toContain("1");
        const wheat = host.querySelector('[data-crop="WHEAT"]');
        expect(wheat.querySelectorAll('[data-mark="plant"]')).toHaveLength(2);
        expect(wheat.querySelectorAll('[data-mark="harvest"]')).toHaveLength(2);
        expect(wheat.querySelector("td.is-current").getAttribute("data-mark")).toBe("plant");
        expect(host.querySelector('[data-crop="GRASS"]').textContent).toContain("map");
        expect(host.querySelector('[data-crop="OAT"]').textContent).toContain("Calendar incomplete");
        expect(host.querySelector('[data-now="plant"]').textContent).toContain("Wheat");
        expect(host.querySelector('[data-now="harvest"]').textContent).toContain("Grass");
        expect(host.querySelector('[data-kv="yield"]').textContent).toContain("+3%");
        expect(host.querySelector('[data-kv="penalty"]').textContent).toContain("2 of 4");
        expect(host.querySelector('[data-kv="dry"]').textContent).toContain("5 (drought after 3)");
        expect(host.querySelector('[data-row="season-1"]').textContent).toContain("+20%");
        expect(host.querySelector('[data-row="BARLEY"]').textContent).toContain("−5%");
        expect(host.textContent).toContain("these seeds are removed from the shop and seeders");
        expect(host.textContent).toContain("15 regions are available in the mod.");
    });

    test("pending calendar and vanilla profile", () => {
        const ui = loadCompanionPage("regionalCropCalendar", ENTRY);
        const pending = ui.renderPage(payload({ ...FULL, calendarState: "pending", crops: [], readState: "partial" }), { farmId: 1 });
        expect(pending.textContent).toContain("The region is still being applied.");
        expect(pending.querySelector('[data-crop="WHEAT"]')).toBeNull();
        document.body.innerHTML = "";
        const vanilla = ui.renderPage(
            payload({ readState: "ok", currentPeriod: 3, selectedRegion: "vanilla", isVanilla: true, settings: { weatherEnabled: false }, calendarState: "ok", crops: [{ crop: "WHEAT", plantingPeriods: [3], harvestPeriods: [], complete: true, source: "map-calendar" }] }),
            { farmId: 1 },
        );
        expect(vanilla.querySelector('[data-stat="region"]').textContent).toContain("Vanilla (map calendar)");
        expect(vanilla.textContent).toContain("All windows come from the map calendar.");
        expect(vanilla.textContent).toContain("No region is selected");
        expect(vanilla.textContent).toContain("Turn on regional weather");
        expect(vanilla.querySelector('[data-stat="weather"]')).toBeNull();
    });

    test("waiting reading", () => {
        const ui = loadCompanionPage("regionalCropCalendar", ENTRY);
        const host = ui.renderPage(payload(null), { farmId: 1 });
        expect(host.querySelector(".fd-mod-page__notice.is-waiting")).not.toBeNull();
        expect(host.textContent).toContain("The calendar appears after the next export.");
    });
});
