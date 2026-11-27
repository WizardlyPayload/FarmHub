"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "OverburdenCollector.lua";
const GAME = `
  g_modIsLoaded = { KM_83309_Overburden = true }
  g_modManager = { getActiveMods = function() return {
    { modName = "KM_83309_Overburden", version = "1.1.0.1" }
  } end }
  Overburden = { loaded = true, initialized = true, saveBlocked = false,
    disabled = false, mines = {
      { id="mine_1", farmId=1, name="North Pit", area=750, coverDepth=3.5,
        overburdenName="DIRT", payName="PAYDIRT", status="ready",
        remainingMs=0, cost=4000 },
      { id="mine_2", farmId=2, name="Other Farm", area=10000, coverDepth=4,
        overburdenName="DIRT", payName="PAYDIRT", status="ready",
        remainingMs=0, cost=999999 },
    } }
  _G.KM_83309_Overburden = { Overburden = Overburden }
  g_currentMission = { missionDynamicInfo = { isMultiplayer = false },
    isMissionStarted = true, getIsServer = function() return true end }
`;

test("exports only selected-farm mine survey data", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { mineCount: 1, readyCount: 1 } },
    mines: [{ farmId: 1, id: "mine_1", name: "North Pit", status: "ready",
      areaSquareMeters: 750, coverDepthMeters: 3.5, recordedSurveyCost: 4000 }],
  });
  expect(JSON.stringify(page)).not.toContain("Other Farm");
  const merged = normalizeCompanionPages({ pages: { overburden: page } }, { modules: loadModules() });
  expect(merged.pages.overburden.mines).toHaveLength(1);
});

test("withholds unreadable or invalid mine registers", () => {
  expect(runCompanionPage(FILE, GAME.replace("loaded = true", "loaded = false"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "mine-register-unavailable" });
  expect(runCompanionPage(FILE, GAME.replace('version = "1.1.0.1"', 'version = "9.9.9.9"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  const bad = GAME.replace("area=750", "area=0/0");
  const page = runCompanionPage(FILE, bad, { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial", byFarm: { "1": {} }, mines: {} });
});
