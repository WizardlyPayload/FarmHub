"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "BhFuelTerminalCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_BH_FuelTerminal_V1 = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_BH_FuelTerminal_V1", version = "1.2.0.0" }
  } end }
  local function terminal(id, owner)
    return { uniqueId = id,
      getOwnerFarmId = function() return owner end,
      getName = function() return id end,
      spec_bhBulkFuelTerminal = {
        ready = true, finalized = true, deleted = false,
        power = true, esd = false,
        tanks = { {open=true}, {open=true}, {open=false},
          {open=true}, {open=true}, {open=true} },
        bays = { {mode=3,loaded=1200,received=800},
          {mode=0,loaded=400,received=100} },
      }
    }
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    placeableSystem = { placeables = {
      terminal("own", 1), terminal("foreign", 2),
    } } }
`;

test("reads only owned terminal controls and native-liter transfer counters", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { terminalCount: 1, loadedLiters: 1600,
      receivedLiters: 900, stoppedCount: 0, esdCount: 0 } } });
  expect(page.rows).toEqual([expect.objectContaining({ terminalId: "own",
    openTanks: 5, power: true, esd: false,
    bays: [{mode: 3, loadedLiters: 1200, receivedLiters: 800},
      {mode: 0, loadedLiters: 400, receivedLiters: 100}] })]);
  expect(JSON.stringify(page)).not.toContain("foreign");
  const merged = normalizeCompanionPages({ pages: { bhFuelTerminal: page } }, { modules: loadModules() });
  expect(merged.pages.bhFuelTerminal.rows).toHaveLength(1);
});

test("withholds duplicate or unreadable owned terminals", () => {
  const duplicate = runCompanionPage(FILE,
    SETUP.replace('terminal("foreign", 2)', 'terminal("own", 1)'), { farmId: 1 });
  expect(duplicate).toMatchObject({ readState: "partial" });
  expect(Object.keys(duplicate.rows)).toHaveLength(0);
  expect(duplicate.byFarm).toBeUndefined();
  const invalid = runCompanionPage(FILE,
    SETUP.replace('{mode=0,loaded=400,received=100}', '{mode=0,loaded=-1,received=100}'),
    { farmId: 1 });
  expect(invalid).toMatchObject({ readState: "partial" });
  expect(Object.keys(invalid.rows)).toHaveLength(0);
  expect(invalid.byFarm).toBeUndefined();
});

test("scan cap withholds full-farm terminal and transfer totals", () => {
  const many = SETUP + `
    local p = _G.g_currentMission.placeableSystem.placeables
    for i = 1, 501 do p[#p + 1] = terminal("foreign" .. i, 2) end
  `;
  const page = runCompanionPage(FILE, many, { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "truncated" });
  expect(page.byFarm).toBeUndefined();
});

test("requires the exact reviewed version and server state", () => {
  expect(runCompanionPage(FILE,
    SETUP.replace('version = "1.2.0.0"', 'version = "1.1.0.0"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE,
    SETUP.replace('getIsServer = function() return true end', 'getIsServer = function() return false end'),
    { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-terminal-state-only" });
});
