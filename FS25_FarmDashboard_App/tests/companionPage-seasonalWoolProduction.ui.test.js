/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");

const KEY = "seasonalWoolProduction";
const page = loadCompanionPage(KEY, { title: "Seasonal Wool Production", group: "livestock" });

function payload(pageData) {
    return {
        companionMods: { mods: [{ id: KEY, detected: true, version: "1.0.0.2" }] },
        companionPages: { pages: pageData ? { [KEY]: { key: KEY, detected: true, ...pageData } } : {} },
    };
}

afterEach(() => {
    document.body.innerHTML = "";
});

describe("Seasonal Wool Production page", () => {
    test("shows the not-detected state when the mod is absent", () => {
        const host = page.renderPage({ companionMods: { mods: [] }, companionPages: { pages: {} } });
        expect(host.textContent).toContain("Not detected in this save");
    });

    test("renders the schedule, farm totals and sheep pens", () => {
        const host = page.renderPage(payload({
            readState: "ok",
            initialized: true,
            currentPeriod: 5,
            shearingPeriods: [2, 8],
            nextShearingPeriod: 8,
            monthsUntilShearing: 3,
            isShearingMonth: false,
            realisticLivestockMode: false,
            settings: { shearingCostPerSheep: 5, notifyNextMonth: true },
            byFarm: {
                1: {
                    penCount: 2, totalSheep: 34, matureSheep: 30, pendingWoolLiters: 1234, nextShearingCost: 150, truncated: false,
                    pens: [
                        { name: "Sheep pasture", hooked: true, rawRateLph: 12.5, historyAvgLph: 11.25, monthsRecorded: 3,
                            lastShearingPeriod: 2, monthsSinceShearing: 3, matureSheep: 30, totalSheep: 34,
                            pendingWoolLiters: 1234, nextShearingCost: 150 },
                        { name: "Small pen", hooked: false, matureSheep: 0, totalSheep: 0 },
                    ],
                },
            },
        }));
        expect(host.querySelector('[data-stat="next"]').textContent).toContain("Period 8");
        expect(host.querySelector('[data-stat="next"]').textContent).toContain("in 3 months");
        expect(host.querySelector('[data-stat="sheep"]').textContent).toContain("30 / 34");
        expect(host.querySelector('[data-stat="pending"]').textContent).toMatch(/1,?234 L/);
        expect(host.querySelector('[data-stat="cost"]').textContent).toContain("150");
        const periods = [...host.querySelectorAll(".fd-mod-wool__periods .fd-badge")].map((b) => b.textContent);
        expect(periods).toEqual(["Period 2", "Period 8"]);
        const rows = host.querySelectorAll("tr[data-row]");
        expect(rows).toHaveLength(2);
        expect(rows[0].textContent).toContain("11.25 L (3 months)");
        expect(rows[1].className).toContain("is-warn");
        expect(rows[1].textContent).toContain("Not yet");
        expect(host.querySelector('[data-kv="fee"]').textContent).toContain("5");
        expect(host.textContent).not.toContain("totalWoolSheared");
    });

    test("shearing period shows done / due instead of a future period", () => {
        const host = page.renderPage(payload({ readState: "ok", isShearingMonth: true, shearingCompleted: true, shearingPeriods: [2, 8] }));
        expect(host.querySelector('[data-stat="next"]').textContent).toContain("Done this period");
    });

    test("settings-only reading explains the mod has not started", () => {
        const host = page.renderPage(payload({ readState: "settings-only", initialized: false, settings: { shearingCostPerSheep: 5 } }));
        expect(host.textContent).toContain("Limited reading");
        expect(host.textContent).toContain("has not started in this save");
        expect(host.querySelector('[data-stat="sheep"]')).toBeNull();
    });
});
