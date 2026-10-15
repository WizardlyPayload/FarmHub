/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");

const ENTRY = { catalogId: "palletDegradation", title: "Pallet Degradation", group: "storage" };

function payload(page) {
    return {
        companionMods: { mods: [{ id: "palletDegradation", detected: true, version: "1.2.0.0" }] },
        companionPages: { pages: { palletDegradation: { key: "palletDegradation", detected: true, ...page } } },
    };
}

const SETTINGS = {
    globalMultiplier: 1, recoveryRate: 0.005, baseTempRate: 0.015, basePermRate: 0.001,
    pristineBonus: 0.05, pristineThreshold: 0.02, maxTempPenalty: 0.3, maxPermPenalty: 0.7, salvageFloor: 0.1,
};

describe("palletDegradation page", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    test("lists pallets worst first with condition bars, sale effect and settings", () => {
        const ui = loadCompanionPage("palletDegradation", ENTRY);
        const host = ui.renderPage(
            payload({
                readState: "ok",
                settings: SETTINGS,
                fillTypeCatalog: { tracked: 12, muted: 30, disabledByWhitelist: 2 },
                byFarm: {
                    "1": {
                        palletCount: 2, trackedCount: 2, outsideCount: 1, belowHalf: 1, belowEighty: 1,
                        pristineCount: 1, penaltyCount: 1, avgCondition: 69, avgWear: 20, minCondition: 40,
                        pallets: [
                            { id: "7", fillType: "SUGAR_CUBES", fillLevel: 1000, tracked: true, condition: 40, wear: 35, outside: true, saleAdjust: -0.2 },
                            { id: "8", fillType: "FLOUR", fillLevel: 800, tracked: true, condition: 99, wear: 0, outside: false, saleAdjust: 0.05 },
                        ],
                        byFillType: [{ fillType: "SUGAR_CUBES", count: 1, outside: 1, avgCondition: 40 }],
                    },
                },
            }),
            { farmId: 1 },
        );
        expect(host.querySelector('[data-stat="pallets"]').textContent).toContain("2");
        expect(host.querySelector('[data-stat="belowHalf"]').className).toContain("is-danger");
        const worst = host.querySelector('[data-row="7"]');
        expect(worst.className).toBe("is-danger");
        expect(worst.textContent).toContain("Sugar cubes");
        expect(worst.textContent).toContain("−20% damage penalty");
        expect(host.querySelector('[data-row="8"]').textContent).toContain("+5% pristine bonus");
        expect(host.querySelectorAll(".fd-mod-page__bar").length).toBe(2);
        expect(host.querySelector('[data-kv="recoveryRate"]').textContent).toContain("0.0050");
        expect(host.querySelector('[data-kv="salvageFloor"]').textContent).toContain("10%");
        expect(host.textContent).toContain("12 fill types decay, 30 do not, 2 are switched off by the whitelist.");
    });

    test("settings-only reading still shows the mod settings", () => {
        const ui = loadCompanionPage("palletDegradation", ENTRY);
        const host = ui.renderPage(payload({ readState: "settings-only", reason: "no-records", settings: SETTINGS }), { farmId: 1 });
        expect(host.querySelector(".fd-mod-page__notice.is-limited")).not.toBeNull();
        expect(host.querySelector("[data-stat]")).toBeNull();
        expect(host.textContent).toContain("Pallet condition appears once the mod has tracked pallets in this save.");
        expect(host.querySelector('[data-kv="pristineBonus"]').textContent).toContain("5%");
    });
});
