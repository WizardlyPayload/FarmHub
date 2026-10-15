/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");

const ENTRY = { catalogId: "factoryProfitCalculator", title: "Factory Profit Calculator", group: "storage" };

function payload(page) {
    return {
        companionMods: { mods: [{ id: "factoryProfitCalculator", detected: true, version: "1.0.0.1" }] },
        companionPages: { pages: { factoryProfitCalculator: { key: "factoryProfitCalculator", detected: true, ...page } } },
    };
}

describe("factoryProfitCalculator page", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    test("renders monthly totals, profit rows with tones and line breakdowns", () => {
        const ui = loadCompanionPage("factoryProfitCalculator", ENTRY);
        const host = ui.renderPage(
            payload({
                readState: "partial",
                period: "month",
                byFarm: {
                    "1": { lineCount: 3, runningCount: 1, profitableCount: 1, lossCount: 1, totalProfit: 1200, runningProfit: 2000, totalUpkeep: 900,
                           bestLine: "Flour", worstLine: "Cereal" },
                },
                lines: [
                    { farmId: 1, point: "Grain Mill", recipe: "Flour", running: true, cyclesPerMonth: 720, upkeepPerMonth: 300, inputCost: 1000, outputValue: 3300, profit: 2000,
                      inputs: [{ fillType: "WHEAT", title: "Wheat", litersPerMonth: 72000, pricePer1000: 13.89, priceSource: "purchase", value: 1000 }],
                      outputs: [{ fillType: "FLOUR", title: "Flour", litersPerMonth: 72000, pricePer1000: 45.83, priceSource: "peak", value: 3300 }] },
                    { farmId: 1, point: "Cereal Factory", recipe: "Cereal", running: false, cyclesPerMonth: 240, upkeepPerMonth: 600, inputCost: 1000, outputValue: 800, profit: -800,
                      inputs: [], outputs: [] },
                    { farmId: 1, point: "Odd Works", recipe: "Mystery", running: false, profit: null, inputs: [{ fillType: "ODD", litersPerMonth: 100 }], outputs: [] },
                ],
                overrides: [{ factory: "Grain Mill", line: "Flour", originalCyclesPerHour: 1, cyclesPerHour: 2, inputs: 1, outputs: 0, capacities: 0 }],
            }),
            { farmId: 1 },
        );
        expect(host.querySelector('[data-stat="lines"]').textContent).toContain("3");
        expect(host.querySelector('[data-stat="lines"]').textContent).toContain("1 running");
        expect(host.querySelector('[data-stat="runningProfit"]').className).toContain("is-ok");
        expect(host.querySelector('[data-stat="best"]').textContent).toContain("Worst: Cereal");
        expect(host.querySelector(".fd-mod-page__notice.is-partial")).not.toBeNull();
        const rows = host.querySelectorAll("tr[data-row]");
        const texts = Array.from(rows).map((r) => r.textContent);
        expect(texts.find((t) => t.includes("Cereal Factory"))).toBeDefined();
        expect(Array.from(rows).find((r) => r.textContent.includes("Cereal Factory")).className).toBe("is-danger");
        expect(Array.from(rows).find((r) => r.textContent.includes("Odd Works")).textContent).toContain("Missing price");
        expect(host.textContent).toContain("(cheapest to buy)");
        expect(host.textContent).toContain("(peak price)");
        expect(host.textContent).toContain("No price");
        expect(host.textContent).toContain("Admin overrides");
        expect(host.textContent).toContain("1.00 → 2.00");
    });

    test("settings-only reading shows the limited notice without stats", () => {
        const ui = loadCompanionPage("factoryProfitCalculator", ENTRY);
        const host = ui.renderPage(payload({ readState: "settings-only", reason: "no-profit-math", lines: [], overrides: [] }), { farmId: 1 });
        expect(host.querySelector(".fd-mod-page__notice.is-limited")).not.toBeNull();
        expect(host.querySelector("[data-stat]")).toBeNull();
        expect(host.textContent).toContain("No production lines owned by this farm.");
    });
});
