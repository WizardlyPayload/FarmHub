"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");

const FILE = "PalletDegradationCollector.lua";

const MOD_ENV = `
    local PalletData = {
        GlobalMultiplier = 1.5, RecoveryRate = 0.005, BaseTempRate = 0.015, BasePermRate = 0.001,
        ValidFillTypes = {
            STRAWBERRY = { 1.5, 2.0, disabledByWhitelist = false },
            WHEAT = { 0.2, 1.5, disabledByWhitelist = false },
            STONE = { 0.0, 0.0, disabledByWhitelist = false },
            BREAD = { 1.5, 1.5, disabledByWhitelist = true },
        },
    }
    function PalletData:getMultipliers(name)
        local e = self.ValidFillTypes[tostring(name):upper()]
        if not e or e.disabledByWhitelist then return 0.0, 0.0 end
        return e[1] or 0, e[2] or 0
    end
    function PalletData:isWhitelisted(name)
        local e = self.ValidFillTypes[tostring(name):upper()]
        if not e or e.disabledByWhitelist then return false end
        local d, w = self:getMultipliers(name)
        return d > 0.001 or w > 0.001
    end
    local function pallet(owner, level) return {
        ownerFarmId = owner,
        getFillUnitFillLevel = function(self, i) return level end,
        raiseDirtyFlags = function() error("write") end,
    } end
    local p1, p2, p3, p4 = pallet(1, 800), pallet(1, 500), pallet(2, 999), pallet(1, 100)
    _G.FS25_StorageOverhaulPalletDegradation = {
        PalletData = PalletData,
        PalletPriceModifier = {
            PRISTINE_BONUS = 0.05, PRISTINE_THRESHOLD = 0.05, MAX_TEMP_PENALTY = 0.4, MAX_PERM_PENALTY = 0.5, SALVAGE_FLOOR = 0.1,
            update = function() error("write") end,
        },
        PalletMetadata = {
            records = {
                a = { runtimeNode = 11, isOutside = true, tempDamage = 0.5, permDamage = 0.4 },
                b = { runtimeNode = 12, isOutside = false, tempDamage = 0.01, permDamage = 0.0 },
                c = { runtimeNode = 13, isOutside = true, tempDamage = 0.9, permDamage = 0.9 },
                d = { runtimeNode = 14, isOutside = false, tempDamage = 0.0, permDamage = 0.0 },
            },
            applyTick = function() error("write") end,
            registerOrUpdate = function() error("write") end,
            syncToEntity = function() error("write") end,
        },
        PalletDegradationManager = {
            cachedPallets = {
                { node = 11, object = p1, id = "a", fillType = "STRAWBERRY" },
                { node = 12, object = p2, id = "b", fillType = "WHEAT" },
                { node = 13, object = p3, id = "c", fillType = "STRAWBERRY" },
                { node = 14, object = p4, id = "d", fillType = "STONE" },
            },
            refreshCacheAndSniff = function() error("write") end,
        },
    }
    _G.g_modIsLoaded = { FS25_StorageOverhaulPalletDegradation = true }
`;

describe("Pallet Degradation page collector", () => {
    test("detects the StorageOverhaulPalletDegradation zip name", () => {
        const page = runCompanionPage(FILE, MOD_ENV, { farmId: 1 });
        expect(page.detected).toBe(true);
        expect(page.modName).toBe("FS25_StorageOverhaulPalletDegradation");
    });

    test("not detected without the mod", () => {
        expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
    });

    test("exports settings, catalog counts and the farm's pallets worst-first", () => {
        const page = runCompanionPage(FILE, MOD_ENV, { farmId: 1 });
        expect(page.readState).toBe("ok");
        expect(page.source).toBe("palletCache");
        expect(page.settings).toMatchObject({
            globalMultiplier: 1.5,
            recoveryRate: 0.005,
            pristineBonus: 0.05,
            maxPermPenalty: 0.5,
            salvageFloor: 0.1,
        });
        expect(page.fillTypeCatalog).toEqual({ tracked: 2, muted: 1, disabledByWhitelist: 1 });
        const farm = page.byFarm["1"];
        expect(farm.palletCount).toBe(3);
        expect(farm.trackedCount).toBe(2);
        expect(farm.outsideCount).toBe(1);
        expect(farm.belowEighty).toBe(1);
        expect(farm.pallets.map((p) => p.id)).toEqual(["a", "b", "d"]);
        const worst = farm.pallets[0];
        expect(worst).toMatchObject({ fillType: "STRAWBERRY", fillLevel: 800, condition: 60, wear: 50, outside: true, tracked: true });
        // PalletPriceModifier: min(1 - 0.1, 0.5 * 0.4 + 0.4 * 0.5) = 0.4 penalty
        expect(worst.saleAdjust).toBeCloseTo(-0.4);
        // 0.01 + 0 < 0.05 threshold -> pristine bonus
        expect(farm.pallets[1].saleAdjust).toBeCloseTo(0.05);
        // STONE has zero rates: not tracked, no sale adjustment
        expect(farm.pallets[2].tracked).toBe(false);
        expect(farm.pallets[2].saleAdjust).toBeUndefined();
        expect(farm.pristineCount).toBe(1);
        expect(farm.penaltyCount).toBe(1);
        expect(farm.byFillType.find((row) => row.fillType === "STRAWBERRY")).toMatchObject({ count: 1, outside: 1, avgCondition: 60 });
    });

    test("falls back to records via nodeToObject when the pallet cache is empty", () => {
        const page = runCompanionPage(FILE, `${MOD_ENV}
            _G.FS25_StorageOverhaulPalletDegradation.PalletDegradationManager.cachedPallets = {}
            _G.FS25_StorageOverhaulPalletDegradation.PalletDegradationManager.getFillTypeName = function(self, obj) return "WHEAT" end
            _G.g_currentMission = { getFarmId = function() return 1 end, nodeToObject = {
                [11] = { ownerFarmId = 1, getFillUnitFillLevel = function() return 10 end },
                [13] = { ownerFarmId = 2 },
            } }
        `, { farmId: 1 });
        expect(page.source).toBe("records");
        expect(page.byFarm["1"].palletCount).toBe(1);
        expect(page.byFarm["1"].pallets[0]).toMatchObject({ id: "a", fillType: "WHEAT", condition: 60 });
    });

    test("settings-only when records are missing", () => {
        const page = runCompanionPage(FILE, `${MOD_ENV}
            _G.FS25_StorageOverhaulPalletDegradation.PalletMetadata = nil
        `, { farmId: 1 });
        expect(page.readState).toBe("settings-only");
        expect(page.settings.baseTempRate).toBe(0.015);
        expect(page.byFarm).toBeUndefined();
    });
});
