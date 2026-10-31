/**
 * @jest-environment jsdom
 */
"use strict";

const { productionTs, preactRuntime } = require("./helpers/production-source.cjs");
const { h, render } = preactRuntime().preact;

let context = { page: null, farmData: null };
const { Page } = productionTs("NEW APP/src/sections/mods/puncturedTires/PuncturedTiresPage.tsx", {
    "@/components/ui": { Card: ({ title, children }) => h("section", null, h("h3", null, title), children) },
    "@/i18n/i18n": { tOr: (_key, fallback, vars) => fallback.replace(/\{\{(\w+)\}\}/g, (_, key) => vars?.[key] ?? "") },
    "@/sections/mods/shared": {
        ModAbout: () => null,
        ModEmpty: ({ children }) => h("p", null, children),
        ModKeyValues: ({ rows }) => h("dl", null, rows.map((row) => h("div", { "data-kv": row.key }, row.label, ": ", row.value))),
        ModPage: ({ children }) => h("main", null, children),
        ModStatTiles: ({ tiles }) => h("div", null, tiles.map((tile) => h("span", { "data-stat": tile.key }, tile.label, ": ", tile.value))),
        ModTable: ({ rows, empty }) => rows.length ? h("table", null, rows.map((row) => h("tr", { "data-row": row.key }, Object.values(row.cells).map((cell) => h("td", null, cell))))) : h("p", null, empty),
        asList: (rows) => Array.isArray(rows) ? rows : [],
        formatNumber: (value, dp = 0) => Number(value).toFixed(dp),
        num: (value) => value == null || !Number.isFinite(Number(value)) ? null : Number(value),
        useCompanionPage: () => context,
        useMoney: () => (value) => value == null ? "—" : `£${value}`,
        yesNo: (value) => value === true ? "Yes" : value === false ? "No" : "—",
    },
});

function paint() {
    const host = document.createElement("div");
    render(h(Page, { entry: { key: "puncturedTires" } }), host);
    return host;
}

test("shows the fresh D1 cycle and sixteen equipped vehicles without inventing a puncture", () => {
    context = {
        page: { readState: "ok", coverage: "complete", cycle: { count: 0, limit: 2, remaining: 2, currentPeriod: 6, startPeriod: 6, dangerPeriod1: 9, dangerPeriod2: 4, dangerNow: false } },
        farmData: { equippedCount: 16, puncturedCount: 0, armedCount: 0, vehicles: Array.from({ length: 16 }, (_, i) => ({ id: `v${i}`, name: i === 0 ? "CLAAS LEXION 6900" : `Vehicle ${i}`, punctured: false })) },
    };
    const host = paint();
    expect(host.querySelector('[data-stat="equipped"]').textContent).toContain("16");
    expect(host.querySelector('[data-stat="remaining"]').textContent).toContain("2");
    expect(host.querySelector('[data-kv="danger1"]').textContent).toContain("9");
    expect(host.querySelector('[data-kv="danger2"]').textContent).toContain("4");
    expect(host.querySelectorAll("tr")).toHaveLength(16);
    expect(host.textContent).toContain("No punctured vehicles or picked-up nails reported");
    expect(host.textContent).toContain("CLAAS LEXION 6900");
});

test("marks a flat and picked-up nail separately, with repair only for the flat", () => {
    context = {
        page: { readState: "ok", coverage: "complete", cycle: { count: 1, limit: 2, remaining: 1 } },
        farmData: { equippedCount: 2, puncturedCount: 1, armedCount: 1, vehicles: [
            { id: "flat", name: "Tractor", punctured: true, pressurePct: 30, speedCapKmh: 8, repairCost: 500 },
            { id: "nail", name: "Loader", armed: true, metersToPuncture: 150 },
        ] },
    };
    const host = paint();
    expect(host.querySelector('[data-row="flat"]').textContent).toContain("Punctured");
    expect(host.querySelector('[data-row="flat"]').textContent).toContain("£500");
    expect(host.querySelector('[data-row="nail"]').textContent).toContain("150 m until flat");
    expect(host.querySelector('[data-row="nail"]').textContent).not.toContain("£500");
    expect(host.textContent).not.toContain("No punctured vehicles or picked-up nails reported");
});
