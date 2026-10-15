"use strict";

const { runCompanionLua, runCompanionPage } = require("./helpers/companion-page-lua.cjs");

const FILE = "FluctuatingDieselPriceCollector.lua";

const SETUP = `
    _G.g_modIsLoaded = { FS25_FluctuatingDieselPrice = true }
    _G.__price = 1.62
    _G.g_fillTypeManager = { getFillTypeByName = function(_, n) if n == "DIESEL" then return { pricePerLiter = _G.__price } end end }
    _G.g_currentMission = { missionInfo = { economicDifficulty = 2 }, environment = { currentHour = 13, currentMonotonicDay = 40 } }
    _G.FS25_FluctuatingDieselPrice = { randomDieselPrice = {} }
`;

describe("companion page: Fluctuating Diesel Price (Lua)", () => {
    test("not detected -> no page", () => {
        expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", {})).toBeUndefined();
    });

    test("live price, difficulty band, next change and first observation", () => {
        const page = runCompanionPage(FILE, SETUP);
        expect(page).toMatchObject({
            readState: "ok", modActive: true, price: 1.62, difficulty: 2, bandMin: 1.25, bandMax: 1.75,
            bandPosition: 0.74, outsideBand: false, currentHour: 13, nextChangeHour: 18, hoursUntilChange: 5,
        });
        expect(page.observed).toEqual({ count: 1, low: 1.62, high: 1.62, average: 1.62, samples: [{ day: 40, hour: 12, price: 1.62 }] });
    });

    test("observed history keeps one sample per 6-hour slot and is capped", () => {
        const out = runCompanionLua([FILE], SETUP, `
            local entry = CompanionPages.entries.fluctuatingDieselPrice
            local env = g_currentMission.environment
            local page
            for i = 0, 40 do
                env.currentMonotonicDay = 40 + math.floor(i / 4)
                env.currentHour = (i % 4) * 6 + 1
                _G.__price = 1.3 + (i % 5) * 0.1
                page = CompanionPages.collectEntry(entry, i)
                page = CompanionPages.collectEntry(entry, i)
            end
            return __fdEncode(page.observed)
        `);
        expect(out.count).toBe(28);
        expect(out.samples[27]).toEqual({ day: 50, hour: 0, price: 1.3 });
        expect(out.low).toBe(1.3);
        expect(out.high).toBe(1.7);
    });

    test("price outside the difficulty band is flagged; midnight rolls over to 00:00", () => {
        const page = runCompanionPage(FILE, `${SETUP}
            _G.__price = 1.96
            g_currentMission.environment.currentHour = 20
        `);
        expect(page).toMatchObject({ outsideBand: true, nextChangeHour: 0, hoursUntilChange: 4 });
    });
});
