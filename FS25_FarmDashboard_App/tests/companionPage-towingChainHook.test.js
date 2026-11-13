"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "TowingChainHookCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { FS25_318102_Towing_Chain_With_Hook = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_318102_Towing_Chain_With_Hook", version = "1.0.0.0" }
  } end }
  local function vehicle(id, farm)
    return { uniqueId = id, ownerFarmId = farm,
      getFullName = function(self) return self.uniqueId end }
  end
  local towed = vehicle("owned-towed", 1)
  local hooked = vehicle("owned-hooked", 1)
  local foreign = vehicle("foreign-secret", 2)
  local chain = vehicle("owned-chain", 1)
  chain.spec_towingChainHook = { isUsed = true, hookMounted = true,
    joint = { vehicleId = towed }, hookedVehicleId = hooked }
  local foreignChain = vehicle("foreign-chain", 2)
  foreignChain.spec_towingChainHook = { isUsed = true, hookMounted = false,
    joint = { vehicleId = foreign } }
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = { chain, towed, hooked, foreignChain, foreign } } }
`;

test("exports only live links between owned vehicles", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { chainCount: 1, linkCount: 2 } } });
  expect(page.rows).toEqual(expect.arrayContaining([
    expect.objectContaining({ chainId: "owned-chain", targetId: "owned-towed", kind: "tow" }),
    expect.objectContaining({ chainId: "owned-chain", targetId: "owned-hooked", kind: "hook" }),
  ]));
  expect(JSON.stringify(page)).not.toMatch(/foreign-secret|foreign-chain/);
  const merged = normalizeCompanionPages({ pages: { towingChainHook: page } }, { modules: loadModules() });
  expect(merged.pages.towingChainHook.rows).toHaveLength(2);
});

test("withholds totals and foreign identity when a link is unresolved or foreign", () => {
  const foreign = GAME.replace('hookedVehicleId = hooked', 'hookedVehicleId = foreign');
  const page = runCompanionPage(FILE, foreign, { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial",
    reason: "unresolved-or-foreign-link" });
  expect(page.byFarm).toBeUndefined();
  expect(JSON.stringify(page)).not.toContain("foreign-secret");
  const stale = GAME.replace('joint = { vehicleId = towed }', 'joint = {}');
  expect(runCompanionPage(FILE, stale, { farmId: 1 }))
    .toMatchObject({ readState: "partial", coverage: "partial" });
});

test("gates unreviewed versions and client-only state", () => {
  expect(runCompanionPage(FILE, GAME.replace("1.0.0.0", "9.9.9.9"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE, GAME.replace("getIsServer = function() return true", "getIsServer = function() return false"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-vehicle-state-only" });
});
