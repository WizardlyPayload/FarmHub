"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "SlurryPipeSystemCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { FS25_SlurryPipeSystem = true }
  local mission = { getIsServer = function() return true end }
  _G.g_currentMission = mission
  local function place(farm, name)
    return { getOwnerFarmId = function() return farm end, getName = function() return name end }
  end
  _G.g_slurryPipeManager = {
    registeredPlaceables = {
      { placeable = place(1, "Farm lagoon"), storeSources = {
        { type = "STORAGE_PLANE", thickeningEnabled = true,
          storeId = 3, solids = 120, settle = 0.42 },
        { type = "STORAGE_PLANE", thickeningEnabled = false,
          storeId = 4, solids = 300, settle = 0.8 },
      } },
      { placeable = place(2, "Other farm"), storeSources = {
        { type = "STORAGE_PLANE", thickeningEnabled = true,
          storeId = 9, solids = 999999, settle = 0.9 },
      } },
    },
    isFeatureEnabled = function() return true end,
    getStoreSources = function(self, entry) return entry.storeSources end,
  }
`;

test("exports only the selected farm's mod-owned live settling pool", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { activeStores: 1 } },
    stores: [{ farmId: 1, placeable: "Farm lagoon", storeId: 3,
      settlingPercent: 42, dryMatterPoolLitres: 120 }],
  });
  expect(JSON.stringify(page)).not.toContain("999999");
  const merged = normalizeCompanionPages({ pages: { slurryPipeSystem: page } }, { modules: loadModules() });
  expect(merged.pages.slurryPipeSystem.stores).toHaveLength(1);
});

test("withholds client, disabled or unknown-version state", () => {
  expect(runCompanionPage(FILE, GAME.replace("return true end }", "return false end }"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-stores-only" });
  expect(runCompanionPage(FILE, GAME.replace("isFeatureEnabled = function() return true", "isFeatureEnabled = function() return false"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "live-store-state-unavailable" });
  const newer = GAME + `
    _G.g_modManager = { getActiveMods = function() return {
      { modName = "FS25_SlurryPipeSystem", version = "9.9.9.9" }
    } end }
  `;
  expect(runCompanionPage(FILE, newer, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
});

test("flags an unready owned pool and withholds complete count", () => {
  const page = runCompanionPage(FILE, GAME.replace("solids = 120, settle = 0.42", "solids = nil, settle = 0.42"), { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(page.byFarm["1"]).not.toHaveProperty("activeStores");
  const merged = normalizeCompanionPages({ pages: { slurryPipeSystem: page } }, { modules: loadModules() });
  expect(merged.pages.slurryPipeSystem.stores).toEqual([]);
});

test("does not claim complete farm coverage when a registered store has no owner", () => {
  const noOwner = GAME.replace('place(2, "Other farm")', 'place(nil, "Other farm")');
  const page = runCompanionPage(FILE, noOwner, { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(page.byFarm["1"]).not.toHaveProperty("activeStores");
  expect(page.stores).toHaveLength(1);
});
