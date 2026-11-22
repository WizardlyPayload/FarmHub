"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "AgroRealisticHealthLossCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_AgroRealistic = true }
  _G.g_modManager = { getActiveMods = function() return { { modName = "FS25_AgroRealistic", version = "1.0.0.0" } } end }
  _G.FS25_AgroRealistic = { LeandroFarmRulesAnimalHealthLoss = {
    timers = {
      ["pen-1|7"] = { placeableId = "pen-1", clusterId = 7, hours = 9 },
      ["pen-2|8"] = { placeableId = "pen-2", clusterId = 8, hours = 15 },
      ["orphan|9"] = { placeableId = "orphan", clusterId = 9, hours = 5 },
    },
    saveState = function() error("must not save") end,
    onHourChanged = function() error("must not advance time") end,
  } }
  local function pen(id, owner, clusterId)
    return {
      getOwnerFarmId = function() return owner end,
      getUniqueId = function() return id end,
      getName = function() return id end,
      getClusters = function() return {
        { id = clusterId, health = 0, numAnimals = 10,
          getNumAnimals = function() return 10 end },
      } end,
    }
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    husbandrySystem = { clusterHusbandries = {
      { getPlaceable = function() return pen("pen-1", 1, 7) end },
      { getPlaceable = function() return pen("pen-2", 2, 8) end },
    } },
  }
`;

test("reads only live zero-health timers for the exact farm", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete", thresholdHours: 24,
    byFarm: { "1": { activeTimerCount: 1 } },
    timers: [{ placeableId: "pen-1", clusterId: 7, animals: 10,
      hoursAtZero: 9, thresholdHours: 24 }] });
  expect(JSON.stringify(page)).not.toContain("pen-2");
  expect(JSON.stringify(page)).not.toContain("orphan");
  expect(normalizeCompanionPages({ pages: { agroRealisticHealthLoss: page } },
    { modules: loadModules() }).pages.agroRealisticHealthLoss.timers).toHaveLength(1);
});

test("withholds timers without server authority or resolvable ownership", () => {
  expect(runCompanionPage(FILE, SETUP.replace("return true end", "return false end"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-timers-only" });
  expect(runCompanionPage(FILE, SETUP.replace('pen("pen-1", 1, 7)', 'pen("pen-1", nil, 7)'),
    { farmId: 1 })).toMatchObject({ readState: "unavailable", reason: "ownership-or-cluster-unresolved" });
});

test("excludes a timer after health recovers", () => {
  const recovered = SETUP.replace("health = 0", "health = 0.5");
  expect(runCompanionPage(FILE, recovered, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "no-active-zero-health-timer",
      byFarm: { "1": { activeTimerCount: 0 } } });
});

test("does not read an unrelated shared-global timer table", () => {
  const shadow = SETUP + `
    _G.LeandroFarmRulesAnimalHealthLoss = _G.FS25_AgroRealistic.LeandroFarmRulesAnimalHealthLoss
    _G.FS25_AgroRealistic.LeandroFarmRulesAnimalHealthLoss = nil
  `;
  expect(runCompanionPage(FILE, shadow, { farmId: 1 }))
    .toMatchObject({ readState: "unavailable", reason: "timers-unavailable" });
});
