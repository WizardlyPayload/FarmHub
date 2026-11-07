"use strict";

const path = require("path");
const { runCompanionLua, MOD_SRC } = require("./helpers/companion-page-lua.cjs");

const FILE = path.join(MOD_SRC, "collectors", "rf", "RfTaxDataCollector.lua");

test("uses each farm's tax bucket instead of copying the local HUD mirror", () => {
    const result = runCompanionLua([FILE], `
      _G.g_currentMission = { environment = { currentPeriod = 6, currentYear = 2026 } }
      _G.g_farmManager = { getFarms = function(self) return {
        [1] = { farmId = 1 }, [2] = { farmId = 2 }, [3] = { farmId = 3 },
        [14] = { farmId = 14 }, [15] = { farmId = 15 }
      } end }
      _G.FS25TaxMod = {
        settings = { annualTaxRate = 0.05, taxRate = "medium" },
        _periodMonth = function(period) return period end,
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
    expect(result.byFarm["14"]).toBeUndefined();
    expect(result.byFarm["15"]).toBeUndefined();
});

test("withholds tax rows when only the unscoped HUD mirror exists", () => {
    const result = runCompanionLua([FILE], `
      _G.g_currentMission = { environment = { currentPeriod = 6, currentYear = 2026 } }
      _G.g_farmManager = { farms = { [1] = { farmId = 1 } } }
      _G.FS25TaxMod = {
        settings = { annualTaxRate = 0.05 },
        _periodMonth = function(period) return period end,
        stats = { taxesAccumulatedAnnual = 9999 }
      }
    `, `return __fdEncode(RfTaxDataCollector:collect())`, { farmId: 1 });
    expect(result.enabled).toBe(true);
    expect(result.byFarm).toEqual({});
});

test("uses Tax Mod's effective annual rate and floors eligible imported buckets separately", () => {
    const result = runCompanionLua([FILE], `
      _G.g_currentMission = {
        environment = { currentPeriod = 6, currentYear = 2026 },
        settingsHub = {}
      }
      _G.g_farmManager = { farms = { [1] = { farmId = 1 } } }
      _G.OptionScalingResolver = {
        readProfile = function(hub) return { economy = 1.5 } end,
        resolve = function(decl, profile) return profile.economy end
      }
      _G.FS25TaxMod = {
        settings = { enabled = true, annualTaxRate = 0.05 },
        SPINE_ANNUAL_TAX = { id = "tm_annualTaxRate", dial = "economy", base = 1 },
        _periodMonth = function(period) return period end,
        stats = {
          taxReturnMonth = 3,
          farmTax = {
            [1] = {
              taxesAccumulatedAnnual = 1003,
              lastTaxYear = 2026,
              imported = {
                { acc = 53, paidYear = 2025 },
                { acc = 999, paidYear = 2027 }
              }
            }
          }
        }
      }
    `, `return __fdEncode(RfTaxDataCollector:collect())`, { farmId: 1 });

    expect(result.byFarm["1"]).toEqual(expect.objectContaining({
        accumulatedAnnual: 1003,
        projectedBill: 78,
        taxRate: 7.5,
        nextEventLabel: "Tax advisory",
        nextEventDay: 6,
    }));
});

test("withholds the projected charge and event timing when the period has no month mapping", () => {
    const result = runCompanionLua([FILE], `
      _G.g_currentMission = { environment = { currentPeriod = 6, currentYear = 2026 } }
      _G.g_farmManager = { farms = { [1] = { farmId = 1 } } }
      _G.FS25TaxMod = {
        settings = { annualTaxRate = 0.05 },
        stats = { farmTax = { [1] = { taxesAccumulatedAnnual = 1000 } } }
      }
    `, `return __fdEncode(RfTaxDataCollector:collect())`, { farmId: 1 });
    expect(result.byFarm["1"].accumulatedAnnual).toBe(1000);
    expect(result.byFarm["1"].projectedBill).toBeUndefined();
    expect(result.byFarm["1"].nextEventLabel).toBeUndefined();
});
