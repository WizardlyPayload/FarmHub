/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");

const ENTRY = { catalogId: "fieldLeasing", title: "Field Leasing", group: "fields" };

function payload(page) {
    return {
        companionMods: { mods: [{ id: "fieldLeasing", detected: true, version: "1.0.0.1" }] },
        companionPages: page ? { pages: { fieldLeasing: { key: "fieldLeasing", detected: true, ...page } } } : { pages: {} },
    };
}

describe("fieldLeasing page", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    test("renders lease totals, per-lease rows, settings and charge history", () => {
        const ui = loadCompanionPage("fieldLeasing", ENTRY);
        const host = ui.renderPage(
            payload({
                readState: "ok",
                farmId: 1,
                coverage: "complete",
                settings: { priceMultiplierPercent: 1.5, minDurationPeriods: 6 },
                byFarm: {
                    "1": {
                        leaseCount: 2, totalAreaHa: 6.75, monthlyCost: 225, yearlyCost: 2700, canEndCount: 1,
                        finance: { today: -150, recentDays: [0, -100, -150] },
                    },
                },
                leases: [
                    { farmId: 1, farmlandId: 12, name: "12", areaHa: 4.5, signedPrice: 120000, currentLandPrice: 125000, periodsPaid: 8, monthlyCost: 150, canEnd: true },
                    { farmId: 1, farmlandId: 30, name: "North Hill", areaHa: 2.25, signedPrice: 60000, periodsPaid: 2, monthlyCost: 75, canEnd: false, periodsUntilEnd: 4 },
                    { farmId: 2, farmlandId: 40, name: "Neighbour land" },
                ],
            }),
            { farmId: 1 },
        );
        expect(host.querySelector('[data-stat="leases"]').textContent).toContain("2");
        expect(host.querySelector('[data-stat="area"]').textContent).toContain("6.75 ha");
        expect(host.querySelector('[data-stat="monthly"]').textContent).toContain("225");
        expect(host.querySelector('[data-stat="yearly"]').textContent).toContain("2,700");
        expect(host.querySelector('[data-stat="canEnd"]').textContent).toContain("1 of 2");
        expect(host.querySelector('[data-stat="today"]').textContent).toContain("150");
        expect(host.querySelector('[data-row="12"]').textContent).toContain("Can end now");
        expect(host.querySelector('[data-row="12"]').textContent).toContain("125,000");
        const second = host.querySelector('[data-row="30"]');
        expect(second.textContent).toContain("30 · North Hill");
        expect(second.textContent).toContain("In 4 periods");
        expect(host.textContent).not.toContain("Neighbour land");
        expect(host.querySelector('[data-kv="others"]')).toBeNull();
        expect(host.querySelector('[data-kv="rate"]').textContent).toContain("1.5% of the land price");
        expect(host.querySelector('[data-kv="minTerm"]').textContent).toContain("6 periods");
        expect(host.querySelector(".fd-mod-page__chart")).not.toBeNull();
    });

    test("settings-only reading shows settings without claiming there are no leases", () => {
        const ui = loadCompanionPage("fieldLeasing", ENTRY);
        const host = ui.renderPage(
            payload({ readState: "settings-only", settings: { priceMultiplierPercent: 1, minDurationPeriods: 12 }, leases: [] }),
            { farmId: 1 },
        );
        expect(host.querySelector(".fd-mod-page__notice.is-limited")).not.toBeNull();
        expect(host.querySelector('[data-stat="leases"]')).toBeNull();
        expect(host.textContent).toContain("This mod's reading is not available in this save.");
        expect(host.textContent).not.toContain("This farm has no leased farmland.");
        expect(host.querySelector('[data-kv="minTerm"]').textContent).toContain("12 periods");
        expect(host.textContent).not.toContain("No lease charges in the days the game keeps.");
    });

    test("waiting reading", () => {
        const ui = loadCompanionPage("fieldLeasing", ENTRY);
        const host = ui.renderPage(payload(null), { farmId: 1 });
        expect(host.querySelector(".fd-mod-page__notice.is-waiting")).not.toBeNull();
        expect(host.textContent).toContain("Leases appear after the next export.");
    });
});
