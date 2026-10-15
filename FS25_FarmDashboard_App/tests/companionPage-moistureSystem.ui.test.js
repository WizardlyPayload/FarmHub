/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");

const ENTRY = { catalogId: "moistureSystem", title: "Moisture System", group: "fields" };

function payload(page) {
    return {
        companionMods: { mods: [{ id: "moistureSystem", detected: true, version: "2.0.0.8" }] },
        companionPages: page ? { pages: { moistureSystem: { key: "moistureSystem", detected: true, ...page } } } : { pages: {} },
    };
}

const FULL = {
    readState: "ok",
    month: 6,
    baseMoisturePercent: 15,
    fieldRange: { low: 13, high: 17 },
    settings: { weatherProfile: "ukwest", overrideWeather: true, hayThresholdPercent: 8, teddingReductionPercent: 4, dryingSpeedPercentPerHour: 1, witheringEnabled: true, baleRotEnabled: true, irrigationContractors: 2 },
    weather: {
        profileName: "UK West",
        monthRange: { min: 8, max: 30 },
        forecast: [
            { offset: 0, months: [{ month: 6, actual: true, precipitation: 28, sun: 42, cloudy: 30, precipitationDiff: -3.25 }] },
            { offset: 1, months: [{ month: 9, precipitation: 35, sun: 30, cloudy: 35, precipitationDiff: 4 }] },
        ],
    },
    crops: [
        { fillType: "WHEAT", idealMinPercent: 11, idealMaxPercent: 13, qualityNow: 80, yieldNow: 1, gradeNow: 2, priceFactorNow: 0.92, state: "wet" },
    ],
    silos: [
        {
            farmId: 1, name: "Grain silo", isDrying: true, etaHours: 3.2, totalLiters: 52000,
            crops: [{ fillType: "WHEAT", liters: 40000, moisturePercent: 16.2, quality: 82, idealMaxPercent: 13, needsDrying: true, grade: 2, priceFactor: 0.92 }],
        },
    ],
    irrigationJobs: [
        { farmId: 1, farmlandId: 7, name: "Home", boostPercent: 3, daysAhead: 0, startHour: 6, hours: 6, hoursWorked: 4, price: 2000, state: "working" },
        { farmId: 1, farmlandId: 7, name: "Home", boostPercent: 2, daysAhead: 2, startHour: 8, hours: 3, hoursWorked: 0, price: 1450.5, state: "booked" },
    ],
    irrigationBoosts: [{ farmId: 1, farmlandId: 7, name: "Home", boostPercent: 3.5, holding: true }],
    byFarm: {
        1: {
            siloCount: 1, dryingCount: 1, needsDryingCount: 1, lowGradeCount: 0,
            bales: { gettingWet: 1, drying: 0, rottingSlowly: 0, rotting: 2, rottingQuickly: 1, total: 4 },
            irrigation: { jobCount: 2, boostedCount: 1, bookedSpend: 3450.5 },
        },
    },
};

describe("moistureSystem page", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    test("renders moisture tiles, harvest table, silos, bales, irrigation and forecast", () => {
        const ui = loadCompanionPage("moistureSystem", ENTRY);
        const host = ui.renderPage(payload(FULL), { farmId: 1 });
        expect(host.querySelector('[data-stat="moisture"]').textContent).toContain("15.0%");
        expect(host.querySelector('[data-stat="moisture"]').textContent).toContain("13.0%–17.0% across your fields by elevation");
        expect(host.querySelector('[data-stat="range"]').textContent).toContain("8% – 30%");
        expect(host.querySelector('[data-stat="range"]').textContent).toContain("UK West");
        expect(host.querySelector('[data-stat="needsDrying"]').textContent).toContain("1 silo(s) drying");
        expect(host.querySelector('[data-stat="bales"]').textContent).toContain("3");
        expect(host.querySelector('[data-stat="irrigation"]').textContent).toContain("3,450");

        const wheat = host.querySelector('[data-row="WHEAT"]');
        expect(wheat.textContent).toContain("Wheat");
        expect(wheat.textContent).toContain("11% – 13%");
        expect(wheat.textContent).toContain("Too wet");
        expect(wheat.textContent).toContain("92%");

        const silo = host.querySelector('[data-row="silo-0-WHEAT"]');
        expect(silo.textContent).toContain("Grain silo");
        expect(silo.textContent).toContain("Drying, ~4 h left");
        expect(silo.textContent).toContain("40,000 L");
        expect(silo.textContent).toContain("ideal ≤ 13%");

        expect(host.querySelector('[data-kv="rottingQuickly"]').textContent).toContain("1");
        expect(host.querySelector('[data-row="job-7-0-0"]').textContent).toContain("On site now");
        expect(host.querySelector('[data-row="job-7-2-1"]').textContent).toContain("In 2 days, 08:00");
        expect(host.querySelector('[data-row="boost-7"]').textContent).toContain("+3.5%");
        expect(host.querySelector('[data-row="boost-7"]').textContent).toContain("holding");

        const now = host.querySelector('[data-row="f-0-6"]');
        expect(now.textContent).toContain("This season");
        expect(now.textContent).toContain("so far");
        expect(now.textContent).toContain("−3.3 pts");
        expect(host.querySelector('[data-row="f-1-9"]').textContent).toContain("+4.0 pts");
        expect(host.querySelector('[data-kv="hay"]').textContent).toContain("8%");
        expect(host.textContent).not.toContain("drought");
    });

    test("pending save shows the start-up note and a waiting crop table", () => {
        const ui = loadCompanionPage("moistureSystem", ENTRY);
        const host = ui.renderPage(payload({ readState: "settings-only", pending: true, settings: { weatherProfile: "ukwest", overrideWeather: false } }), { farmId: 1 });
        expect(host.textContent).toContain("still starting up");
        expect(host.textContent).toContain("Crop windows appear after the next export.");
        expect(host.textContent).toContain("not controlling the weather");
        expect(host.querySelector('[data-stat="moisture"]')).toBeNull();
    });

    test("not-loaded state", () => {
        const ui = loadCompanionPage("moistureSystem", ENTRY);
        const host = ui.renderPage(payload(null), { farmId: 1 });
        expect(host.querySelector(".fd-mod-page__notice.is-waiting")).not.toBeNull();
        expect(host.textContent).toContain("Your silos appear after the next export.");
    });
});
