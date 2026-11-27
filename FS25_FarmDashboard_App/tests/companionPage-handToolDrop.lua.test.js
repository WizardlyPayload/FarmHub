"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "HandToolDropCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { KM_82920_Hand_Tool_Drop = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "KM_82920_Hand_Tool_Drop", version = "1.0.0.0" }
  } end }
  _G.KM_82920_Hand_Tool_Drop = { HandToolDrop = {
    SPEC_TABLE_NAME = "spec_KM_82920_Hand_Tool_Drop.handToolDrop" } }
  _G.getWorldTranslation = function(nodeId) return nodeId, 0, -nodeId end
  local specName = "spec_KM_82920_Hand_Tool_Drop.handToolDrop"
  local function tool(id, farm, dropped, node)
    local t = { getUniqueId = function() return id end,
      getOwnerFarmId = function() return farm end,
      getName = function() return "Tool " .. id end }
    local object = node and { nodeId = node, handTool = t,
      getOwnerFarmId = function() return farm end } or nil
    t[specName] = { isDropped = dropped, droppedHandTool = object,
      pendingDropTransform = node and nil or { position = { 999, 0, 999 } } }
    return t
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    handToolSystem = { handTools = {
      tool("owned-drop", 1, true, 42),
      tool("owned-held", 1, false, nil),
      tool("foreign-drop", 2, true, 90),
    } } }
`;

test("reports only this farm's live dropped hand tool, separately from vehicles", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { handToolCount: 2, droppedCount: 1 } } });
  expect(page.rows).toEqual([{ farmId: 1, toolId: "owned-drop",
    tool: "Tool owned-drop", x: 42, z: -42 }]);
  expect(JSON.stringify(page)).not.toContain("foreign-drop");
  const merged = normalizeCompanionPages({ pages: { handToolDrop: page } },
    { modules: loadModules() });
  expect(merged.pages.handToolDrop.rows).toHaveLength(1);
});

test("does not advertise pending restore as a confirmed world object", () => {
  const page = runCompanionPage(FILE,
    SETUP.replace('tool("owned-drop", 1, true, 42)', 'tool("owned-drop", 1, true, nil)'),
    { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial",
    reason: "unresolved-owned-drop" });
  expect(Object.keys(page.rows ?? {})).toHaveLength(0);
  expect(page.byFarm).toBeUndefined();
});

test("withholds totals for duplicate identity and truncation", () => {
  const duplicate = runCompanionPage(FILE,
    SETUP.replace('tool("owned-held", 1, false, nil)', 'tool("owned-drop", 1, true, 43)'),
    { farmId: 1 });
  expect(duplicate).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(Object.keys(duplicate.rows ?? {})).toHaveLength(0);
  expect(duplicate.byFarm).toBeUndefined();

  const many = runCompanionPage(FILE, SETUP + `
    for i = 4, 153 do
      g_currentMission.handToolSystem.handTools[i] = {
        getOwnerFarmId = function() return 2 end }
    end
  `, { farmId: 1 });
  expect(many).toMatchObject({ readState: "partial", coverage: "truncated" });
  expect(many.byFarm).toBeUndefined();
});

test("gates unreviewed version and client-only state", () => {
  expect(runCompanionPage(FILE,
    SETUP.replace('version = "1.0.0.0"', 'version = "1.0.0.1"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE,
    SETUP.replace("getIsServer = function() return true end",
      "getIsServer = function() return false end"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-hand-tool-state-only" });
});
