/** @jest-environment jsdom */
"use strict";

const fs = require("fs");
const path = require("path");
const { productionFunctions, productionTs, preactRuntime } = require("./helpers/production-source.cjs");

const { measuredClusterHealth } = productionFunctions(
    "NEW APP/src/lib/pastures-parsers.ts", ["measuredClusterHealth"],
);

describe("measured pasture health", () => {
    test("weights actual cluster averages by heads, not by row count", () => {
        expect(measuredClusterHealth({ clusters: [
            { count: 10, avgHealth: 10 },
            { count: 9, avgHealth: 16 },
        ] }, 19)).toBe(13);
    });

    test("keeps an explicitly measured zero, but not a missing measurement", () => {
        expect(measuredClusterHealth({ clusters: [{ count: 1, avgHealth: 0 }] }, 1)).toBe(0);
        expect(measuredClusterHealth({ clusters: [{ count: 1 }] }, 1)).toBeNull();
        expect(measuredClusterHealth({ health: 0, clusters: [] }, 1)).toBeNull();
    });

    test("partial, invalid and absent clusters cannot claim an average", () => {
        expect(measuredClusterHealth({ clusters: [{ count: 18, avgHealth: 13 }] }, 19)).toBeNull();
        expect(measuredClusterHealth({ clusters: [
            { count: 1, avgHealth: 13 }, { count: 1 },
        ] }, 2)).toBeNull();
        expect(measuredClusterHealth({ clusters: [{ count: 1, avgHealth: 101 }] }, 1)).toBeNull();
        expect(measuredClusterHealth(null, 19)).toBeNull();
    });
});

describe("livestock value currency", () => {
    afterEach(() => { document.body.innerHTML = ""; });

    test("the shared value display follows the effective profile and stays neutral when unknown", () => {
        let profile = { effective: { money: 3 } };
        const { preact } = preactRuntime();
        const panel = productionTs("NEW APP/src/sections/livestock/AnimalDetailPanel.tsx", {
            "@/i18n/i18n": {},
            "@/components/ui": {},
            "@/lib/livestock-format": {},
            "@/lib/genetics-overview": {},
            "@/lib/livestock-value": {},
            "@/lib/economy": {
                formatCurrency: (amount, selected) => selected?.effective?.money === 3
                    ? `\u00a3${amount}` : String(amount),
            },
            "@/lib/fill-unit-mode": { useUnitDisplay: () => ({ saveUnitProfiles: profile }) },
            "@/lib/profile-display": { saveProfileFromUnitDisplay: (display) => display.saveUnitProfiles ?? null },
        });
        const host = document.createElement("div");
        document.body.appendChild(host);
        preact.render(preact.h(panel.EstimatedAnimalMoney, { amount: 432 }), host);
        expect(host.textContent).toBe("\u00a3432");
        profile = null;
        preact.render(preact.h(panel.EstimatedAnimalMoney, { amount: 432 }), host);
        expect(host.textContent).toBe("432");
    });

    test("all livestock value surfaces use the same display without a literal dollar prefix", () => {
        const root = path.resolve(__dirname, "../..");
        for (const file of [
            "NEW APP/src/sections/livestock/LivestockPenPanel.tsx",
            "NEW APP/src/sections/livestock/AnimalDetailPanel.tsx",
            "NEW APP/src/sections/livestock/AnimalDetailsModal.tsx",
        ]) {
            const source = fs.readFileSync(path.join(root, file), "utf8");
            expect(source).toContain("EstimatedAnimalMoney");
            expect(source).not.toMatch(/\$\$?\{(?:valueInfo\.value|breakdown\.baseValue|info\.getValue\(\))/);
        }
    });
});
