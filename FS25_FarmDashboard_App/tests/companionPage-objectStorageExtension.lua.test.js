"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "ObjectStorageExtensionCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_ObjectStorageExtension = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_ObjectStorageExtension", version = "1.0.2.0" }
  } end }
  _G.FS25_ObjectStorageExtension = {
    PlaceableObjectStorageExtension = {
      SPEC_TABLE_NAME = "spec_FS25_ObjectStorageExtension.objectStorageExtension"
    }
  }
  local function store(id, farm, capacity, kind, disabled)
    return { uniqueId = id, spec_objectStorage = {},
      ["spec_FS25_ObjectStorageExtension.objectStorageExtension"] = {
        capacity = capacity, supportedTypeId = kind, objectTriggerDisabled = disabled
      },
      getOwnerFarmId = function() return farm end,
      getName = function() return "Store " .. id end }
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    placeableSystem = { placeables = {
      store("owned", 1, 350, 2, true),
      store("foreign", 2, 900, 3, false),
      store("owned-2", 1, 250, 1, false),
    } } }
`;

test("reads owned configured object limits and input state without copying inventory", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { ownedStorageCount: 2, inputDisabledCount: 1 } } });
  expect(page.rows).toEqual([
    { farmId: 1, placeableId: "owned", name: "Store owned",
      configuredObjectCapacity: 350, acceptedObjectType: "bales",
      inputTriggerDisabled: true },
    { farmId: 1, placeableId: "owned-2", name: "Store owned-2",
      configuredObjectCapacity: 250, acceptedObjectType: "bales-and-pallets",
      inputTriggerDisabled: false },
  ]);
  expect(JSON.stringify(page)).not.toContain("foreign");
  const merged = normalizeCompanionPages({ pages: { objectStorageExtension: page } },
    { modules: loadModules() });
  expect(merged.pages.objectStorageExtension.rows).toHaveLength(2);
});

test("withholds totals for invalid owned capacity or duplicate identity", () => {
  const invalid = runCompanionPage(FILE,
    SETUP.replace('store("owned", 1, 350, 2, true)',
      'store("owned", 1, -1, 2, true)'), { farmId: 1 });
  expect(invalid).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(invalid.byFarm).toBeUndefined();
  const duplicate = runCompanionPage(FILE,
    SETUP.replace('store("owned-2", 1, 250, 1, false)',
      'store("owned", 1, 250, 1, false)'), { farmId: 1 });
  expect(Object.keys(duplicate.rows)).toHaveLength(0);
  expect(duplicate.byFarm).toBeUndefined();
});

test("gates unreviewed version, client and absent specialization", () => {
  expect(runCompanionPage(FILE,
    SETUP.replace('version = "1.0.2.0"', 'version = "1.0.3.0"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE,
    SETUP.replace('getIsServer = function() return true end',
      'getIsServer = function() return false end'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-placeable-state-only" });
  expect(runCompanionPage(FILE,
    SETUP.replace('SPEC_TABLE_NAME = "spec_FS25_ObjectStorageExtension.objectStorageExtension"',
      'SPEC_TABLE_NAME = nil'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "no-extension-specialization" });
});
