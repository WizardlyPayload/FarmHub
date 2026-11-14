"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "AgroRealisticResaleCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_AgroRealistic = true }
  _G.g_modManager = { getActiveMods = function() return { { modName = "FS25_AgroRealistic", version = "1.0.0.0" } } end }
  _G.g_currentMission = { getIsServer = function() return true end,
    environment = { currentYear = 3, currentPeriod = 1 } }
  _G.FS25_AgroRealistic = { LeandroFarmRules = {
    farmlandPurchasePeriods = { [10] = 12, [11] = 0, [12] = 24 },
    saveLandHistory = function() error("must not save") end,
    getFarmlandResaleFactor = function() error("must not invoke mod policy") end,
  } }
  _G.g_farmlandManager = {
    getFarmlandOwner = function(_, id)
      if id == 10 then return 1 end
      if id == 11 then return 2 end
      return 0
    end,
  }
`;

test("exports only currently owned land with the mod's period-based factor", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete", currentPeriodIndex: 24,
    byFarm: { "1": { recordedLandCount: 1 } },
    lands: [{ farmlandId: 10, recordedStartPeriod: 12, elapsedPeriods: 12, resaleFactor: 0.6 }] });
  expect(JSON.stringify(page)).not.toContain('"farmlandId":11');
  expect(JSON.stringify(page)).not.toContain('"farmlandId":12');
  const other = runCompanionPage(FILE, SETUP, { farmId: 2 });
  expect(other.lands).toEqual([{ farmlandId: 11, recordedStartPeriod: 0,
    elapsedPeriods: 24, resaleFactor: 0.7 }]);
  expect(normalizeCompanionPages({ pages: { agroRealisticResale: page } }, { modules: loadModules() })
    .pages.agroRealisticResale.lands).toHaveLength(1);
});

test("withholds history when current ownership or server authority is unknown", () => {
  expect(runCompanionPage(FILE, SETUP.replace("return 1 end", "return nil end"), { farmId: 1 }))
    .toMatchObject({ readState: "unavailable", reason: "owner-unresolved" });
  expect(runCompanionPage(FILE, SETUP.replace("return true end", "return false end"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-history-only" });
});

test("marks impossible future history partial and excludes its row", () => {
  const page = runCompanionPage(FILE, SETUP.replace("[10] = 12", "[10] = 25"), { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", reason: "invalid-history", lands: {} });
});
