"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");

const FILE = "GreenhouseAutomaticWateringCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_303379_Greenhouse_Automatic_Watering = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_303379_Greenhouse_Automatic_Watering", version = "1.0.0.0" }
  } end }
  _G.FillType = { WATER = 22 }
  local function point(id, owner, water, enabled)
    return {
      ownerFarmId = owner,
      getName = function() return id end,
      storage = { getIsFillTypeSupported = function(_, fillType) return water and fillType == 22 end },
      owningPlaceable = {
        uniqueId = id, AutoWatering = enabled,
        getOwnerFarmId = function() return owner end,
      },
    }
  end
  _G.g_currentMission = {
    getFarmId = function() return 1 end,
    getIsServer = function() return true end,
    productionChainManager = { getProductionPointsForFarmId = function() return {
      point("Owned greenhouse", 1, true, true),
      point("Owned disabled", 1, true, false),
      point("Foreign greenhouse", 2, true, true),
      point("Dry factory", 1, false, true),
    } end },
  }
`;

test("exports only owned water-using switches, including an explicit off state", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete" });
  expect(page.byFarm["1"]).toEqual({ eligibleCount: 2, enabledCount: 1 });
  expect(page.rows).toMatchObject([
    { farmId: 1, name: "Owned disabled", enabled: false },
    { farmId: 1, name: "Owned greenhouse", enabled: true },
  ]);
  expect(JSON.stringify(page)).not.toMatch(/Foreign greenhouse|Dry factory/);
});

test("withholds unreadable switches and unreviewed versions", () => {
  const invalid = runCompanionPage(FILE, SETUP.replace('point("Owned greenhouse", 1, true, true)', 'point("Owned greenhouse", 1, true, nil)'), { farmId: 1 });
  expect(invalid).toMatchObject({ readState: "partial", reason: "unreadable-auto-watering-switch" });
  expect(JSON.stringify(invalid)).not.toContain("Owned greenhouse");
  const unknown = runCompanionPage(FILE, SETUP.replace('version = "1.0.0.0"', 'version = "1.0.1.0"'), { farmId: 1 });
  expect(unknown).toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(unknown.rows).toBeUndefined();
});
