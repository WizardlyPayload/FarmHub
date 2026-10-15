"use strict";

const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");
const mod = require("../companionPages/vehicleYears.js");

const modules = new Map([[mod.key, mod]]);

describe("vehicleYears merge", () => {
    test("module is auto-discovered by the lead merger", () => {
        expect(loadModules().get(mod.key)).toBeDefined();
    });

    test("rejects implausible years, sorts oldest first and orders decades", () => {
        const out = normalizeCompanionPages({
            pages: {
                vehicleYears: {
                    detected: true,
                    byFarm: {
                        "1": {
                            oldestYear: 12,
                            vehicles: [
                                { id: "new", year: 2021, decade: "2020s" },
                                { id: "bad", year: 99999, decade: "junk" },
                                { id: "old", year: 1968, decade: "1960s" },
                            ],
                            byDecade: [
                                { decade: "2020s", count: 1 },
                                { decade: "1960s", count: 1 },
                                { decade: "junk", count: 4 },
                                { decade: "1990s", count: 0 },
                            ],
                        },
                    },
                },
            },
        }, { modules });
        const farm = out.pages.vehicleYears.byFarm["1"];
        expect(farm.vehicles.map((v) => v.id)).toEqual(["old", "new", "bad"]);
        expect(farm.vehicles[2]).toMatchObject({ year: undefined, decade: undefined });
        expect(farm.byDecade.map((d) => d.decade)).toEqual(["1960s", "2020s"]);
        expect(farm.oldestYear).toBeUndefined();
    });

    test("missing lists become empty arrays", () => {
        const out = normalizeCompanionPages({ pages: { vehicleYears: { detected: true, byFarm: { "1": {} } } } }, { modules });
        expect(out.pages.vehicleYears.byFarm["1"]).toMatchObject({ vehicles: [], byDecade: [] });
    });
});
