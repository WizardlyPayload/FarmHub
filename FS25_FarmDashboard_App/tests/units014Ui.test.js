/**
 * @jest-environment jsdom
 */
"use strict";

const { productionTs, preactRuntime } = require("./helpers/production-source.cjs");

const { h, render } = preactRuntime().preact;
const i18n = {
    t: (key) => key,
    tOr: (_key, fallback) => fallback,
};
const ui = {
    Badge: (props) => h("span", null, props.children),
    Button: (props) => h("button", { type: "button", onClick: props.onClick }, props.children),
    Card: (props) => h("section", null, props.title, props.children),
};
const rules = {
    refreshFieldRulesCache: () => Promise.resolve(),
    clusterFieldsForDisplay: (fields) => fields,
    getLocalFieldSuggestion: () => null,
    RULES_ENGINE_FALLBACK_KIND: "fallback",
    getBaleCountStrict: () => 0,
    aggregateWindrowDetected: () => 0,
    aggregateBaleableLoose: () => 0,
    classifyWindrowMaterial: () => "",
    fieldShowsNonBaleForageBadges: () => false,
    MIN_FORAGE_WORKFLOW_LITERS: 1,
    nitrogenTargetForDisplay: () => null,
    PF_NUTRIENT_CLOSE_FRAC: 0.1,
    isFreshlyMownGrass: () => false,
    isMowableForageCrop: () => false,
    isPreparedSeedbedGround: () => false,
    buildToolGuidanceLines: () => [],
    buildFleetLinksForSuggestion: () => [],
    formatMoisturePercent: () => "",
    moistureGradeLabel: () => "",
    weedPercentForDisplay: () => 0,
    WEED_ALERT_THRESHOLD_PCT: 10,
};

const box = {
    state: {
        payload: null,
        activeFarmId: 1,
        activeServerId: "",
        connection: "ws",
        viewerFillUnitMode: null,
        sectionParams: {},
        setSectionParams: () => {},
        setSection: () => {},
        servers: [],
    },
};
const useDashboardStore = (selector) => (selector ? selector(box.state) : box.state);

const fillUnits = productionTs("NEW APP/src/lib/fill-units.ts");
const profileDisplay = productionTs("NEW APP/src/lib/profile-display.ts", { "@/i18n/i18n": i18n });
const fillTypeResolve = productionTs("NEW APP/src/lib/fillTypeResolve.ts");
const fillMode = productionTs("NEW APP/src/lib/fill-unit-mode.ts", {
    "@/store/dashboard-store": { useDashboardStore },
    "@/lib/fill-units": fillUnits,
});
const gameTime = productionTs("NEW APP/src/lib/game-time.ts", {
    "@/lib/profile-display": profileDisplay,
});
const weather = productionTs("NEW APP/src/lib/weather.ts");
const cores = productionTs("NEW APP/src/lib/realisticFarming/cores/index.ts");
const connectionBadge = productionTs("NEW APP/src/lib/connection-badge.ts");
const serverLabel = productionTs("NEW APP/src/lib/server-label.ts");
const land = productionTs("NEW APP/src/lib/realisticFarming/land/index.ts");
const rfEconomy = productionTs("NEW APP/src/lib/realisticFarming/economy/index.ts", {
    "@/types/dashboard": {},
    "@/lib/profile-display": profileDisplay,
});
const productionsLib = productionTs("NEW APP/src/lib/productions.ts", {
    "@/lib/fillTypeResolve": fillTypeResolve,
    "@/lib/fill-units": fillUnits,
});
const moisture = productionTs("NEW APP/src/lib/moisture.ts", { "@/i18n/i18n": i18n });
const stockMoisture = productionTs("NEW APP/src/lib/storage/stock-moisture.ts");
const storageLib = productionTs("NEW APP/src/lib/storage/index.ts", {
    "@/i18n/i18n": i18n,
    "@/lib/fillTypeResolve": fillTypeResolve,
    "@/lib/moisture": moisture,
    "@/lib/fill-units": fillUnits,
    "@/lib/profile-display": profileDisplay,
});
const economyLib = productionTs("NEW APP/src/lib/economy.ts", {
    "@/i18n/i18n": i18n,
    "@/lib/fleet-classify": productionTs("NEW APP/src/lib/fleet-classify.ts"),
    "@/lib/profile-display": profileDisplay,
});
const pasturesDisplay = productionTs("NEW APP/src/lib/pastures-display.ts");
const fieldHelpers = productionTs("NEW APP/src/sections/fields/field-helpers.ts", {
    "@/i18n/i18n": i18n,
    "@/lib/rules-engine": rules,
    "@/lib/field-harvest-state": { xmlGrowthLooksHarvested: () => false },
});
const fieldSort = productionTs("NEW APP/src/sections/fields/field-sort.ts", {
    "@/lib/realisticFarming/land": land,
    "@/lib/rules-engine": rules,
    "./field-helpers": fieldHelpers,
});

const ProductionsSection = productionTs("NEW APP/src/sections/productions/ProductionsSection.tsx", {
    "@/i18n/i18n": i18n,
    "@/sections/companions": { CompanionModsEmbed: () => null },
    "@/components/ui": ui,
    "@/store/dashboard-store": { useDashboardStore },
    "@/lib/fillTypeResolve": fillTypeResolve,
    "@/lib/productions": productionsLib,
    "@/lib/fill-units": fillUnits,
    "@/lib/fill-unit-mode": fillMode,
    "./productions.css": {},
}).ProductionsSection;

const StorageSection = productionTs("NEW APP/src/sections/storage/StorageSection.tsx", {
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
    "@/lib/storage/stock-moisture": stockMoisture,
    "@/lib/fillTypeResolve": fillTypeResolve,
    "@/sections/storage/FertilizerDepotPanel": { FertilizerDepotPanel: () => null },
    "@/sections/economy/economy.css": {},
}).StorageSection;

const RfEconomyPanels = productionTs("NEW APP/src/sections/economy/RfEconomyPanels.tsx", {
    "@/components/ui": ui,
    "@/i18n/i18n": i18n,
    "@/lib/fill-units": fillUnits,
    "@/lib/fill-unit-mode": fillMode,
    "@/lib/profile-display": profileDisplay,
    "@/lib/realisticFarming/economy": rfEconomy,
    "@/types/dashboard": {},
}).RfEconomyPanels;

const DetailsModal = productionTs("NEW APP/src/sections/pastures/PasturesSection.tsx", {
    "@/lib/use-focus-trap": { useFocusTrap: () => ({ current: null }) },
    "@/i18n/i18n": i18n,
    "@/sections/companions": { CompanionModsEmbed: () => null },
    "@/components/ui": ui,
    "@/store/dashboard-store": { useDashboardStore },
    "@/lib/fill-units": fillUnits,
    "@/lib/fill-unit-mode": fillMode,
    "@/lib/farm-scope": { isMultiFarmEnabled: () => false },
    "@/lib/pastures-parsers": {
        formatPastureHealthPercent: () => "0%",
        formatResourceDurationHint: () => "",
        fmtAgeMonthsStr: () => "",
        getHealthClass: () => "",
        getLowHealthAnimalsForPastures: () => [],
        getWarningTypeTitle: () => "",
        parsePasturesFromPayload: () => [],
    },
    "@/lib/pastures-display": pasturesDisplay,
    "@/lib/pastures-types": {},
    "@/sections/livestock/LivestockPenPanel": { LivestockPenPanel: () => null },
    "@/sections/pastures/DairyCorePanel": { DairyCorePanel: () => null },
    "@/lib/use-hydrated-livestock": { useHydratedLivestockAnimals: () => ({ animals: [] }) },
    "./pastures.css": {},
}).DetailsModal;

const AppTopBar = productionTs("NEW APP/src/app/AppTopBar.tsx", {
    "@/i18n/i18n": i18n,
    "@/store/dashboard-store": { useDashboardStore },
    "@/components/ui": ui,
    "@/platform/PlatformChrome": { NotificationBell: () => null },
    "@/platform/viewer-mode": { isFarmDashLocalConfigHost: () => false },
    "@/lib/farm-scope": {
        getPlayerFarmRecords: () => [],
        isMultiFarmEnabled: () => false,
    },
    "@/services/ws-client": { switchActiveFarm: () => {}, switchActiveServer: () => {} },
    "@/lib/game-time": gameTime,
    "@/lib/profile-display": profileDisplay,
    "@/lib/weather": weather,
    "@/components/WeatherModal": { WeatherModal: () => null },
    "@/app/section-meta": { TOPBAR_ICONS: { settings: "" } },
    "@/lib/realisticFarming/cores": cores,
    "@/lib/connection-badge": connectionBadge,
    "@/lib/server-label": serverLabel,
}).AppTopBar;

const WeatherModal = productionTs("NEW APP/src/components/WeatherModal.tsx", {
    "@/i18n/i18n": i18n,
    "@/lib/fill-unit-mode": fillMode,
    "@/lib/profile-display": profileDisplay,
    "@/components/ui": ui,
    "@/lib/use-focus-trap": { useFocusTrap: () => ({ current: null }) },
    "@/lib/weather": weather,
    "@/lib/realisticFarming/cores": cores,
}).WeatherModal;

const FieldCard = productionTs("NEW APP/src/sections/fields/FieldCard.tsx", {
    "@/i18n/i18n": i18n,
    "@/components/ui": ui,
    "@/store/dashboard-store": { useDashboardStore },
    "@/lib/fill-unit-mode": fillMode,
    "@/lib/profile-display": profileDisplay,
    "@/lib/realisticFarming/land": land,
    "@/lib/fleetMapOverlays": { normalizeFieldOutline: () => null },
    "./field-helpers": fieldHelpers,
    "@/lib/rules-engine": rules,
    "./RfLandPanels": { RfLandPanels: () => null },
}).FieldCard;

const FieldsSection = productionTs("NEW APP/src/sections/fields/FieldsSection.tsx", {
    "@/i18n/i18n": i18n,
    "@/sections/companions": { CompanionModsEmbed: () => null },
    "@/components/ui": ui,
    "@/lib/rules-engine": rules,
    "@/store/dashboard-store": { useDashboardStore },
    "@/lib/profile-display": profileDisplay,
    "@/services/electron-bridge": { getFarmDashApi: () => null },
    "@/lib/realisticFarming/land": land,
    "./field-helpers": fieldHelpers,
    "./field-sort": fieldSort,
    "./FieldCard": { FieldCard },
    "@/components/ux/UiStatePanel": { UiStatePanel: () => null },
    "@/components/ux/FreshnessChip": { FreshnessChip: () => null },
    "@/lib/ux-state": { buildModuleUiState: () => ({ kind: "success" }) },
    "@/services/ws-client": { refreshDashboard: () => {} },
    "./fields.css": {},
}).FieldsSection;

function compact(text) {
    return String(text).replace(/[\s,\u00a0\u202f]/g, "");
}

function show(node) {
    const root = document.createElement("div");
    document.body.appendChild(root);
    render(h(node.type || node, node.props || null), root);
    return root;
}

function paint(Component, props) {
    const root = document.createElement("div");
    document.body.appendChild(root);
    render(h(Component, props || {}), root);
    return root;
}

const pounds = {
    applyState: "effective",
    effective: {
        money: 3,
        miles: true,
        fahrenheit: true,
        acre: true,
        use24HourTime: false,
    },
};

const metricFlags = {
    applyState: "effective",
    money: 3,
    miles: true,
    fahrenheit: true,
    acre: true,
    use24HourTime: false,
    effective: {
        money: 1,
        miles: false,
        fahrenheit: false,
        acre: false,
        use24HourTime: true,
    },
};

function chainPayload(unitDisplay, physics) {
    return {
        production: {
            chains: [{
                id: "mill",
                name: "Mill",
                ownerFarmId: 1,
                productions: [{
                    inputs: [
                        { fillType: "WHEAT", recipeAmount: 1000 },
                        { fillType: "DIESEL", recipeAmount: 3785.41 },
                        { fillType: "EGG", recipeAmount: 12 },
                        { fillType: "MOD_FILL", recipeAmount: 1000 },
                        { fillType: "SEEDS", recipeAmount: 0 },
                    ],
                    outputs: [],
                }],
            }],
        },
        unitDisplay,
        fillTypePhysics: physics || null,
    };
}

const wheatPhysics = {
    WHEAT: { kg: 0.78 },
    MOD_FILL: { kg: Infinity, liquid: false },
    STRAW: { kg: 0.06 },
};

describe("mounted unit and profile consumers", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    test("production recipes show litres, British mass, manual US, and rejected density", () => {
        box.state.viewerFillUnitMode = null;
        box.state.payload = chainPayload(null, wheatPhysics);
        let root = paint(ProductionsSection);
        expect(compact(root.textContent)).toContain("1000L");
        expect(root.textContent).toContain("0 L");
        render(null, root);

        box.state.payload = chainPayload({ british: true }, wheatPhysics);
        root = paint(ProductionsSection);
        expect(root.textContent).toMatch(/780 kg/);
        expect(root.textContent).toMatch(/1[,.\u00a0\u202f]?000 L/);
        expect(root.textContent).toContain("2.4 kg");
        expect(root.textContent).toContain("0 kg");
        render(null, root);

        box.state.viewerFillUnitMode = "imperial";
        box.state.payload = chainPayload(null, wheatPhysics);
        root = paint(ProductionsSection);
        expect(compact(root.textContent)).toContain("1000USgal");
        expect(root.textContent).toContain("US bu");
        expect(root.textContent).toContain("12 L");
        expect(root.textContent).toMatch(/1[,.\u00a0\u202f]?000 L/);
        render(null, root);
    });

    test("Automatic follows a readable provider, an explicit choice wins, and an all-metric profile stays litres", () => {
        const gallonsProvider = {
            british: false,
            imperial: {
                present: true,
                settingsAvailable: true,
                ownsFillUnits: false,
                liquid: "gallons",
                crops: "imperial",
                weight: "imperial",
            },
        };
        box.state.viewerFillUnitMode = null;
        box.state.payload = chainPayload(gallonsProvider, wheatPhysics);
        let root = paint(ProductionsSection);
        expect(root.textContent).toContain("US gal");
        expect(root.textContent).not.toMatch(/780 kg/);
        render(null, root);

        box.state.viewerFillUnitMode = "british";
        box.state.payload = chainPayload(gallonsProvider, wheatPhysics);
        root = paint(ProductionsSection);
        expect(root.textContent).toMatch(/780 kg/);
        expect(root.textContent).not.toContain("US gal");
        render(null, root);

        box.state.viewerFillUnitMode = "imperial";
        box.state.payload = chainPayload({
            imperial: {
                present: true,
                settingsAvailable: true,
                liquid: "liters",
                crops: "liters",
                weight: "metric",
            },
        }, wheatPhysics);
        root = paint(ProductionsSection);
        expect(compact(root.textContent)).toContain("1000L");
        expect(root.textContent).not.toContain("US gal");
        render(null, root);

        box.state.viewerFillUnitMode = "british";
        box.state.payload = chainPayload({ british: false, imperial: null }, wheatPhysics);
        root = paint(ProductionsSection);
        expect(root.textContent).toMatch(/780 kg/);
        render(null, root);
    });

    test("storage quantities, prices, and profile money render together", () => {
        box.state.viewerFillUnitMode = "imperial";
        box.state.payload = {
            stock: {
                byFarm: {
                    "1": {
                        items: [{
                            fillType: "DIESEL",
                            totalLiters: 3785.41,
                            bestSellPrice: 1000,
                        }],
                    },
                },
            },
            unitDisplay: { saveUnitProfiles: pounds },
        };
        const root = paint(StorageSection);
        expect(root.textContent).toContain("US gal");
        expect(root.textContent).toContain("/ US gal");
        expect(root.textContent).toContain("£");
        render(null, root);
    });

    test("pasture food uses British mass and water stays litres", () => {
        box.state.viewerFillUnitMode = null;
        box.state.payload = {
            unitDisplay: { british: true },
            fillTypePhysics: { DRYGRASS_WINDROW: { kg: 0.07 } },
        };
        const root = paint(DetailsModal, {
            pasture: {
                name: "Barn",
                animalCount: 2,
                conditionReport: { hasRealData: true },
                foodReport: {
                    hasRealData: true,
                    totalCapacity: 5000,
                    availableFood: 1000,
                    hay: 1000,
                    silage: 0,
                    grass: 0,
                    forage: 0,
                    water: 1000,
                    straw: 0,
                },
            },
            onClose: () => {},
            onViewLivestock: () => {},
        });
        expect(root.textContent).toMatch(/70 kg/);
        expect(compact(root.textContent)).toContain("1000L");
        render(null, root);
    });

    test("economy money and market prices follow the profile and the fill owner", () => {
        box.state.viewerFillUnitMode = "imperial";
        box.state.payload = { unitDisplay: { saveUnitProfiles: pounds } };
        const root = paint(RfEconomyPanels, {
            farmId: 1,
            rf: {
                tax: { enabled: true, byFarm: { "1": { accumulatedAnnual: 1500, projectedBill: 400 } } },
                fuelCosts: { enabled: true, dieselPrice: 1.25, trend: "flat" },
                marketDynamics: {
                    enabled: true,
                    movers: [{ fillType: "DIESEL", pricePer1000l: 1000, pctFromBase: 1 }],
                },
            },
        });
        expect(root.textContent).toContain("£");
        expect(root.textContent).toContain("£1.2500/L");
        expect(root.textContent).toContain("/ US gal");
        render(null, root);
    });

    test("clock, temperature, wind, and field area follow live profile flags", () => {
        box.state.payload = {
            gameTime: { hour: 13, minute: 0, currentDay: 2 },
            weather: { currentTemperature: 0, currentWeather: "sunny", windSpeed: 100 },
            unitDisplay: { saveUnitProfiles: pounds },
            fields: [{ id: 1, ownerFarmId: 1, hectares: 10, fruitType: "wheat" }],
        };
        let root = paint(AppTopBar, { onOpenSettings: () => {} });
        expect(root.textContent).toContain("1:00 PM");
        expect(root.textContent).toContain("32°F");
        render(null, root);

        root = paint(WeatherModal, {
            weather: box.state.payload.weather,
            onClose: () => {},
        });
        expect(root.textContent).toContain("32°F");
        expect(root.textContent).toContain("62 mph");
        render(null, root);

        root = paint(FieldCard, { field: { id: 1, ownerFarmId: 1, hectares: 4, fruitType: "wheat" } });
        expect(root.textContent).toContain("9.88 ac");
        render(null, root);

        root = paint(FieldsSection);
        expect(root.textContent).toContain("24.7");
        expect(root.textContent).toContain("ac");
        render(null, root);

        box.state.payload = {
            ...box.state.payload,
            unitDisplay: { saveUnitProfiles: metricFlags },
        };
        root = paint(AppTopBar, { onOpenSettings: () => {} });
        expect(root.textContent).toContain("13:00");
        expect(root.textContent).toContain("0°C");
        render(null, root);
        root = paint(WeatherModal, { weather: { currentTemperature: 0, currentWeather: "sunny", windSpeed: 100 }, onClose: () => {} });
        expect(root.textContent).toContain("100 km/h");
        render(null, root);
        root = paint(FieldCard, { field: { id: 1, ownerFarmId: 1, hectares: 4, fruitType: "wheat" } });
        expect(root.textContent).toContain("4.00 ha");
        render(null, root);
        root = paint(FieldsSection);
        expect(root.textContent).toContain("10.0");
        expect(root.textContent).toContain("fields.hectares");
        expect(root.textContent).not.toContain("24.7");
        render(null, root);
    });
});
