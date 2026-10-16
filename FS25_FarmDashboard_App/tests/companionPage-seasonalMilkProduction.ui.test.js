/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");

const KEY = "seasonalMilkProduction";
const page = loadCompanionPage(KEY, { title: "Seasonal Milk Production", group: "livestock" });

function payload(pageData) {
    return {
        companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.0.1", modName: "FS25_SeasonalMilkProduction" }] },
        companionPages: { enabled: true, schema: 1, pages: pageData ? { [KEY]: { key: KEY, detected: true, ...pageData } } : {} },
    };
}

const CURVE = [70, 75, 85, 100, 115, 120, 115, 105, 95, 85, 75, 70];

afterEach(() => {
    document.body.innerHTML = "";
});

describe("Seasonal Milk Production page", () => {
    test("shows the not-detected state when the mod is absent", () => {
        const host = page.renderPage({ companionMods: { mods: [] }, companionPages: { pages: {} } });
        expect(host.textContent).toContain("Not detected in this save");
        expect(host.querySelector("[data-stat]")).toBeNull();
    });

    test("renders the curve, farm totals and per-pen rates", () => {
        const host = page.renderPage(payload({
            readState: "ok",
            initialized: true,
            hemisphere: "north",
            currentPeriod: 2,
            currentPercent: 75,
            nextPeakPeriod: 6,
            nextPeakPercent: 120,
            monthlyPercent: CURVE,
            minimumAgeMonths: 15,
            settings: { healthImpactEnabled: true, seasonalGoatsEnabled: false },
            byFarm: {
                1: {
                    penCount: 2, pensWithBaseline: 1, baselineLph: 40, currentLph: 30, truncated: false,
                    pens: [
                        { name: "Cow barn", kind: "milk", animals: 30, baselineCaptured: true, baselineLph: 40, currentLph: 30,
                            appliedRatio: 0.75, avgHealth: 92, fillTypes: ["Milk"] },
                        { name: "Goat shed", kind: "milk", animals: 8, baselineCaptured: false, fillTypes: [] },
                    ],
                },
            },
        }));
        expect(host.querySelector('[data-stat="period"]').textContent).toContain("Period 2");
        expect(host.querySelector('[data-stat="modifier"]').textContent).toContain("75%");
        expect(host.querySelector('[data-stat="peak"]').textContent).toContain("Period 6");
        expect(host.querySelector('[data-stat="rate"]').textContent).toContain("30.00 L/h");
        expect(host.querySelector('[data-stat="pens"]').textContent).toContain("1 / 2");
        expect(host.querySelectorAll(".fd-mod-page__chart-col")).toHaveLength(12);
        expect(host.querySelector(".fd-mod-page__chart-col.is-current small").textContent).toBe("2");
        const rows = host.querySelectorAll("tr[data-row]");
        expect(rows).toHaveLength(2);
        expect(rows[0].textContent).toContain("Cow barn");
        expect(rows[0].textContent).toContain("75%");
        expect(rows[0].className).toContain("is-warn");
        expect(rows[1].textContent).toContain("Not captured yet");
        expect(host.querySelector('[data-kv="healthImpactEnabled"]').textContent).toContain("Yes");
        expect(host.querySelector('[data-kv="seasonalGoatsEnabled"]').textContent).toContain("No");
        expect(host.querySelector('[data-kv="minimumAge"]').textContent).toContain("15 months");
    });

    test("settings-only reading shows the base pattern and a not-started note, no invented rates", () => {
        const host = page.renderPage(payload({
            readState: "settings-only",
            initialized: false,
            basePatternPercent: CURVE,
            settings: { seasonalCowsEnabled: true },
        }));
        expect(host.textContent).toContain("Limited reading");
        expect(host.textContent).toContain("The mod's base pattern.");
        expect(host.textContent).toContain("has not started in this save");
        expect(host.querySelector('[data-stat="rate"]')).toBeNull();
    });
});
