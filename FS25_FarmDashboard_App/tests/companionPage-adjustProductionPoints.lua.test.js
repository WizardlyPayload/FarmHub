"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const FILE = "AdjustProductionPointsCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_352087_Adjust_Production_Points = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_352087_Adjust_Production_Points", version = "1.0.0.0" }
  } end }
  _G.g_fillTypeManager = { getFillTypeTitleByIndex = function(_, index)
    return index == 1 and "Wheat" or nil
  end }
  local function point(id, owner)
    local storage = { capacity = 200, capacities = { [1] = 100 } }
    return {
      ownerFarmId = owner, getName = function() return id end,
      storage = storage,
      productions = {
        { id = "flour", name = "Flour", cyclesPerMonthDefault = 528, cyclesPerMonth = 792 },
        { id = "bran", name = "Bran", cyclesPerMonthDefault = 100, cyclesPerMonth = 100 },
      },
      owningPlaceable = {
        uniqueId = id, getOwnerFarmId = function() return owner end,
        spec_adjustProductionPointStorage = {
          adjustedTotalCapacity = 200,
          adjustedCapacities = { { fillTypeIndex = 1, capacity = 100 } },
        },
      },
    }
  end
  local owned = point("Own mill", 1)
  local foreign = point("Foreign mill", 2)
  local transferred = point("Transferred mill", 1)
  transferred.owningPlaceable.getOwnerFarmId = function() return 2 end
  _G.g_currentMission = {
    getFarmId = function() return 1 end,
    getIsServer = function() return true end,
    productionChainManager = { getProductionPointsForFarmId = function() return { owned, foreign, transferred } end },
  }
`;

test("exports changed rates and saved/live limits only from currently owned points", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete" });
  expect(page.byFarm["1"]).toEqual({
    ownedPointCount: 1, changedRateCount: 1, adjustedCapacityCount: 2, mismatchCount: 0,
  });
  expect(page.rows).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: "Own mill", kind: "cycles", item: "Flour", baseline: 528, current: 792 }),
    expect.objectContaining({ name: "Own mill", kind: "fillCapacity", item: "Wheat", saved: 100, current: 100 }),
    expect.objectContaining({ name: "Own mill", kind: "totalCapacity", saved: 200, current: 200 }),
  ]));
  expect(JSON.stringify(page)).not.toMatch(/Foreign mill|Transferred mill|Bran/);
});

test("withholds ambiguous duplicate fill limits and flags saved/live disagreement", () => {
  const duplicate = runCompanionPage(FILE, SETUP.replace(
    '{ { fillTypeIndex = 1, capacity = 100 } }',
    '{ { fillTypeIndex = 1, capacity = 100 }, { fillTypeIndex = 1, capacity = 120 } }',
  ), { farmId: 1 });
  expect(duplicate).toMatchObject({ readState: "partial", reason: "unreadable-or-duplicate-adjustment" });
  expect(duplicate.rows.some((row) => row.kind === "fillCapacity")).toBe(false);

  const mismatch = runCompanionPage(FILE, SETUP.replace('capacity = 200, capacities', 'capacity = 250, capacities'), { farmId: 1 });
  expect(mismatch).toMatchObject({ readState: "partial", reason: "saved-live-capacity-disagreement" });
  expect(mismatch.byFarm["1"].mismatchCount).toBe(1);
});

test("does not read unreviewed versions or client-only production state", () => {
  const version = runCompanionPage(FILE, SETUP.replace('version = "1.0.0.0"', 'version = "1.1.0.0"'), { farmId: 1 });
  expect(version).toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  const client = runCompanionPage(FILE, SETUP.replace('getIsServer = function() return true end', 'getIsServer = function() return false end'), { farmId: 1 });
  expect(client).toMatchObject({ readState: "settings-only", reason: "server-production-state-only" });
});
