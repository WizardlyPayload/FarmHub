"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "LockSteeringAxlesCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_lockSteeringAxles = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_lockSteeringAxles", version = "1.0.0.0" }
  } end }
  local function trailer(id, farm, found, locked)
    return { uniqueId = id, ownerFarmId = farm,
      getFullName = function() return "Trailer " .. id end,
      spec_lockSteeringAxles = { foundSteeringAxle = found, lockSteeringAxle = locked } }
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      trailer("owned-locked", 1, true, true),
      trailer("owned-unlocked", 1, true, false),
      trailer("not-compatible", 1, false, false),
      trailer("foreign", 2, true, true),
    } } }
`;

test("exports current lock state only for compatible owned trailers", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { compatibleTrailerCount: 2, lockedTrailerCount: 1 } } });
  expect(page.rows.find((row) => row.vehicleId === "owned-locked"))
    .toMatchObject({ steeringAxleLocked: true, farmId: 1 });
  expect(JSON.stringify(page)).not.toMatch(/foreign|not-compatible/);
  const merged = normalizeCompanionPages({ pages: { lockSteeringAxles: page } },
    { modules: loadModules() });
  expect(merged.pages.lockSteeringAxles.rows).toHaveLength(2);
});

test("withholds totals on invalid supported state", () => {
  const page = runCompanionPage(FILE,
    SETUP.replace('trailer("owned-unlocked", 1, true, false)',
      'trailer("owned-unlocked", 1, true, nil)'), { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(page.byFarm).toBeUndefined();
});

test("requires reviewed version and server-side state", () => {
  expect(runCompanionPage(FILE,
    SETUP.replace('version = "1.0.0.0"', 'version = "1.1.0.0"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE,
    SETUP.replace('getIsServer = function() return true end',
      'getIsServer = function() return false end'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-trailer-state-only" });
});
