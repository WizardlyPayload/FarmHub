"use strict";

const { productionTs } = require("./helpers/production-source.cjs");

const readings = productionTs("NEW APP/src/lib/companionMods/readings.ts");

function fill(template, params) {
    let text = template;
    if (params) {
        for (const [key, value] of Object.entries(params)) {
            text = text.replace(`{{${key}}}`, String(value));
        }
    }
    return text;
}

const companions = productionTs("NEW APP/src/sections/companions/CompanionModsSection.tsx", {
    "@/components/ui": { Badge: () => null, Button: () => null, Card: () => null },
    "@/i18n/i18n": { t: (key) => key, tOr: (_key, fallback, params) => fill(fallback, params) },
    "@/lib/economy": { formatCurrency: (value) => String(value) },
    "@/lib/profile-display": { saveProfileFromUnitDisplay: () => null },
    "@/lib/fill-unit-mode": { useUnitDisplay: () => null },
    "@/lib/companionMods": Object.assign({}, readings, {
        COMPANION_CATALOG: [],
        COMPANION_CATEGORY_ORDER: [],
        catalogEntry: () => ({}),
        categoryLabelKey: () => "",
        detectedCompanionMods: () => [],
        formatRestrictedBanReason: (value) => (value ? String(value) : ""),
        isCompanionModsActive: () => false,
    }),
    "@/store/dashboard-store": { useDashboardStore: () => ({}) },
    "@/sections/mods/registry": { companionPageForCatalogId: () => undefined },
    "@/sections/mods/shared": { ModPageLink: () => null },
    "@/sections/economy/economy.css": {},
    "./companions.css": {},
});

const overview = productionTs("NEW APP/src/sections/overview/OverviewSection.tsx", {
    "@/i18n/i18n": { t: (key) => key, tOr: (_key, fallback, params) => fill(fallback, params) },
    "@/components/ui": { Badge: () => null, Button: () => null },
    "@/store/dashboard-store": { useDashboardStore: () => ({}) },
    "@/components/WeatherModal": {},
    "@/lib/game-time": {},
    "@/lib/profile-display": { saveProfileFromUnitDisplay: () => null },
    "@/lib/weather": {},
    "@/lib/economy": { formatCurrency: (value) => String(value) },
    "@/lib/farm-scope": {},
    "@/services/ws-client": {},
    "@/sections/fields/field-helpers": {},
    "@/lib/rules-engine": {},
    "@/lib/vehicles": {},
    "@/lib/productions": {},
    "@/lib/mod-export-progress": {},
    "@/services/electron-bridge": {},
    "@/platform/viewer-mode": {},
    "@/platform/ChangesModal": {},
    "@/lib/pastures-parsers": {},
    "@/lib/livestock-normalize": {},
    "@/app/section-meta": {},
    "@/lib/vehicleAds": {},
    "@/lib/moisture": {},
    "@/lib/redTape": {},
    "@/lib/storage": {},
    "@/platform/notifications": {},
    "@/sections/overview/OverviewMiniBoards": {},
    "@/lib/realisticFarming/life": {},
    "@/lib/realisticFarming/cores": {},
    "@/lib/companionMods": Object.assign({}, readings, {
        detectedCompanionMods: () => [],
        formatRestrictedBanReason: (value) => (value ? String(value) : ""),
    }),
    "@/lib/realisticFarming/depot": {},
    "./overview.css": {},
});

function vnodeText(node) {
    if (node == null || typeof node === "boolean") return "";
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(vnodeText).join(" ");
    if (node.props) return vnodeText(node.props.children);
    return "";
}

function live(key, payload, farmId) {
    return vnodeText(companions.LiveStats({ entry: { liveKey: key }, payload, farmId }));
}

const splitLoans = {
    loans: {
        enabled: true,
        readState: "ok",
        restAmount: 80000,
        loanCount: 2,
        byFarm: {
            "1": { count: 0, restAmount: 0, loans: [] },
            "2": { count: 2, restAmount: 80000, loans: [] },
        },
    },
};

describe("companion and overview consumers", () => {
    test("selected farm zero does not inherit the other farm or the aggregate", () => {
        const text = live("loans", splitLoans, 1);
        expect(text).toContain("0 active loan(s)");
        expect(text).toContain("Outstanding 0");
        expect(text).not.toContain("80000");
        const alerts = overview.companionOverviewAlerts(splitLoans, 1);
        expect(alerts.map((item) => item.key)).not.toContain("companion-loans");
    });

    test("unavailable loans are not described as zero debt", () => {
        const text = live("loans", {
            loans: { enabled: true, readState: "partial", restAmount: 80000, loanCount: 2, byFarm: {} },
        }, 1);
        expect(text).toContain("unavailable");
        expect(text).not.toContain("No active enhanced loans");
        expect(text).not.toContain("80000");
        expect(overview.companionOverviewAlerts({
            loans: { enabled: true, restAmount: 80000, byFarm: {} },
        }, 1).some((item) => item.key === "companion-loans")).toBe(false);
    });

    test("a positive selected-farm loan alerts with that farm's amount", () => {
        const alerts = overview.companionOverviewAlerts(splitLoans, 2);
        expect(alerts.find((item) => item.key === "companion-loans").label).toContain("80000");
    });

    test("restriction and region screens follow the verified read", () => {
        expect(live("restrictedPeriods", { restrictedPeriods: { enabled: true } }, 1)).toContain("not read");
        expect(live("restrictedPeriods", {
            restrictedPeriods: { enabled: true, readState: "partial", anyActive: false },
        }, 1)).not.toContain("Spreading allowed");
        expect(live("restrictedPeriods", {
            restrictedPeriods: { enabled: true, readState: "ok", anyActive: false },
        }, 1)).toContain("Spreading allowed");
        expect(live("restrictedPeriods", {
            restrictedPeriods: { enabled: true, readState: "ok", anyActive: true, liquidBan: "frost", solidBan: null },
        }, 1)).toContain("Liquid: frost");
        expect(live("restrictedPeriods", {
            restrictedPeriods: { enabled: true, readState: "ok", anyActive: true, liquidBan: "frost", solidBan: null },
        }, 1)).not.toContain("Solid:");
        expect(live("restrictedPeriods", {
            restrictedPeriods: { enabled: true, readState: "ok", anyActive: true, liquidBan: null, solidBan: "wet" },
        }, 1)).toContain("Solid: wet");
        expect(live("cropCalendar", {
            cropCalendar: { enabled: true, readState: "pending", selectedRegion: "old-region" },
        }, 1)).toContain("not read");
        const region = live("cropCalendar", {
            cropCalendar: {
                enabled: true,
                readState: "ok",
                selectedRegion: "alpine",
                weatherEnabled: true,
                yieldEnabled: false,
            },
        }, 1);
        expect(region).toContain("Region: alpine");
        expect(region).toContain("Regional weather on");
        expect(region).not.toContain("Regional yield on");
    });

    test("a failed restriction read does not raise an active ban alert", () => {
        const alerts = overview.companionOverviewAlerts({
            restrictedPeriods: { enabled: true, readState: "failed", anyActive: true, liquidBan: "frost" },
        }, 1);
        expect(alerts.map((item) => item.key)).not.toContain("companion-restricted");
    });
});
