"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "ManualPaintCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_369086_FS25_ManualPaint = true }
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      { ownerFarmId = 1, uniqueId = "painted", getFullName = function() return "Owned tractor" end,
        spec_manualPaint = {},
        mpGetColorMap = function() return {
          body = {1, 0.5, 0, "matte"}, wheel = {0, 0.25, 1, "gloss"}
        } end },
      { ownerFarmId = 1, uniqueId = "plain", spec_manualPaint = {},
        mpGetColorMap = function() return {} end },
      { ownerFarmId = 2, uniqueId = "foreign", spec_manualPaint = {},
        mpGetColorMap = function() return { body = {1, 0, 0, "gloss"} } end },
    } } }
`;

test("reads only owned vehicles' saved manual-paint targets", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  if (page?.readState === "failed") throw new Error(JSON.stringify(page));
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { customizedVehicleCount: 1, customizedPartCount: 2 } } });
  expect(page.rows).toHaveLength(1);
  expect(page.rows[0]).toMatchObject({ vehicleId: "painted", vehicle: "Owned tractor",
    partCount: 2, colors: ["#0040FF", "#FF8000"], finishes: ["gloss", "matte"] });
  expect(JSON.stringify(page)).not.toMatch(/foreign|plain/);
  const merged = normalizeCompanionPages({ pages: { manualPaint: page } }, { modules: loadModules() });
  expect(merged.pages.manualPaint.rows).toHaveLength(1);
});

test("withholds client-only and absent-mod states", () => {
  const client = SETUP.replace("getIsServer = function() return true end", "getIsServer = function() return false end");
  expect(runCompanionPage(FILE, client, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-vehicles-only" });
  expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
});

test("does not present an unpainted owned machine as customized", () => {
  const empty = SETUP.replace('body = {1, 0.5, 0, "matte"}, wheel = {0, 0.25, 1, "gloss"}', "");
  const page = runCompanionPage(FILE, empty, { farmId: 1 });
  expect(page).toMatchObject({ readState: "settings-only", reason: "no-custom-owned-vehicles",
    byFarm: { "1": { customizedVehicleCount: 0, customizedPartCount: 0 } } });
  expect(Object.keys(page.rows)).toHaveLength(0);
});
