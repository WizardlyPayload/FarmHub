"use strict";

const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");
const mod = require("../companionPages/vehicleMileage.js");

const modules = new Map([[mod.key, mod]]);

describe("vehicleMileage merge", () => {
    test("module is auto-discovered by the lead merger", () => {
        expect(loadModules().get(mod.key)).toBeDefined();
    });

    test("drops rows without an odometer, clamps negatives and sorts highest first", () => {
        const out = normalizeCompanionPages({
            pages: {
                vehicleMileage: {
                    detected: true,
                    useMiles: "yes",
                    byFarm: {
                        "1": {
                            totalKm: -1,
                            vehicles: [
                                { id: "low", odoKm: 12, tripKm: -2, hudMode: "junk" },
                                { id: "none", name: "No reading" },
                                { id: "high", odoKm: 900.5, tripKm: 3, hudMode: "trip" },
                            ],
                        },
                    },
                },
            },
        }, { modules });
        const page = out.pages.vehicleMileage;
        const farm = page.byFarm["1"];
        expect(farm.vehicles.map((v) => v.id)).toEqual(["high", "low"]);
        expect(farm.vehicles[1]).toMatchObject({ tripKm: 0, hudMode: "mileage" });
        expect(farm.vehicles[0].hudMode).toBe("trip");
        expect(farm.totalKm).toBe(0);
        expect(page.useMiles).toBeUndefined();
    });

    test("empty Lua table becomes an empty list", () => {
        const out = normalizeCompanionPages({ pages: { vehicleMileage: { detected: true, byFarm: { "1": { vehicles: {} } } } } }, { modules });
        expect(out.pages.vehicleMileage.byFarm["1"].vehicles).toEqual([]);
    });
});
