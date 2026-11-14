"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "ManualAttachCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { FS25_340627_FS25_manualAttach = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_340627_FS25_manualAttach", version = "1.1.0.0" }
  } end }
  _G["FS25_340627_FS25_manualAttach"] = {
    PowerTakeOffExtension = {
      hasPowerTakeOffs = function(implement, parent) return implement.hasPto end,
      hasAttachedPowerTakeOffs = function(implement, parent) return implement.ptoConnected end,
    },
    ConnectionHosesExtension = {
      hasConnectionHoses = function(implement, parent) return implement.hasHoses end,
      hasAttachedConnectionHoses = function(implement) return implement.hosesConnected end,
    },
  }
  local function vehicle(id, owner, hasPto, ptoConnected, hasHoses, hosesConnected, parentOwner)
    local parent = { ownerFarmId = parentOwner or 1,
      getFullName = function() return "Owned Tractor" end }
    return { uniqueId = id, ownerFarmId = owner, hasPto = hasPto, ptoConnected = ptoConnected,
      hasHoses = hasHoses, hosesConnected = hosesConnected,
      spec_manualAttachPowerTakeOff = {}, spec_manualAttachConnectionHoses = {},
      getAttacherVehicle = function() return parent end,
      getFullName = function(self) return self.uniqueId end }
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      vehicle("ready", 1, true, true, true, true),
      vehicle("needs-pto", 1, true, false, true, true),
      vehicle("foreign-secret", 2, true, false, true, false),
      vehicle("foreign-parent", 1, true, false, true, false, 2),
      vehicle("no-connections", 1, false, false, false, false),
    } } }
`;

test("reads only owned attached implement connections and preserves false states", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { implementCount: 2, connectedCount: 1, needsConnectionCount: 1 } } });
  expect(page.rows.find((row) => row.vehicleId === "needs-pto"))
    .toMatchObject({ pto: false, hoses: true, attachedTo: "Owned Tractor" });
  expect(JSON.stringify(page)).not.toMatch(/foreign-secret|foreign-parent|no-connections/);
  const merged = normalizeCompanionPages({ pages: { manualAttach: page } }, { modules: loadModules() });
  expect(merged.pages.manualAttach.rows).toHaveLength(2);
});

test("withholds an owned implement attached to a parent with unknown ownership", () => {
  const unknownParent = GAME.replace("ownerFarmId = parentOwner or 1,", "ownerFarmId = nil,");
  const page = runCompanionPage(FILE, unknownParent, { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial",
    byFarm: { "1": { implementCount: 0, connectedCount: 0, needsConnectionCount: 0 } } });
  expect(page.rows).toEqual({});
});

test("does not interpret an unreviewed Manual Attach version", () => {
  const newer = GAME.replace('version = "1.1.0.0"', 'version = "1.2.0.0"');
  const page = runCompanionPage(FILE, newer, { farmId: 1 });
  expect(page).toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(page.rows).toBeUndefined();
});

test("withholds client state and unavailable helper state", () => {
  const client = GAME.replace("getIsServer = function() return true end", "getIsServer = function() return false end");
  expect(runCompanionPage(FILE, client, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-vehicle-state-only" });
  const unavailable = GAME.replace("PowerTakeOffExtension = {", "PowerTakeOffExtension = nil,\n    unused = {");
  expect(runCompanionPage(FILE, unavailable, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "manual-attach-state-unavailable" });
  const brokenCheck = GAME.replace("hasPowerTakeOffs = function(implement, parent) return implement.hasPto end,", "");
  expect(runCompanionPage(FILE, brokenCheck, { farmId: 1 }))
    .toMatchObject({ readState: "partial" });
});
