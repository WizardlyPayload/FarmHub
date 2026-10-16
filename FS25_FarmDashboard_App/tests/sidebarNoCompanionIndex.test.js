/**
 * @jest-environment jsdom
 */
"use strict";

const { productionTs, preactRuntime } = require("./helpers/production-source.cjs");

const { h, render } = preactRuntime().preact;
const i18n = {
    t: (key) => key,
    tOr: (key, fallback) => fallback || key,
};
const box = {
    state: {
        section: "overview",
        setSection() {},
        enabledSections: {},
        payload: null,
        activeFarmId: 1,
    },
};
const useDashboardStore = (selector) => (selector ? selector(box.state) : box.state);
const mocks = {
    "@/i18n/i18n": i18n,
    "@/store/dashboard-store": { useDashboardStore },
};
const dashboard = productionTs("NEW APP/src/types/dashboard.ts", mocks);
const sidebar = productionTs("NEW APP/src/app/SectionSidebar.tsx", mocks);
const registry = productionTs("NEW APP/src/sections/mods/registry.ts", mocks);

function paint(payload) {
    box.state.payload = payload;
    const host = document.createElement("div");
    document.body.appendChild(host);
    render(h(sidebar.SectionSidebar, null), host);
    const labels = [...host.querySelectorAll(".fd-sidebar__label")].map((el) => el.textContent);
    const modGroup = host.querySelectorAll(".fd-sidebar__list")[1];
    const modLabels = modGroup
        ? [...modGroup.querySelectorAll(".fd-sidebar__label")].map((el) => el.textContent)
        : [];
    render(null, host);
    host.remove();
    return { labels, modLabels };
}

describe("sidebar without the Companion mods index", () => {
    test("the companions section id is gone and falls back to Save overview", () => {
        expect(dashboard.ALL_SECTIONS).not.toContain("companions");
        expect(dashboard.MOD_NAV_SECTIONS).not.toContain("companions");
        expect(dashboard.normalizeSectionId("companions")).toBe("overview");
        expect(dashboard.normalizeSectionId("mod-dynamicMarket")).toBe("mod-dynamicMarket");
    });

    test("detected mods get their own entries under Mods and no index entry", () => {
        const { labels, modLabels } = paint({
            companionMods: {
                enabled: true,
                mods: [
                    { id: "dynamicMarket", title: "Dynamic Market", category: "economy", detected: true },
                    { id: "enhancedLoanSystem", title: "Enhanced Loan System", category: "finance", detected: true },
                    { id: "courseplay", title: "Courseplay", category: "fleet", detected: false },
                ],
            },
        });
        expect(labels).not.toContain("Companion mods");
        expect(labels.some((label) => /companion/i.test(label))).toBe(false);
        expect(modLabels).toEqual(expect.arrayContaining(["Dynamic Market", "Enhanced Loan System"]));
        expect(modLabels).not.toContain("Courseplay");
    });

    test("mods read on Storage, Productions, Vehicles, Fields or as units get no sidebar entry even when detected", () => {
        const folded = {
            timeSavingStockCheck: ["Time Saving Stock Check", "storage"],
            productionWatcher: ["Production Watcher", "productions"],
            courseplay: ["Courseplay", "vehicles"],
            vehicleYears: ["Vehicle Years", "vehicles"],
            vehicleMileage: ["Vehicle Mileage", "vehicles"],
            outOfFuel: ["Out Of Fuel", "vehicles"],
            advancedMaintenance: ["Advanced Maintenance", "vehicles"],
            collisionDamage: ["Collision Damage", "vehicles"],
            puncturedTires: ["Punctured Tires", "vehicles"],
            bushelPlus: ["Bushel Plus", "vehicles"],
            soilWorkYieldBonus: ["Soil Work Yield Bonus", "fields"],
            britishFillUnits: ["British Fill Units", "economy"],
            imperialSystem: ["Imperial System", "economy"],
        };
        const pages = {};
        for (const key of Object.keys(folded)) pages[key] = { detected: true, byFarm: {} };
        const { labels, modLabels } = paint({
            companionMods: {
                enabled: true,
                mods: [
                    { id: "dynamicMarket", title: "Dynamic Market", category: "economy", detected: true },
                    ...Object.entries(folded).map(([id, [title]]) => ({ id, title, category: "fleet", detected: true })),
                ],
            },
            companionPages: { pages },
        });
        expect(modLabels).toEqual(["Dynamic Market"]);
        const registryKeys = registry.COMPANION_PAGES.map((entry) => entry.key);
        for (const [key, [title, destination]] of Object.entries(folded)) {
            expect(labels).not.toContain(title);
            expect(registryKeys).not.toContain(key);
            expect(dashboard.normalizeSectionId(`mod-${key}`)).toBe(destination);
        }
    });

    test("with no detected mods the Mods group and index are both absent", () => {
        const { labels, modLabels } = paint({
            companionMods: {
                enabled: true,
                mods: [{ id: "dynamicMarket", title: "Dynamic Market", category: "economy", detected: false }],
            },
        });
        expect(modLabels).toEqual([]);
        expect(labels).not.toContain("Companion mods");
        expect(labels).not.toContain("Dynamic Market");
    });

    test("a removed mod is hidden even when its previous page data is retained", () => {
        const stalePage = { dynamicMarket: { key: "dynamicMarket", detected: true, priceHistory: [100] } };
        const payload = {
            companionMods: { enabled: false, mods: [] },
            companionPages: { pages: stalePage },
        };
        expect(paint(payload).modLabels).toEqual([]);
        expect(registry.visibleCompanionPages(payload)).toEqual([]);
        expect(stalePage.dynamicMarket.priceHistory).toEqual([100]);

        const reenabled = {
            ...payload,
            companionMods: { enabled: true, mods: [{ id: "dynamicMarket", detected: true }] },
        };
        expect(paint(reenabled).modLabels).toEqual(["Dynamic Market"]);
    });

    test("an old export without a companion catalog can still show detected pages", () => {
        expect(paint({ companionPages: { pages: { dynamicMarket: { detected: true } } } }).modLabels)
            .toEqual(["Dynamic Market"]);
    });
});
