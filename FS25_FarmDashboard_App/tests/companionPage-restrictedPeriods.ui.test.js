/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");

const ENTRY = { catalogId: "restrictedPeriods", title: "Restricted Periods", group: "fields" };

function payload(page, version = "1.0.0.0") {
    return {
        companionMods: { mods: [{ id: "restrictedPeriods", detected: true, version }] },
        companionPages: page ? { pages: { restrictedPeriods: { key: "restrictedPeriods", detected: true, version, ...page } } } : { pages: {} },
    };
}

describe("restrictedPeriods page", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    test("closed period shows bans, reopen hint, rule grid and blocked vehicles", () => {
        const ui = loadCompanionPage("restrictedPeriods", ENTRY);
        const host = ui.renderPage(
            payload({
                readState: "ok",
                currentPeriod: 10,
                temperature: 4.5,
                liquidBan: "sperrfrist",
                solidBan: "sperrfrist",
                liquidRead: true,
                solidRead: true,
                anyActive: true,
                byFarm: { "1": { liquidVehicles: 1, solidVehicles: 0, blockedVehicles: 1 } },
                vehicles: [
                    { farmId: 1, name: "Slurry tanker", category: "liquid", blocked: true, reason: "sperrfrist" },
                    { farmId: 2, name: "Neighbour tanker", category: "liquid", blocked: true, reason: "sperrfrist" },
                ],
            }),
            { farmId: 1 },
        );
        expect(host.querySelector('[data-stat="spreading"]').textContent).toContain("Restricted");
        expect(host.querySelector('[data-stat="liquid"]').textContent).toContain("Banned: Closed period");
        expect(host.querySelector('[data-stat="liquid"]').textContent).toContain("Opens again in Period 1");
        expect(host.querySelector('[data-stat="solid"]').textContent).toContain("Opens again in Period 12");
        expect(host.querySelector('[data-stat="temperature"]').textContent).toContain("4.5 °C");
        expect(host.querySelector('[data-stat="blocked"]').textContent).toContain("1");
        const liquidRow = host.querySelector('[data-rule="liquid"]');
        expect(liquidRow.querySelectorAll('[data-cell="closed"]')).toHaveLength(3);
        expect(liquidRow.querySelectorAll('[data-cell="frost"]')).toHaveLength(1);
        expect(host.querySelector('[data-rule="solid"]').querySelectorAll('[data-cell="closed"]')).toHaveLength(2);
        expect(host.textContent).toContain("Slurry tanker");
        expect(host.textContent).not.toContain("Neighbour tanker");
        expect(host.querySelector('[data-rules-version="mismatch"]')).toBeNull();
    });

    test("open period without vehicles and a newer mod version", () => {
        const ui = loadCompanionPage("restrictedPeriods", ENTRY);
        const host = ui.renderPage(
            payload({ readState: "ok", currentPeriod: 4, liquidRead: true, solidRead: true, anyActive: false, byFarm: { "1": { blockedVehicles: 0 } }, vehicles: [] }, "1.1.0.0"),
            { farmId: 1 },
        );
        expect(host.querySelector('[data-stat="spreading"]').textContent).toContain("Allowed");
        expect(host.querySelector('[data-stat="temperature"]').textContent).toContain("—");
        expect(host.textContent).toContain("None of your vehicles is carrying slurry");
        expect(host.querySelector('[data-rules-version="mismatch"]')).not.toBeNull();
    });

    test("waiting reading keeps the rule grid and hides live tiles", () => {
        const ui = loadCompanionPage("restrictedPeriods", ENTRY);
        const host = ui.renderPage(payload(null), { farmId: 1 });
        expect(host.querySelector(".fd-mod-page__notice.is-waiting")).not.toBeNull();
        expect(host.querySelector('[data-stat="spreading"]')).toBeNull();
        expect(host.querySelector('[data-rule="liquid"]')).not.toBeNull();
        expect(host.textContent).toContain("Your spreaders appear after the next export.");
    });

    test("not detected renders the standard state", () => {
        const ui = loadCompanionPage("restrictedPeriods", ENTRY);
        const host = ui.renderPage({ companionMods: { mods: [] }, companionPages: { pages: {} } }, { farmId: 1 });
        expect(host.textContent).toContain("Not detected in this save");
        expect(host.querySelector('[data-rule="liquid"]')).toBeNull();
    });
});
