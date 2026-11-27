"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");

const FILE = "RealisticFuelingSilosCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_344040_Realistic_Fueling_System = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_344040_Realistic_Fueling_System", version = "1.0.0.0" }
  } end }
  local function silo(id, owner, diesel, def)
    return {
      uniqueId = id,
      getName = function() return id end,
      getOwnerFarmId = function() return owner end,
      spec_dynamicPricingSilo = { currentPrices = { DIESEL = diesel, DEF = def } },
    }
  end
  _G.g_currentMission = {
    getFarmId = function() return 1 end,
    getIsServer = function() return true end,
    placeableSystem = { placeables = {
      silo("Owned yard silo", 1, 1.537, 1.245),
      silo("Foreign silo", 2, 4.000, 4.000),
      { getOwnerFarmId = function() return 1 end, getName = function() return "Native silo" end },
    } },
  }
`;

test("exports only valid configured prices on current-farm fuel silos", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete" });
  expect(page.byFarm["1"]).toEqual({ siloCount: 1 });
  expect(page.rows).toMatchObject([{
    farmId: 1, placeableId: "Owned yard silo", name: "Owned yard silo",
    dieselPerLitre: 1.537, defPerLitre: 1.245,
  }]);
  expect(JSON.stringify(page)).not.toMatch(/Foreign silo|Native silo|4\.0/);
});

test("withholds invalid owned prices and unreviewed versions", () => {
  const invalid = runCompanionPage(FILE, SETUP.replace('1.537, 1.245', '9.000, 1.245'), { farmId: 1 });
  expect(invalid).toMatchObject({ readState: "partial", reason: "invalid-owned-silo-price" });
  expect(invalid.rows).toEqual({});
  const unknown = runCompanionPage(FILE, SETUP.replace('version = "1.0.0.0"', 'version = "1.0.1.0"'), { farmId: 1 });
  expect(unknown).toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(unknown.rows).toBeUndefined();
});
