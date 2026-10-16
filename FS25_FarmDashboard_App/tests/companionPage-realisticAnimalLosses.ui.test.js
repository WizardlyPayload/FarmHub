/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");

const KEY = "realisticAnimalLosses";
const page = loadCompanionPage(KEY, { title: "Realistic Animal Losses", group: "livestock" });

function payload(pageData) {
    return {
        companionMods: { mods: [{ id: KEY, detected: true, version: "1.1.0.0" }] },
        companionPages: { pages: pageData ? { [KEY]: { key: KEY, detected: true, ...pageData } } : {} },
    };
}

const RULES = {
    ageLossRatePercent: 10, waterLossRatePercent: 15, strawLossRatePercent: 5, checkHour: 18, warningWaitingHours: 4,
    riskAges: [{ animalType: "COW", months: 120 }],
};

afterEach(() => {
    document.body.innerHTML = "";
});

describe("Realistic Animal Losses page", () => {
    test("shows the not-detected state when the mod is absent", () => {
        const host = page.renderPage({ companionMods: { mods: [] }, companionPages: { pages: {} } });
        expect(host.textContent).toContain("Not detected in this save");
    });

    test("renders risk tiles, flagged pens and the loss rules", () => {
        const host = page.renderPage(payload({
            readState: "ok",
            settings: { foodEffectivityThreshold: 90, defaultFoodEffectivityThreshold: 90 },
            rules: RULES,
            daysPerPeriod: 1,
            firstSeasonGrace: false,
            byFarm: {
                1: {
                    penCount: 2, animals: 40, oldAnimals: 3, pensAtRisk: 1, pensBelowThreshold: 1, pensNoWater: 1, pensNoStraw: 0,
                    truncated: false,
                    pens: [
                        { name: "Cow barn", animalType: "COW", animals: 30, riskAgeMonths: 120, oldAnimals: 3, foodEffectivity: 60,
                            belowThreshold: true, noWater: true, noStraw: false, careRiskPercentPerCheck: 30.4,
                            ageRiskPercentPerCheck: 10, lastWarnedCareRiskPercent: 28.1 },
                        { name: "Pig barn", animalType: "PIG", animals: 10, oldAnimals: 0, foodEffectivity: 100,
                            belowThreshold: false, noWater: false, noStraw: false, careRiskPercentPerCheck: 0 },
                    ],
                },
            },
        }));
        expect(host.querySelector('[data-stat="threshold"]').textContent).toContain("90%");
        expect(host.querySelector('[data-stat="atRisk"]').textContent).toContain("1 / 2");
        expect(host.querySelector('[data-stat="atRisk"]').className).toContain("is-danger");
        expect(host.querySelector('[data-stat="old"]').textContent).toContain("3");
        const rows = host.querySelectorAll("tr[data-row]");
        expect(rows[0].className).toContain("is-danger");
        expect(rows[0].textContent).toContain("Feed below threshold, No water");
        expect(rows[0].textContent).toContain("30.4%");
        expect(rows[0].textContent).toContain("3 (over 120 months)");
        expect(rows[0].textContent).toContain("28.1% / —");
        expect(rows[1].textContent).toContain("None");
        expect(rows[1].className).toBe("");
        expect(host.querySelector('[data-kv="hour"]').textContent).toContain("18:00");
        expect(host.querySelector('[data-kv="warn"]').textContent).toContain("4 hours");
        expect(host.textContent).toContain("120 months");
        expect(host.textContent).not.toContain("Losses are paused");
    });

    test("first-season grace shows the pause notice", () => {
        const host = page.renderPage(payload({ readState: "ok", settings: { foodEffectivityThreshold: 90 }, rules: RULES, firstSeasonGrace: true }));
        expect(host.textContent).toContain("Losses are paused");
    });

    test("settings-only reading shows rules without pen figures", () => {
        const host = page.renderPage(payload({ readState: "settings-only", settings: {}, rules: RULES }));
        expect(host.textContent).toContain("Limited reading");
        expect(host.querySelector('[data-stat="atRisk"]')).toBeNull();
        expect(host.querySelector('[data-kv="ageRate"]').textContent).toContain("10%");
    });
});
