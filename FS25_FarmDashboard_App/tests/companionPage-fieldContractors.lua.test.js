"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "FieldContractorsCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { KM_82386_Field_Contractors = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "KM_82386_Field_Contractors", version = "1.5.3.1" }
  } end }
  _G.KM_82386_Field_Contractors = { FieldContractors = {
    persistenceLoadedForMission = true, persistenceRestoreFinished = true,
    claims = {
      [36] = { id = 4, fieldId = 36, contract = true, contractFarmId = 1,
        workType = "harvest", label = "Harvest", dynamicLabel = "Field 36",
        contractPrice = 1800, contractAreaHa = 3.5,
        contractProcessedAreaHa = 1.25, jobPhase = "working" },
      [37] = { id = 5, fieldId = 37, contract = true, contractFarmId = 2,
        workType = "harvest", label = "Foreign private job",
        contractPrice = 999999, contractAreaHa = 9,
        contractProcessedAreaHa = 8 },
      [38] = { id = 6, fieldId = 38, contract = false, contractFarmId = 1,
        workType = "harvest", contractPrice = 70, contractAreaHa = 1,
        contractProcessedAreaHa = 0 },
    },
    savePersistentContracts = function() error("reader must not write profile") end,
  } }
  _G.g_currentMission = { isMissionStarted = true,
    getIsServer = function() return true end }
`;

test("shows only live exact-farm claims and never calls the profile writer", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { currentClaimCount: 1 } },
    rows: [{ farmId: 1, claimId: 4, fieldId: 36, workType: "harvest",
      agreedPrice: 1800, areaHa: 3.5, processedAreaHa: 1.25,
      phase: "working" }],
  });
  expect(JSON.stringify(page)).not.toContain("Foreign private job");
  expect(normalizeCompanionPages({ pages: { fieldContractors: page } },
    { modules: loadModules() }).pages.fieldContractors.rows).toHaveLength(1);
});

test("requires exact version, server authority and completed restore", () => {
  expect(runCompanionPage(FILE, GAME.replace('version = "1.5.3.1"',
    'version = "1.5.3.2"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE, GAME.replace('return true end }',
    'return false end }'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-world-not-ready" });
  expect(runCompanionPage(FILE, GAME.replace('persistenceRestoreFinished = true',
    'persistenceRestoreFinished = false'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "claim-register-not-ready" });
});

test("does not treat other farms' claims as current-farm work", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 3 });
  expect(page).toMatchObject({ readState: "settings-only",
    reason: "no-current-farm-claims" });
  expect(page.rows).toEqual({});
});

test("withholds totals for ambiguous or invalid current-farm claims", () => {
  const page = runCompanionPage(FILE,
    GAME.replace('contractProcessedAreaHa = 1.25',
      'contractProcessedAreaHa = 9'), { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial",
    reason: "invalid-or-ambiguous-farm-claim" });
  expect(page.byFarm).toBeUndefined();
});
