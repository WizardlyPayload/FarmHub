/**
 * @jest-environment jsdom
 */
"use strict";

const { productionTs, preactRuntime } = require("./helpers/production-source.cjs");
const { h, render } = preactRuntime().preact;

const state = { payload: null, activeFarmId: 1 };
const useDashboardStore = (selector) => selector(state);
const folded = productionTs("NEW APP/src/lib/companionFold.ts", {
    "@/store/dashboard-store": { useDashboardStore },
});
const assetReadings = productionTs("NEW APP/src/lib/companionMods/assetReadings.ts");
const mocks = {
    "@/store/dashboard-store": { useDashboardStore },
    "@/lib/companionFold": folded,
    "@/i18n/i18n": { tOr: (_key, fallback) => fallback },
    "@/components/ui": {
        Badge: ({ children }) => h("span", null, children),
        Card: ({ title, children }) => h("section", null, title, children),
    },
    "@/lib/fill-units": {},
    "@/lib/fill-unit-mode": {},
    "@/lib/fillTypeResolve": {},
    "@/lib/storage": {},
    "@/lib/companionMods": {
        readAdvancedMaintenance: () => ({ status: "pending", coverage: "truncated", blocked: [] }),
        readExtendedMaintenance: assetReadings.readExtendedMaintenance,
        readVehicleService: assetReadings.readVehicleService,
        serviceFaults: assetReadings.serviceFaults,
        readRealSilo: assetReadings.readRealSilo,
    },
    "@/lib/companionMods/presentation": { companionPanelId: (id) => id },
    "@/sections/mods/shared": {
        useCompanionPage: () => {
            const page = state.payload?.companionPages?.pages?.realSilo ?? null;
            return {
                page,
                mod: state.payload?.companionMods?.mods?.find((row) => row.id === "realSilo" && row.detected) ?? null,
                farmData: page?.byFarm?.[String(state.activeFarmId)] ?? null,
            };
        },
        ModPageLink: () => h("button", null, "Open full page"),
    },
    "./StatTiles": { StatTiles: ({ tiles }) => h("div", null, tiles.map((tile) => h("span", null, `${tile.label}: ${tile.value}`))) },
};
const { FleetMaintenanceNotes, StorageAssetNotes } = productionTs("NEW APP/src/sections/companions/AssetCompanionNotes.tsx", mocks);

function paint(payload, farmId = 1) {
    state.payload = payload;
    state.activeFarmId = farmId;
    const host = document.createElement("div");
    document.body.appendChild(host);
    render(h(FleetMaintenanceNotes, null), host);
    return host.textContent;
}

test("a complete farm-scoped page reading supersedes the older pending fleet summary", () => {
    const payload = {
        companionMods: {
            mods: [{ id: "advancedMaintenance", detected: true }],
            advancedMaintenance: { enabled: true, readState: "pending", coverage: "truncated", farmId: 1, machines: {} },
        },
        companionPages: { pages: { advancedMaintenance: {
            detected: true, readState: "ok", coverage: "complete",
            byFarm: { "1": { machineCount: 16, lockedCount: 0, machines: [{ id: "tractor-1", zone: "ok" }] } },
        } } },
    };
    const text = paint(payload);
    expect(text).toContain("Advanced Maintenance");
    expect(text).toContain("16 modded machines checked");
    expect(text).toContain("No machine on this farm is blocked from starting.");
    expect(text).not.toContain("This reading is not ready yet.");
    expect(paint(payload, 2)).not.toContain("No machine on this farm is blocked from starting.");
});

test("separate maintenance mods retain labels and display ratio condition as a percentage", () => {
    const text = paint({ companionMods: {
        extendedVehicleMaintenance: {
            enabled: true, readState: "ok", coverage: "truncated", scope: "farm", farmId: 1,
            machines: [{ id: "a", name: "Pallet Fork", hoursPool: 25, serviceActive: false, failureType: "" }],
        },
        realisticVehicleService: {
            enabled: true, readState: "ok", coverage: "truncated", scope: "farm", farmId: 1,
            machines: [{ id: "b", name: "Tractor", condition: 0.999988, serviceSoon: false, warmupMs: 0, faults: {} }],
        },
    } });
    expect(text).toContain("Extended Vehicle Maintenance");
    expect(text).toContain("Realistic Vehicle Service");
    expect(text).toContain("Lowest condition 100%");
    expect(text).not.toContain("Lowest condition 1%");
});

test("a partial page reading cannot assert that every machine is clear", () => {
    const text = paint({
        companionMods: { mods: [{ id: "advancedMaintenance", detected: true }] },
        companionPages: { pages: { advancedMaintenance: {
            detected: true, readState: "partial", coverage: "complete",
            byFarm: { "1": { machineCount: 16, lockedCount: 0, machines: [] } },
        } } },
    });
    expect(text).toContain("Some items were not ready to read.");
    expect(text).not.toContain("No machine on this farm is blocked from starting.");
});

test("Storage uses the complete farm-scoped RealSilo page instead of the older unavailable summary", () => {
    state.payload = {
        companionMods: {
            mods: [{ id: "realSilo", detected: true }],
            realSilo: { enabled: true, farmId: 1, readState: "unavailable", source: "realSilo" },
        },
        companionPages: { pages: { realSilo: {
            detected: true, readState: "ok", coverage: "complete",
            byFarm: { "1": { siloCount: 2, compartments: 8, usedCompartments: 0, unconfigured: 2 } },
        } } },
    };
    state.activeFarmId = 1;
    const host = document.createElement("div");
    document.body.appendChild(host);
    render(h(StorageAssetNotes, { catalog: null, titles: null, economy: null }), host);
    expect(host.textContent).toContain("Silos: 2");
    expect(host.textContent).toContain("Compartments in use: 0 / 8");
    expect(host.textContent).toContain("Silos not set up: 2");
    expect(host.textContent).toContain("Open full page");
    expect(host.textContent).not.toContain("This mod's reading is not available in this save.");
});
