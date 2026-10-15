/**
 * @jest-environment jsdom
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");
const { productionTs, preactRuntime } = require("./helpers/production-source.cjs");

const NOT_TESTED = [
    "pixels",
    "native-keyboard",
    "native-numerical-comparison",
    "package",
    "installed-load",
    "persisted-website",
    "two-visitor-delayed-switch",
];

const MATRIX = [
    { id: "farmReputation", producer: "COVERED", renderer: "COVERED" },
    { id: "moistureSystem", producer: "COVERED", renderer: "COVERED" },
    { id: "rentYourField", producer: "COVERED", renderer: "COVERED" },
    { id: "farmlandMarketplace", producer: "COVERED", renderer: "COVERED" },
    { id: "distributionRedux", producer: "COVERED", renderer: "COVERED" },
    { id: "silageCompactionMonitor", producer: "COVERED", renderer: "COVERED" },
    { id: "farmOperationsDashboard", producer: "COVERED", renderer: "COVERED" },
    { id: "factoryProfitCalculator", producer: "COVERED", renderer: "COVERED" },
    { id: "fieldProfitabilityLedger", producer: "COVERED", renderer: "COVERED", reason: "single-player, farm-scoped summary query; producer executed in units017Wave2" },
    ...NOT_TESTED.map((id) => ({ id, producer: "NOT_TESTED", renderer: "NOT_TESTED" })),
];

const source = fs.readFileSync(
    path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua"),
    "utf8",
);

function runLua(setup, expression) {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    const chunk = `${source}\n${setup}\nlocal out = CompanionModsDataCollector:collect()\nreturn ${expression}`;
    if (lauxlib.luaL_dostring(L, to_luastring(chunk)) !== lua.LUA_OK) {
        throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
    }
    return to_jsstring(lua.lua_tostring(L, -1));
}

const { h, render } = preactRuntime().preact;
function fill(template, params) {
    return String(template || "").replace(/\{\{(\w+)\}\}/g, (_, key) => (
        params && params[key] != null ? String(params[key]) : ""
    ));
}
// Merged English catalog with the app's t/tOr semantics: catalog text first, fallback only when the key is missing.
const en = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../web/locales/messages/en.json"), "utf8"));
const i18n = {
    t: (key, params) => fill(en[key] ?? key, params),
    tOr: (key, fallback, params) => (en[key] ? fill(en[key], params) : fill(fallback || key, params)),
};
function fieldText(host, labelKey) {
    return [...host.querySelectorAll(`[data-field="${labelKey}"] dd`)].map((node) => node.textContent);
}
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

describe("producer to renderer matrix", () => {
    test("coverage is declared and native gates stay untested", () => {
        for (const id of NOT_TESTED) {
            const row = MATRIX.find((item) => item.id === id);
            expect(row.producer).toBe("NOT_TESTED");
            expect(row.renderer).toBe("NOT_TESTED");
        }
        expect(source).not.toMatch(/\.getProductionPoints\b|getProductionPoints\s*\(/);
        expect(catalog.companionSupport(catalog.catalogEntry("factoryProfitCalculator"))).toBe("limited");
        expect(catalog.companionSupport(catalog.catalogEntry("fieldProfitabilityLedger"))).toBe("limited");
        expect(catalog.catalogEntry("fieldProfitabilityLedger").liveKey).toBe("fieldProfitabilityLedger");
        expect(catalog.companionSupport(catalog.catalogEntry("farmReputation"))).toBe("limited");
    });

    test("a reputation producer number renders for the owning farm only", () => {
        const produced = runLua(`
            getfenv = function() return _G end
            g_currentMission = { getFarmId = function() return 1 end }
            g_modIsLoaded = { ['FS25_367320_Farm_Reputation'] = true }
            _G['FS25_367320_Farm_Reputation'] = {
                ReputationManager = {
                    reputationByFarm = { [1] = 800, [2] = 9000 },
                    ranks = { { min = 750, missionLimit = 4, rewardBonus = 0.05 } },
                    add = function() error('write') end,
                },
            }
        `, "tostring(out.farmReputation.reputation) .. '|' .. tostring(out.farmReputation.missionLimit) .. '|'"
            + " .. tostring(out.farmReputation.rewardBonus) .. '|' .. tostring(out.farmReputation.farmId) .. '|'"
            + " .. tostring(out.farmReputation.scope) .. '|' .. tostring(out.farmReputation.readState)");
        expect(produced).toBe("800|4|0.05|1|farm|ok");
        const [score, missionLimit, rewardBonus] = produced.split("|").map(Number);

        box.state.activeFarmId = 1;
        box.state.payload = {
            companionMods: {
                enabled: true,
                mods: [
                    { id: "farmReputation", title: "Farm Reputation", category: "contracts", detected: true },
                    { id: "moistureSystem", title: "Moisture System", category: "fields", detected: true },
                    { id: "rentYourField", title: "Rent Your Field", category: "fields", detected: true },
                    { id: "farmlandMarketplace", title: "Farmland Marketplace", category: "fields", detected: true },
                    { id: "distributionRedux", title: "Distribution Redux", category: "production", detected: true },
                    { id: "silageCompactionMonitor", title: "Silage Compaction Monitor", category: "storage", detected: true },
                    { id: "farmOperationsDashboard", title: "Farm Operations Dashboard", category: "economy", detected: true },
                    { id: "fieldProfitabilityLedger", title: "Field Profitability Ledger", category: "fields", detected: true },
                ],
                farmReputation: {
                    enabled: true, source: "farmReputation", readState: "ok", scope: "farm", farmId: 1,
                    reputation: score, missionLimit, rewardBonus,
                },
                moistureSystem: { enabled: true, readState: "ok", scope: "map", mapMoisturePercent: 42 },
                rentYourField: { enabled: true, readState: "ok", coverage: "complete", scope: "farm", farmId: 1, agreements: [{ farmlandId: 4, duration: 2 }] },
                farmlandMarketplace: { enabled: true, readState: "ok", coverage: "complete", scope: "farm", farmId: 1, rows: [{ kind: "sale", farmlandId: 7, price: 1500 }] },
                fieldProfitabilityLedger: {
                    enabled: true, source: "fieldProfitabilityLedger", readState: "ok", coverage: "complete", scope: "farm",
                    farmId: 1, singlePlayerOnly: true, sales: { present: false, reason: "no-sale-category" },
                    cycles: [{
                        cycleId: "c1", land: "Ledger Field 3", farmId: 1, crop: "WHEAT", state: "open", area: 4.2,
                        totalsRead: "ok", totalsCoverage: "complete", totalsCount: 1, totalsCountExact: true,
                        totals: [{ accountingClass: "Direct", category: "seed", unit: "money", direction: "expense", amount: 120 }],
                    }],
                },
                distributionRedux: { enabled: true, readState: "ok", scope: "global", mode: 2, modeKey: "distribute", sellEnabled: false },
                silageCompaction: { enabled: true, readState: "ok", scope: "player-hud", farmId: 1, context: "Compacted: 40%", estimate: "Est. Time: 0h 5m" },
                farmOperations: { enabled: true, readState: "ok", farmId: 1, fields: [{ farmlandId: 9, growthState: 4 }] },
            },
        };
        const host = document.createElement("div");
        document.body.appendChild(host);
        render(h(sections.CompanionModsEmbed, { categories: companionMods.COMPANION_CATEGORY_ORDER }), host);
        expect(host.textContent).toContain("Reputation 800");
        expect(fieldText(host, "companions.field.reputation")).toEqual(["800"]);
        expect(fieldText(host, "companions.field.missionLimit")).toEqual(["4"]);
        expect(fieldText(host, "companions.field.rewardBonus")).toEqual(["5%"]);
        expect(fieldText(host, "companions.field.periodsRented")).toEqual(["2"]);
        expect(fieldText(host, "companions.field.land")).toEqual(["Ledger Field 3"]);
        expect(host.textContent).toContain("Map moisture 42%");
        expect(host.textContent).toContain("1 field(s) rented out");
        expect(host.textContent).toContain("1 marketplace row(s)");
        expect(host.textContent).toContain("Default mode Distribute");
        expect(host.textContent).toContain("Compacted: 40%");
        expect(host.textContent).toContain("Est. Time: 0h 5m");
        expect(host.textContent).toContain("1 field HUD row(s)");
        expect(host.textContent).not.toContain("9000");
        box.state.activeFarmId = 2;
        render(h(sections.CompanionModsEmbed, { categories: companionMods.COMPANION_CATEGORY_ORDER }), host);
        expect(host.textContent).toContain("These numbers are for another farm.");
        expect(host.textContent).toContain("Map moisture 42%");
        expect(host.textContent).toContain("Default mode Distribute");
        expect(host.textContent).not.toContain("Reputation 800");
        expect(fieldText(host, "companions.field.reputation")).toEqual([]);
        expect(fieldText(host, "companions.field.land")).toEqual([]);
        expect(host.textContent).not.toContain("Ledger Field 3");
        expect(host.textContent).not.toContain("9000");
        render(null, host);
        host.remove();
    });
});
