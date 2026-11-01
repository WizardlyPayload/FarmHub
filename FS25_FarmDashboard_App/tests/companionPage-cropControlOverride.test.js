"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "CropControlOverrideCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_CropControlOverride = true }
  _G.g_currentMission = { getIsServer = function() return true end }
  _G.FS25_CropControlOverride = { CropControlOverride = {
    VERSION = "2.0.3.6", _configPath = "live-save-policy.xml",
    _rules = {
      WHEAT = { enabled = true, npcAllowed = nil, npcMaxHa = 0,
        resetNpcFields = true, reseedWeight = 5 },
      PEAS = { enabled = true, npcAllowed = false, npcMaxHa = 8.5,
        resetNpcFields = false, reseedWeight = 7 },
      SORGHUM = { enabled = false, npcAllowed = false, npcMaxHa = 0,
        resetNpcFields = true, reseedWeight = 5 },
    },
    applyRules = function() error("must not apply rules") end,
    writeConfig = function() error("must not write settings") end,
  } }
`;

test("reads only nondefault save-wide live crop policy without changing the mod", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ scope: "save-wide", readState: "ok", coverage: "complete",
    ruleCount: 3, changedCount: 2, sourceVersion: "2.0.3.6" });
  expect(page.byFarm).toBeUndefined();
  const otherFarm = runCompanionPage(FILE, SETUP, { farmId: 2 });
  expect(otherFarm.rules).toEqual(page.rules);
  expect(otherFarm.byFarm).toBeUndefined();
  expect(page.rules).toEqual([
    { crop: "PEAS", playerEnabled: true, npcAllowed: false, npcMaxHa: 8.5,
      resetNpcFields: false, reseedWeight: 7 },
    { crop: "SORGHUM", playerEnabled: false, npcAllowed: false,
      resetNpcFields: true, reseedWeight: 5 },
  ]);
  const merged = normalizeCompanionPages({ pages: { cropControlOverride: page } }, { modules: loadModules() });
  expect(merged.pages.cropControlOverride.rules).toHaveLength(2);
});

test("does not call default policy a meaningful change or trust a shadow global", () => {
  const defaults = SETUP.replace(/PEAS = \{[^}]+\},/, "").replace(/SORGHUM = \{[^}]+\},/, "");
  expect(runCompanionPage(FILE, defaults, { farmId: 2 })).toMatchObject({
    scope: "save-wide", readState: "settings-only", reason: "default-rules", changedCount: 0,
  });
  expect(runCompanionPage(FILE, SETUP.replace("_G.FS25_CropControlOverride =", "_G.shadow ="), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "live-policy-unavailable" });
});

test("withholds client state and versions whose rule schema was not reviewed", () => {
  expect(runCompanionPage(FILE, SETUP.replace("return true end", "return false end"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-policy-only" });
  expect(runCompanionPage(FILE, SETUP.replace('VERSION = "2.0.3.6"', 'VERSION = "9.0.0.0"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "version-unreviewed" });
  expect(runCompanionPage(FILE, SETUP.replace('VERSION = "2.0.3.6"', 'VERSION = "2.1.0.0-beta.2"'), { farmId: 1 }))
    .toMatchObject({ readState: "ok", sourceVersion: "2.1.0.0-beta.2" });
  expect(runCompanionPage(FILE, SETUP.replace('_configPath = "live-save-policy.xml"', '_configPath = nil'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "live-policy-unavailable" });
  expect(runCompanionPage(FILE, SETUP.replace(/_rules = \{[\s\S]*?\n    \},\n    applyRules/, '_rules = {},\n    applyRules'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "live-policy-empty" });
});
