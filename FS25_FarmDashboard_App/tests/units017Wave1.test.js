/**
 * @jest-environment jsdom
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { productionTs, preactRuntime } = require("./helpers/production-source.cjs");

const lua = fs.readFileSync(
    path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua"),
    "utf8",
);

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

describe("wave 1 companion readers", () => {
    test("the collector reads the proven fields and does not use the player-farm task helper", () => {
        expect(lua).toContain("local function collectSeasonalWool");
        expect(lua).toContain("local function collectTaskList");
        expect(lua).toContain("local function collectProductionSchedule");
        expect(lua).toContain("local function collectEconomicHistory");
        expect(lua).not.toContain("getActiveTasksForCurrentFarm");
        expect(lua).not.toContain("playerUserId");
        expect(catalog.companionSupport(catalog.catalogEntry("seasonalWoolProduction"))).toBe("limited");
        expect(catalog.companionSupport(catalog.catalogEntry("economicHistory"))).toBe("limited");
    });

    test("the cards show the farm-scoped reading and an empty task list", () => {
        box.state.payload = {
            unitDisplay: { saveUnitProfiles: { applyState: "effective", effective: { money: 3 } } },
            companionMods: {
                enabled: true,
                mods: [
                    { id: "seasonalWoolProduction", title: "Seasonal Wool Production", category: "livestock", detected: true },
                    { id: "taskList", title: "Task List", category: "contracts", detected: true },
                    { id: "economicHistory", title: "Economic History", category: "finance", detected: true },
                ],
                // Producer shape from collectSeasonalWool: map-wide season and fee,
                // pen count owned by the exporting farm.
                seasonalWool: {
                    enabled: true,
                    readState: "ok",
                    source: "seasonalWoolProduction",
                    scope: "map",
                    isShearingMonth: true,
                    shearingCostPerSheep: 5,
                    feeScope: "map",
                    farmId: 1,
                    trackedPens: 2,
                    coverage: "complete",
                    pensReadState: "ok",
                },
                taskList: { enabled: true, readState: "empty", tasks: [] },
                economicHistory: {
                    enabled: true,
                    readState: "ok",
                    current: { balance: 1000, total: 50, loanBalance: 0 },
                    months: [{ year: 2030, period: 6, total: 50 }],
                },
            },
        };
        const host = document.createElement("div");
        document.body.appendChild(host);
        render(h(sections.CompanionModsEmbed, { categories: companionMods.COMPANION_CATEGORY_ORDER }), host);
        expect(host.textContent).toContain("Shearing month");
        expect(host.textContent).toContain("£5");
        expect(host.textContent).toContain("Tracked pens2");
        expect(host.textContent).toContain("No active tasks for this farm.");
        expect(host.textContent).toContain("£1,000");
        expect(host.textContent).toContain("1 recorded month(s)");
        render(null, host);
        host.remove();
    });

    test("wool pens stay private to the owning farm and an ownerless fee is not shown", () => {
        const woolPayload = (seasonalWool) => ({
            unitDisplay: { saveUnitProfiles: { applyState: "effective", effective: { money: 3 } } },
            companionMods: {
                enabled: true,
                mods: [{ id: "seasonalWoolProduction", title: "Seasonal Wool Production", category: "livestock", detected: true }],
                seasonalWool,
            },
        });
        const host = document.createElement("div");
        document.body.appendChild(host);

        // Another farm keeps the shared map season and configured fee, never the pen count.
        box.state.activeFarmId = 2;
        box.state.payload = woolPayload({
            enabled: true, readState: "ok", scope: "map", isShearingMonth: true,
            shearingCostPerSheep: 5, feeScope: "map", farmId: 1, trackedPens: 2, coverage: "complete", pensReadState: "ok",
        });
        render(h(sections.CompanionModsEmbed, { categories: companionMods.COMPANION_CATEGORY_ORDER }), host);
        expect(host.textContent).toContain("Shearing month");
        expect(host.textContent).toContain("£5");
        expect(host.textContent).not.toContain("pen(s)");

        // Another farm with no map-scoped facts sees no wool numbers at all.
        box.state.payload = woolPayload({
            enabled: true, readState: "ok", isShearingMonth: true, shearingCostPerSheep: 5, farmId: 1, trackedPens: 2,
        });
        render(h(sections.CompanionModsEmbed, { categories: companionMods.COMPANION_CATEGORY_ORDER }), host);
        expect(host.textContent).not.toContain("£5");
        expect(host.textContent).not.toContain("pen(s)");
        expect(host.textContent).not.toContain("Shearing month");

        // Unknown owner and no feeScope: the fee and pens are refused for the selected farm.
        box.state.activeFarmId = 1;
        box.state.payload = woolPayload({
            enabled: true, readState: "ok", isShearingMonth: true, shearingCostPerSheep: 5, trackedPens: 2,
        });
        render(h(sections.CompanionModsEmbed, { categories: companionMods.COMPANION_CATEGORY_ORDER }), host);
        expect(host.textContent).toContain("Shearing month");
        expect(host.textContent).not.toContain("£5");
        expect(host.textContent).not.toContain("pen(s)");

        render(null, host);
        host.remove();
    });

    test("another farm and a failed read do not show the first farm's task", () => {
        box.state.activeFarmId = 2;
        box.state.payload = {
            companionMods: {
                enabled: true,
                mods: [{ id: "taskList", title: "Task List", category: "contracts", detected: true }],
                taskList: {
                    enabled: true,
                    readState: "ok",
                    farmId: 1,
                    tasks: [{ id: "t1", detail: "PRIVATE FARM ONE TASK" }],
                },
            },
        };
        const host = document.createElement("div");
        document.body.appendChild(host);
        render(h(sections.CompanionModsEmbed, { categories: companionMods.COMPANION_CATEGORY_ORDER }), host);
        expect(host.textContent).toContain("These numbers are for another farm.");
        expect(host.textContent).not.toContain("PRIVATE FARM ONE TASK");
        box.state.payload = {
            companionMods: {
                enabled: true,
                mods: [{ id: "taskList", title: "Task List", category: "contracts", detected: true }],
                taskList: { enabled: true, readState: "failed", farmId: 2, tasks: [] },
            },
        };
        render(h(sections.CompanionModsEmbed, { categories: companionMods.COMPANION_CATEGORY_ORDER }), host);
        expect(host.textContent).toContain("This reading failed. It is not an empty result.");
        expect(host.textContent).not.toContain("No active tasks");
        render(null, host);
        host.remove();
        box.state.activeFarmId = 1;
    });
});
