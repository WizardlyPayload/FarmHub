"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "FarmGateKeysCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_356593_Farm_Gate_Keys = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_356593_Farm_Gate_Keys", version = "1.0.0.0" }
  } end }
  local function gate(id, locked, holder)
    return { saveId = id, farmGateKeysEnabled = true,
      farmGateKeysState = { isLocked = locked, lockedFarmId = holder } }
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    onCreateObjectSystem = { objects = {
      gate("map-a", true, 1), gate("foreign", true, 2),
      gate("open", false, 0) } },
    placeableSystem = { placeables = { {
      uniqueId = "barn-1", spec_animatedObjects = { animatedObjects = {
        gate("door-a", true, 1) } },
      spec_fence = { animatedObjects = { gate("fence-a", true, 1) } }
    } } } }
`;

test("reports only the selected farm's current map and placeable gate locks", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { heldLockCount: 3 } } });
  expect(page.rows).toHaveLength(3);
  expect(page.rows).toEqual(expect.arrayContaining([
    expect.objectContaining({ gate: "map-a", source: "map", gateId: "map::map-a" }),
    expect.objectContaining({ gate: "door-a", source: "placeable", placeableId: "barn-1" }),
    expect.objectContaining({ gate: "fence-a", source: "placeable", placeableId: "barn-1" }),
  ]));
  expect(JSON.stringify(page)).not.toMatch(/foreign|open/);
  const merged = normalizeCompanionPages({ pages: { farmGateKeys: page } },
    { modules: loadModules() });
  expect(merged.pages.farmGateKeys.rows).toHaveLength(3);
});

test("withholds totals for invalid farm holder or duplicate gate identity", () => {
  for (const altered of [
    SETUP.replace('gate("foreign", true, 2)', 'gate("bad", true, 0)'),
    SETUP.replace('gate("foreign", true, 2)', 'gate("map-a", true, 1)'),
  ]) {
    const page = runCompanionPage(FILE, altered, { farmId: 1 });
    expect(page).toMatchObject({ readState: "partial", coverage: "partial" });
    expect(page.byFarm).toBeUndefined();
  }
});

test("gates unreviewed version and client state", () => {
  expect(runCompanionPage(FILE,
    SETUP.replace('version = "1.0.0.0"', 'version = "1.0.0.1"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE,
    SETUP.replace("getIsServer = function() return true end",
      "getIsServer = function() return false end"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-gate-state-only" });
});
