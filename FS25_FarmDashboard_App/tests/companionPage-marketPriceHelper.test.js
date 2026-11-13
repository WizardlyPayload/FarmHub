"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "MarketPriceHelperCollector.lua";
const LIVE = `
  _G.g_modIsLoaded = { FS25_362332_Market_Price_Helper = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_362332_Market_Price_Helper", version = "1.0.0.1" }
  } end }
  _G.g_client = {}
  _G.g_server = {}
  _G.g_currentMission = {
    missionDynamicInfo = { isMultiplayer = false },
    missionInfo = { savegameDirectory = "savegame20" }
  }
  _G.FS25_362332_Market_Price_Helper = {
    g_priceTicker = {
      mission = _G.g_currentMission, isClient = true,
      history = {
        [1] = {
          { price = 0.72, day = 4, hour = 8, period = 2 },
          { price = 0.81, day = 4, hour = 9, period = 2 },
        },
        [2] = { { price = 1.35, day = 4, hour = 9, period = 2 } },
        [3] = { { price = 1.5, day = 0, hour = 9, period = 0 } },
      }
    }
  }
  _G.g_fillTypeManager = { getFillTypeByIndex = function(self, index)
    if index == 1 then return { name = "WHEAT", title = "Wheat" } end
    if index == 2 then return { name = "SORGHUM", title = "Sorghum" } end
    if index == 3 then return { name = "BARLEY", title = "Barley" } end
  end }
`;

test("exports bounded local market observations without assigning sales to a farm", () => {
  const page = runCompanionPage(FILE, LIVE, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", scope: "save-wide",
    priceBasis: "best-station-price-per-litre", fillTypeCount: 2 });
  expect(page.rows).toEqual([
    expect.objectContaining({ fillType: "SORGHUM", latest: { pricePerLitre: 1.35, day: 4, hour: 9, period: 2 }, sampleCount: 1 }),
    expect.objectContaining({ fillType: "WHEAT", latest: { pricePerLitre: 0.81, day: 4, hour: 9, period: 2 }, lowPricePerLitre: 0.72, highPricePerLitre: 0.81, sampleCount: 2 }),
  ]);
  const merged = normalizeCompanionPages({ pages: { marketPriceHelper: page } }, { modules: loadModules() });
  expect(merged.pages.marketPriceHelper.fillTypeCount).toBe(2);
  expect(JSON.stringify(page)).not.toMatch(/farmId|income|stock/);
});

test("withholds remote, missing, unreviewed and foreign-mission histories", () => {
  const cases = [
    [LIVE.replace("isMultiplayer = false", "isMultiplayer = true"), "local-single-player-only"],
    [LIVE.replace("_G.g_server = {}", "_G.g_server = nil"), "local-single-player-only"],
    [LIVE.replace("version = \"1.0.0.1\"", "version = \"2.0.0.0\""), "unreviewed-version"],
    [LIVE.replace("mission = _G.g_currentMission", "mission = {}"), "local-history-unavailable"],
    [LIVE.replace('savegameDirectory = "savegame20"', 'savegameDirectory = ""'), "save-identity-unavailable"],
  ];
  for (const [source, reason] of cases) {
    expect(runCompanionPage(FILE, source, { farmId: 1 })).toMatchObject({ readState: "settings-only", reason, scope: "save-wide" });
  }
});

test("recognizes an FS25_PriceTicker staging alias of the reviewed bytes", () => {
  const source = LIVE.replaceAll("FS25_362332_Market_Price_Helper", "FS25_PriceTicker");
  expect(runCompanionPage(FILE, source, { farmId: 1 })).toMatchObject({
    readState: "ok", fillTypeCount: 2, modName: "FS25_PriceTicker",
  });
});
