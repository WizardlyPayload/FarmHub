"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const FILE = "AnimalPlannerControlsCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_368672_Animal_Planner = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_368672_Animal_Planner", version = "1.0.0.0" }
  } end }
  _G.FS25_368672_Animal_Planner = {
    AnimalPlannerAdminManager = { customOffsets = {
      owned = { animalOffset = 10, foodOffset = 10000, sharedOffset = 0,
        fillTypeOffsets = { [1] = 20000 }, virtualFillTypeOffsets = { [2] = 10000 },
        distributionEnabled = true, autoSellEnabled = false },
      foreign = { animalOffset = 100, distributionEnabled = true, autoSellEnabled = true },
    } },
    AnimalPlannerLogisticsManager = { routes = {
      owned = { [1] = { mode = 1 }, [2] = { mode = 3 } },
      foreign = { [1] = { mode = 3 } },
    } },
  }
  _G.g_fillTypeManager = { getFillTypeTitleByIndex = function(_, index)
    return ({ [1] = "Milk", [2] = "Wool" })[index]
  end }
  local function pen(id, owner)
    return { uniqueId = id, getOwnerFarmId = function() return owner end,
      getName = function() return id == "owned" and "Own dairy" or "Foreign barn" end }
  end
  _G.g_currentMission = {
    getFarmId = function() return 1 end,
    getIsServer = function() return true end,
    husbandrySystem = { placeables = { pen("owned", 1), pen("foreign", 2) } },
  }
`;

test("reads only currently owned per-pen offsets, switches and non-store routes", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete" });
  expect(page.byFarm["1"]).toEqual({ ownedPenCount: 1, adjustmentCount: 4, routeCount: 2 });
  expect(page.rows).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: "Own dairy", kind: "animalOffset", amount: 10 }),
    expect.objectContaining({ kind: "fillTypeOffsets", item: "Milk", amount: 20000 }),
    expect.objectContaining({ kind: "virtualFillTypeOffsets", item: "Wool", amount: 10000 }),
    expect.objectContaining({ kind: "distributionEnabled", enabled: true }),
    expect.objectContaining({ kind: "autoSellEnabled", enabled: false }),
    expect.objectContaining({ kind: "route", item: "Milk", mode: 1, featureEnabled: true }),
    expect.objectContaining({ kind: "route", item: "Wool", mode: 3, featureEnabled: false }),
  ]));
  expect(JSON.stringify(page)).not.toContain("Foreign barn");
});

test("withholds duplicate pen identity and unreviewed versions", () => {
  const duplicate = runCompanionPage(FILE, SETUP.replace(
    'pen("owned", 1), pen("foreign", 2)', 'pen("owned", 1), pen("owned", 1), pen("foreign", 2)'), { farmId: 1 });
  expect(duplicate).toMatchObject({ readState: "partial", reason: "ambiguous-or-unreadable-planner-state" });
  expect(Object.keys(duplicate.rows)).toHaveLength(0);
  const crossFarmCollision = runCompanionPage(FILE, SETUP.replace('pen("foreign", 2)', 'pen("owned", 2)'), { farmId: 1 });
  expect(crossFarmCollision).toMatchObject({ readState: "partial" });
  expect(Object.keys(crossFarmCollision.rows)).toHaveLength(0);
  const version = runCompanionPage(FILE, SETUP.replace('version = "1.0.0.0"', 'version = "1.1.0.0"'), { farmId: 1 });
  expect(version).toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
});

test("does not read client-only or unowned pen state", () => {
  const client = runCompanionPage(FILE, SETUP.replace('getIsServer = function() return true end', 'getIsServer = function() return false end'), { farmId: 1 });
  expect(client).toMatchObject({ readState: "settings-only", reason: "server-husbandry-state-only" });
  const unowned = runCompanionPage(FILE, SETUP.replace('pen("owned", 1)', 'pen("owned", 2)'), { farmId: 1 });
  expect(Object.keys(unowned.rows)).toHaveLength(0);
});
