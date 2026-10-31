/**
 * @jest-environment jsdom
 */
"use strict";

const { productionTs, preactRuntime } = require("./helpers/production-source.cjs");
const { h, render } = preactRuntime().preact;

let context = { page: null };
let unitDisplay = {};
let mode = "litres";
let viewerMode = null;
const { Page } = productionTs("NEW APP/src/sections/mods/imperialSystem/ImperialSystemPage.tsx", {
    "@/components/ui": { Card: ({ title, children }) => h("section", null, h("h3", null, title), children) },
    "@/i18n/i18n": { tOr: (_key, fallback) => fallback },
    "@/lib/fill-units": { fillUnitOwnerId: (value) => value.british ? "British Fill Units" : value.imperial?.present ? "Imperial System" : null },
    "@/lib/fill-unit-mode": { useFillUnitMode: () => mode, useUnitDisplay: () => unitDisplay },
    "@/store/dashboard-store": { useDashboardStore: (selector) => selector({ viewerFillUnitMode: viewerMode }) },
    "@/sections/mods/shared": {
        ModAbout: () => null,
        ModEmpty: ({ children }) => h("p", null, children),
        ModKeyValues: ({ rows }) => h("dl", null, rows.map((row) => h("div", { "data-kv": row.key }, row.label, ": ", row.value))),
        ModPage: ({ children }) => h("main", null, children),
        ModStatTiles: ({ tiles }) => h("div", null, tiles.map((tile) => h("span", { "data-stat": tile.key }, tile.label, ": ", tile.value))),
        asList: (rows) => Array.isArray(rows) ? rows : [],
        formatNumber: (value, dp = 0) => Number(value).toFixed(dp),
        num: (value) => value == null || !Number.isFinite(Number(value)) ? null : Number(value),
        useCompanionPage: () => context,
        yesNo: (value) => value === true ? "Yes" : value === false ? "No" : "—",
    },
});

function paint() {
    const host = document.createElement("div");
    render(h(Page, { entry: { key: "imperialSystem" } }), host);
    return host;
}

test("shows D1 metric settings, game miles and British priority without attributing a conversion", () => {
    unitDisplay = { british: true, imperial: { present: true, liquid: "liters", crops: "liters", weight: "metric" } };
    mode = "british";
    viewerMode = null;
    context = { page: {
        readState: "ok",
        settings: { liquid: "liters", crops: "liters", weight: "metric", measure: "metric", weightScale: "auto" },
        gameUnits: { useMiles: true, useAcre: false, useFahrenheit: false },
        factors: { litersPerGallon: 3.78541, litersPerBushel: 35.2391, kgPerPound: 0.453592, metersPerFoot: 0.3048, lbsPerUsTon: 2000 },
        bushelCrops: Array.from({ length: 18 }, (_, i) => `CROP${i}`),
        bulkDensityCount: 69,
    } };
    const host = paint();
    expect(host.querySelector('[data-stat="bushelCrops"]').textContent).toContain("18");
    expect(host.querySelector('[data-kv="provider"]').textContent).toContain("British Fill Units");
    expect(host.textContent).toContain("it takes priority for FarmHub fill amounts");
    expect(host.querySelector('[data-kv="miles"]').textContent).toContain("Yes");
    expect(host.querySelector('[data-kv="acre"]').textContent).toContain("No");
    expect(host.querySelector('[data-kv="gallon"]').textContent).toContain("3.78541");
    expect(host.textContent).toContain("A miles, acres or temperature choice alone does not prove Imperial System changed a value.");
});

test("separates Imperial fill choices from a manual dashboard override", () => {
    unitDisplay = { british: false, imperial: { present: true, liquid: "gallons", crops: "imperial", weight: "imperial" } };
    mode = "litres";
    viewerMode = "litres";
    context = { page: { readState: "ok", settings: { liquid: "gallons", crops: "imperial", weight: "imperial", measure: "imperial", weightScale: "auto" } } };
    const host = paint();
    expect(host.querySelector('[data-kv="liquid"]').textContent).toContain("US gallons");
    expect(host.querySelector('[data-kv="measure"]').textContent).toContain("Feet");
    expect(host.querySelector('[data-kv="provider"]').textContent).toContain("Imperial System");
    expect(host.textContent).toContain("manual fill-unit choice in FarmHub Settings takes priority");
    expect(host.querySelector('[data-stat="display"]').textContent).toContain("Litres");
});
