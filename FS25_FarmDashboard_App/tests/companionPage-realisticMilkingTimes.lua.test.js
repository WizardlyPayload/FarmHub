"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "RealisticMilkingTimesCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_303654_Realistic_Milking_Times = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_303654_Realistic_Milking_Times", version = "1.0.0.0" }
  } end }
  local function pen(id, farm, buffer, hasMilk)
    return { uniqueId = id, ownerFarmId = farm,
      getName = function() return "Barn " .. id end,
      spec_husbandryMilk = hasMilk and {} or nil,
      spec_husbandry = { RDM_RealisticMilkingTimeFillLevel = buffer } }
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    placeableSystem = { placeables = {
      pen("owned-a", 1, 123.5, true), pen("owned-b", 1, 0, true),
      pen("foreign", 2, 90, true), pen("sheep", 1, 80, false),
    } } }
`;

test("reports mod-held milk from exact owned dairy pens, retaining zero", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { penCount: 2, pendingLitres: 123.5 } } });
  expect(page.rows.find((row) => row.placeableId === "owned-b"))
    .toMatchObject({ pendingLitres: 0 });
  expect(JSON.stringify(page)).not.toMatch(/foreign|sheep/);
  const merged = normalizeCompanionPages({ pages: { realisticMilkingTimes: page } },
    { modules: loadModules() });
  expect(merged.pages.realisticMilkingTimes.rows).toHaveLength(2);
});

test("withholds totals for malformed milk buffer or duplicate pen identity", () => {
  for (const altered of [
    SETUP.replace('"owned-a", 1, 123.5', '"owned-a", 1, -1'),
    SETUP.replace('"owned-b", 1, 0', '"owned-a", 1, 0'),
  ]) {
    const page = runCompanionPage(FILE, altered, { farmId: 1 });
    expect(page).toMatchObject({ readState: "partial", coverage: "partial" });
    expect(page.byFarm).toBeUndefined();
  }
});

test("gates unreviewed version and client state", () => {
  expect(runCompanionPage(FILE,
    SETUP.replace('version = "1.0.0.0"', 'version = "1.0.1.0"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE,
    SETUP.replace("getIsServer = function() return true end",
      "getIsServer = function() return false end"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-husbandry-state-only" });
});
