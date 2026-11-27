"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "LeaseLivestockCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { KM_81709_Lease_Livestock = true }
  _G.g_modManager = { getActiveMods = function() return { { modName = "KM_81709_Lease_Livestock", version = "1.0.0.0" } } end }
  _G.KM_81709_Lease_Livestock = {
    LL_LeaseLivestock = { addLease = function() error("must not lease") end },
  }
  local function pen(farm, name, clusters)
    return { ownerFarmId = farm, getOwnerFarmId = function(self) return self.ownerFarmId end,
      getName = function() return name end, getClusters = function() return clusters end }
  end
  _G.g_currentMission = {
    getIsServer = function() return true end,
    husbandrySystem = { placeables = {
      pen(1, "Cow Barn", {
        { isLeased = true, subTypeIndex = 1, numAnimals = 3 },
        { isLeased = true, subTypeIndex = 1, numAnimals = 2 },
        { isLeased = false, subTypeIndex = 2, numAnimals = 9 },
      }),
      pen(2, "Other Farm", { { isLeased = true, subTypeIndex = 1, numAnimals = 20 } }),
      pen(1, "Sheep Pen", { { isLeased = true, subTypeIndex = 3, numAnimals = 4 } }),
    } },
    animalSystem = {
      getSubTypeByIndex = function(self, index)
        return ({ [1] = {name="HOLSTEIN"}, [3] = {name="SHEEP"} })[index]
      end,
      getAnimalBuyPrice = function(self, index, age)
        assert(age == 18)
        return ({ [1] = 2400, [3] = 1000 })[index]
      end,
    },
  }
`;

test("shows only this farm's leased animals with source-formula prospective charges", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { ownedPensScanned: 2, leasedAnimals: 9,
      estimatedPeriodCharge: 668 } } });
  expect(page.rows).toHaveLength(2);
  expect(page.rows).toEqual(expect.arrayContaining([
    expect.objectContaining({ farmId: 1, pen: "Cow Barn", animal: "HOLSTEIN",
      leasedCount: 5, ratePerAnimal: 100, estimatedPeriodCharge: 500 }),
    expect.objectContaining({ farmId: 1, pen: "Sheep Pen", animal: "SHEEP",
      leasedCount: 4, ratePerAnimal: 42, estimatedPeriodCharge: 168 }),
  ]));
  const merged = normalizeCompanionPages({ pages: { leaseLivestock: page } },
    { modules: loadModules() });
  expect(merged.pages.leaseLivestock.rows).toHaveLength(2);
});

test("foreign farm and client sessions do not attribute leased animals", () => {
  const other = runCompanionPage(FILE, GAME, { farmId: 2 });
  expect(other).toMatchObject({ readState: "ok",
    byFarm: { "2": { leasedAnimals: 20, estimatedPeriodCharge: 2000 } } });
  expect(other.rows).toHaveLength(1);
  const client = GAME.replace("getIsServer = function() return true end",
    "getIsServer = function() return false end");
  expect(runCompanionPage(FILE, client, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-animals-only" });
});

test("unpriced leased cluster withholds farm charge rather than reporting a false total", () => {
  const unpriced = GAME.replace("return ({ [1] = 2400, [3] = 1000 })[index]",
    "return ({ [1] = 2400 })[index]");
  const page = runCompanionPage(FILE, unpriced, { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial",
    byFarm: { "1": { leasedAnimals: 9 } } });
  expect(page.byFarm["1"].estimatedPeriodCharge).toBeUndefined();
  expect(page.rows.find((row) => row.subTypeIndex === 3).estimatedPeriodCharge)
    .toBeUndefined();
  expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 }))
    .toBeUndefined();
  const newer = GAME + `
    _G.g_modManager = { getActiveMods = function() return {
      { modName = "KM_81709_Lease_Livestock", version = "9.9.9.9" }
    } end }
  `;
  expect(runCompanionPage(FILE, newer, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
});

test("ignores a shared-global lease manager shadow outside the loaded mod", () => {
  const shadow = GAME.replace(
    `_G.KM_81709_Lease_Livestock = {
    LL_LeaseLivestock = { addLease = function() error("must not lease") end },
  }`,
    `_G.LL_LeaseLivestock = { addLease = function() error("must not lease") end }`
  );
  expect(runCompanionPage(FILE, shadow, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "lease-state-unavailable" });
});
