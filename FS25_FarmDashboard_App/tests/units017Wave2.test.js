/**
 * @jest-environment jsdom
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { lua: luaVm, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");
const { productionTs, preactRuntime } = require("./helpers/production-source.cjs");

const lua = fs.readFileSync(
    path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua"),
    "utf8",
);
const registry = fs.readFileSync(
    path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src/MissionActiveRegistry.lua"),
    "utf8",
);

// Runs the real collector inside an ordinary mod environment; the expression can
// call the collector's local readers because it shares the chunk.
function inModEnv(engineBody, expression) {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    // The mission registry only answers once a save slot is known.
    const chunk = `
        local base = _G
        local engine = {}
        setmetatable(engine, { __index = base })
        local MISSION_INFO = { savegameDirectory = 'savegame1', mapId = 'map' }
        ${engineBody}
        local dashboard = {}
        setmetatable(dashboard, { __index = engine })
        dashboard._G = dashboard
        _ENV = dashboard
        ${registry}
        ${lua}
        ${expression}
    `;
    if (lauxlib.luaL_dostring(L, to_luastring(chunk)) !== luaVm.LUA_OK) {
        throw new Error(to_jsstring(luaVm.lua_tostring(L, -1)));
    }
    return to_jsstring(luaVm.lua_tostring(L, -1));
}

function foodProvider(scaleBody) {
    return `
        calls = {}
        engine.g_currentMission = { missionInfo = MISSION_INFO, environment = { daysPerPeriod = 3 } }
        engine.g_modManager = { getActiveMods = function() return { { modName = 'FS25_AnimalFoodCalculator' } } end }
        engine.FS25_AnimalFoodCalculator = { AFCConsumptionScaling = {
            enabled = true,
            getModeName = function(self) return 'custom' end,
            getScaleFactor = ${scaleBody},
        } }
    `;
}
const foodRow = "local row = collectAnimalFoodCalculator()\n"
    + "return table.concat(calls, ',') .. '|' .. tostring(row.readState) .. '|' .. tostring(row.foodScale) .. '|'"
    + " .. tostring(row.waterScale) .. '|' .. tostring(row.strawScale) .. '|' .. tostring(row.daysPerPeriod)";

function ledgerProvider(multiplayer) {
    return `
        forbidden = nil
        queries = {}
        engine.g_currentMission = {
            missionInfo = MISSION_INFO,
            getFarmId = function() return 1 end,
            missionDynamicInfo = { isMultiplayer = ${multiplayer ? "true" : "false"} },
        }
        engine.g_modManager = { getActiveMods = function() return { { modName = 'FS25_FieldProfitabilityLedger' } } end }
        local runtime = {
            listCycles = function(options)
                return { cycles = {
                    { id = 'c1', farmId = 1, landKey = 'Field 3', fruitType = 'WHEAT', state = 'open', cycleAreaHa = 4.2 },
                    { id = 'c2', farmId = 2, landKey = 'OTHER FARM FIELD', fruitType = 'BARLEY', state = 'open' },
                }, page = {} }
            end,
            queryCycle = function(cycleId, options)
                queries[#queries + 1] = cycleId .. ':' .. tostring(options.recordLimit) .. ':' .. tostring(options.includeLive)
                return { categoryTotals = { { accountingClass = 'Direct', category = 'seed', unit = 'money', direction = 'expense', amount = 120 } } }
            end,
            save = function() forbidden = 'save' error('save') end,
            export = function() forbidden = 'export' error('export') end,
            publish = function() forbidden = 'publish' error('publish') end,
        }
        engine.FS25_FieldProfitabilityLedger = { FieldProfitabilityLedger = { Runtime = { SinglePlayerRuntime = runtime } } }
    `;
}
const ledgerRow = "local row = collectFieldProfitabilityLedger()\n"
    + "local lands = {}\n"
    + "for _, c in ipairs(row.cycles or {}) do lands[#lands + 1] = tostring(c.land) .. '/' .. tostring(c.totalsRead) end\n"
    + "return tostring(row.readState) .. '|' .. tostring(row.scope) .. '|' .. tostring(row.farmId) .. '|' .. table.concat(lands, ',')"
    + " .. '|' .. table.concat(queries, ',') .. '|' .. tostring(row.sales and row.sales.present) .. '|' .. tostring(row.reason)"
    + " .. '|' .. tostring(forbidden)";
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
const box = { state: { payload: null, activeFarmId: 1, sectionParams: {}, setSection() {}, setSectionParams() {} } };
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
const companionMods = productionTs("NEW APP/src/lib/companionMods/index.ts", { "./catalog": catalog, "./readings": readings });
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

describe("wave 2 reads stay bounded", () => {
    test("food scale and VIP count are read, and the factory list is not called", () => {
        expect(lua).toContain("local function collectAnimalFoodCalculator");
        expect(lua).toContain("local function collectVipOrders");
        expect(lua).not.toMatch(/\.getProductionPoints\b|getProductionPoints\s*\(/);
        expect(lua).not.toMatch(/fpc_placeable["']?\s*\]?\s*=[^=]|rawset\([^)]*fpc_placeable/);
        expect(catalog.companionSupport(catalog.catalogEntry("animalFoodCalculator"))).toBe("limited");
        expect(catalog.companionSupport(catalog.catalogEntry("factoryProfitCalculator"))).toBe("limited");
        expect(catalog.catalogEntry("factoryProfitCalculator").desc).toContain("never calls the mod's production list");
    });

    test("the food reader asks the provider for food, water and straw with the period length", () => {
        const scales = "function(self, input, days) calls[#calls + 1] = input .. '@' .. tostring(days)"
            + " return ({ food = 1.5, water = 1.25, straw = 0.5 })[input] end";
        expect(inModEnv(foodProvider(scales), foodRow)).toBe("food@3,water@3,straw@3|ok|1.5|1.25|0.5|3");
        // A failed middle read is a failed reading, not a partial set of scales.
        const waterFails = "function(self, input, days) calls[#calls + 1] = input"
            + " if input == 'water' then error('down') end return 2 end";
        expect(inModEnv(foodProvider(waterFails), foodRow)).toBe("food,water|failed|nil|nil|nil|3");
        // No scale method means no scale numbers.
        expect(inModEnv(foodProvider("nil"), foodRow)).toBe("|failed|nil|nil|nil|3");
        // Provider absent: unavailable, never a default scale.
        expect(inModEnv("calls = {}\nengine.g_currentMission = { environment = { daysPerPeriod = 3 } }", foodRow))
            .toBe("|unavailable|nil|nil|nil|nil");
    });

    test("the ledger is a limited single-player, farm-scoped, read-only summary", () => {
        const entry = catalog.catalogEntry("fieldProfitabilityLedger");
        expect(catalog.companionSupport(entry)).toBe("limited");
        expect(entry.liveKey).toBe("fieldProfitabilityLedger");
        expect(entry.desc).toContain("Single player only.");
        expect(entry.desc).toContain("this farm's field cycles");
        expect(entry.desc).toContain("summary query");
        expect(entry.desc).toContain("sales are not shown");
        expect(inModEnv(ledgerProvider(false), ledgerRow))
            .toBe("ok|farm|1|Field 3/ok|c1:0:false|false|nil|nil");
        expect(inModEnv(ledgerProvider(true), ledgerRow))
            .toBe("unavailable|nil|nil|||false|mp-disabled|nil");
    });

    test("a food card still renders when the task list is absent", () => {
        box.state.payload = {
            companionMods: {
                enabled: true,
                mods: [
                    { id: "animalFoodCalculator", title: "Animal Food Calculator", category: "livestock", detected: true },
                    { id: "vipOrderManager", title: "VIP Order Manager", category: "economy", detected: true },
                ],
                animalFoodCalculator: { enabled: true, readState: "ok", mode: "custom", foodScale: 1.5 },
                // Producer shape from collectVipOrders: the count belongs to the exporting farm.
                vipOrders: { enabled: true, source: "vipOrderManager", readState: "ok", farmId: 1, orderCount: 2, coverage: "session-list" },
            },
        };
        const host = document.createElement("div");
        document.body.appendChild(host);
        render(h(sections.CompanionModsEmbed, { categories: companionMods.COMPANION_CATEGORY_ORDER }), host);
        expect(host.textContent).toContain("Food x1.5");
        expect(host.textContent).toContain("2 open VIP order(s)");
        expect(host.textContent).not.toContain("No active tasks");
        render(null, host);
        host.remove();
    });

    test("an ownerless, other-farm or multiplayer VIP count is not shown", () => {
        const vipPayload = (vipOrders) => ({
            companionMods: {
                enabled: true,
                mods: [{ id: "vipOrderManager", title: "VIP Order Manager", category: "economy", detected: true }],
                vipOrders,
            },
        });
        const host = document.createElement("div");
        document.body.appendChild(host);

        box.state.payload = vipPayload({ enabled: true, readState: "ok", orderCount: 2 });
        render(h(sections.CompanionModsEmbed, { categories: companionMods.COMPANION_CATEGORY_ORDER }), host);
        expect(host.textContent).toContain("Needs a selected farm before these numbers can be read.");
        expect(host.textContent).not.toContain("open VIP order(s)");

        box.state.payload = vipPayload({ enabled: true, readState: "ok", farmId: 2, orderCount: 2 });
        render(h(sections.CompanionModsEmbed, { categories: companionMods.COMPANION_CATEGORY_ORDER }), host);
        expect(host.textContent).not.toContain("open VIP order(s)");

        box.state.payload = vipPayload({ enabled: true, readState: "unavailable", reason: "single-player-only" });
        render(h(sections.CompanionModsEmbed, { categories: companionMods.COMPANION_CATEGORY_ORDER }), host);
        expect(host.textContent).toContain("VIP orders are single-player only.");
        expect(host.textContent).not.toContain("open VIP order(s)");

        render(null, host);
        host.remove();
    });
});
