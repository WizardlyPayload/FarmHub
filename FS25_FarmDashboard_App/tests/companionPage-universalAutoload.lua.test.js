"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "UniversalAutoloadCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_UniversalAutoload = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_UniversalAutoload", version = "1.1.1.0" }
  } end }
  _G.FS25_UniversalAutoload = { UniversalAutoload = {
    MATERIALS = { "ALL", "WHEAT" },
    MATERIALS_FILLTYPE = { { title = "All" }, { title = "Wheat" } },
    CONTAINERS = { "ALL", "EURO_PALLET", "BALE" },
  } }
  local function vehicle(id, farm, spec)
    return { uniqueId = id, ownerFarmId = farm,
      getFullName = function() return "Trailer " .. id end,
      spec_universalAutoload = spec }
  end
  local function state(material, container, filter, collection)
    return { isAutoloadAvailable = true, initialised = true,
      currentMaterialIndex = material, currentContainerIndex = container,
      currentLoadside = "both", currentTipside = "rear",
      currentLoadingFilter = filter, autoCollectionMode = collection,
      useHorizontalLoading = false, loadedObjects = { product = true } }
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      vehicle("owned", 1, state(2, 2, true, false)),
      vehicle("foreign", 2, state(1, 3, false, true)),
      vehicle("owned-2", 1, state(1, 3, false, true)),
      vehicle("unavailable", 1, { isAutoloadAvailable = false }),
    } } }
`;

test("reads only owned autoload choices with resolved source indices", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { vehicleCount: 2, filteredCount: 1, collectionModeCount: 1 } } });
  expect(page.rows).toHaveLength(2);
  expect(page.rows.find((row) => row.vehicleId === "owned")).toMatchObject({
    material: "WHEAT", materialTitle: "Wheat", container: "EURO_PALLET",
    loadside: "both", tipside: "rear", loadingFilter: true,
    autoCollectionMode: false, horizontalLoading: false,
  });
  expect(JSON.stringify(page)).not.toMatch(/foreign|unavailable|loadedObjects|product/);
  const merged = normalizeCompanionPages({ pages: { universalAutoload: page } },
    { modules: loadModules() });
  expect(merged.pages.universalAutoload.rows).toHaveLength(2);
});

test("withholds totals on invalid or ambiguous owned state", () => {
  const invalid = runCompanionPage(FILE,
    SETUP.replace("state(2, 2, true, false)", "state(99, 2, true, false)"), { farmId: 1 });
  expect(invalid).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(invalid.byFarm).toBeUndefined();
  const duplicate = runCompanionPage(FILE,
    SETUP.replace('vehicle("owned-2", 1,', 'vehicle("owned", 1,'), { farmId: 1 });
  expect(duplicate).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(Object.keys(duplicate.rows)).toHaveLength(0);
  expect(duplicate.byFarm).toBeUndefined();
});

test("gates unreviewed version, client, and unready source table", () => {
  expect(runCompanionPage(FILE,
    SETUP.replace('version = "1.1.1.0"', 'version = "1.0.2.9"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE,
    SETUP.replace("getIsServer = function() return true end",
      "getIsServer = function() return false end"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-vehicle-state-only" });
  expect(runCompanionPage(FILE,
    SETUP.replace('CONTAINERS = { "ALL", "EURO_PALLET", "BALE" },',
      "CONTAINERS = nil,"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "autoload-register-not-ready" });
});
