"use strict";

const path = require("path");
const fs = require("fs");
const { lauxlib, lualib, lua, to_luastring } = require("fengari");
const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");

const FILE = "FieldLeasingCollector.lua";

// Mirrors FieldLeasingManager / FieldLeaseAgreement from Field Leasing 1.0.0.1. Agreements carry a
// metatable in game (Class/Object); the collector must only copy plain fields.
const MOD_ENV = `
    _G.g_modIsLoaded = { FS25_FieldLeasing = true }
    _G.g_modManager = { getActiveMods = function() return { { modName = "FS25_FieldLeasing", version = "1.0.0.1" } } end }
    local lands = {
        [12] = { id = 12, name = "12", areaInHa = 4.5, price = 120000 },
        [30] = { id = 30, name = "North Hill", areaInHa = 2.25, price = 66000 },
        [40] = { id = 40, name = "40", areaInHa = 9, price = 1 },
    }
    _G.g_farmlandManager = { getFarmlandById = function(self, id) return lands[id] end }
    local farm1 = { stats = {
        finances = { statisticFieldLease = -150 },
        financesHistory = { { statisticFieldLease = 0 }, { statisticFieldLease = -100 }, { statisticFieldLease = -150 } },
    } }
    _G.g_farmManager = { getFarmById = function(self, id) if id == 1 then return farm1 end end }
    local objMt = { __index = { register = function() error("write") end, delete = function() error("write") end } }
    _G.FS25_FieldLeasing = {
        g_fieldLeasingManager = {
            priceMultiplier = 1.5,
            minDuration = 6,
            fieldLeaseAgreements = {
                [30] = setmetatable({ farmlandId = 30, farmId = 1, price = 60000, duration = 2 }, objMt),
                [12] = setmetatable({ farmlandId = 12, farmId = 1, price = 120000, duration = 8 }, objMt),
                [40] = setmetatable({ farmlandId = 40, farmId = 2, price = 90000, duration = 1 }, objMt),
            },
            lease = function() error("write") end,
            terminateLease = function() error("write") end,
        },
    }
`;

describe("Field Leasing page collector", () => {
    test("not detected without the mod", () => {
        expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
    });

    test("exports settings, this farm's leases and the mod's own per-period charge", () => {
        const page = runCompanionPage(FILE, MOD_ENV, { farmId: 1 });
        expect(page.readState).toBe("ok");
        expect(page.version).toBe("1.0.0.1");
        expect(page.settings).toEqual({ priceMultiplierPercent: 1.5, minDurationPeriods: 6 });
        expect(page.otherFarmLeases).toBeUndefined();
        expect(page.coverage).toBe("complete");
        expect(page.leases.map((l) => l.farmlandId)).toEqual([12, 30]);
        // price * (1.5 / 100) / 12
        expect(page.leases[0]).toMatchObject({
            farmId: 1, farmlandId: 12, areaHa: 4.5, currentLandPrice: 120000, signedPrice: 120000,
            periodsPaid: 8, monthlyCost: 150, canEnd: true, periodsUntilEnd: 0,
        });
        expect(page.leases[1]).toMatchObject({ name: "North Hill", monthlyCost: 75, canEnd: false, periodsUntilEnd: 4 });
        expect(page.byFarm["1"]).toMatchObject({
            leaseCount: 2, totalAreaHa: 6.75, monthlyCost: 225, yearlyCost: 2700, canEndCount: 1,
            finance: { today: -150, recentDays: [0, -100, -150] },
        });
    });

    test("partial when the price factor is unreadable; costs left empty", () => {
        const page = runCompanionPage(FILE, `${MOD_ENV}
            _G.FS25_FieldLeasing.g_fieldLeasingManager.priceMultiplier = nil
        `, { farmId: 1 });
        expect(page.readState).toBe("partial");
        expect(page.leases[0].monthlyCost).toBeUndefined();
        expect(page.byFarm["1"].monthlyCost).toBeUndefined();
    });

    test("settings-only without a farm", () => {
        const page = runCompanionPage(FILE, `${MOD_ENV}
            _G.g_currentMission = { getFarmId = function() return 0 end }
        `);
        expect(page.readState).toBe("settings-only");
        expect(page.settings.minDurationPeriods).toBe(6);
        expect(page.leases).toBeUndefined();
    });

    test("collector parses as Lua", () => {
        const src = fs.readFileSync(path.join(__dirname, "../../FS25_FarmDashboard_Mod/src/companionPages", FILE), "utf8");
        const L = lauxlib.luaL_newstate();
        lualib.luaL_openlibs(L);
        expect(lauxlib.luaL_loadstring(L, to_luastring(src))).toBe(lua.LUA_OK);
    });
});
