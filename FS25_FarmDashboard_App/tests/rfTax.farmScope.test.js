"use strict";

const path = require("path");
const { runCompanionLua, MOD_SRC } = require("./helpers/companion-page-lua.cjs");

const FILE = path.join(MOD_SRC, "collectors", "rf", "RfTaxDataCollector.lua");

test("uses each farm's tax bucket instead of copying the local HUD mirror", () => {
    const result = runCompanionLua([FILE], `
      _G.g_currentMission = { environment = { currentMonth = 6 } }
      _G.g_farmManager = { farms = {
        [1] = { farmId = 1 }, [2] = { farmId = 2 }, [3] = { farmId = 3 }
      } }
      _G.FS25TaxMod = {
        settings = { annualTaxRate = 0.05, taxRate = "medium" },
        stats = {
          taxesAccumulatedAnnual = 9999,
          farmTax = {
            [1] = { taxesAccumulatedAnnual = 1000 },
            [2] = { taxesAccumulatedAnnual = 3000 }
          }
        }
      }
    `, `return __fdEncode(RfTaxDataCollector:collect())`, { farmId: 1 });

    expect(result.enabled).toBe(true);
    expect(result.byFarm["1"]).toEqual(expect.objectContaining({
        accumulatedAnnual: 1000, projectedBill: 50,
    }));
    expect(result.byFarm["2"]).toEqual(expect.objectContaining({
        accumulatedAnnual: 3000, projectedBill: 150,
    }));
    expect(result.byFarm["3"]).toBeUndefined();
});

test("withholds tax rows when only the unscoped HUD mirror exists", () => {
    const result = runCompanionLua([FILE], `
      _G.g_currentMission = { environment = { currentMonth = 6 } }
      _G.g_farmManager = { farms = { [1] = { farmId = 1 } } }
      _G.FS25TaxMod = {
        settings = { annualTaxRate = 0.05 },
        stats = { taxesAccumulatedAnnual = 9999 }
      }
    `, `return __fdEncode(RfTaxDataCollector:collect())`, { farmId: 1 });
    expect(result.enabled).toBe(true);
    expect(result.byFarm).toEqual({});
});
