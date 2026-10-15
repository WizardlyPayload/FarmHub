/**
 * @jest-environment jsdom
 */
"use strict";

const { productionTs, preactRuntime } = require("./helpers/production-source.cjs");

const { h, render } = preactRuntime().preact;
const withParams = (key, params) => (params ? `${key}${JSON.stringify(params)}` : key);
const i18n = {
    t: (key, params) => withParams(key, params),
    tOr: (key, _fallback, params) => withParams(key, params),
};
const ui = {
    Badge: (props) => h("span", { class: `badge badge--${props.tone || "default"}` }, props.children),
    Button: (props) => h("button", { type: "button", onClick: props.onClick }, props.children),
    Card: (props) => h("section", { class: props.class }, props.title, props.children),
};
const box = {
    state: {
        payload: null,
        activeFarmId: 1,
        activeServerId: "source-A",
        viewerFillUnitMode: "litres",
        sectionParams: {},
        setSectionParams: () => {},
        setSection: () => {},
    },
};
const useDashboardStore = (selector) => (selector ? selector(box.state) : box.state);
const mocks = {
    "@/i18n/i18n": i18n,
    "@/components/ui": ui,
    "@/store/dashboard-store": { useDashboardStore },
    "@/sections/companions": { CompanionModsEmbed: () => null },
    "@/sections/companions/AssetCompanionNotes": { FLEET_NOTES_IDS: [], FleetMaintenanceNotes: () => null },
    "@/sections/storage/FertilizerDepotPanel": { FertilizerDepotPanel: () => null },
};

const { VehiclesSection } = productionTs("NEW APP/src/sections/vehicles/VehiclesSection.tsx", mocks);
const { StorageSection } = productionTs("NEW APP/src/sections/storage/StorageSection.tsx", mocks);
const { ProductionsSection } = productionTs("NEW APP/src/sections/productions/ProductionsSection.tsx", mocks);
const { SoilWorkBonusCard } = productionTs("NEW APP/src/sections/fields/SoilWorkBonusCard.tsx", mocks);
const fillUnits = productionTs("NEW APP/src/lib/fill-units.ts", mocks);
const { FOLDED_COMPANIONS } = productionTs("NEW APP/src/lib/foldedCompanions.ts", mocks);
const { COMPANION_CATALOG } = productionTs("NEW APP/src/lib/companionMods/catalog.ts", mocks);

test("each folded mod's catalog row points at the page that now shows its data", () => {
    expect(FOLDED_COMPANIONS).toEqual({
        timeSavingStockCheck: "storage",
        productionWatcher: "productions",
        courseplay: "vehicles",
        vehicleYears: "vehicles",
        vehicleMileage: "vehicles",
        outOfFuel: "vehicles",
        advancedMaintenance: "vehicles",
        collisionDamage: "vehicles",
        puncturedTires: "vehicles",
        bushelPlus: "vehicles",
        soilWorkYieldBonus: "fields",
        britishFillUnits: "economy",
        imperialSystem: "economy",
    });
    for (const [key, section] of Object.entries(FOLDED_COMPANIONS)) {
        expect(COMPANION_CATALOG.find((entry) => entry.id === key)?.relatedSection).toBe(section);
    }
});

function paint(Component, payload, params = {}) {
    box.state.payload = payload;
    box.state.sectionParams = params;
    const host = document.createElement("div");
    document.body.appendChild(host);
    render(h(Component, null), host);
    return host;
}

function folds(root, key) {
    return [...root.querySelectorAll(`[data-fold="${key}"]`)];
}

const vehicles = [
    { id: 101, uniqueId: "veh-a", name: "Tractor A", typeName: "tractor", isMotorized: true, fuelLevel: 40, fuelCapacity: 400, farmId: 1, ownerFarmId: 1 },
    { id: 102, name: "Tractor B", typeName: "tractor", isMotorized: true, fuelLevel: 300, fuelCapacity: 400, farmId: 1, ownerFarmId: 1 },
];

function vehiclePages() {
    return {
        courseplay: {
            detected: true,
            globalSettings: [{ name: "wageModifier", value: 1.5 }, { name: "autoRepair", value: true }],
            byFarm: {
                "1": {
                    vehicles: [
                        { id: "veh-a", cpActive: true, fieldWork: true, selectedJob: "Field work", courses: { count: 1, names: ["North 12"] }, status: { waypoint: 40, waypoints: 200 } },
                        { id: 102, otherHelper: false, courses: { count: 0 } },
                    ],
                },
            },
        },
        vehicleYears: {
            detected: true,
            byFarm: { "1": { oldestYear: 1998, newestYear: 2022, averageYear: 2010, vehicles: [{ id: "veh-a", year: 1998 }, { id: 102, year: 2022 }] } },
        },
        vehicleMileage: {
            detected: true,
            useMiles: true,
            byFarm: { "1": { vehicles: [{ id: "veh-a", odoKm: 1609.344, tripKm: 16.09344 }] } },
        },
        outOfFuel: {
            detected: true,
            floorPct: 10,
            settings: { patched: true },
            byFarm: { "1": { topUpLitres: 120, topUpCost: 180, vehicles: [{ id: 102, topUpLitres: 120 }] } },
        },
    };
}

describe("companion mods folded into Vehicles", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    test("table shows Courseplay, model year, miles and the Out Of Fuel notes when the mods are detected", () => {
        const root = paint(VehiclesSection, { vehicles, companionPages: { pages: vehiclePages() } }, { view: "table" });
        const text = root.textContent;

        const cp = folds(root, "courseplay");
        expect(cp.length).toBeGreaterThanOrEqual(3);
        expect(text).toContain("companionPage.courseplay.actFieldWork");
        expect(text).toContain("North 12");
        expect(text).toContain("companionPage.courseplay.waypointOf");
        const settings = folds(root, "courseplay-settings");
        expect(settings).toHaveLength(1);
        expect(settings[0].querySelectorAll("[data-kv]")).toHaveLength(2);

        expect(folds(root, "vehicleYears").length).toBeGreaterThanOrEqual(2);
        expect(text).toContain("1998");
        expect(text).toContain('vehicles.fold.yearRange{"oldest":1998,"newest":2022}');

        const miles = folds(root, "vehicleMileage").map((el) => el.textContent).join(" ");
        expect(miles).toContain('companionPage.vehicleMileage.miles{"value":"1,000"}');
        expect(miles).toContain('companionPage.vehicleMileage.miles{"value":"10.0"}');

        const fuel = folds(root, "outOfFuel").map((el) => el.textContent).join(" ");
        expect(fuel).toContain('vehicles.fold.outOfFuelNote{"pct":"10"}');
        expect(fuel).toContain("vehicles.fold.outOfFuelTopUpCost");
        expect(fuel).toContain('vehicles.fold.noTopUp{"litres":"120"}');
        render(null, root);
    });

    test("cards carry the same odometer, year and Courseplay line", () => {
        const root = paint(VehiclesSection, { vehicles, companionPages: { pages: vehiclePages() } }, { view: "cards" });
        const cards = [...root.querySelectorAll("[data-vehicle-id]")];
        expect(cards).toHaveLength(2);
        expect(folds(cards[0], "vehicleMileage")).toHaveLength(1);
        expect(folds(cards[0], "courseplay")).toHaveLength(1);
        expect(root.textContent).toContain("1998");
        expect(folds(root, "outOfFuel").length).toBeGreaterThanOrEqual(2);
        render(null, root);
    });

    test("Out Of Fuel that did not patch the load says the top-up is still on and drops per-vehicle lines", () => {
        const pages = vehiclePages();
        pages.outOfFuel.settings.patched = false;
        const root = paint(VehiclesSection, { vehicles, companionPages: { pages } }, { view: "table" });
        const fuel = folds(root, "outOfFuel");
        expect(fuel).toHaveLength(1);
        expect(fuel[0].textContent).toBe("vehicles.fold.outOfFuelNotPatched");
        render(null, root);
    });

    test("nothing from the four mods shows when they are not detected", () => {
        const pages = vehiclePages();
        for (const key of Object.keys(pages)) pages[key].detected = false;
        for (const payload of [{ vehicles }, { vehicles, companionPages: { pages } }]) {
            for (const view of ["table", "cards"]) {
                const root = paint(VehiclesSection, payload, { view });
                for (const key of ["courseplay", "courseplay-settings", "vehicleYears", "vehicleMileage", "outOfFuel"]) {
                    expect(folds(root, key)).toHaveLength(0);
                }
                expect(root.textContent).not.toContain("companionPage.");
                render(null, root);
            }
        }
    });
});

function conditionPages() {
    return {
        advancedMaintenance: {
            detected: true,
            riskThresholdPct: 28.57,
            byFarm: { "1": { machineCount: 2, lockedCount: 1, riskCount: 1, machines: [
                { id: "veh-a", damagePct: 100, zone: "locked" },
                { id: 102, damagePct: 40, zone: "risk", oddsPerCheck: 250 },
            ] } },
        },
        collisionDamage: {
            detected: true,
            settings: { multiplierPct: 100, minDamagePct: 1 },
            byFarm: { "1": { hitCount: 1, machines: [{ id: 102, hitThisSession: true, lastHitMinutesAgo: 5 }, { id: "veh-a", hitThisSession: false }] } },
        },
        puncturedTires: {
            detected: true,
            cycle: { count: 1, limit: 2, dangerNow: true },
            byFarm: { "1": { puncturedCount: 1, armedCount: 1, vehicles: [
                { id: "veh-a", punctured: true, axle: "front", side: "left", punctureType: 2, repairCost: 900 },
                { id: 102, armed: true, metersToPuncture: 150 },
            ] } },
        },
        bushelPlus: {
            detected: true,
            units: [{ name: "Bushel Plus", onCombine: true }, { name: "Bushel Plus", onCombine: false }],
            combines: [{ name: "Combine X", equipped: true, bonusPercent: 10 }, { name: "Combine Y", equipped: false }],
            byFarm: { "1": { unitCount: 2, onCombineCount: 1, combineCount: 2, equippedCombines: 1 } },
        },
    };
}

describe("Advanced Maintenance, Collision Damage, Punctured Tires and Bushel Plus folded into Vehicles", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    test("per-vehicle flags and fleet summary cards show when the mods are detected", () => {
        for (const view of ["table", "cards"]) {
            const root = paint(VehiclesSection, { vehicles, companionPages: { pages: conditionPages() } }, { view });
            const rows = [...root.querySelectorAll("[data-vehicle-id]")];
            expect(rows).toHaveLength(2);
            const [a, b] = rows;
            expect(folds(a, "advancedMaintenance")[0].textContent).toContain("companionPage.advancedMaintenance.zoneLocked");
            expect(folds(b, "advancedMaintenance")[0].textContent).toContain("companionPage.advancedMaintenance.zoneRisk");
            expect(folds(b, "advancedMaintenance")[0].textContent).toContain('companionPage.advancedMaintenance.odds{"n":"250"}');
            expect(folds(a, "collisionDamage")).toHaveLength(0);
            expect(folds(b, "collisionDamage")[0].textContent).toContain("vehicles.fold.collisionHit");
            expect(folds(a, "puncturedTires")[0].textContent).toContain("vehicles.fold.punctureAt");
            expect(folds(a, "puncturedTires")[0].textContent).toContain("companionPage.puncturedTires.axleFront");
            expect(folds(b, "puncturedTires")[0].textContent).toContain('companionPage.puncturedTires.stateArmed{"m":"150"}');

            const summary = root.querySelector(".fd-vehicles__summary");
            expect(summary.querySelector('[data-fold="advancedMaintenance"]').textContent).toContain('vehicles.fold.maintenanceHint{"locked":1,"risk":1}');
            expect(summary.querySelector('[data-fold="collisionDamage"]').textContent).toContain("companionPage.collisionDamage.statHits");
            expect(summary.querySelector('[data-fold="puncturedTires"]').textContent).toContain('vehicles.fold.tyresHint{"punctured":1,"armed":1}');
            const bushel = folds(root, "bushelPlus").map((el) => el.textContent).join(" ");
            expect(bushel).toContain("vehicles.fold.bushelFitted");
            expect(bushel).toContain("Combine X (+10%)");
            expect(bushel).toContain('vehicles.fold.bushelIdle{"count":1}');
            expect(root.textContent).not.toContain("multiplierPct");
            expect(root.textContent).not.toContain("companionPage.puncturedTires.cycle");
            render(null, root);
        }
    });

    test("nothing shows when the mods are not detected", () => {
        const pages = conditionPages();
        for (const key of Object.keys(pages)) pages[key].detected = false;
        for (const payload of [{ vehicles }, { vehicles, companionPages: { pages } }]) {
            const root = paint(VehiclesSection, payload, { view: "table" });
            for (const key of ["advancedMaintenance", "collisionDamage", "puncturedTires", "bushelPlus"]) {
                expect(folds(root, key)).toHaveLength(0);
            }
            expect(root.querySelector(".fd-vehicles__mod-flags")).toBeNull();
            render(null, root);
        }
    });
});

const soilPage = {
    detected: true,
    readState: "ok",
    settings: { enabled: true },
    cellSize: 10,
    workedCells: 420,
    workedAreaHa: 4.2,
    averageBonus: 0.08,
    bestBonus: 0.12,
    coverage: "complete",
    tiers: [
        { bonus: 0.12, areaHa: 1.5, tools: ["plow"] },
        { bonus: 0.08, areaHa: 2.2, tools: ["cultivatorDeep", "powerHarrow"] },
        { bonus: 0.05, areaHa: 0.5, tools: [] },
    ],
};

describe("Soil Work Yield Bonus folded into Fields", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    test("map-wide totals and a compact tier list, in hectares or acres", () => {
        let root = paint(SoilWorkBonusCard, { companionPages: { pages: { soilWorkYieldBonus: soilPage } } });
        expect(root.querySelector('[data-stat="area"]').textContent).toContain("4.20 ha");
        expect(root.querySelector('[data-stat="average"]').textContent).toContain("+8%");
        expect(root.querySelector('[data-stat="best"]').textContent).toContain("+12%");
        const tiers = [...root.querySelectorAll("[data-tier]")].map((li) => li.textContent);
        expect(tiers).toHaveLength(3);
        expect(tiers[0]).toContain("companionPage.soilWorkYieldBonus.toolPlow");
        expect(tiers[0]).toContain("1.50 ha");
        expect(tiers[2]).toContain("companionPage.soilWorkYieldBonus.olderSetting");
        render(null, root);

        root = paint(SoilWorkBonusCard, {
            unitDisplay: { saveUnitProfiles: { applyState: "effective", effective: { acre: true } } },
            companionPages: { pages: { soilWorkYieldBonus: soilPage } },
        });
        expect(root.querySelector('[data-stat="area"]').textContent).toContain("10.38 ac");
        render(null, root);
    });

    test("a sampled grid labels the area as a lower bound", () => {
        const root = paint(SoilWorkBonusCard, { companionPages: { pages: { soilWorkYieldBonus: { ...soilPage, coverage: "sampled" } } } });
        expect(root.querySelector('[data-stat="area"]').textContent).toBe('companionPage.soilWorkYieldBonus.statAreacompanionPage.soilWorkYieldBonus.atLeast{"value":"4.20 ha"}');
        expect(root.textContent).toContain("fields.fold.soilBonusSampled");
        render(null, root);
    });

    test("settings-only, detection-only and switched-off readings give one short line", () => {
        for (const [page, key] of [
            [{ detected: true, readState: "settings-only", settings: { enabled: true } }, "companionPage.soilWorkYieldBonus.noWorked"],
            [{ detected: true, readState: "detection-only" }, "companionPage.soilWorkYieldBonus.noWorked"],
            [{ ...soilPage, settings: { enabled: false } }, "fields.fold.soilBonusOff"],
        ]) {
            const root = paint(SoilWorkBonusCard, { companionPages: { pages: { soilWorkYieldBonus: page } } });
            const empty = root.querySelector('[data-soil-bonus="empty"]');
            expect(empty.textContent).toBe(key);
            expect(root.querySelector("[data-stat]")).toBeNull();
            render(null, root);
        }
    });

    test("hidden when the mod is not detected", () => {
        for (const payload of [{}, { companionPages: { pages: { soilWorkYieldBonus: { ...soilPage, detected: false } } } }]) {
            const root = paint(SoilWorkBonusCard, payload);
            expect(root.innerHTML).toBe("");
            render(null, root);
        }
    });
});

describe("unit mods drive units without a page", () => {
    test("a detected British Fill Units page turns British on when the export missed the mod", () => {
        const display = fillUnits.unitDisplayFromPayload({
            unitDisplay: { british: false, mods: [] },
            companionPages: { pages: { britishFillUnits: { detected: true, modName: "FS25_BritishUnits", gameUnits: { useAcre: true, useMiles: true } } } },
        });
        expect(display.british).toBe(true);
        expect(fillUnits.fillUnitOwnerId(display)).toBe("FS25_BritishUnits");
        expect(display.saveUnitProfiles.effective).toEqual({ acre: true, miles: true });
        expect(fillUnits.effectiveFillUnitMode(display, null)).toBe("british");
        expect(fillUnits.effectiveFillUnitMode(display, "litres")).toBe("litres");
    });

    test("a detected Imperial System page supplies its unit choices", () => {
        const display = fillUnits.unitDisplayFromPayload({
            unitDisplay: { british: false, imperial: null, mods: [] },
            companionPages: { pages: { imperialSystem: { detected: true, settings: { liquid: "gallons", crops: "imperial", weight: "imperial", weightScale: "auto" } } } },
        });
        expect(display.imperial).toMatchObject({ present: true, ownsFillUnits: true, liquid: "gallons", crops: "imperial" });
        expect(fillUnits.effectiveFillUnitMode(display, null)).toBe("imperial");
        expect(fillUnits.formatFillQuantity(3785.41, "DIESEL", "imperial", null, display)).toContain("US gal");
    });

    test("the mod's own export and Save Unit Profiles are never overridden, and payloads are cached", () => {
        const own = { british: false, britishFillUnits: { present: true, ownsFillUnits: false }, imperial: { present: true, settingsAvailable: true, liquid: "liters" }, saveUnitProfiles: { effective: { acre: false } }, mods: [] };
        const payload = {
            unitDisplay: own,
            companionPages: { pages: {
                britishFillUnits: { detected: true, gameUnits: { useAcre: true } },
                imperialSystem: { detected: true, settings: { liquid: "gallons" } },
            } },
        };
        const display = fillUnits.unitDisplayFromPayload(payload);
        expect(display).toBe(own);
        expect(fillUnits.unitDisplayFromPayload(payload)).toBe(display);
        const undetected = { unitDisplay: { british: false }, companionPages: { pages: { britishFillUnits: { detected: false } } } };
        expect(fillUnits.unitDisplayFromPayload(undetected)).toBe(undetected.unitDisplay);
    });
});

function stockPayload(page) {
    return {
        stock: {
            byFarm: {
                "1": {
                    items: [
                        { fillType: "WHEAT", totalLiters: 50000, bestSellPrice: 300 },
                        { fillType: "BARLEY", totalLiters: 20000, bestSellPrice: 250 },
                    ],
                },
            },
        },
        companionPages: page ? { pages: { timeSavingStockCheck: page } } : undefined,
    };
}

describe("Time Saving Stock Check folded into Storage", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    test("adds a Sell now? column per product and the snapshot note when the mod is detected", () => {
        const root = paint(StorageSection, stockPayload({
            detected: true,
            readState: "snapshot",
            byFarm: { "1": { bestTotalValue: 42000, items: [{ fillType: "wheat", guide: "great" }, { fillType: "BARLEY", guide: "normal" }] } },
        }));
        const header = [...root.querySelectorAll("th")].find((th) => th.textContent === "companionPage.timeSavingStockCheck.colGuide");
        expect(header).toBeDefined();
        expect(root.textContent).toContain("companionPage.timeSavingStockCheck.guideGreat");
        expect(root.textContent).toContain("companionPage.timeSavingStockCheck.guideNormal");
        const note = folds(root, "timeSavingStockCheck").map((el) => el.textContent).join(" ");
        expect(note).toContain("storage.fold.stockCheckSnapshot");
        expect(note).toContain("storage.fold.stockCheckBest");
        render(null, root);
    });

    test("a settings-only reading gives the short reason and no column", () => {
        const root = paint(StorageSection, stockPayload({ detected: true, readState: "settings-only", reason: "no-gui", byFarm: {} }));
        expect(root.textContent).not.toContain("companionPage.timeSavingStockCheck.colGuide");
        const note = folds(root, "timeSavingStockCheck");
        expect(note).toHaveLength(1);
        expect(note[0].textContent).toBe("storage.fold.stockCheckNoGui");
        render(null, root);
    });

    test("hidden when the mod is not detected", () => {
        for (const page of [null, { detected: false, byFarm: { "1": { items: [{ fillType: "WHEAT", guide: "great" }] } } }]) {
            const root = paint(StorageSection, stockPayload(page));
            expect(folds(root, "timeSavingStockCheck")).toHaveLength(0);
            expect(root.textContent).not.toContain("companionPage.timeSavingStockCheck");
            render(null, root);
        }
    });
});

function productionPayload(page) {
    return {
        farmInfo: [{ id: 1 }],
        production: {
            chains: [{
                id: 7,
                name: "Bakery",
                ownerFarmId: 1,
                isActive: true,
                inputFillLevels: { FLOUR: 0, SUGAR: 20 },
                outputFillLevels: { BREAD: 9990 },
                productions: [],
            }],
        },
        companionPages: page ? { pages: { productionWatcher: page } } : undefined,
    };
}

const watcherPage = {
    detected: true,
    points: [{
        farmId: 1,
        id: "pp-7",
        name: "Bakery",
        inputAlert: "missing",
        outputAlert: "full",
        storage: [
            { fillType: "FLOUR", role: "input", level: 0, capacity: 1000, percent: 0 },
            { fillType: "SUGAR", role: "input", level: 20, capacity: 1000, percent: 2 },
            { fillType: "BREAD", role: "output", level: 9990, capacity: 10000, percent: 99.9 },
        ],
    }],
    byFarm: { "1": { missingInputs: 1, lowInputs: 1, outputFull: 1, outputNearlyFull: 0 } },
};

describe("Production Watcher folded into Productions", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    test("marks the point's badges and storage rows and adds the count line when detected", () => {
        const root = paint(ProductionsSection, productionPayload(watcherPage));
        const rows = Object.fromEntries([...root.querySelectorAll("tr[data-watch]")].map((tr) => [tr.textContent.split("companionPage")[0], tr]));
        expect(Object.keys(rows).sort()).toEqual(["Bread", "Flour", "Sugar"]);
        expect(rows.Flour.getAttribute("data-watch")).toBe("missing");
        expect(rows.Flour.className).toBe("is-danger");
        expect(rows.Sugar.getAttribute("data-watch")).toBe("low");
        expect(rows.Sugar.className).toBe("is-warn");
        expect(rows.Bread.getAttribute("data-watch")).toBe("full");
        const folded = folds(root, "productionWatcher").map((el) => el.textContent);
        expect(folded).toEqual(expect.arrayContaining([
            "companionPage.productionWatcher.alertMissing",
            "companionPage.productionWatcher.alertFull",
        ]));
        expect(folded.join(" ")).toContain('productions.fold.watcherSummary{"missing":1,"low":1,"full":1,"nearlyFull":0}');
        render(null, root);
    });

    test("hidden when the mod is not detected", () => {
        for (const page of [null, { ...watcherPage, detected: false }]) {
            const root = paint(ProductionsSection, productionPayload(page));
            expect(folds(root, "productionWatcher")).toHaveLength(0);
            expect(root.querySelectorAll("tr[data-watch]")).toHaveLength(0);
            expect(root.textContent).toContain("Flour");
            render(null, root);
        }
    });
});
