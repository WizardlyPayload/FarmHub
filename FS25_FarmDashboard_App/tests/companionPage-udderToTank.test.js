"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "UdderToTankCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { KM_82886_Udder_to_Tank = true }
  local cow = {
    getNumAnimals = function() return 2 end,
    udderMilkAnimals = {
      { id = "a", liters = 12, capacityFactor = 1 },
      { id = "b", liters = 16, capacityFactor = 1.1 },
    },
    display = true, goat = false,
  }
  local goat = {
    getNumAnimals = function() return 1 end,
    udderMilkAnimals = { { id = "c", liters = 2, capacityFactor = 1 } },
    display = true, goat = true,
  }
  local young = { getNumAnimals = function() return 1 end,
    udderMilkAnimals = { { id = "d", liters = 0, capacityFactor = 1 } }, display = false }
  local foreign = { getNumAnimals = function() return 1 end,
    udderMilkAnimals = { { id = "e", liters = 30, capacityFactor = 1 } }, display = true }
  local function pen(id, name, clusters)
    return { getOwnerFarmId = function() return id end, getName = function() return name end,
      spec_husbandryAnimals = { clusterSystem = { getClusters = function() return clusters end } } }
  end
  _G.g_currentMission = {
    getFarmId = function() return 1 end, getIsServer = function() return true end,
    husbandrySystem = { placeables = {
      pen(1, "Dairy Barn", { cow, young }), pen(1, "Goat Pen", { goat }),
      pen(2, "Foreign Barn", { foreign }),
    } },
  }
  _G.KM_82886_Udder_to_Tank = { UdderMilk = {
    capacity = 40, goatCapacity = 4,
    hasMilkDisplay = function(cluster) return cluster.display end,
    isGoat = function(cluster) return cluster.goat end,
    ensure = function() error("mutating ensure called") end,
    capacityFor = function() error("mutating capacityFor called") end,
    showInfo = function() error("mutating showInfo called") end,
  } }
`;

test("reads producing animals' current udder stock for this farm, not tank or foreign milk", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { penCount: 2, clusterCount: 2, animalCount: 3,
      storedLitres: 30, capacityLitres: 88 } } });
  expect(page.rows).toEqual([
    expect.objectContaining({ pen: "Dairy Barn", milkType: "dairy", animals: 2,
      avgStoredLitres: 14, avgCapacityLitres: 42, totalStoredLitres: 28 }),
    expect.objectContaining({ pen: "Goat Pen", milkType: "goat", animals: 1,
      avgStoredLitres: 2, avgCapacityLitres: 4, totalStoredLitres: 2 }),
  ]);
  expect(JSON.stringify(page)).not.toMatch(/Foreign Barn|30.*capacityFactor|tank|yieldFactor/);
  const merged = normalizeCompanionPages({ pages: { udderToTank: page } }, { modules: loadModules() });
  expect(merged.pages.udderToTank.rows).toHaveLength(2);
});

test("does not treat an unbound mod or client state as authoritative", () => {
  const client = SETUP.replace("getIsServer = function() return true end", "getIsServer = function() return false end");
  expect(runCompanionPage(FILE, client, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-animals-only" });
  const shadow = SETUP.replace("_G.KM_82886_Udder_to_Tank = { UdderMilk = {", "_G.shadow = { UdderMilk = {");
  expect(runCompanionPage(FILE, shadow, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "no-udder-register" });
});

test("invalid animal records cannot contribute a false total", () => {
  const invalid = SETUP.replace("{ id = \"b\", liters = 16, capacityFactor = 1.1 }",
    "{ id = \"b\", liters = -16, capacityFactor = 1.1 }");
  const page = runCompanionPage(FILE, invalid, { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial",
    byFarm: { "1": { clusterCount: 1, animalCount: 1, storedLitres: 2 } } });
  expect(page.rows).toHaveLength(1);
});

test("keeps all 81 owned singleton groups within the bounded page budget", () => {
  const many = SETUP.replace('pen(1, "Dairy Barn", { cow, young })', `pen(1, "Dairy Barn", (function()
    local groups = {}
    for i = 1, 80 do
      groups[i] = { getNumAnimals = function() return 1 end,
        udderMilkAnimals = { { id = tostring(i), liters = 1, capacityFactor = 1 } },
        display = true, goat = false }
    end
    return groups
  end)())`);
  const page = runCompanionPage(FILE, many, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { clusterCount: 81, animalCount: 81, storedLitres: 82 } } });
  expect(page.rows).toHaveLength(81);
  const merged = normalizeCompanionPages({ pages: { udderToTank: page } }, { modules: loadModules() });
  expect(merged.pages.udderToTank.rows).toHaveLength(81);
});
