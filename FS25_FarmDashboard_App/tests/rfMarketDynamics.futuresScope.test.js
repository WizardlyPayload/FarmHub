"use strict";

const path = require("path");
const { runCompanionLua, MOD_SRC } = require("./helpers/companion-page-lua.cjs");

const FILE = path.join(MOD_SRC, "collectors", "rf", "RfMarketDynamicsDataCollector.lua");
const SETUP = `
  _G.g_currentMission = {}
  _G.g_modIsLoaded = { FS25_MarketDynamics = true }
  local own = { farmId = 1, fillTypeName = "WHEAT", quantity = 2000,
    delivered = 500, status = "active" }
  local foreign = { farmId = 2, fillTypeName = "BARLEY", quantity = 3000,
    delivered = 0, status = "active" }
  _G.g_currentMission.MarketDynamics = {
    isActive = true, futuresMarket = { contracts = { [7] = own, [8] = foreign } }
  }
`;

test("exports only this farm's futures without mutating the mod's contracts", () => {
    const result = runCompanionLua([FILE], SETUP, `
      local data = RfMarketDynamicsDataCollector:collect()
      local contracts = g_currentMission.MarketDynamics.futuresMarket.contracts
      return __fdEncode({ data = data, ownId = tostring(contracts[7].id),
        foreignId = tostring(contracts[8].id) })
    `, { farmId: 1 });
    expect(result.data.futures).toEqual([expect.objectContaining({
        id: "7", label: "WHEAT", status: "active",
    })]);
    expect(result.ownId).toBe("nil");
    expect(result.foreignId).toBe("nil");
});

test("withholds futures when the active export farm is unresolved", () => {
    const result = runCompanionLua([FILE], `${SETUP}
      _G.FarmDashboardDataCollector = { _companionFarmScopeReady = false }
    `, `return __fdEncode(RfMarketDynamicsDataCollector:collect())`, { farmId: 1 });
    expect(result.futures).toEqual({});
});
