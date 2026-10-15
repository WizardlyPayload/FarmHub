"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");

const FILE = "ImperialSystemCollector.lua";

const MOD = (settings) => `
    local mgrMt = { __index = { save = function() error("write") end } }
    local settings = ${settings}
    if settings then setmetatable(settings, mgrMt) end
    _G.g_modIsLoaded = { FS25_ImperialSystem = true }
    _G.FS25_ImperialSystem = { UnitConversionMod = {
        LITERS_PER_GALLON = 3.78541, LITERS_PER_BUSHEL = 35.2391, KG_PER_POUND = 0.453592, METERS_PER_FOOT = 0.3048,
        LBS_PER_US_TON = 2000, KG_PER_US_TON = 907.185, DEFAULT_BULK_DENSITY = 0.6,
        BUSHEL_CROPS = { WHEAT = true, MAIZE = true, BARLEY = true },
        BULK_DENSITY = { POTATO = 0.67, SILAGE = 0.65 },
        settings = settings,
    } }
    _G.g_gameSettings = { getValue = function(self, n) if n == "useAcre" then return true end end }
`;

describe("Imperial System page collector", () => {
    test("not detected without the mod", () => {
        expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
    });

    test("exports the five unit choices, factors and bushel crops", () => {
        const page = runCompanionPage(
            FILE,
            MOD("{ liquidUnit = 1, cropsUnit = 1, weightUnit = 0, measureUnit = 1, weightScale = 2 }"),
            { farmId: 1 },
        );
        expect(page.readState).toBe("ok");
        expect(page.settings).toEqual({ liquid: "gallons", crops: "imperial", weight: "metric", measure: "imperial", weightScale: "tons" });
        expect(page.factors).toMatchObject({ litersPerGallon: 3.78541, litersPerBushel: 35.2391, kgPerUsTon: 907.185 });
        expect(page.bushelCrops).toEqual(["BARLEY", "MAIZE", "WHEAT"]);
        expect(page.bulkDensityCount).toBe(2);
        expect(page.gameUnits).toEqual({ useAcre: true });
    });

    test("before the settings manager exists the page is partial", () => {
        const page = runCompanionPage(FILE, MOD("nil"), { farmId: 1 });
        expect(page.readState).toBe("partial");
        expect(page.reason).toBe("settings-not-created");
        expect(page.settings).toBeUndefined();
        expect(page.factors.litersPerGallon).toBe(3.78541);
    });
});
