"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "RealLandFinanceCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { KM_83258_Real_Land_Finances = true }
  _G.KM_83258_Real_Land_Finances = { g_ftrManager = { contracts = {
    [1] = { id = 1, type = "MORTGAGE", farmlandId = 36, farmId = 1, unit = "MONEY",
      balance = 90000, installment = 4000, arrearsCount = 1, monthsToNext = 2 },
    [2] = { id = 2, type = "LEASE", farmlandId = 9, farmId = 2, unit = "MONEY", rentPerYear = 1800 },
    [3] = { id = 3, type = "LET", farmlandId = 12, farmId = 2, tenantFarmId = 1,
      unit = "KG", fillTypeName = "SOYBEAN", rentPerYear = 5000 },
    [4] = { id = 4, type = "LET", farmlandId = 14, farmId = 1, tenantFarmId = 2,
      unit = "MONEY", rentPerYear = 1200 },
  } } }
`;

test("reads only this farm's purchase and lease roles with their original units", () => {
    const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
    expect(page).toMatchObject({ readState: "ok", coverage: "complete",
        byFarm: { "1": { contractCount: 3, purchaseCount: 1, rentOwedCount: 1, rentInCount: 1 } } });
    expect(page.rows).toEqual([
        expect.objectContaining({ id: 1, farmlandId: 36, kind: "MORTGAGE", role: "buyer",
            unit: "MONEY", balance: 90000, installment: 4000, arrearsCount: 1 }),
        expect.objectContaining({ id: 3, farmlandId: 12, kind: "LET", role: "tenant",
            unit: "KG", fillTypeName: "SOYBEAN", rentPerYear: 5000 }),
        expect.objectContaining({ id: 4, farmlandId: 14, kind: "LET", role: "landlord",
            unit: "MONEY", rentPerYear: 1200 }),
    ]);
    expect(normalizeCompanionPages({ pages: { realLandFinance: page } }, { modules: loadModules() })
        .pages.realLandFinance.rows).toHaveLength(3);
});

test("does not accept a shared shadow as the mod's contract register", () => {
    const shadow = `
      _G.g_modIsLoaded = { KM_83258_Real_Land_Finances = true }
      _G.g_ftrManager = { contracts = { [1] = { id = 1, farmlandId = 36, farmId = 1,
        type = "MORTGAGE", unit = "MONEY", balance = 123 } } }
    `;
    expect(runCompanionPage(FILE, shadow, { farmId: 1 })).toMatchObject({
        readState: "settings-only", reason: "no-contract-register",
    });
    expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
});
