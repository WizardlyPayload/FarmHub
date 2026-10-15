"use strict";

const { runCompanionPage, runCompanionPagesCycle } = require("./helpers/companion-page-lua.cjs");

const FILE = "RealisticDieselPriceCollector.lua";

function setup(extra = "", price = 1.96) {
    return `
        _G.g_modIsLoaded = { FS25_RealisticDieselPrice = true }
        _G.g_fillTypeManager = { getFillTypeByName = function(_, n) if n == "DIESEL" then return { pricePerLiter = ${price} } end end }
        _G.g_currentMission = {}
        _G.FS25_RealisticDieselPrice = {
            RealisticDieselPrice = {
                regions = {
                    { name = "Europe", countries = { { label = "Germany", price = 1.90 }, { label = "United Kingdom", price = 1.96 } } },
                    { name = "Asia", countries = { { label = "Japan", price = 0.86 } } },
                },
                currentRegion = 1, currentCountry = 2, customMode = false, customPrice = 1.5, menuInstalled = true,
            },
        }
        ${extra}
    `;
}

describe("companion page: Realistic Diesel Price (Lua)", () => {
    test("not detected -> no page", () => {
        expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", {})).toBeUndefined();
    });

    test("selected preset, all presets and game price in sync", () => {
        const page = runCompanionPage(FILE, setup());
        expect(page).toMatchObject({
            readState: "ok", customMode: false, region: "Europe", country: "United Kingdom",
            presetPrice: 1.96, targetPrice: 1.96, gamePrice: 1.96, inSync: true, settingsMenuInstalled: true,
        });
        expect(page.regions).toHaveLength(2);
        expect(page.regions[0].countries[1]).toEqual({ label: "United Kingdom", price: 1.96, selected: true });
        expect(page.regions[1]).toMatchObject({ name: "Asia", selected: false });
        expect(page.otherDieselMod).toBeUndefined();
    });

    test("custom mode targets the custom price; a different game price is flagged", () => {
        const page = runCompanionPage(FILE, setup("FS25_RealisticDieselPrice.RealisticDieselPrice.customMode = true", 1.31));
        expect(page).toMatchObject({ customMode: true, targetPrice: 1.5, gamePrice: 1.31, inSync: false });
    });

    test("Fluctuating Diesel Price loaded alongside is reported", () => {
        const payload = runCompanionPagesCycle([FILE, "FluctuatingDieselPriceCollector.lua"], setup(`
            _G.g_modIsLoaded.FS25_FluctuatingDieselPrice = true
        `));
        expect(payload.pages.realisticDieselPrice.otherDieselMod).toBe("fluctuatingDieselPrice");
        expect(payload.pages.fluctuatingDieselPrice.otherDieselMod).toBe("realisticDieselPrice");
    });

    test("mod table missing -> detection-only with the game price", () => {
        const page = runCompanionPage(FILE, setup("FS25_RealisticDieselPrice.RealisticDieselPrice = nil"));
        expect(page).toMatchObject({ readState: "detection-only", gamePrice: 1.96 });
    });
});
