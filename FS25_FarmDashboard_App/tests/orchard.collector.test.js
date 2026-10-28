"use strict";

const fs = require("fs");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");

const source = fs.readFileSync(path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src/collectors/OrchardDataCollector.lua"), "utf8");

test("base and DLC orchards export owner, row geometry and only supported growth detail", () => {
  const L = lauxlib.luaL_newstate();
  try {
    lualib.luaL_openlibs(L);
    const script = `
local host = { g_time = 100 }
host.g_fruitTypeManager = { getFruitTypeByIndex=function(_, index)
  return {name=({[1]="GRAPE",[2]="OLIVE",[3]="BANANA",[4]="COFFEECHERRIES"})[index], sickReplacements=index == 4 and {[7]=4} or nil}
end }
local env = setmetatable({}, { __index=function(_, key) return host[key] or _G[key] end })
env._G = env
assert(rawget(env, "g_fruitTypeManager") == nil)
assert(load([=[${source}]=], "=OrchardDataCollector.lua", "t", env))()
local grape = {id=101, spec_vine={}, spec_fence={segments={{x1=0,z1=0,x2=0,z2=10}}}, getVineFruitTypeIndex=function() return 1 end,
 getOwnerFarmId=function() return 1 end,
 getHasSegmentTargetGrowthState=function(_,_,_,harvest,prepare) return harvest and not prepare end}
local olive = {id=102, spec_vine={}, spec_fence={segments={{x1=0,z1=0,x2=10,z2=0}}}, getVineFruitTypeIndex=function() return 2 end,
 getOwnerFarmId=function() return 1 end,
 getHasSegmentTargetGrowthState=function() return false end}
local banana = {id=103, getVineFruitTypeIndex=function() return 3 end,
 getOwnerFarmId=function() return 0 end,
 getFence=function() return {segments={{startPosX=0,startPosZ=0,endPosX=0,endPosZ=5}}} end,
 getHasSegmentTargetGrowthState=function() return false end}
local coffeeNode = {growthValues={{values={[7]=3,[4]=0}}}}
local coffeeFence = {segments={{startPosX=0,startPosZ=0,endPosX=0,endPosZ=8,
 vineNodes={[101]=coffeeNode},getHasTargetGrowthState=function(_,_,harvest) return harvest end}}}
local coffee = {id=104, getVineFruitTypeIndex=function() return 4 end,
 getOwnerFarmId=function() return 0 end,
 getFence=function() return coffeeFence end,
 getHasSegmentTargetGrowthState=function(_,_,_,harvest) return harvest end}
local mission = {placeableSystem={placeables={grape,olive,banana,coffee}},vineSystem={dirtyNodes={}}}
local result = env.OrchardDataCollector.collect(mission)
assert(result.available and #result.rows == 4)
local byFruit = {}
for _, row in ipairs(result.rows) do byFruit[row.fruitType]=row end
assert(byFruit.GRAPE.farmId == 1 and byFruit.GRAPE.rowLengthMeters == 10)
assert(byFruit.GRAPE.growthMeasured and byFruit.GRAPE.readyRows == 1)
assert(byFruit.OLIVE.rows == 1 and byFruit.OLIVE.readyRows == 0)
assert(byFruit.BANANA.farmId == 0 and not byFruit.BANANA.growthMeasured and byFruit.BANANA.readyRows == nil)
assert(byFruit.COFFEECHERRIES.growthMeasured and byFruit.COFFEECHERRIES.readyRows == 1)
assert(byFruit.COFFEECHERRIES.diseaseMeasured and byFruit.COFFEECHERRIES.sickRows == 1, "curable coffee sickness")
-- Buying the land does not necessarily change a map-created placeable's owner.
host.g_farmlandManager = {getOwnerIdAtWorldPosition=function(_, x, z)
  return z >= 4 and 1 or 0
end}
local afterPurchase = env.OrchardDataCollector.collect(mission)
local afterByFruit = {}
for _, row in ipairs(afterPurchase.rows) do afterByFruit[row.fruitType] = row end
assert(afterByFruit.COFFEECHERRIES.farmId == 1 and afterByFruit.COFFEECHERRIES.landOwnershipComplete,
  "coffee map orchard follows the bought farmland")
assert(afterByFruit.BANANA.farmId == 0, "unbought banana land stays unowned")
local split = {id=106,getVineFruitTypeIndex=function() return 4 end,
 getOwnerFarmId=function() return 0 end,
 getFence=function() return {segments={
   {startPosX=0,startPosZ=0,endPosX=0,endPosZ=2},
   {startPosX=0,startPosZ=6,endPosX=0,endPosZ=8},
 }} end}
local splitRow = env.OrchardDataCollector.collect({placeableSystem={placeables={split}}}).rows[1]
assert(splitRow.farmId == 0 and splitRow.landOwnershipComplete
  and splitRow.landOwnerFarmIds[1] == 0 and splitRow.landOwnerFarmIds[2] == 1,
  "mixed parcels must not be presented as wholly owned")
host.g_farmlandManager = nil
mission.vineSystem.dirtyNodes[999] = true
local unrelated = env.OrchardDataCollector.collect(mission)
for _, row in ipairs(unrelated.rows) do
  if row.fruitType == "COFFEECHERRIES" then
    assert(row.diseaseMeasured and row.sickRows == 1, "unrelated dirty nodes do not hide coffee data")
  end
end
mission.vineSystem.dirtyNodes[999] = nil
mission.vineSystem.dirtyNodes[101] = true
local updating = env.OrchardDataCollector.collect(mission)
for _, row in ipairs(updating.rows) do
  if row.fruitType == "COFFEECHERRIES" then
    assert(row.diseaseMeasured == false and row.sickRows == nil, "dirty growth cache stays unknown")
  end
end
mission.vineSystem.dirtyNodes[101] = nil
coffeeNode.growthValues[1].values[7] = 0
local healthy = env.OrchardDataCollector.collect(mission)
for _, row in ipairs(healthy.rows) do
  if row.fruitType == "COFFEECHERRIES" then
    assert(row.diseaseMeasured and row.sickRows == 0, "cache refreshed after dirty node")
  end
end
local manySegments = {}
for i=1,208 do
  local nodes = {}
  for j=1,12 do
    nodes[i*100+j] = {growthValues={{values={[7]=(i == 208 and j == 12) and 1 or 0}}}}
  end
  manySegments[i] = {startPosX=0,startPosZ=i,endPosX=0,endPosZ=i+1,vineNodes=nodes,
    getHasTargetGrowthState=function() return false end}
end
local largeCoffee = {id=105,getVineFruitTypeIndex=function() return 4 end,
 getOwnerFarmId=function() return 0 end,
 getFence=function() return {segments=manySegments} end,
 getHasSegmentTargetGrowthState=function() return false end}
local largeMission = {placeableSystem={placeables={largeCoffee}},vineSystem={}}
host.g_farmlandManager = {getOwnerIdAtWorldPosition=function()
  return 1
end}
local partial = env.OrchardDataCollector.collect(largeMission)
assert(partial.rows[1].farmId == 1 and partial.rows[1].landOwnershipComplete
  and #partial.rows[1].landOwnerFarmIds == 1,
  "all 208 rows of a map-spanning orchard follow their purchased land")
host.g_farmlandManager = nil
assert(partial.rows[1].diseaseScanning and not partial.rows[1].diseaseMeasured,
  "large coffee orchard progresses without a dirtyNodes table")
host.g_time = 60101
local complete = env.OrchardDataCollector.collect(largeMission)
assert(complete.rows[1].diseaseMeasured and complete.rows[1].sickRows == 1,
  "bounded scan survives row-cache expiry and completes across collections")
local baseOnly = env.OrchardDataCollector.collect({placeableSystem={placeables={grape,olive}}})
assert(baseOnly.available and #baseOnly.rows == 2)
assert(baseOnly.rows[1].fruitType == "GRAPE" and baseOnly.rows[2].fruitType == "OLIVE")
local many = {}
for i=1,129 do many[i] = grape end
local limited = env.OrchardDataCollector.collect({placeableSystem={placeables=many}})
assert(#limited.rows == 128 and limited.truncated == true, "limited export is visibly incomplete")
return "ok"
`;
    const status = lauxlib.luaL_dostring(L, to_luastring(script));
    if (status !== lua.LUA_OK) throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
    expect(to_jsstring(lua.lua_tostring(L, -1))).toBe("ok");
  } finally {
    lua.lua_close(L);
  }
});
