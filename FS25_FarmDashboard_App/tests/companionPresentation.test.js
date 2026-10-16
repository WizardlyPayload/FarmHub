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
const presentation = productionTs("NEW APP/src/lib/companionMods/presentation.ts", { "./catalog": catalog });
const registry = productionTs("NEW APP/src/sections/mods/registry.ts");
const modsShared = { ModPageLink: (props) => h("button", { type: "button", "data-page-link": props.pageKey }, "Open full page") };
const sections = productionTs("NEW APP/src/sections/companions/CompanionModsSection.tsx", {
    "@/sections/mods/registry": registry,
    "@/sections/mods/shared": modsShared,
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

function crop(name, plantingPeriods, harvestPeriods, extra) {
    return { crop: name, readState: "ok", source: "map-calendar", plantingPeriods, harvestPeriods, ...extra };
}

const calendar = {
    enabled: true,
    readState: "ok",
    selectedRegion: "vanilla",
    calendarsReadState: "ok",
    coverage: "complete",
    crops: [crop("WHEAT", [9, 10], [7, 8]), crop("BARLEY", [1, 2, 7], [6, 7])],
};

function paint(node) {
    const host = document.createElement("div");
    document.body.appendChild(host);
    render(node, host);
    return host;
}

describe("companion presentation helpers", () => {
    test("crop calendar grid marks planting, harvest and overlap per period", () => {
        const grid = presentation.cropCalendarGrid(calendar, 7);
        expect(grid.status).toBe("ok");
        expect(grid.rows.map((row) => row.label)).toEqual(["Barley", "Wheat"]);
        const barley = grid.rows[0].cells;
        expect(barley[0]).toBe("plant");
        expect(barley[5]).toBe("harvest");
        expect(barley[6]).toBe("both");
        expect(barley[11]).toBeNull();
        expect(grid.currentPeriod).toBe(7);
        expect(grid.partial).toBe(false);
    });

    test("no verified region or unread calendars never produce a grid", () => {
        expect(presentation.cropCalendarGrid({ ...calendar, selectedRegion: "" }).status).toBe("unavailable");
        expect(presentation.cropCalendarGrid({ ...calendar, readState: "error" }).status).toBe("unavailable");
        expect(presentation.cropCalendarGrid({ ...calendar, calendarsReadState: "pending" })).toEqual({
            status: "pending",
            region: "vanilla",
        });
        expect(presentation.cropCalendarGrid(calendar, 13).currentPeriod).toBeNull();
    });

    test("incomplete crops are flagged partial and carry no marks", () => {
        const grid = presentation.cropCalendarGrid({
            ...calendar,
            crops: [crop("OAT", [1], [5], { readState: "partial" })],
        });
        expect(grid.partial).toBe(true);
        expect(grid.rows[0].complete).toBe(false);
        expect(grid.rows[0].cells.every((cell) => cell === null)).toBe(true);
    });

    test("tiering: detection-only and unread mods are listed, live blocks get a panel", () => {
        const payload = { cropCalendar: calendar, loans: { enabled: false } };
        expect(presentation.companionTier(catalog.catalogEntry("dynamicMarket"), payload)).toEqual({
            tier: "listed",
            reason: "detection-only",
        });
        expect(presentation.companionTier(catalog.catalogEntry("regionalCropCalendar"), payload)).toEqual({ tier: "live" });
        expect(presentation.companionTier(catalog.catalogEntry("enhancedLoanSystem"), payload)).toEqual({
            tier: "listed",
            reason: "no-reading",
        });
        expect(presentation.companionPanelId("real silo")).toBe("fd-companion-real-silo");
        expect(presentation.cropLabel("GREENBEAN")).toBe("Greenbean");
        expect(presentation.cropLabel("Sugar beet")).toBe("Sugar beet");
    });
});

describe("companion panels on section pages", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    test("fields embed renders the crop x period grid with the current period highlighted", () => {
        box.state.payload = {
            companionMods: {
                enabled: true,
                mods: [
                    { id: "regionalCropCalendar", title: "Regional Crop Calendar", category: "fields", detected: true },
                    { id: "restrictedPeriods", title: "Restricted Periods", category: "fields", detected: true },
                ],
                cropCalendar: calendar,
                restrictedPeriods: {
                    enabled: true,
                    readState: "ok",
                    currentPeriod: 7,
                    liquidWindow: { currentAllowed: true },
                    solidWindow: { currentAllowed: true },
                },
            },
        };
        const root = paint(h(sections.CompanionModsEmbed, { categories: ["fields"] }));
        const rows = [...root.querySelectorAll("tr[data-crop]")];
        expect(rows.map((row) => row.getAttribute("data-crop"))).toEqual(["BARLEY", "WHEAT"]);
        const barleyMarks = [...rows[0].querySelectorAll("td")].map((cell) => cell.getAttribute("data-mark"));
        expect(barleyMarks.slice(0, 2)).toEqual(["plant", "plant"]);
        expect(barleyMarks[6]).toBe("both");
        expect(root.querySelectorAll("td.is-current").length).toBe(2);
        expect(root.querySelector("th.is-current").textContent).toBe("7");
        expect(root.querySelector("details.fd-companions__calendar").open).toBe(true);
        expect(root.querySelector("#fd-companion-regionalCropCalendar")).not.toBeNull();
        expect(root.textContent).toContain("2 crop calendar(s)");
    });

    test("detected-only mods become chips, not empty panels", () => {
        box.state.payload = {
            companionMods: {
                enabled: true,
                mods: [
                    { id: "dynamicMarket", title: "Dynamic Market", category: "economy", detected: true },
                    { id: "realisticDieselPrice", title: "Realistic Diesel Price", category: "economy", detected: true },
                ],
                diesel: { enabled: true, readState: "ok", price: 1.81, source: "native" },
            },
        };
        const root = paint(h(sections.CompanionModsEmbed, { categories: ["economy"] }));
        expect(root.querySelector("#fd-companion-dynamicMarket").classList.contains("fd-companions__chip")).toBe(true);
        expect(root.querySelectorAll(".fd-companions__panel-wrap").length).toBe(1);
        expect(root.querySelector("#fd-companion-realisticDieselPrice").classList.contains("fd-companions__panel-wrap")).toBe(true);
        expect(root.textContent).toContain("Also installed");
        expect(root.textContent).toContain("Dynamic Market");
        expect(root.querySelector('#fd-companion-dynamicMarket [data-page-link="dynamicMarket"]')).not.toBeNull();
        expect(root.querySelector('#fd-companion-realisticDieselPrice [data-page-link="realisticDieselPrice"]')).not.toBeNull();
    });

    test("embeds link each mod to its own page and never to a companion index", () => {
        box.state.payload = {
            companionMods: {
                enabled: true,
                mods: [
                    { id: "dynamicMarket", title: "Dynamic Market", category: "economy", detected: true },
                    { id: "regionalCropCalendar", title: "Regional Crop Calendar", category: "fields", detected: true },
                ],
                cropCalendar: calendar,
            },
        };
        const root = paint(h(sections.CompanionModsEmbed, { categories: ["economy", "fields"] }));
        expect(root.querySelector('#fd-companion-dynamicMarket [data-page-link="dynamicMarket"]')).not.toBeNull();
        expect(root.querySelector('[data-mod="regionalCropCalendar"] [data-page-link="regionalCropCalendar"]')).not.toBeNull();
        expect(root.textContent).not.toContain("View all");
        expect([...root.querySelectorAll("button")].every((b) => b.hasAttribute("data-page-link"))).toBe(true);
        expect(sections.CompanionModsSection).toBeUndefined();
    });

    test("embed chips mark mods read on their own page instead of calling them unread", () => {
        box.state.payload = {
            companionMods: {
                enabled: true,
                mods: [
                    { id: "dynamicMarket", title: "Dynamic Market", category: "economy", detected: true },
                    { id: "courseplay", title: "Courseplay", category: "fleet", detected: true },
                ],
            },
        };
        const root = paint(h(sections.CompanionModsEmbed, { categories: ["economy", "fleet"] }));
        const chip = root.querySelector("#fd-companion-dynamicMarket");
        expect(chip.textContent).toContain("Own page");
        expect(chip.textContent).not.toContain("Detected only");
        expect(chip.getAttribute("title")).toContain("FarmHub reads this mod on its own page under Mods in the sidebar.");
    });
});
