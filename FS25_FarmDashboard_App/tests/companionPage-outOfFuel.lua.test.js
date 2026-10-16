"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");

const FILE = "OutOfFuelCollector.lua";

const SETUP = `
    local function motorized(owner, name, consumers)
        local levels = {}
        local spec = { consumersByFillTypeName = {} }
        for i, c in ipairs(consumers) do
            spec.consumersByFillTypeName[c.name] = { fillUnitIndex = i, fillType = c.index }
            levels[i] = { c.level, c.capacity }
        end
        return {
            ownerFarmId = owner,
            uniqueId = "veh-" .. name,
            spec_motorized = spec,
            getFullName = function() return name end,
            getFillUnitFillLevel = function(self, i) return levels[i][1] end,
            getFillUnitCapacity = function(self, i) return levels[i][2] end,
            addFillUnitFillLevel = function() error("write") end,
        }
    end
    _G.g_modIsLoaded = { FS25_OutOfFuel = true }
    _G.FS25_OutOfFuel = { OutOfFuel = { patched = true, keepVanillaRefill = false, verbose = false } }
    _G.g_currentMission = {
        economyManager = { getCostPerLiter = function(self, fillType) return fillType == 1 and 1.5 or 0.8 end },
        vehicleSystem = { vehicles = {
            motorized(1, "Tractor A", { { name = "DIESEL", index = 1, level = 20, capacity = 400 }, { name = "DEF", index = 2, level = 30, capacity = 40 } }),
            motorized(1, "Tractor B", { { name = "DIESEL", index = 1, level = 0, capacity = 300 } }),
            motorized(1, "Truck C", { { name = "DIESEL", index = 1, level = 250, capacity = 500 } }),
            motorized(2, "Other farm", { { name = "DIESEL", index = 1, level = 0, capacity = 500 } }),
            { ownerFarmId = 1, uniqueId = "trailer" },
        } },
    }
`;

describe("Out Of Fuel page collector", () => {
    test("not detected without the mod", () => {
        expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
    });

    test("exports the patch flags and the farm's fuel against the vanilla 10% floor", () => {
        const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
        expect(page.detected).toBe(true);
        expect(page.readState).toBe("ok");
        expect(page.settings).toEqual({ patched: true, keepVanillaRefill: false, verbose: false });
        expect(page.floorPct).toBe(10);
        const farm = page.byFarm["1"];
        expect(farm.motorizedCount).toBe(3);
        expect(farm.emptyCount).toBe(1);
        expect(farm.belowFloorCount).toBe(2);
        expect(farm.vehicles.map((v) => v.name)).toEqual(["Tractor B", "Tractor A", "Truck C"]);
        const b = farm.vehicles[0];
        expect(b).toMatchObject({ empty: true, belowFloor: true, lowestPct: 0, topUpLitres: 30, topUpCost: 90 });
        const a = farm.vehicles[1];
        expect(a.topUpLitres).toBe(20);
        expect(a.topUpCost).toBe(60);
        expect(a.fuels.find((f) => f.fillType === "DEF")).toMatchObject({ pct: 75 });
        expect(farm.topUpLitres).toBe(50);
        expect(farm.topUpCost).toBe(150);
        expect(JSON.stringify(page)).not.toContain("Other farm");
    });

    test("no farm gives a settings-only reading", () => {
        const page = runCompanionPage(FILE, SETUP.replace("_G.g_currentMission = {", "_G.g_currentMission = { getFarmId = function() return 0 end,"), {});
        expect(page.readState).toBe("settings-only");
        expect(page.reason).toBe("no-farm");
        expect(page.byFarm).toBeUndefined();
    });
});
