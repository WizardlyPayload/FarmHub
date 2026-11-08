"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "BhSandFacilitiesCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_BH_SandFacilities = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_BH_SandFacilities", version = "1.0.0.0" }
  } end }
  local function silo(id, owner)
    return { uniqueId = id,
      getOwnerFarmId = function() return owner end,
      getName = function() return id end,
      ["spec_FS25_BH_SandFacilities.bhSandSystem"] = {
        placed = true, deleted = false, running = true,
        usageEnabled = true, usageArmed = true,
        usageHoldRemainingMs = 90000, usageTickElapsedMs = 3000,
        usageLitersPerMs = 1/3, fillType = 21,
        storage = { getFillLevel = function() return 250000 end,
          getCapacity = function() return 500000 end },
      },
    }
  end
  local function yard(id, owner)
    return { uniqueId = id,
      getOwnerFarmId = function() return owner end,
      getName = function() return id end,
      ["spec_FS25_BH_SandFacilities.bhSandYard"] = {
        placed = true, deleted = false, running = false,
        station = {}, fillType = 21, stopFillRatio = 0.9,
      },
    }
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    placeableSystem = { placeables = {
      silo("owned-silo", 1), yard("owned-yard", 1),
      silo("foreign-silo", 2),
    } } }
`;

test("separates finite owned silo stock and cycle from unlimited paid yard", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { siloCount: 1, yardCount: 1,
      runningCount: 1, sandLiters: 250000 } } });
  expect(page.silos).toEqual([expect.objectContaining({
    placeableId: "owned-silo", running: true, sandLiters: 250000,
    capacityLiters: 500000, usageArmed: true,
    holdRemainingSeconds: 90, tickElapsedSeconds: 3,
    configuredUseLitersPerRunningHour: 1200000,
  })]);
  expect(page.yards).toEqual([expect.objectContaining({
    placeableId: "owned-yard", running: false, truckFillCutoffRatio: 0.9,
  })]);
  expect(JSON.stringify(page)).not.toContain("foreign-silo");
  expect(JSON.stringify(page.yards)).not.toContain("sandLiters");
  const merged = normalizeCompanionPages({ pages: { bhSandFacilities: page } }, { modules: loadModules() });
  expect(merged.pages.bhSandFacilities.silos).toHaveLength(1);
});

test("withholds duplicate identities and unreadable native stock", () => {
  const duplicate = runCompanionPage(FILE,
    SETUP.replace('yard("owned-yard", 1)', 'yard("owned-silo", 1)'), { farmId: 1 });
  expect(duplicate).toMatchObject({ readState: "partial" });
  expect(Object.keys(duplicate.silos)).toHaveLength(0);
  expect(Object.keys(duplicate.yards)).toHaveLength(0);
  const invalid = runCompanionPage(FILE,
    SETUP.replace('return 250000 end', 'return 900000 end'), { farmId: 1 });
  expect(invalid).toMatchObject({ readState: "partial" });
  expect(Object.keys(invalid.silos)).toHaveLength(0);
  expect(invalid.yards).toHaveLength(1);
});

test("requires the reviewed version and server state", () => {
  expect(runCompanionPage(FILE,
    SETUP.replace('version = "1.0.0.0"', 'version = "1.0.0.2"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE,
    SETUP.replace('getIsServer = function() return true end', 'getIsServer = function() return false end'),
    { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-sand-state-only" });
});
