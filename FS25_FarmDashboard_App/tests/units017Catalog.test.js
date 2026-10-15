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
const ui = {
    Badge: (props) => h("span", null, props.children),
    Button: (props) => h("button", { type: "button" }, props.children),
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

function entry(id) {
    return catalog.COMPANION_CATALOG.find((row) => row.id === id);
}

describe("catalog support claims", () => {
    test("the ten corrected entries match their source meaning and support tier", () => {
        expect(entry("stallRental").desc).toContain("boarding income");
        expect(entry("stallRental").desc).not.toContain("rent stall capacity");
        expect(catalog.companionSupport(entry("stallRental"))).toBe("unmapped");

        expect(entry("animalFoodOverview").desc).toContain("feed groups");
        expect(entry("animalFoodOverview").desc).not.toContain("food/water stocks");
        expect(catalog.companionSupport(entry("animalFoodOverview"))).toBe("unmapped");

        expect(entry("smartCropControl").desc).toContain("NPC");
        expect(entry("smartCropControl").desc).toContain("does not plan the player's own crops");

        expect(entry("productionControl").desc).toContain("50%");
        expect(entry("productionControl").desc).toContain("300%");
        expect(entry("productionControl").desc).not.toContain("prioritising");

        expect(entry("outOfFuel").desc).toContain("safety fuel top-up");
        expect(entry("outOfFuel").category).toBe("fleet");
        expect(catalog.companionSupport(entry("outOfFuel"))).toBe("detection-only");

        expect(entry("bushelPlus").category).toBe("fleet");
        expect(entry("bushelPlus").desc).toContain("loss-measurement");
        expect(entry("bushelPlus").desc).not.toContain("fill-unit");
        expect(catalog.companionSupport(entry("bushelPlus"))).toBe("unmapped");

        expect(entry("ingameTimeOperatingHours").desc).toContain("fuel use");
        expect(entry("enhancedSeasonalPrices").desc).toContain("buying prices");
        expect(entry("enhancedSeasonalPrices").desc).toContain("Seasonal Prices");
        expect(entry("animalTrader").desc).toContain("placeable");

        expect(catalog.companionSupport(entry("dynamicMarket"))).toBe("detection-only");
        expect(entry("dynamicMarket").desc).toContain("on its own page");
        expect(entry("dynamicMarket").desc).not.toContain("only detects");
        expect(catalog.companionSupport(entry("soilWorkYieldBonus"))).toBe("limited");
        expect(entry("soilWorkYieldBonus").desc).toContain("one grid for the whole map");
        expect(catalog.companionSupport(entry("realSilo"))).toBe("limited");
        expect(catalog.companionSupport(entry("palletDegradation"))).toBe("limited");
        expect(catalog.companionSupport(entry("seasonalMilkProduction"))).toBe("limited");
    });

    test("an enabled detection-only card does not claim live farm numbers", () => {
        box.state.payload = {
            companionMods: {
                enabled: true,
                mods: [{ id: "dynamicMarket", title: "Dynamic Market", category: "economy", detected: true }],
                dynamicMarket: { enabled: true, readState: "detection-only" },
            },
        };
        const host = document.createElement("div");
        document.body.appendChild(host);
        render(h(sections.CompanionModsEmbed, { categories: ["economy"] }), host);
        const chip = host.querySelector("#fd-companion-dynamicMarket");
        expect(chip.textContent).toContain("Own page");
        expect(chip.getAttribute("title")).toContain("FarmHub reads this mod on its own page under Mods in the sidebar.");
        expect(chip.getAttribute("title")).not.toContain("farm numbers");
        expect(chip.getAttribute("title")).toContain("never changes prices");
        render(null, host);
        host.remove();
    });
});
