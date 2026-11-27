"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "UseYourTyresCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_useYourTyres = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_useYourTyres", version = "1.1.0.0" }
  } end }
  _G.FS25_useYourTyres = { UseYourTyres = { tyreDistanceMultiplier = 1 } }
  local function machine(id, owner, firstDistance)
    return { uniqueId = id, uytHasTyres = true,
      getOwnerFarmId = function() return owner end,
      getFullName = function() return id end,
      spec_wheels = { wheels = {
        { uytTravelledDist = firstDistance, physics = { radius = 0.8 } },
        { uytTravelledDist = 0, physics = { radius = 0.8 } },
      } } }
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      machine("owned", 1, 24000), machine("foreign", 2, 120000)
    } } }
`;

test("exports current owned wheel travel and source-model wear, excluding another farm", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete", multiplier: 1,
    byFarm: { "1": { vehicleCount: 1, wheelCount: 2, maxWearPct: 10 } } });
  expect(page.rows).toEqual([
    expect.objectContaining({ farmId: 1, vehicleId: "owned", wheelIndex: 1, distanceKm: 24, wearPct: 10 }),
    expect.objectContaining({ farmId: 1, vehicleId: "owned", wheelIndex: 2, distanceKm: 0, wearPct: 0 }),
  ]);
  expect(JSON.stringify(page)).not.toContain("foreign");
  const merged = normalizeCompanionPages({ pages: { useYourTyres: page } }, { modules: loadModules() });
  expect(merged.pages.useYourTyres.rows).toHaveLength(2);
});

test("uses the mod's live multiplier and withholds totals for invalid or duplicate readings", () => {
  const doubled = runCompanionPage(FILE,
    SETUP.replace("tyreDistanceMultiplier = 1", "tyreDistanceMultiplier = 2"), { farmId: 1 });
  expect(doubled.rows[0].wearPct).toBe(5);
  const missing = runCompanionPage(FILE,
    SETUP.replace("firstDistance, physics", "nil, physics"), { farmId: 1 });
  expect(missing).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(missing.byFarm["1"]).not.toHaveProperty("wheelCount");
  const duplicate = runCompanionPage(FILE,
    SETUP.replace('machine("foreign", 2, 120000)', 'machine("owned", 1, 120000)'), { farmId: 1 });
  expect(duplicate).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(Object.keys(duplicate.rows)).toHaveLength(0);
});

test("gates unreviewed version, client, missing multiplier and absent mod", () => {
  expect(runCompanionPage(FILE, SETUP.replace('version = "1.1.0.0"', 'version = "1.1.0.1"'),
    { farmId: 1 })).toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE, SETUP.replace('getIsServer = function() return true end',
    'getIsServer = function() return false end'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-wheel-state-only" });
  expect(runCompanionPage(FILE, SETUP.replace("tyreDistanceMultiplier = 1", "tyreDistanceMultiplier = nil"),
    { farmId: 1 })).toMatchObject({ readState: "settings-only", reason: "no-valid-tyre-multiplier" });
  expect(runCompanionPage(FILE, '_G.g_modIsLoaded = {}', { farmId: 1 })).toBeUndefined();
});
