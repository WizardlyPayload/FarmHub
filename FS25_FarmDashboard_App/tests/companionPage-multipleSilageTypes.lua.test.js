"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "MultipleSilageTypesCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_354139_Multiple_Silage_Types = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_354139_Multiple_Silage_Types", version = "1.0.0.1" }
  } end }
  _G.MultipleSilageTypes = { silageTypes = { { name = "grass" }, { name = "maize" } } }
  _G.BunkerSilo = { STATE_CLOSED = 1, STATE_FERMENTED = 2 }
  local function vehicle(id, owner, kind, chop)
    local v = { uniqueId = id, _mst_chopMode = chop,
      getOwnerFarmId = function() return owner end,
      getFullName = function() return id end }
    if kind == "wagon" then v.spec_forageWagon = {}; v._mst_originalCapacity = 10000;
      v._mst_compressionCapacity = 16000
    else v.spec_baler = {} end
    return v
  end
  local function bunker(id, owner, state, grass, maize)
    return { uniqueId = id,
      getOwnerFarmId = function() return owner end,
      getName = function() return id end,
      spec_bunkerSilo = { bunkerSilo = { state = state,
        _mst_closedAmounts = { grass = grass, maize = maize } } } }
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = { vehicle("own-wagon", 1, "wagon", true),
      vehicle("own-baler", 1, "baler", true), vehicle("foreign", 2, "wagon", true) } },
    placeableSystem = { bunkerSilos = { bunker("own-bunker", 1, 1, 1200, 300),
      bunker("foreign-bunker", 2, 1, 999, 0), bunker("draining", 1, 3, 0, 0) } } }
`;

test("reads owned knife settings and only recorded closed mixture", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { configuredVehicleCount: 2, recordedBunkerCount: 1 } } });
  expect(page.vehicles).toEqual([
    expect.objectContaining({ vehicleId: "own-baler", kind: "baler", chopMode: true }),
    expect.objectContaining({ vehicleId: "own-wagon", kind: "forageWagon", chopMode: true,
      originalCapacityLitres: 10000, compressionCapacityLitres: 16000 }),
  ]);
  expect(page.bunkers[0]).toMatchObject({ bunkerId: "own-bunker", state: "closed",
    recordedTotalLitres: 1500,
    mix: [{ type: "grass", recordedLitres: 1200 }, { type: "maize", recordedLitres: 300 }] });
  expect(JSON.stringify(page)).not.toContain("foreign");
  const merged = normalizeCompanionPages({ pages: { multipleSilageTypes: page } }, { modules: loadModules() });
  expect(merged.pages.multipleSilageTypes.bunkers).toHaveLength(1);
  expect(merged.pages.multipleSilageTypes.bunkers[0].mix).toEqual([
    { type: "grass", recordedLitres: 1200 }, { type: "maize", recordedLitres: 300 },
  ]);
});

test("withholds duplicate IDs, malformed readings and stale drain amounts", () => {
  const duplicate = runCompanionPage(FILE, SETUP.replace('vehicle("own-baler", 1', 'vehicle("own-wagon", 1'), { farmId: 1 });
  expect(duplicate).toMatchObject({ readState: "partial" });
  expect(Object.keys(duplicate.vehicles)).toHaveLength(0);
  const invalid = runCompanionPage(FILE, SETUP.replace('1200, 300', '-1200, 300'), { farmId: 1 });
  expect(invalid).toMatchObject({ readState: "partial" });
  expect(Object.keys(invalid.bunkers)).toHaveLength(0);
  const stale = runCompanionPage(FILE, SETUP.replace('bunker("own-bunker", 1, 1', 'bunker("own-bunker", 1, 3'), { farmId: 1 });
  expect(stale).toMatchObject({ readState: "partial" });
  expect(Object.keys(stale.bunkers)).toHaveLength(0);
});

test("gates version and server state", () => {
  expect(runCompanionPage(FILE, SETUP.replace('version = "1.0.0.1"', 'version = "1.0.0.2"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE, SETUP.replace('getIsServer = function() return true end', 'getIsServer = function() return false end'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-state-only" });
});
