/**
 * @jest-environment jsdom
 */
"use strict";

const { productionTs, preactRuntime } = require("./helpers/production-source.cjs");

const { h, render } = preactRuntime().preact;
const i18n = {
    t: (key) => key,
    tOr: (key, fallback, params) => {
        let text = fallback || key;
        if (params) {
            for (const [name, value] of Object.entries(params)) text = text.replace(`{{${name}}}`, String(value));
        }
        return text;
    },
};
const ui = {
    Badge: (props) => h("span", null, props.children),
    Button: (props) => h("button", { type: "button", onClick: props.onClick }, props.children),
    Card: (props) => h("section", null, props.title, props.children),
};

const box = {
    state: {
        payload: null,
        activeFarmId: 1,
        sectionParams: {},
        setSection() {},
        setSectionParams() {},
    },
};
const useDashboardStore = (selector) => (selector ? selector(box.state) : box.state);
const profileDisplay = productionTs("NEW APP/src/lib/profile-display.ts", { "@/i18n/i18n": i18n });
const fillMode = productionTs("NEW APP/src/lib/fill-unit-mode.ts", {
    "@/store/dashboard-store": { useDashboardStore },
    "@/lib/fill-units": productionTs("NEW APP/src/lib/fill-units.ts"),
});
const economyLib = productionTs("NEW APP/src/lib/economy.ts", {
    "@/i18n/i18n": i18n,
    "@/lib/fleet-classify": productionTs("NEW APP/src/lib/fleet-classify.ts"),
    "@/lib/profile-display": profileDisplay,
});
const catalog = productionTs("NEW APP/src/lib/companionMods/catalog.ts");
const readings = productionTs("NEW APP/src/lib/companionMods/readings.ts");
const companionMods = productionTs("NEW APP/src/lib/companionMods/index.ts", {
    "./catalog": catalog,
    "./readings": readings,
});
const sections = productionTs("NEW APP/src/sections/companions/CompanionModsSection.tsx", {
    "preact/hooks": preactRuntime().hooks,
    "@/components/ui": ui,
    "@/i18n/i18n": i18n,
    "@/lib/economy": economyLib,
    "@/lib/fill-unit-mode": fillMode,
    "@/lib/profile-display": profileDisplay,
    "@/lib/companionMods": companionMods,
    "@/store/dashboard-store": { useDashboardStore },
    "@/types/dashboard": {},
    "@/sections/economy/economy.css": {},
    "./companions.css": {},
});

const loans = {
    enabled: true,
    readState: "ok",
    byFarm: {
        "1": {
            count: 1,
            restAmount: 1000,
            monthlyAnnuity: 100,
            loans: [{ amount: 1500, restAmount: 1000, monthlyAnnuity: 100 }],
        },
    },
};

function payload(profile, extra) {
    return {
        unitDisplay: profile ? { saveUnitProfiles: profile } : {},
        companionMods: {
            enabled: true,
            mods: [
                { id: "enhancedLoanSystem", title: "Enhanced Loan System", category: "finance", detected: true },
                { id: "automaticLoanRepay", title: "Automatic Loan Repay", category: "finance", detected: true },
            ],
            loans,
            automaticLoanRepay: { enabled: true, minimumBalance: 250 },
            ...extra,
        },
    };
}

function paint(Component) {
    const host = document.createElement("div");
    document.body.appendChild(host);
    render(h(Component, { categories: companionMods.COMPANION_CATEGORY_ORDER }), host);
    return host;
}

describe("companion cards use the dashboard profile", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    test("loan and repay amounts follow the live currency on the same mounted cards", () => {
        const companionData = payload({ applyState: "effective", effective: { money: 3 } }).companionMods;
        box.state.payload = {
            unitDisplay: { saveUnitProfiles: { applyState: "effective", effective: { money: 3 } } },
            companionMods: companionData,
        };
        const root = paint(sections.CompanionModsEmbed);
        expect(root.textContent).toContain("Outstanding£1,000");
        expect(root.textContent).toContain("Monthly payments£100");
        expect(root.textContent).toContain("Keep £250");
        expect(root.textContent).not.toContain("$");

        box.state.payload = {
            unitDisplay: { saveUnitProfiles: { applyState: "effective", effective: { money: 16 } } },
            companionMods: companionData,
        };
        render(h(sections.CompanionModsEmbed, { categories: companionMods.COMPANION_CATEGORY_ORDER }), root);
        expect(root.textContent).toContain("Outstanding1,000 грн");
        expect(root.textContent).toContain("Keep 250 грн");
        expect(root.textContent).not.toContain("£");

        box.state.payload = {
            unitDisplay: { saveUnitProfiles: { applyState: "effective", effective: { money: 99 } } },
            companionMods: companionData,
        };
        render(h(sections.CompanionModsEmbed, { categories: companionMods.COMPANION_CATEGORY_ORDER }), root);
        expect(root.textContent).toContain("1,000 profile.unitUnavailable");
        expect(root.textContent).not.toContain("$");

        box.state.payload = { unitDisplay: {}, companionMods: companionData };
        render(h(sections.CompanionModsEmbed, { categories: companionMods.COMPANION_CATEGORY_ORDER }), root);
        expect(root.textContent).toContain("Outstanding1,000");
        expect(root.textContent).not.toContain("$");
        render(null, root);
    });

    test("the embedded finance cards use the same profile", () => {
        box.state.payload = payload({ applyState: "effective", effective: { money: 3 } });
        const root = document.createElement("div");
        document.body.appendChild(root);
        render(h(sections.CompanionModsEmbed, { categories: ["finance"] }), root);
        const tiles = [...root.querySelectorAll(".fd-companions__stat")].map((tile) => tile.textContent);
        expect(tiles).toContain("Outstanding£1,000");
        expect(tiles).toContain("Monthly payments£100");
        expect(root.textContent).toContain("£1,500");
        expect(root.textContent).toContain("Keep £250");
        expect(root.textContent).not.toContain("$");
        render(null, root);
    });

    test("a failed loan read does not remove the repay card", () => {
        box.state.payload = payload(
            { applyState: "effective", effective: { money: 3 } },
            { loans: { enabled: true, readState: "failed", byFarm: {} } },
        );
        const root = paint(sections.CompanionModsEmbed);
        expect(root.textContent).toContain("Enhanced Loan System");
        expect(root.textContent).toContain("unavailable");
        expect(root.textContent).toContain("Automatic Loan Repay");
        expect(root.textContent).toContain("Keep £250");
        render(null, root);
    });
});
