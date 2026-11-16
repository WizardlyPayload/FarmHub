"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "CropInsuranceCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { KM_82103_Crop_Insurance = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "KM_82103_Crop_Insurance", version = "1.0.0.0" }
  } end }
  _G.g_currentMission = { getFarmId = function() return 1 end,
    getIsServer = function() return true end }
  _G.KM_82103_Crop_Insurance = { CropInsurance = {
    policies = {
      [36] = { farmId = 1, fruitType = "WHEAT", premiumPaid = 128.45,
        hectares = 2.5, coverageRatio = 0.8, purchaseDay = 3, purchaseYear = 2,
        insuranceYear = 2, pendingClaim = { eventName = "HAIL", severity = 0.7, detectedDay = 8 } },
      [40] = { farmId = 2, fruitType = "BARLEY", premiumPaid = 220,
        hectares = 4, coverageRatio = 0.8 },
      [41] = { farmId = 1, fruitType = "CORN", premiumPaid = -1,
        hectares = 4, coverageRatio = 0.8 },
    },
    history = {
      { farmId = 1, fieldId = 18, fruitType = "OAT", premiumPaid = 80,
        outcome = "claim", indemnity = 300, endDay = 20, eventName = "HAIL" },
      { farmId = 2, fieldId = 40, fruitType = "BARLEY", outcome = "claim", indemnity = 999 },
      { farmId = 1, fieldId = 19, outcome = "invalid", indemnity = 500 },
    },
  } }
`;

test("reads only farm-owned recorded policy and retained outcome without estimating payout", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial",
    byFarm: { "1": { policyCount: 1, pendingCount: 1, historyCount: 1 } } });
  expect(page.policies).toEqual([expect.objectContaining({ farmId: 1, fieldId: 36,
    crop: "WHEAT", premiumPaid: 128.45, coveragePercent: 80,
    pendingEvent: "HAIL", pendingSeverityPercent: 70 })]);
  expect(page.history).toEqual([expect.objectContaining({ farmId: 1, fieldId: 18,
    outcome: "claim", indemnity: 300 })]);
  expect(JSON.stringify(page)).not.toMatch(/BARLEY|999|500|estimated|expected/);
  const merged = normalizeCompanionPages({ pages: { cropInsurance: page } }, { modules: loadModules() });
  expect(merged.pages.cropInsurance.policies).toHaveLength(1);
  expect(merged.pages.cropInsurance.history).toHaveLength(1);
});

test("withholds client and unbound policy register", () => {
  const client = SETUP.replace("getIsServer = function() return true end", "getIsServer = function() return false end");
  expect(runCompanionPage(FILE, client, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-policies-only" });
  const shadow = SETUP.replace("_G.KM_82103_Crop_Insurance = { CropInsurance = {", "_G.shadow = { CropInsurance = {");
  expect(runCompanionPage(FILE, shadow, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "no-policy-register" });
});

test("withholds policy data from an unreviewed Crop Insurance version", () => {
  const newer = SETUP.replace('version = "1.0.0.0"', 'version = "9.9.9.9"');
  expect(runCompanionPage(FILE, newer, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
});

test("reports an empty authoritative register as an empty reading", () => {
  const empty = SETUP.replace(/policies = \{[\s\S]*?\n    \},\n    history = \{[\s\S]*?\n    \},/, "policies = {}, history = {},");
  expect(runCompanionPage(FILE, empty, { farmId: 1 })).toMatchObject({
    readState: "ok", coverage: "complete",
    byFarm: { "1": { policyCount: 0, pendingCount: 0, historyCount: 0 } },
  });
});
