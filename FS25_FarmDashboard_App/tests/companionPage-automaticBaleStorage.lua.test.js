"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "AutomaticBaleStorageCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_363427_FS25_AutomaticBaleStorage = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_363427_FS25_AutomaticBaleStorage", version = "1.0.0.3" }
  } end }
  local function storage(id, owner, pending)
    return { uniqueId = id, getOwnerFarmId = function() return owner end,
      getName = function() return id end,
      spec_objectStorage = {},
      spec_automaticBaleStorage = { remainingUnload = pending },
    }
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    placeableSystem = { placeables = {
      storage("owned-pending", 1, 8), storage("owned-idle", 1, 0),
      storage("foreign", 2, 99),
    } },
  }
`;

test("reads only owned pending unloads and keeps native stored-object counts separate", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { ownedStorageCount: 2, queuedStorageCount: 1, pendingUnload: 8 } } });
  expect(page.rows).toEqual([{ farmId: 1, placeableId: "owned-pending",
    storage: "owned-pending", pendingUnload: 8 }]);
  expect(JSON.stringify(page)).not.toContain("foreign");
  expect(normalizeCompanionPages({ pages: { automaticBaleStorage: page } },
    { modules: loadModules() }).pages.automaticBaleStorage.rows).toHaveLength(1);
});

test("withholds totals for duplicate identities and invalid pending counts", () => {
  const duplicate = runCompanionPage(FILE,
    SETUP.replace('storage("owned-idle", 1, 0)', 'storage("owned-pending", 1, 0)'),
    { farmId: 1 });
  expect(duplicate).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(duplicate.byFarm).toBeUndefined();
  expect(Object.keys(duplicate.rows)).toHaveLength(0);
  const invalid = runCompanionPage(FILE,
    SETUP.replace('storage("owned-pending", 1, 8)', 'storage("owned-pending", 1, -8)'),
    { farmId: 1 });
  expect(invalid).toMatchObject({ readState: "partial" });
  expect(invalid.byFarm).toBeUndefined();
});

test("requires exact reviewed version and server queue state", () => {
  expect(runCompanionPage(FILE,
    SETUP.replace('version = "1.0.0.3"', 'version = "1.0.0.4"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE,
    SETUP.replace('getIsServer = function() return true end',
      'getIsServer = function() return false end'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-queue-state-only" });
});

test("recognizes the byte-identical vault alias as the same integration", () => {
  const alias = SETUP.replaceAll("FS25_363427_FS25_AutomaticBaleStorage",
    "KM_78542_Automatic_Bale_Storage");
  expect(runCompanionPage(FILE, alias, { farmId: 1 }))
    .toMatchObject({ readState: "ok", byFarm: { "1": { pendingUnload: 8 } } });
});
