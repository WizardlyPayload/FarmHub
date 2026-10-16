"use strict";

const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");
const mod = require("../companionPages/restrictedPeriods.js");

const modules = new Map([[mod.key, mod]]);

describe("restrictedPeriods merge", () => {
    test("module is auto-discovered by the lead merger", () => {
        expect(loadModules().get(mod.key)).toBeDefined();
        expect(loadModules().get(mod.key).arrays).toEqual(mod.arrays);
    });

    test("normalises reasons, drops other-farm and unknown-category vehicles", () => {
        const out = normalizeCompanionPages({
            pages: {
                restrictedPeriods: {
                    detected: true,
                    readState: "ok",
                    currentPeriod: 12,
                    liquidBan: "frost",
                    solidBan: "",
                    anyActive: false,
                    byFarm: { "1": { blockedVehicles: 1 } },
                    vehicles: [
                        { farmId: 1, name: "Tanker", category: "liquid", blocked: 1, reason: "frost" },
                        { farmId: 1, name: "Odd", category: "grain" },
                        { farmId: 2, name: "Neighbour", category: "solid" },
                    ],
                },
            },
        }, { modules });
        const page = out.pages.restrictedPeriods;
        expect(page.liquidBan).toBe("frost");
        expect(page.solidBan).toBeUndefined();
        expect(page.anyActive).toBe(true);
        expect(page.vehicles).toEqual([{ farmId: 1, name: "Tanker", category: "liquid", blocked: false, reason: "frost" }]);
    });

    test("empty Lua tables and missing period", () => {
        const out = normalizeCompanionPages({
            pages: { restrictedPeriods: { detected: true, readState: "settings-only", currentPeriod: 13, vehicles: {} } },
        }, { modules });
        const page = out.pages.restrictedPeriods;
        expect(page.vehicles).toEqual([]);
        expect(page.currentPeriod).toBeUndefined();
        expect(page.anyActive).toBeUndefined();
    });
});
