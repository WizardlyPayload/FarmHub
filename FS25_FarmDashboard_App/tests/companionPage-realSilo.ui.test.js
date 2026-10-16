/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");

const ENTRY = { catalogId: "realSilo", title: "RealSilo", group: "storage" };

function payload(page) {
    return {
        companionMods: { mods: [{ id: "realSilo", detected: true, version: "1.1.0.2" }] },
        companionPages: { pages: { realSilo: { key: "realSilo", detected: true, ...page } } },
    };
}

describe("realSilo page", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    test("renders farm totals, crop summary and compartments with moisture and grade", () => {
        const ui = loadCompanionPage("realSilo", ENTRY);
        const host = ui.renderPage(
            payload({
                readState: "ok",
                defaults: { compartments: 4, capacityPerCompartment: 50000 },
                byFarm: {
                    "1": {
                        siloCount: 1, compartments: 4, usedCompartments: 2, extensionCompartments: 0, totalFill: 60000, totalCapacity: 200000,
                        activeTransfers: 1, dryingTransfers: 0, unconfigured: 0,
                        byFillType: [{ fillType: "WHEAT", title: "Wheat", liters: 50000, compartments: 1 }],
                    },
                },
                silos: [
                    {
                        farmId: 1, id: "rs_1", name: "Main silo", configured: true, hasDryer: true, compartments: 4, capacityPerCompartment: 50000,
                        fill: 60000, capacity: 200000, transfer: { fromSlot: 1, toSlot: 2, rate: 100 },
                        slots: [
                            { index: 1, fillType: "WHEAT", title: "Wheat", fillLevel: 50000, capacity: 50000, isActive: true, moisture: 0.145, quality: 92 },
                            { index: 2, fillType: "BARLEY", title: "Barley", fillLevel: 10000, capacity: 50000 },
                        ],
                    },
                    { farmId: 3, id: "rs_x", name: "Other farm silo", slots: [] },
                ],
            }),
            { farmId: 1 },
        );
        expect(host.querySelector('[data-stat="compartments"]').textContent).toContain("2 / 4");
        expect(host.querySelector('[data-stat="fill"]').textContent).toContain("30%");
        expect(host.querySelector('[data-row="WHEAT"]').textContent).toContain("50,000 L");
        const first = host.querySelector('[data-row="1"]');
        expect(first.textContent).toContain("Receiving");
        expect(first.textContent).toContain("14.5%");
        expect(first.textContent).toContain("A");
        expect(first.className).toBe("is-warn");
        expect(host.querySelector('[data-kv="transfer"]').textContent).toContain("Compartment 1 → 2");
        expect(host.textContent).not.toContain("Other farm silo");
        expect(host.textContent).toContain("New silos start with 4 compartments of 50,000 L.");
    });

    test("waiting reading shows the empty silo card", () => {
        const ui = loadCompanionPage("realSilo", ENTRY);
        const host = ui.renderPage({ companionMods: { mods: [{ id: "realSilo", detected: true }] }, companionPages: { pages: {} } }, { farmId: 1 });
        expect(host.querySelector(".fd-mod-page__notice.is-waiting")).not.toBeNull();
        expect(host.textContent).toContain("Silos appear after the next export.");
    });
});
