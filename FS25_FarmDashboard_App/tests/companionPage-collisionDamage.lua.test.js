"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");

const FILE = "CollisionDamageCollector.lua";

const SETUP = `
    local function veh(owner, name, damage, mass)
        return {
            ownerFarmId = owner, uniqueId = "veh-" .. name, spec_motorized = {}, spec_wearable = {},
            mass = mass,
            getFullName = function() return name end,
            getDamageAmount = function() return damage end,
            setDamageAmount = function() error("write") end,
        }
    end
    local a, b, c, n = veh(1, "Tractor", 0.12, 6), veh(1, "Combine", 0.3, 16), veh(1, "Pickup", 0.0, 2), veh(2, "Neighbour", 0.5, 5)
    local states = setmetatable({}, { __mode = "k" })
    states[a] = { lastDamageTime = 400000 }
    states[b] = { lastDamageTime = -100000 }
    states[n] = { lastDamageTime = 590000 }
    local FSCD = {
        VERSION = "1.2.0.0", DAMAGE_MULTIPLIER = 1.5, damageMultiplierState = 7,
        MIN_DAMAGE = 0.01, MAX_DAMAGE = 0.045, HEAVY_MACHINE_MAX_DAMAGE = 0.07, DAMAGE_PER_KMH_DROP = 0.0012,
        MIN_SPEED_KMH = 10, MIN_SPEED_DROP_KMH = 10, HEAVY_MACHINE_MIN_MASS_T = 10, COUNTERPART_DAMAGE_ENABLED = true,
        vehicleStates = states,
        getDamageMultiplierState = function() error("write") end,
    }
    function FSCD:isHeavyMachine(v) return v.mass >= 10, v.mass end
    _G.g_modIsLoaded = { FS25_CollisionDamage = true }
    _G.FS25_CollisionDamage = { FSCollisionDamage = FSCD }
    _G.g_currentMission = { vehicleSystem = { vehicles = { a, b, c, n, { ownerFarmId = 1, uniqueId = "trailer" } } } }
`;

describe("Collision Damage page collector", () => {
    test("not detected without the mod", () => {
        expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
    });

    test("exports the multiplier and damage bands, and this session's hits per machine", () => {
        const page = runCompanionPage(FILE, SETUP, { farmId: 1, time: 600000 });
        expect(page.readState).toBe("ok");
        expect(page.sessionTracking).toBe(true);
        expect(page.settings).toMatchObject({
            multiplierPct: 150, multiplierState: 7, minDamagePct: 1, maxDamagePct: 4.5, heavyMaxDamagePct: 7,
            damagePerKmhDropPct: 0.12, minSpeedKmh: 10, heavyMassT: 10, counterpartDamage: true, version: "1.2.0.0",
        });
        const farm = page.byFarm["1"];
        expect(farm).toMatchObject({ machineCount: 3, heavyCount: 1, hitCount: 1, lastHitMinutesAgo: 3.33, averageDamagePct: 14 });
        expect(farm.machines[0]).toMatchObject({ name: "Tractor", hitThisSession: true, lastHitMinutesAgo: 3.33, damagePct: 12 });
        expect(farm.machines[1]).toMatchObject({ name: "Combine", heavy: true, massT: 16, hitThisSession: false });
        expect(JSON.stringify(page)).not.toContain("Neighbour");
    });

    test("detection-only when the mod table is missing", () => {
        const page = runCompanionPage(FILE, `_G.g_modIsLoaded = { FS25_CollisionDamage = true }`, { farmId: 1 });
        expect(page.readState).toBe("detection-only");
    });
});
