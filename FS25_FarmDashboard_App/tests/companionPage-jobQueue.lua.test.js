"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "JobQueueCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { KM_82197_Job_Queue = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "KM_82197_Job_Queue", version = "1.0.0.0" }
  } end }
  local function machine(id, owner, firstField)
    return { uniqueId = id, getOwnerFarmId = function() return owner end,
      getFullName = function() return id end,
      jobQueue = { isRunning = true, pendingStart = false,
        waitReason = nil, activeEntry = { jobType = "FIELDWORK", fieldId = firstField },
        entries = { { jobType = "GOTO", x = 162, z = -24 } } } }
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      machine("owned", 1, 36), machine("foreign", 2, 91)
    } } }
`;

test("exports one owned vehicle's unfinished ordered plan, not another farm's", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { vehicleCount: 1, entryCount: 2, armedCount: 1 } } });
  expect(page.rows).toEqual([
    expect.objectContaining({ vehicleId: "owned", position: 1, current: true,
      jobType: "FIELDWORK", fieldId: 36, running: true }),
    expect.objectContaining({ vehicleId: "owned", position: 2, current: false,
      jobType: "GOTO", x: 162, z: -24, running: true }),
  ]);
  expect(page.rows[0]).not.toHaveProperty("waitReason");
  expect(page.rows[1]).not.toHaveProperty("waitReason");
  expect(JSON.stringify(page)).not.toContain("foreign");
  const merged = normalizeCompanionPages({ pages: { jobQueue: page } }, { modules: loadModules() });
  expect(merged.pages.jobQueue.rows).toHaveLength(2);
});

test("applies a pending refill wait only to the first queued entry", () => {
  const waiting = runCompanionPage(FILE,
    SETUP.replace('pendingStart = false', 'pendingStart = true')
      .replace('waitReason = nil', 'waitReason = "REFILL"')
      .replace('activeEntry = { jobType = "FIELDWORK", fieldId = firstField }',
        'activeEntry = nil'), { farmId: 1 });
  expect(waiting).toMatchObject({ readState: "ok", coverage: "complete" });
  expect(waiting.rows).toHaveLength(1);
  expect(waiting.rows[0]).toMatchObject({ current: false, position: 1,
    jobType: "GOTO", waitReason: "REFILL" });
});

test("withholds totals for malformed entries and repeated vehicle IDs", () => {
  const malformed = runCompanionPage(FILE,
    SETUP.replace('firstField },', '0 },'), { farmId: 1 });
  expect(malformed).toMatchObject({ readState: "partial", coverage: "partial",
    reason: "invalid-queue-state" });
  expect(malformed.byFarm["1"]).not.toHaveProperty("entryCount");
  expect(malformed.rows).toHaveLength(1);
  const duplicate = runCompanionPage(FILE,
    SETUP.replace('machine("foreign", 2, 91)', 'machine("owned", 1, 91)'), { farmId: 1 });
  expect(duplicate).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(Object.keys(duplicate.rows)).toHaveLength(0);
});

test("gates unreviewed version, client and absent mod", () => {
  expect(runCompanionPage(FILE,
    SETUP.replace('version = "1.0.0.0"', 'version = "1.0.0.1"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE,
    SETUP.replace('getIsServer = function() return true end',
      'getIsServer = function() return false end'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-queue-state-only" });
  expect(runCompanionPage(FILE, '_G.g_modIsLoaded = {}', { farmId: 1 })).toBeUndefined();
});
