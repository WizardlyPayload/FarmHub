"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "ImplementUsageCounterCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { FS25_310419_Implement_Usage_Counter = true }
  _G.g_currentMission = { getFarmId = function() return 1 end,
    vehicleSystem = { vehicles = {
      { ownerFarmId = 1, uniqueId = "cult-1", getFullName = function() return "Cultivator A" end,
        spec_cultivator = { usageCounter = 3.255, sessionCounter = 1.25 } },
      { ownerFarmId = 1, uniqueId = "wrap-1", getFullName = function() return "Wrapper B" end,
        ["spec_FS25_310419_Implement_Usage_Counter.baleWrapCounter"] = { lifetimeCounter = 4, sessionCounter = 2 } },
      { ownerFarmId = 1, uniqueId = "small-1", getFullName = function() return "Cutter C" end,
        spec_cutter = { usageCounter = 0.004, sessionCounter = 0.004 } },
      { ownerFarmId = 2, uniqueId = "other", spec_cultivator = { usageCounter = 100, sessionCounter = 100 } },
      { ownerFarmId = 1, uniqueId = "native-only", spec_mower = {} },
    } } }
`;

test("separates worked hectares from bale counts on only currently owned implements", () => {
    const page = runCompanionPage(FILE, GAME, { farmId: 1 });
    expect(page.readState).toBe("ok");
    expect(page.byFarm["1"]).toMatchObject({ vehicleCount: 3, areaCounterCount: 2, baleCounterCount: 1, nonzeroCount: 3 });
    expect(page.rows).toEqual(expect.arrayContaining([
        expect.objectContaining({ vehicleId: "cult-1", activity: "cultivator", unit: "ha", lifetime: 3.26, session: 1.25 }),
        expect.objectContaining({ vehicleId: "wrap-1", activity: "baleWrap", unit: "bales", lifetime: 4, session: 2 }),
        expect.objectContaining({ vehicleId: "small-1", activity: "cutter", unit: "ha", lifetime: 0.004, session: 0.004 }),
    ]));
    expect(page.rows.some((row) => row.vehicleId === "other" || row.vehicleId === "native-only")).toBe(false);
    const merged = normalizeCompanionPages({ pages: { implementUsageCounter: page } }, { modules: loadModules() });
    expect(merged.pages.implementUsageCounter.rows).toHaveLength(3);
});

test("an unloaded counter mod cannot turn native implement specs into a page", () => {
    expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
});
