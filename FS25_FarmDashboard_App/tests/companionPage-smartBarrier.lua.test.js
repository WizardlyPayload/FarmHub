"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "SmartBarrierCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_SmartBarrierPack = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_SmartBarrierPack", version = "1.0.0.0" }
  } end }
  local function site(id, owner, automatic, time, direction, warning)
    return { uniqueId = id,
      getOwnerFarmId = function() return owner end,
      getName = function() return id end,
      spec_smartBarrier = { automatic = automatic,
        scheduleEnabled = true, scheduleStartHour = 8, scheduleEndHour = 18,
        warningTimer = warning,
        animatedObject = { animation = { time = time, direction = direction } },
      },
    }
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    placeableSystem = { placeables = {
      site("own-open", 1, true, 1, 0, -1),
      site("own-closing", 1, false, 0.5, -1, 1000),
      site("foreign", 2, true, 0, 0, -1),
    } } }
`;

test("separates owned saved mode and schedule from live position and warning", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { barrierCount: 2, automaticCount: 1,
      openCount: 1, warningCount: 1 } } });
  expect(page.rows).toEqual([
    expect.objectContaining({ barrierId: "own-closing", automatic: false,
      scheduleEnabled: true, scheduleStartHour: 8, scheduleEndHour: 18,
      position: "partway", warning: true }),
    expect.objectContaining({ barrierId: "own-open", automatic: true,
      position: "open", warning: false }),
  ]);
  expect(JSON.stringify(page)).not.toContain("foreign");
  const merged = normalizeCompanionPages({ pages: { smartBarrier: page } }, { modules: loadModules() });
  expect(merged.pages.smartBarrier.rows).toHaveLength(2);
});

test("withholds duplicate IDs and unreadable owned state", () => {
  const duplicate = runCompanionPage(FILE,
    SETUP.replace('site("own-closing"', 'site("own-open"'), { farmId: 1 });
  expect(duplicate).toMatchObject({ readState: "partial" });
  expect(Object.keys(duplicate.rows)).toHaveLength(0);
  const invalid = runCompanionPage(FILE,
    SETUP.replace('site("own-closing", 1, false, 0.5', 'site("own-closing", 1, false, 1.5'), { farmId: 1 });
  expect(invalid).toMatchObject({ readState: "partial" });
  expect(invalid.rows).toHaveLength(1);
});

test("requires the reviewed version and server state", () => {
  expect(runCompanionPage(FILE,
    SETUP.replace('version = "1.0.0.0"', 'version = "1.0.0.1"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE,
    SETUP.replace('getIsServer = function() return true end', 'getIsServer = function() return false end'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-barrier-state-only" });
});
