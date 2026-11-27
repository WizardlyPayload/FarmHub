"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "GrainHaulingServiceCollector.lua";
const GAME = `
  g_modIsLoaded = { ["KM_81831_Getreidetransport-Service"] = true }
  g_modManager = { getActiveMods = function() return {
    { modName = "KM_81831_Getreidetransport-Service", version = "0.4.8.9" }
  } end }
  GrainHaulingService = { persistenceLoaded = true, pendingHauls = {
    { id=4, farmId=1, cropName="Wheat", liters=20000, destinationName="Mill",
      serviceName="Standard", carrierName="Ironwheel", gross=3200, fee=430,
      net=2770, timeRemainingMs=180000 },
    { id=5, farmId=2, cropName="Oats", liters=99999, destinationName="Other",
      gross=999999, fee=1, net=999998, timeRemainingMs=1000 },
  } }
  _G["KM_81831_Getreidetransport-Service"] = { GrainHaulingService = GrainHaulingService }
  g_currentMission = { missionDynamicInfo = { isMultiplayer = false },
    isMissionStarted = true, getIsServer = function() return true end }
`;

test("shows only the selected farm's dispatched pending haul", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { pendingCount: 1, pendingNet: 2770 } },
    pending: [{ farmId: 1, id: 4, crop: "Wheat", liters: 20000,
      destination: "Mill", net: 2770, etaMinutes: 3 }],
  });
  expect(JSON.stringify(page)).not.toContain("999998");
  const merged = normalizeCompanionPages({ pages: { grainHaulingService: page } }, { modules: loadModules() });
  expect(merged.pages.grainHaulingService.pending).toHaveLength(1);
});

test("does not invent a receivable from an unready or malformed register", () => {
  expect(runCompanionPage(FILE, GAME.replace("persistenceLoaded = true", "persistenceLoaded = false"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "pending-hauls-not-loaded" });
  expect(runCompanionPage(FILE, GAME.replace('version = "0.4.8.9"', 'version = "9.9.9.9"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  const bad = GAME.replace("net=2770", "net=0/0");
  const page = runCompanionPage(FILE, bad, { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial", byFarm: { "1": {} }, pending: {} });
});
