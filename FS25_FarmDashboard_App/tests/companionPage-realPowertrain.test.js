"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "RealPowertrainCollector.lua";
const GAME = `
  local modName = "KM_83605_Real_Power_Train"
  local key = "spec_" .. modName .. ".realPowertrain"
  _G.g_modIsLoaded = { [modName] = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = modName, version = "1.0.0.0" }
  } end }
  _G[modName] = { RealPowertrain = { SPEC_KEY = key } }
  local function vehicle(id, owner)
    return { uniqueId = id, ownerFarmId = owner,
      getFullName = function(self) return self.uniqueId end }
  end
  local owned = vehicle("owned-tractor", 1)
  owned[key] = { cvt = true, profileId = "cvx", profile = { ranges = { 1, 2, 3 } },
    state = { range = 2, strategy = 2, ramp = 3, limitStep = 4,
      handThrottle = 1400, maxRpm = 2200 } }
  local disabled = vehicle("owned-disabled", 1)
  disabled[key] = { cvt = false }
  local foreign = vehicle("foreign-secret", 2)
  foreign[key] = { cvt = true, profileId = "generic", profile = { ranges = { 1, 2 } },
    state = { range = 1, strategy = 1, ramp = 1, limitStep = 1,
      handThrottle = 0, maxRpm = 2000 } }
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = { owned, disabled, foreign } } }
`;

test("exports CVT controls only for the current farm's owned vehicles", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { cvtVehicleCount: 1 } },
    rows: [{ vehicleId: "owned-tractor", profile: "cvx", range: 2,
      rangeCount: 3, strategy: 2, ramp: 3, loadLimitPercent: 10,
      handThrottleRpm: 1400 }] });
  expect(JSON.stringify(page)).not.toMatch(/foreign-secret|owned-disabled/);
  const merged = normalizeCompanionPages({ pages: { realPowertrain: page } }, { modules: loadModules() });
  expect(merged.pages.realPowertrain.rows).toHaveLength(1);
});

test("withholds totals when a CVT control state is malformed", () => {
  const game = GAME.replace("limitStep = 4", "limitStep = 99");
  const page = runCompanionPage(FILE, game, { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", reason: "invalid-vehicle-state" });
  expect(page.byFarm).toBeUndefined();
  expect(Object.keys(page.rows)).toHaveLength(0);
});

test("gates unreviewed, client-only and no-owned-CVT cases", () => {
  expect(runCompanionPage(FILE, GAME.replace('version = "1.0.0.0"', 'version = "9.9.9.9"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE, GAME.replace("getIsServer = function() return true", "getIsServer = function() return false"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-vehicle-state-only" });
  expect(runCompanionPage(FILE, GAME.replace("owned[key] = { cvt = true", "owned[key] = { cvt = false"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "no-owned-cvt-powertrain" });
});
