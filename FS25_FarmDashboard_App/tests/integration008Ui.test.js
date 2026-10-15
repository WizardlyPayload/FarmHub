/**
 * @jest-environment jsdom
 */
"use strict";

const { productionTs, preactRuntime } = require("./helpers/production-source.cjs");

const calls = { server: [], farm: [], settings: 0 };
let storeState = {};

function useStore(select) {
    return select(storeState);
}

const t = (key) => key;
const AppTopBar = productionTs("NEW APP/src/app/AppTopBar.tsx", {
    "@/i18n/i18n": { t, tOr: (_key, fallback) => fallback },
    "@/store/dashboard-store": { useDashboardStore: useStore },
    "@/components/ui": {
        Badge: (props) => h("span", { class: props.tone, title: props.title }, props.children),
        Button: (props) => h("button", { type: "button", onClick: props.onClick }, props.children),
    },
    "@/platform/PlatformChrome": { NotificationBell: () => h("button", { type: "button", "aria-label": "notifications" }, "bell") },
    "@/platform/viewer-mode": { isFarmDashLocalConfigHost: () => true },
    "@/lib/farm-scope": {
        getPlayerFarmRecords: (info) => (Array.isArray(info) ? info : []),
        isMultiFarmEnabled: (info) => Array.isArray(info) && info.length > 1,
    },
    "@/services/ws-client": {
        switchActiveServer: (id) => { calls.server.push(id); },
        switchActiveFarm: (id) => { calls.farm.push(id); },
    },
    "@/lib/game-time": { formatGameTimeDisplay: () => "Day 1" },
    "@/lib/profile-display": { saveProfileFromUnitDisplay: () => null },
    "@/lib/weather": {
        asWeatherSnapshot: () => null,
        engineWeatherChip: () => ({ show: false }),
        formatWeatherTemp: () => "",
        weatherConditionLabelKey: () => "weather.clear",
    },
    "@/components/WeatherModal": { WeatherModal: () => null },
    "@/app/section-meta": { TOPBAR_ICONS: { settings: "settings.png" } },
    "@/lib/realisticFarming/cores": {
        formatTimeGuardBadge: () => null,
        getTimeGuard: () => null,
        getWeatherGuard: () => null,
    },
    "@/lib/connection-badge": {
        LUA_EXPORT_STALE_MS: 1,
        luaStaleRefreshDelayMs: () => null,
        resolveNavbarConnectionBadge: () => ({ tone: "ok", titleKey: "nav.live", labelKey: "nav.live" }),
    },
    "@/lib/server-label": { formatUniqueServerLabels: (servers) => servers.map((srv) => srv.name || srv.id) },
}).AppTopBar;

const helpers = productionTs("NEW APP/src/sections/fields/field-helpers.ts", {
    "@/i18n/i18n": { t, tOr: (_key, fallback) => fallback },
    "@/lib/rules-engine": new Proxy({
        nitrogenTargetForDisplay: (field) => Number(field.targetNitrogen) || 0,
        PF_NUTRIENT_CLOSE_FRAC: 0.1,
        RULES_ENGINE_FALLBACK_KIND: "fallback",
        MIN_FORAGE_WORKFLOW_LITERS: 1,
        WEED_ALERT_THRESHOLD_PCT: 20,
    }, {
        get(target, prop) {
            if (prop in target) return target[prop];
            if (prop === "then") return undefined;
            return () => null;
        },
    }),
    "@/lib/field-harvest-state": { xmlGrowthLooksHarvested: () => false },
});

const FieldCard = productionTs("NEW APP/src/sections/fields/FieldCard.tsx", {
    "@/i18n/i18n": { t },
    "@/components/ui": {
        Badge: (props) => h("span", null, props.children),
        Button: (props) => h("button", { type: "button", onClick: props.onClick }, props.children),
        Card: (props) => h("article", null, props.children),
    },
    "@/store/dashboard-store": { useDashboardStore: useStore },
    "@/lib/fill-unit-mode": { useUnitDisplay: () => null },
    "@/lib/profile-display": { saveProfileFromUnitDisplay: () => null },
    "@/lib/realisticFarming/land": { isRfSoilActive: () => false, rfSoilUrgency: () => 0 },
    "@/lib/fleetMapOverlays": { normalizeFieldOutline: () => [] },
    "./field-helpers": helpers,
    "@/lib/rules-engine": {},
    "./RfLandPanels": { RfLandPanels: () => null },
}).FieldCard;

const { h, render } = preactRuntime().preact;

describe("product source and field components", () => {
    test("multi-source top bar requires an explicit save choice", () => {
        calls.server.length = 0;
        storeState = {
            connection: "connecting",
            servers: [{ id: "riverbend", name: "Riverbend" }, { id: "witcombe", name: "Witcombe" }],
            activeServerId: null,
            activeFarmId: null,
            payload: null,
        };
        const host = document.createElement("div");
        render(h(AppTopBar, { onOpenSettings: () => {} }), host);
        const saveSelect = host.querySelector(".fd-topbar__save-select");
        expect(saveSelect.value).toBe("");
        expect(saveSelect.selectedOptions[0].textContent).toBe("Data source");
        expect(calls.server).toEqual([]);
        saveSelect.value = "witcombe";
        saveSelect.dispatchEvent(new window.Event("change", { bubbles: true }));
        expect(calls.server).toEqual(["witcombe"]);
        calls.server.length = 0;
        render(null, host);
    });

    test("the real top bar switches source and keeps an empty farm selectable", () => {
        storeState = {
            connection: "ws",
            servers: [{ id: "save-a", name: "Farm A" }, { id: "save-b", name: "Farm B" }],
            activeServerId: "save-a",
            activeFarmId: 1,
            payload: {
                farmInfo: [{ id: 1, name: "Empty Farm", money: 0 }, { id: 2, name: "Other", money: 10 }],
                vehicles: [],
                animals: [],
                fields: [],
                dataTimestamps: { sectionAge: "current" },
            },
        };
        const host = document.createElement("div");
        document.body.appendChild(host);
        render(h(AppTopBar, { onOpenSettings: () => { calls.settings += 1; } }), host);
        const saveSelect = host.querySelector(".fd-topbar__save-select");
        expect(saveSelect).not.toBeNull();
        saveSelect.focus();
        saveSelect.value = "save-b";
        saveSelect.dispatchEvent(new window.Event("change", { bubbles: true }));
        expect(calls.server).toEqual(["save-b"]);
        expect(document.activeElement).toBe(saveSelect);
        const settings = [...host.querySelectorAll("button")].find((button) => button.textContent.includes("nav.unifiedSettings"));
        settings.focus();
        settings.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        settings.click();
        expect(calls.settings).toBe(1);
        expect(host.textContent).toContain("Empty Farm");
    });

    test("the real field card labels held nitrogen and still renders with companions off", () => {
        storeState = { payload: { companionMods: { enabled: false, mods: [] } }, activeFarmId: 1 };
        const host = document.createElement("div");
        render(h(FieldCard, {
            field: {
                id: 7,
                farmlandId: 2,
                name: "North",
                hectares: 2,
                fruitType: "WHEAT",
                isPrecisionFarming: true,
                isScanned: true,
                nitrogenLevel: 100,
                targetNitrogen: 100,
                phValue: 6.5,
                targetPh: 6.5,
                soilReadState: "partial",
                nitrogenReadState: "held",
                phReadState: "ok",
                nitrogenSampledAt: 1000,
                phSampledAt: 9000,
            },
            gameSettings: {},
        }), host);
        expect(host.textContent).toContain("fields.soilLastKnown");
        expect(host.querySelector("article")).not.toBeNull();
    });
});
