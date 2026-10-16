"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");

const FILE = "RealSiloCollector.lua";

const MOD_ENV = `
    _G.g_modIsLoaded = { FS25_RealSilo = true }
    _G.g_modManager = { getActiveMods = function() return { { modName = "FS25_RealSilo", version = "1.1.0.2" } } end }
    _G.g_fillTypeManager = {
        names = { [1] = "WHEAT", [2] = "BARLEY" },
        getFillTypeNameByIndex = function(self, i) return self.names[i] end,
        getFillTypeByIndex = function(self, i) return self.names[i] and { name = self.names[i], title = self.names[i] .. " T" } or nil end,
    }
    local farmSilo = { ownerFarmId = 1, getName = function() return "Grain Silo" end,
        spec_silo = { storages = { { capacity = 200000 } } } }
    local otherSilo = { ownerFarmId = 2, spec_silo = { storages = { { capacity = 1 } } } }
    _G.FS25_RealSilo = {
        realSiloManager = {
            DEFAULT_COMPARTMENTS = 4, DEFAULT_CAPACITY = 50000,
            silos = {
                rs_1 = { uniqueId = "rs_1", placeable = farmSilo, config = { numCompartments = 3, capacityPerCompartment = 50000, isConfigured = true } },
                rs_2 = { uniqueId = "rs_2", placeable = otherSilo, config = { numCompartments = 2, capacityPerCompartment = 1000 } },
            },
            siloNames = { rs_1 = "North" },
            transfers = { rs_1 = { fromSlot = 1, toSlot = 3, rate = 1000, active = true } },
            dryingTransfers = {},
            applyConfig = function() error("write") end,
            startTransfer = function() error("write") end,
        },
        RealSiloCompartmentStorage = {
            siloSlots = {
                rs_1 = { activeSlot = 2, slots = {
                    { index = 1, fillType = 1, fillLevel = 30000, capacity = 50000, isActive = false, moisture = 0.14, quality = 0.9 },
                    { index = 2, fillType = 2, fillLevel = 12000, capacity = 50000, isActive = true },
                    { index = 3, fillType = 0, fillLevel = 0, capacity = 50000, isActive = false },
                    { index = 4, fillType = 1, fillLevel = 5000, capacity = 10000, isExtension = true },
                } },
                rs_2 = { activeSlot = 1, slots = { { index = 1, fillType = 1, fillLevel = 999, capacity = 1000 } } },
            },
            moveBetweenSlots = function() error("write") end,
            getEffectiveMoistureInfo = function() error("write") end,
        },
    }
`;

describe("RealSilo page collector", () => {
    test("not detected without the mod", () => {
        expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
    });

    test("exports the farm's silos with compartments, transfers and fill-type totals", () => {
        const page = runCompanionPage(FILE, MOD_ENV, { farmId: 1 });
        expect(page.readState).toBe("ok");
        expect(page.version).toBe("1.1.0.2");
        expect(page.defaults).toEqual({ compartments: 4, capacityPerCompartment: 50000 });
        expect(page.registeredSilos).toBe(2);
        expect(page.otherFarmSilos).toBe(1);
        const farm = page.byFarm["1"];
        expect(farm).toMatchObject({
            siloCount: 1,
            compartments: 4,
            usedCompartments: 3,
            extensionCompartments: 1,
            totalFill: 47000,
            totalCapacity: 160000,
            activeTransfers: 1,
            unconfigured: 0,
        });
        expect(farm.byFillType[0]).toEqual({ fillType: "WHEAT", title: "WHEAT T", liters: 35000, compartments: 2 });
        expect(page.silos).toHaveLength(1);
        const silo = page.silos[0];
        expect(silo).toMatchObject({
            farmId: 1,
            id: "rs_1",
            name: "North",
            placeableName: "Grain Silo",
            configured: true,
            compartments: 3,
            storageCapacity: 200000,
            activeSlot: 2,
            transfer: { fromSlot: 1, toSlot: 3, rate: 1000 },
        });
        expect(silo.slots[0]).toMatchObject({ index: 1, fillType: "WHEAT", fillLevel: 30000, moisture: 0.14, quality: 0.9 });
        expect(silo.slots[1]).toMatchObject({ fillType: "BARLEY", isActive: true });
        expect(silo.slots[2].fillType).toBeUndefined();
        expect(silo.slots[3].isExtension).toBe(true);
    });

    test("partial when the compartment storage table is missing", () => {
        const page = runCompanionPage(FILE, `${MOD_ENV}
            _G.FS25_RealSilo.RealSiloCompartmentStorage = nil
        `, { farmId: 1 });
        expect(page.readState).toBe("partial");
        // Empty Lua table: {} on the wire; companionPages/realSilo.js coerces it to [].
        expect(Object.keys(page.silos[0].slots)).toHaveLength(0);
    });

    test("settings-only without a farm", () => {
        const page = runCompanionPage(FILE, `${MOD_ENV}
            _G.g_currentMission = { getFarmId = function() return 0 end }
        `);
        expect(page.readState).toBe("settings-only");
        expect(page.defaults.capacityPerCompartment).toBe(50000);
    });
});
