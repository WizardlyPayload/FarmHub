"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "CropContractsCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { ITCH_4385334_FS25_CropContracts = true }
  _G.ITCH_4385334_FS25_CropContracts = { CropContractsMod = { manager = { contracts = {
    { id = 3, farmId = 1, cropTitle = "Wheat", cropName = "WHEAT",
      stationName = "Grain Mill", status = "ACTIVE", targetLiters = 35239.0704,
      deliveredLiters = 5000, lockedPricePerLiter = 0.2, dueYear = 2, duePeriod = 7 },
    { id = 4, farmId = 2, cropTitle = "Secret", cropName = "BARLEY",
      stationName = "Other Farm", status = "ACTIVE", targetLiters = 99999,
      deliveredLiters = 0, lockedPricePerLiter = 1.5 },
  } } } }
`;

test("exports only the current farm's nonempty forward contract terms", () => {
    const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
    expect(page.readState).toBe("ok");
    expect(page.byFarm["1"]).toMatchObject({ activeCount: 1, completedCount: 0 });
    expect(page.rows).toEqual([expect.objectContaining({
        farmId: 1, id: 3, crop: "Wheat", station: "Grain Mill",
        targetLiters: 35239.0704, deliveredLiters: 5000, lockedPricePerLiter: 0.2,
    })]);
    expect(normalizeCompanionPages({ pages: { cropContracts: page } }, { modules: loadModules() })
        .pages.cropContracts.rows).toHaveLength(1);
});

test("does not read a shared-engine shadow or an unloaded mod", () => {
    const shadow = `
      _G.g_modIsLoaded = { ITCH_4385334_FS25_CropContracts = true }
      _G.CropContractsMod = { manager = { contracts = { { farmId = 1, targetLiters = 1000 } } } }
    `;
    expect(runCompanionPage(FILE, shadow, { farmId: 1 })).toMatchObject({
        readState: "settings-only", reason: "no-contract-register",
    });
    expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
});

test("reports an unreadable owned contract instead of a complete empty register", () => {
    const setup = `
      _G.g_modIsLoaded = { ITCH_4385334_FS25_CropContracts = true }
      _G.ITCH_4385334_FS25_CropContracts = { CropContractsMod = { manager = { contracts = {
        { id = 8, farmId = 1, status = "ACTIVE", targetLiters = 1000 },
        { id = 9, farmId = 2, status = "ACTIVE", targetLiters = 1000 },
      } } } }
    `;
    const page = runCompanionPage(FILE, setup, { farmId: 1 });
    expect(page).toMatchObject({ readState: "partial", coverage: "partial" });
    expect(Object.keys(page.rows)).toHaveLength(0);
    expect(page.byFarm["1"]).toMatchObject({ activeCount: 0 });
});

test("bounds the register scan and reports truncation", () => {
    const setup = `
      _G.g_modIsLoaded = { ITCH_4385334_FS25_CropContracts = true }
      local contracts = {}
      for i = 1, 301 do
        contracts[i] = { id = i, farmId = 2, status = "ACTIVE", targetLiters = 1000, deliveredLiters = 0 }
      end
      _G.ITCH_4385334_FS25_CropContracts = { CropContractsMod = { manager = { contracts = contracts } } }
    `;
    const page = runCompanionPage(FILE, setup, { farmId: 1 });
    expect(page).toMatchObject({ readState: "ok", coverage: "truncated" });
    expect(Object.keys(page.rows)).toHaveLength(0);
});
