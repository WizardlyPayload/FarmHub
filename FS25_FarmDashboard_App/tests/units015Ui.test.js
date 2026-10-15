/**
 * @jest-environment jsdom
 */
"use strict";

const { productionTs, preactRuntime } = require("./helpers/production-source.cjs");

const { h, render } = preactRuntime().preact;
const i18n = { t: (key) => key, tOr: (key, fallback) => fallback || key };
const ui = {
    Badge: (props) => h("span", null, props.children),
    Button: (props) => h("button", { type: "button", onClick: props.onClick }, props.children),
    Card: (props) => h("section", null, props.title, props.children),
};

const box = {
    state: {
        payload: null,
        activeFarmId: 1,
        activeServerId: "source-A",
        viewerFillUnitMode: "imperial",
        sectionParams: {},
        setSectionParams: () => {},
        setSection: () => {},
    },
};
const useDashboardStore = (selector) => (selector ? selector(box.state) : box.state);

const fillUnits = productionTs("NEW APP/src/lib/fill-units.ts");
const profileDisplay = productionTs("NEW APP/src/lib/profile-display.ts", { "@/i18n/i18n": i18n });
const fillMode = productionTs("NEW APP/src/lib/fill-unit-mode.ts", {
    "@/store/dashboard-store": { useDashboardStore },
    "@/lib/fill-units": fillUnits,
});
const rfEconomy = productionTs("NEW APP/src/lib/realisticFarming/economy/index.ts", {
    "@/types/dashboard": {},
    "@/lib/profile-display": profileDisplay,
});
const economyLib = productionTs("NEW APP/src/lib/economy.ts", {
    "@/i18n/i18n": i18n,
    "@/lib/fleet-classify": productionTs("NEW APP/src/lib/fleet-classify.ts"),
    "@/lib/profile-display": profileDisplay,
});
const moisture = productionTs("NEW APP/src/lib/moisture.ts", { "@/i18n/i18n": i18n });
const storageLib = productionTs("NEW APP/src/lib/storage/index.ts", {
    "@/i18n/i18n": i18n,
    "@/lib/fillTypeResolve": productionTs("NEW APP/src/lib/fillTypeResolve.ts"),
    "@/lib/moisture": moisture,
    "@/lib/fill-units": fillUnits,
    "@/lib/profile-display": profileDisplay,
});

const RfEconomyPanels = productionTs("NEW APP/src/sections/economy/RfEconomyPanels.tsx", {
    "@/components/ui": ui,
    "@/i18n/i18n": i18n,
    "@/lib/fill-units": fillUnits,
    "@/lib/fill-unit-mode": fillMode,
    "@/lib/profile-display": profileDisplay,
    "@/lib/realisticFarming/economy": rfEconomy,
    "@/types/dashboard": {},
}).RfEconomyPanels;

const EconomySection = productionTs("NEW APP/src/sections/economy/EconomySection.tsx", {
    "preact/hooks": preactRuntime().hooks,
    "@/i18n/i18n": i18n,
    "@/components/ui": ui,
    "@/store/dashboard-store": { useDashboardStore },
    "@/types/dashboard": {},
    "@/lib/economy": economyLib,
    "@/lib/redTape": { isRedTapeModActive: () => false },
    "@/lib/hirePurchasing": { isHirePurchasingModActive: () => false },
    "@/lib/invoices": { isInvoicesModActive: () => false },
    "@/lib/fill-units": fillUnits,
    "@/lib/fill-unit-mode": fillMode,
    "@/lib/profile-display": profileDisplay,
    "@/sections/economy/RfEconomyPanels": { RfEconomyPanels },
    "@/sections/companions": { CompanionModsEmbed: () => null },
    "@/lib/companionMods": { isCompanionModsActive: () => false },
    "@/sections/economy/economy.css": {},
}).EconomySection;

const StorageSection = productionTs("NEW APP/src/sections/storage/StorageSection.tsx", {
    "preact/hooks": preactRuntime().hooks,
    "@/i18n/i18n": i18n,
    "@/sections/companions": { CompanionModsEmbed: () => null },
    "@/components/ui": ui,
    "@/store/dashboard-store": { useDashboardStore },
    "@/lib/fill-units": fillUnits,
    "@/lib/fill-unit-mode": fillMode,
    "@/lib/profile-display": profileDisplay,
    "@/types/dashboard": {},
    "@/lib/economy": economyLib,
    "@/lib/storage": storageLib,
    "@/lib/moisture": moisture,
    "@/lib/storage/stock-moisture": productionTs("NEW APP/src/lib/storage/stock-moisture.ts"),
    "@/lib/fillTypeResolve": productionTs("NEW APP/src/lib/fillTypeResolve.ts"),
    "@/sections/storage/FertilizerDepotPanel": { FertilizerDepotPanel: () => null },
    "@/sections/economy/economy.css": {},
}).StorageSection;

class Viewport {
    constructor() {
        return new Proxy(this, {
            get(target, key) {
                if (key in target) return target[key];
                return () => {};
            },
        });
    }

    consumePan() { return false; }
}

const FleetMapSection = productionTs("NEW APP/src/sections/fleet-map/FleetMapSection.tsx", {
    "preact/hooks": preactRuntime().hooks,
    "@/components/ui": ui,
    "@/i18n/i18n": i18n,
    "@/lib/fleetMapGeo": {
        fleetMapPercent: () => ({ left: 12, top: 18 }),
        INGAME_MAP_WORLD_INSET: { width: 1, height: 1, left: 0, top: 0 },
        mapOverviewIdentityKey: () => "",
        resolveFleetMapTerrainBounds: () => ({ minX: 0, maxX: 1, minZ: 0, maxZ: 1 }),
    },
    "@/lib/fleetMapViewport": { FleetMapViewport: Viewport },
    "@/lib/fleetMapMarkers": {
        classifyFleetMapIcon: () => "tractor",
        classifyHusbandrySpecies: () => null,
        fleetMapHeadingDeg: () => null,
        FleetMapMarkerIcon: () => null,
        FleetMapPlaceIcon: () => null,
    },
    "@/lib/fleetMapOverlays": {
        availableOverlayModes: () => ["crops"],
        computeOverlayRange: () => null,
        defaultOverlayMode: () => "crops",
        fieldBlobSizePercent: () => 1,
        FLEET_MAP_TYPE_FILTERS: ["all"],
        groupedAvailableOverlayModes: () => [],
        isFleetMapOverlayMode: (value) => value === "crops" || value === "off",
        isFleetMapTypeFilter: (value) => value === "all",
        isOwnedField: (field) => Boolean(field && (field.id || field.farmlandId)),
        isRelativeOverlayMode: () => false,
        normalizeFieldOutline: () => null,
        outlineToSvgPoints: () => "",
        overlayLegendItems: () => [],
        overlayLegendRange: () => "",
        overlayPaintForField: () => ({ fill: "#ccc" }),
        overlayScaleInvert: () => false,
        pickMapOutlineForField: () => null,
        readWorldXZ: (vehicle) => (vehicle ? { x: 100, z: 200 } : null),
        snapshotHasPrecisionFarming: () => false,
        snapshotHasSoilFertilizer: () => false,
        typeFilterMatches: () => true,
    },
    "@/lib/rules-engine": { paintedBlobKey: () => "" },
    "@/lib/productions": { getChainsForFarmView: () => [], normalizeProductionChains: () => [] },
    "@/lib/economy": economyLib,
    "@/sections/fields/field-helpers": { formatCropName: (name) => String(name || "") },
    "@/lib/vehicles": {
        getDisplayFleet: (vehicles) => vehicles?.items || [],
        isDealershipOrPoolStock: () => false,
        isStorageItem: () => false,
        normalizeVehicleList: (vehicles) => vehicles?.items || [],
        resolveVehicleDisplayName: (vehicle) => vehicle?.typeName || "Tractor",
        resolveVehicleRoleFilter: () => ({ type: null }),
        vehicleMatchesDeepLinkId: () => false,
        vehicleMatchesActiveFarm: () => true,
        vehicleRowKey: (vehicle) => String(vehicle.id),
    },
    "@/store/dashboard-store": { useDashboardStore },
    "@/lib/profile-display": profileDisplay,
    "@/platform/urgent-alerts": productionTs("NEW APP/src/platform/urgent-alerts.ts", {
        "@/i18n/i18n": i18n,
        "@/sections/fields/field-helpers": { effectiveHarvestReady: () => false, fieldShowsWithered: () => false },
    }),
    "@/sections/fleet-map/fleet-map.css": {},
}).FleetMapSection;

const pounds = { applyState: "effective", effective: { money: 3 } };
const miles = { applyState: "effective", effective: { money: 3, miles: true } };

function fire(node, type) {
    const handler = node && node.l && node.l[`${type}false`];
    if (typeof handler !== "function") throw new Error(`no ${type} handler`);
    handler({ stopPropagation() {}, preventDefault() {}, currentTarget: node, target: node });
}

function paint(Component) {
    const host = document.createElement("div");
    document.body.appendChild(host);
    render(h(Component, null), host);
    return host;
}

function economyPayload(profile) {
    return {
        farmInfo: [{ id: 1, money: 1000, loan: 0 }],
        vehicles: [],
        economy: {
            marketPrices: {
                crops: {
                    WHEAT: { avgPrice: 100, locations: [{ name: "Mill", price: 100 }] },
                },
                sellPoints: [{
                    name: "Mill",
                    prices: { WHEAT: { price: 100, multiplier: 1 } },
                }],
            },
        },
        realisticFarming: {
            tax: { enabled: true, byFarm: { "1": { accumulatedAnnual: 1500 } } },
            fuelCosts: { enabled: true, dieselPrice: 1.25 },
        },
        unitDisplay: profile ? { saveUnitProfiles: profile } : {},
    };
}

describe("mounted currency and speed", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    test("economy balances and market quotes share the live currency and the fill basis", async () => {
        box.state.viewerFillUnitMode = "imperial";
        box.state.payload = economyPayload(pounds);
        const root = paint(EconomySection);
        const text = root.textContent;
        expect(text).toContain("£1,000");
        expect(text).toContain("£1,500");
        expect(text).toContain("£1.2500/L");
        expect(text).toContain("£3.5239 / US bu");
        const location = [...root.querySelectorAll("button")].find((button) => button.textContent === "economy.marketByLocation");
        fire(location, "click");
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(root.textContent).toContain("economy.colPrice");
        expect(root.textContent).not.toContain("$");
        render(null, root);
    });

    test("a missing live currency stays neutral and an unknown id stays unnamed", () => {
        box.state.viewerFillUnitMode = "litres";
        box.state.payload = economyPayload(null);
        let root = paint(EconomySection);
        expect(root.textContent).toContain("1,000");
        expect(root.textContent).toContain("1.2500/L");
        expect(root.textContent).not.toContain("$");
        expect(root.textContent).toContain("/ 1,000 L");
        render(null, root);

        box.state.payload = economyPayload({ applyState: "effective", effective: { money: 99 } });
        root = paint(EconomySection);
        expect(root.textContent).toContain("1,000 profile.unitUnavailable");
        expect(root.textContent).toContain("1.2500 profile.unitUnavailable/L");
        expect(root.textContent).not.toContain("$");
        render(null, root);
    });

    test("storage keeps a fractional gallon price visible beside the rounded total", () => {
        box.state.viewerFillUnitMode = "imperial";
        box.state.payload = {
            stock: { byFarm: { "1": { items: [{ fillType: "DIESEL", totalLiters: 3785.41, bestSellPrice: 100 }] } } },
            unitDisplay: { saveUnitProfiles: pounds },
        };
        const root = paint(StorageSection);
        expect(root.textContent).toContain("£0.3785 / US gal");
        expect(root.textContent).toContain("£378");
        expect(root.textContent).not.toContain("£0 / US gal");
        render(null, root);
    });

    test("the fleet pin shows miles or kilometres from the live speed flag", async () => {
        box.state.payload = {
            vehicles: { items: [{ id: "v1", typeName: "Tractor", speed: 10 }] },
            unitDisplay: { saveUnitProfiles: miles },
        };
        let root = paint(FleetMapSection);
        const pin = root.querySelector("#fleet-map-markers button.farm-fleet-map-pin");
        expect(pin).not.toBeNull();
        fire(pin, "click");
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(root.textContent).toContain("6 mph");
        render(null, root);

        box.state.payload = {
            vehicles: { items: [{ id: "v1", typeName: "Tractor", speed: 10 }] },
            unitDisplay: { saveUnitProfiles: pounds },
        };
        root = paint(FleetMapSection);
        fire(root.querySelector("#fleet-map-markers button.farm-fleet-map-pin"), "click");
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(root.textContent).toContain("10 km/h");
        render(null, root);
    });

    test("an open map detail follows the current profile and entity", async () => {
        const vehicles = { items: [{ id: "v1", typeName: "Tractor", speed: 10 }] };
        const fields = [{ id: "f1", hectares: 10, fruitType: "WHEAT" }];
        box.state.payload = {
            vehicles,
            fields,
            unitDisplay: { saveUnitProfiles: { applyState: "effective", effective: { money: 3, miles: true, acre: true } } },
        };
        const root = paint(FleetMapSection);
        fire(root.querySelector("#fleet-map-markers button.farm-fleet-map-pin"), "click");
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(root.textContent).toContain("6 mph");

        box.state.payload = {
            vehicles,
            fields,
            unitDisplay: { saveUnitProfiles: { applyState: "effective", effective: { money: 3, miles: false, acre: true } } },
        };
        render(h(FleetMapSection, null), root);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(root.textContent).toContain("10 km/h");
        expect(root.textContent).not.toContain("mph");

        box.state.payload = {
            vehicles,
            fields,
            unitDisplay: { saveUnitProfiles: { applyState: "effective", effective: { money: 3, acre: true } } },
        };
        render(h(FleetMapSection, null), root);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(root.textContent).toContain("10 km/h");

        box.state.payload = {
            vehicles: { items: [{ id: "v1", typeName: "Tractor", speed: 20 }] },
            fields,
            unitDisplay: box.state.payload.unitDisplay,
        };
        render(h(FleetMapSection, null), root);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(root.textContent).toContain("20 km/h");

        const field = root.querySelector("button.farm-fleet-map-blob");
        expect(field).not.toBeNull();
        fire(field, "click");
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(root.textContent).toContain("24.71 ac");

        box.state.payload = {
            vehicles: box.state.payload.vehicles,
            fields,
            unitDisplay: { saveUnitProfiles: { applyState: "effective", effective: { money: 3 } } },
        };
        render(h(FleetMapSection, null), root);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(root.textContent).toContain("10.00 ha");
        expect(root.textContent).not.toContain("24.71 ac");

        box.state.payload = {
            vehicles: { items: [{ id: "v2", typeName: "Other", speed: 10 }] },
            fields: [],
            unitDisplay: box.state.payload.unitDisplay,
        };
        render(h(FleetMapSection, null), root);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(root.querySelector(".farm-fleet-map-tooltip")).toBeNull();
        render(null, root);
    });

    test("a selected pin does not attach to the same id on another source, save, or farm", async () => {
        box.state.activeServerId = "source-A";
        box.state.activeFarmId = 1;
        const profile = { saveUnitProfiles: { applyState: "effective", effective: { money: 3 } } };
        box.state.payload = {
            savegameName: "session-1",
            vehicles: { items: [{ id: "v1", typeName: "Source A Tractor", speed: 10 }] },
            fields: [{ id: "f1", hectares: 10, fruitType: "WHEAT" }],
            unitDisplay: profile,
        };
        const root = paint(FleetMapSection);
        fire(root.querySelector("#fleet-map-markers button.farm-fleet-map-pin"), "click");
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(root.textContent).toContain("Source A Tractor");
        expect(root.textContent).toContain("10 km/h");

        box.state.payload = {
            ...box.state.payload,
            vehicles: { items: [{ id: "v1", typeName: "Source A Tractor", speed: 12 }] },
        };
        render(h(FleetMapSection, null), root);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(root.textContent).toContain("12 km/h");

        box.state.activeServerId = "source-B";
        box.state.payload = {
            savegameName: "session-1",
            vehicles: { items: [{ id: "v1", typeName: "Source B Different Vehicle", speed: 30 }] },
            fields: [{ id: "f1", hectares: 10, fruitType: "WHEAT" }],
            unitDisplay: profile,
        };
        render(h(FleetMapSection, null), root);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(root.textContent).not.toContain("Source B Different Vehicle");
        expect(root.textContent).not.toContain("30 km/h");
        expect(root.querySelector(".farm-fleet-map-tooltip")).toBeNull();

        fire(root.querySelector("#fleet-map-markers button.farm-fleet-map-pin"), "click");
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(root.textContent).toContain("Source B Different Vehicle");
        expect(root.textContent).toContain("30 km/h");
        fire(root.querySelector("button.farm-fleet-map-blob"), "click");
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(root.textContent).toContain("10.00 ha");

        box.state.payload = {
            ...box.state.payload,
            savegameName: "session-2",
        };
        render(h(FleetMapSection, null), root);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(root.querySelector(".farm-fleet-map-tooltip")).toBeNull();

        fire(root.querySelector("#fleet-map-markers button.farm-fleet-map-pin"), "click");
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(root.textContent).toContain("30 km/h");

        box.state.activeFarmId = 2;
        box.state.payload = {
            ...box.state.payload,
            vehicles: { items: [] },
            fields: [],
        };
        render(h(FleetMapSection, null), root);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(root.querySelector(".farm-fleet-map-tooltip")).toBeNull();

        box.state.activeServerId = "source-A";
        box.state.activeFarmId = 1;
        render(null, root);
    });

    test("the same save name does not keep a selection across a new export session", async () => {
        box.state.activeServerId = "source-A";
        box.state.activeFarmId = 1;
        box.state.payload = {
            savegameName: "same-save",
            sectionOutcomes: { sessionId: "session-1", careerId: "career-1" },
            vehicles: { items: [{ id: "v1", typeName: "Source A Tractor", speed: 10 }] },
            fields: [],
        };
        const root = paint(FleetMapSection);
        fire(root.querySelector("#fleet-map-markers button.farm-fleet-map-pin"), "click");
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(root.textContent).toContain("Source A Tractor");

        box.state.payload = {
            savegameName: "same-save",
            sectionOutcomes: { sessionId: "session-2", careerId: "career-1" },
            vehicles: { items: [{ id: "v1", typeName: "Source B Different Vehicle", speed: 30 }] },
            fields: [],
        };
        render(h(FleetMapSection, null), root);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(root.querySelector(".farm-fleet-map-tooltip")).toBeNull();
        expect(root.textContent).not.toContain("Source B Different Vehicle");
        render(null, root);
    });
});
