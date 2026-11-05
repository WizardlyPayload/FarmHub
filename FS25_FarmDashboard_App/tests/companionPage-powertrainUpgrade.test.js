"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "PowertrainUpgradeCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_PowertrainUpgrade = true }
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      { ownerFarmId = 1, uniqueId = "tuned", getFullName = function() return "Owned tractor" end,
        configurations = { ptuPower = 2, ptuSpeed = 4 },
        spec_ptuUpgrade = { base = {}, powerLevel = 2, speedLevel = 4, speedWasCapped = false } },
      { ownerFarmId = 1, uniqueId = "stock", getFullName = function() return "Owned stock motor" end,
        configurations = { ptuPower = 1, ptuSpeed = 1 },
        spec_ptuUpgrade = { base = {}, powerLevel = 1, speedLevel = 1 } },
      { ownerFarmId = 2, uniqueId = "foreign", configurations = { ptuPower = 7, ptuSpeed = 7 },
        spec_ptuUpgrade = { base = {}, powerLevel = 7, speedLevel = 7 } },
      { ownerFarmId = 1, uniqueId = "mismatch", configurations = { ptuPower = 7, ptuSpeed = 7 },
        spec_ptuUpgrade = { base = {}, powerLevel = 1, speedLevel = 1 } },
    } } }
`;

test("separates native selected levels from observed mod levels", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "complete",
    byFarm: { "1": { motorCount: 3, upgradedCount: 2 } },
    diagnostics: { nativeSelectionCount: 3, runtimeBaseCount: 3, unverifiedSelectionCount: 1 } });
  expect(page.rows.find((row) => row.vehicleId === "tuned"))
    .toMatchObject({ powerLevel: 2, powerFactor: 1.25, speedLevel: 4, speedFactor: 2, modStateMatched: true });
  expect(page.rows.find((row) => row.vehicleId === "mismatch"))
    .toMatchObject({ powerLevel: 7, speedLevel: 7, modStateMatched: false });
  expect(JSON.stringify(page)).not.toMatch(/foreign|horsepower|paid/);
  const merged = normalizeCompanionPages({ pages: { powertrainUpgrade: page } }, { modules: loadModules() });
  expect(merged.pages.powertrainUpgrade.rows).toHaveLength(3);
});

test("reads one non-stock native key with the other defaulting to Stock", () => {
  const oneKey = SETUP.replace("ptuPower = 2, ptuSpeed = 4", "ptuPower = 2")
    .replace("powerLevel = 2, speedLevel = 4", "powerLevel = 2, speedLevel = 1");
  const page = runCompanionPage(FILE, oneKey, { farmId: 1 });
  expect(page.rows.find((row) => row.vehicleId === "tuned"))
    .toMatchObject({ powerLevel: 2, speedLevel: 1, modStateMatched: true });
});

test("keeps an owned native selection when transient mod state is unavailable", () => {
  const withoutSpec = SETUP.replace(
    "spec_ptuUpgrade = { base = {}, powerLevel = 2, speedLevel = 4, speedWasCapped = false }",
    "spec_ptuUpgrade = nil"
  );
  const page = runCompanionPage(FILE, withoutSpec, { farmId: 1 });
  expect(page.rows.find((row) => row.vehicleId === "tuned"))
    .toMatchObject({ powerLevel: 2, speedLevel: 4, modStateMatched: false });
  expect(page.readState).toBe("partial");
});

test("withholds client state and absent mod", () => {
  const client = SETUP.replace("getIsServer = function() return true end", "getIsServer = function() return false end");
  expect(runCompanionPage(FILE, client, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-vehicle-state-only" });
  expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
});
