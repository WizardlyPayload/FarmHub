/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");

const KEY = "animalFoodCalculator";
const page = loadCompanionPage(KEY, { title: "Animal Food Calculator", group: "livestock" });

function payload(pageData) {
    return {
        companionMods: { mods: [{ id: KEY, detected: true, version: "1.1.0.2" }] },
        companionPages: { pages: pageData ? { [KEY]: { key: KEY, detected: true, ...pageData } } : {} },
    };
}

afterEach(() => {
    document.body.innerHTML = "";
});

describe("Animal Food Calculator page", () => {
    test("shows the not-detected state when the mod is absent", () => {
        const host = page.renderPage({ companionMods: { mods: [] }, companionPages: { pages: {} } });
        expect(host.textContent).toContain("Not detected in this save");
    });

    test("renders daily totals, per-pen amounts, outputs, settings and hooks", () => {
        const host = page.renderPage(payload({
            readState: "ok",
            daysPerPeriod: 3,
            enhancedAnimalSystem: false,
            settings: { enabled: true, autoScaleByDays: true, mode: "Realistic", customMultiplier: 1.5, referenceSource: "Game",
                foodScale: 0.33, waterScale: 0.33, strawScale: 1 },
            hooks: { food: true, water: true, straw: false, milk: true, liquidManure: false, pallets: false },
            byFarm: {
                1: {
                    penCount: 2, calculatedPens: 1, foodDaily: 1500, waterDaily: 2600, strawDaily: 300, truncated: false,
                    pens: [
                        { name: "Cow barn", animals: 20, calculated: true, foodDaily: 1500, foodYearly: 547500, waterDaily: 2600,
                            waterYearly: 949000, strawDaily: 300, strawYearly: 109500,
                            outputs: [{ title: "Milk", daily: 800, yearly: 292000 }] },
                        { name: "Heifers", animals: 5, calculated: false, outputs: [] },
                    ],
                },
            },
        }));
        expect(host.querySelector('[data-stat="food"]').textContent).toMatch(/1,?500 L\/day/);
        expect(host.querySelector('[data-stat="water"]').textContent).toMatch(/2,?600 L\/day/);
        expect(host.querySelector('[data-stat="calculated"]').textContent).toContain("1 / 2");
        expect(host.querySelector('[data-stat="calculated"]').className).toContain("is-warn");
        const rows = host.querySelectorAll("tr[data-row]");
        expect(rows[0].textContent).toContain("Milk 800 L/day");
        expect(rows[0].querySelector("span[title]").getAttribute("title")).toMatch(/547,?500 L\/year/);
        expect(rows[1].textContent).toContain("Not calculated yet");
        expect(rows[1].className).toContain("is-warn");
        expect(host.querySelector('[data-kv="mode"]').textContent).toContain("Realistic");
        expect(host.querySelector('[data-kv="multiplier"]').textContent).toContain("×1.50");
        expect(host.querySelector('[data-kv="foodScale"]').textContent).toContain("×0.33");
        expect(host.querySelector('[data-kv="straw"]').textContent).toContain("No");
        expect(host.querySelector('[data-kv="milk"]').textContent).toContain("Yes");
    });

    test("settings-only reading keeps settings and says pen figures were not readable", () => {
        const host = page.renderPage(payload({ readState: "settings-only", settings: { enabled: false }, hooks: {} }));
        expect(host.textContent).toContain("Limited reading");
        expect(host.textContent).toContain("pen figures were not readable");
        expect(host.querySelector('[data-kv="enabled"]').textContent).toContain("No");
        expect(host.querySelector('[data-stat="food"]')).toBeNull();
    });
});
