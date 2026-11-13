"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "WoodManagerCollector.lua";
const LIVE = `
  _G.g_modIsLoaded = { FS25_347200_Wood_Manager = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_347200_Wood_Manager", version = "1.0.0.0" }
  } end }
  _G.g_currentMission = {
    getIsServer = function() return true end,
    missionInfo = { savegameDirectory = "savegame20" }
  }
  _G.g_server = {}
  _G.g_splitShapeManager = { typesByIndex = {
    [1] = { name = "SPLITWOOD", title = "Split Wood", pricePerLiter = 1.25, woodChipsPerLiter = 0.4 },
    [2] = { name = "SOFTWOOD", title = "Softwood", pricePerLiter = 0.6, woodChipsPerLiter = 0.5 },
  } }
  _G.FS25_347200_Wood_Manager = { woodManager = {
    defaultCaptured = true,
    defaultSplitTypes = {
      [1] = { pricePerLiter = 1.0, woodChipsPerLiter = 0.3 },
      [2] = { pricePerLiter = 0.6, woodChipsPerLiter = 0.5 },
    },
    overrides = {
      [1] = { pricePerLiter = 1.25, woodChipsPerLiter = 0.4 },
      [2] = { pricePerLiter = 0.6, woodChipsPerLiter = 0.5 },
    },
  } }
`;

test("exports applied nondefault wood rules as save-wide settings", () => {
  const page = runCompanionPage(FILE, LIVE, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", scope: "save-wide", overrideCount: 1 });
  expect(page.rows).toEqual([expect.objectContaining({
    splitType: "SPLITWOOD", pricePerLitre: 1.25, defaultPricePerLitre: 1,
    woodChipsPerLitre: 0.4, defaultWoodChipsPerLitre: 0.3,
  })]);
  const merged = normalizeCompanionPages({ pages: { woodManager: page } }, { modules: loadModules() });
  expect(merged.pages.woodManager.overrideCount).toBe(1);
  expect(JSON.stringify(page)).not.toMatch(/farmId|revenue|harvest/);
});

test("withholds unreviewed, nonserver and unapplied values", () => {
  const cases = [
    [LIVE.replace('version = "1.0.0.0"', 'version = "2.0.0.0"'), "unreviewed-version"],
    [LIVE.replace("getIsServer = function() return true end", "getIsServer = function() return false end"), "server-rule-only"],
    [LIVE.replace("_G.g_server = {}", "_G.g_server = nil"), "server-state-unavailable"],
    [LIVE.replace('savegameDirectory = "savegame20"', 'savegameDirectory = ""'), "save-identity-unavailable"],
  ];
  for (const [source, reason] of cases) {
    expect(runCompanionPage(FILE, source, { farmId: 1 })).toMatchObject({
      readState: "settings-only", reason, scope: "save-wide",
    });
  }
  const mismatched = LIVE.replace("[1] = { pricePerLiter = 1.25, woodChipsPerLiter = 0.4 },\n      [2]", "[1] = { pricePerLiter = 1.5, woodChipsPerLiter = 0.4 },\n      [2]");
  expect(runCompanionPage(FILE, mismatched, { farmId: 1 })).toMatchObject({
    readState: "partial", unresolvedCount: 1, overrideCount: 0,
  });
});
