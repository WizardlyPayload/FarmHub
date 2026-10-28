"use strict";

const fs = require("fs");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");

const source = fs.readFileSync(
  path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src/collectors/EmergencyPackDataCollector.lua"),
  "utf8"
);

function runLua(body) {
  const L = lauxlib.luaL_newstate();
  try {
    lualib.luaL_openlibs(L);
    const script = `
local env = setmetatable({}, { __index = _G })
env._G = env
assert(load([=[${source}]=], "=EmergencyPackDataCollector.lua", "t", env))()
local collect = env.EmergencyPackDataCollector.collect
${body}
return "ok"
`;
    const status = lauxlib.luaL_dostring(L, to_luastring(script));
    if (status !== lua.LUA_OK) throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
    expect(to_jsstring(lua.lua_tostring(L, -1))).toBe("ok");
  } finally {
    lua.lua_close(L);
  }
}

test("reports only the host farm's DLC running or pending scenario", () => {
  runLua(`
local mission = {
  getIsServer=function() return true end,
  getFarmId=function() return 1 end,
}
local private = { farmId=2, id=2, targetPosition={99,0,88}, description="other farm" }
mission.rolePlay = {
  mission=mission, isServer=true,
  scenarioReferences={ {type="fire"}, {type="tree"}, {type="oilSpill"} },
  runningScenarios={ [1]={farmId=1,id=1,targetPosition={1,2,3},description="private"}, [2]=private },
  pendingScenarios={ [1]={farmId=1,id=3} },
  stateMachines={ [1]={getCurrentState=function() return {id=2} end} },
}
local result = collect(mission, {{farmId=1,isPlayer=true},{farmId=2,isPlayer=true}})
assert(result.enabled and result.authoritative and result.farmId == 1)
assert(result.incident.status == "running" and result.incident.type == "fire")
assert(result.incident.targetPosition == nil and result.incident.description == nil)
assert(result.byFarm == nil and result[2] == nil)
mission.rolePlay.runningScenarios[1] = nil
result = collect(mission, {{farmId=1,isPlayer=true},{farmId=2,isPlayer=true}})
assert(result.incident.status == "pending" and result.incident.type == "oilSpill")
mission.rolePlay.pendingScenarios[1] = nil
result = collect(mission, {{farmId=1,isPlayer=true},{farmId=2,isPlayer=true}})
assert(result.incident.status == "none" and result.incident.type == nil)
`);
});

test("headless multi-farm server and client do not publish other farms' incidents", () => {
  runLua(`
local mission = { getIsServer=function() return true end, getFarmId=function() return nil end }
mission.rolePlay = {
  mission=mission, isServer=true,
  scenarioReferences={{type="fire"}},
  runningScenarios={ [2]={farmId=2,id=1} }, pendingScenarios={},
  stateMachines={ [2]={getCurrentState=function() return {id=2} end} },
}
local result = collect(mission, {{farmId=1,isPlayer=true},{farmId=2,isPlayer=true}})
assert(result.enabled and not result.authoritative and result.incident == nil and result.farmId == nil)
mission.getIsServer = function() return false end
result = collect(mission, {{farmId=2,isPlayer=true}})
assert(result.enabled and not result.authoritative and result.incident == nil)
mission.getIsServer = function() return true end
result = collect(mission, {{farmId=2,isPlayer=true}})
assert(result.authoritative and result.farmId == 2 and result.incident.status == "running")
`);
});

test("fails closed for missing, foreign, malformed or uncertain incident state", () => {
  runLua(`
assert(collect({}, {{farmId=1,isPlayer=true}}).enabled == false)
local mission = { getIsServer=function() return true end, getFarmId=function() return 1 end }
mission.rolePlay = { mission=mission, isServer=true,
  runningScenarios={ [1]={farmId=2,id=1} }, pendingScenarios={},
  stateMachines={ [1]={getCurrentState=function() return {id=2} end} },
  scenarioReferences={{type="fire"}} }
local result = collect(mission, {{farmId=1,isPlayer=true}})
assert(result.enabled and not result.authoritative and result.incident == nil)
mission.rolePlay.runningScenarios[1] = {farmId=1,id=1}
mission.rolePlay.scenarioReferences[1].type = "customPrivateScenario"
result = collect(mission, {{farmId=1,isPlayer=true}})
assert(result.authoritative and result.incident.status == "running" and result.incident.type == nil)
mission.rolePlay.stateMachines[1].getCurrentState = function() return {id=3} end
result = collect(mission, {{farmId=1,isPlayer=true}})
assert(result.authoritative and result.incident.status == "closing", "stop grace is not active work")
mission.rolePlay.stateMachines[1] = nil
result = collect(mission, {{farmId=1,isPlayer=true}})
assert(not result.authoritative and result.incident == nil, "no state machine means unknown")
mission.rolePlay.runningScenarios = nil
result = collect(mission, {{farmId=1,isPlayer=true}})
assert(not result.authoritative and result.incident == nil)
mission.rolePlay.runningScenarios = {}
mission.getFarmId = function() error("unavailable") end
result = collect(mission, {{farmId=1,isPlayer=true},{farmId=2,isPlayer=true}})
assert(not result.authoritative and result.farmId == nil)
`);
});
