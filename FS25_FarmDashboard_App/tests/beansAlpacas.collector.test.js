"use strict";

const fs = require("fs");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");

const source = fs.readFileSync(path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src/collectors/BeansAlpacasDataCollector.lua"), "utf8");

test("optional DLC snapshot reports live settings, farm workers and spoiler-free discovery counts", () => {
  const L = lauxlib.luaL_newstate();
  try {
    lualib.luaL_openlibs(L);
    const script = `
local env = setmetatable({}, { __index=_G })
env._G = env
env.g_fruitTypeManager = { getFruitTypeByIndex=function(_, index)
  return { name=({[11]="COFFEECHERRIES",[12]="BANANA"})[index] }
end }
assert(load([=[${source}]=], "=BeansAlpacasDataCollector.lua", "t", env))()
local c = env.BeansAlpacasDataCollector
assert(c.collect({}, 1).enabled == false)
local mission = {
  missionInfo={mapId="pdlc_beansAndAlpacasPack.beansAndAlpacasMap"},
  bananaRailSystem={workerManager={maxNumWorkers=20, actionsPerWorkerPerDay=120,
    costPerWorkerPerDay=200, getNumWashingStations=function() return 1 end,
    getNumWorkers=function(_,id) return id == 1 and 2 or 1 end,
    getFarmState=function(_,id) return {actionsUsedToday=id == 1 and 5 or 0} end,
    getTotalBananaPlantCount=function() return 12 end,
    getInReachPlantCount=function() return 8 end,
    getEstimatedDailyDemand=function() return 24 end}},
  orchardDiseaseSettings={getDiseaseEnabled=function() return true end},
  frostDamageSettings={getFrostDamageEnabled=function() return false end},
  frostDamageSystem={isServer=true,pendingFrostByFruit={[11]=true,[12]=false}},
  placeableSystem={placeables={
    {getIsBananaWashingStation=function() return true end, getOwnerFarmId=function() return 1 end,
      getFreeBananaCapacity=function() return 1500 end, getAvailableBananaCapacity=function() return 900 end},
    {getIsBananaWashingStation=function() return true end, getOwnerFarmId=function() return 2 end,
      getFreeBananaCapacity=function() return 200 end, getAvailableBananaCapacity=function() return 100 end},
  }},
  collectiblesSystem={collectibles={a={index=1},b={index=2,uncovered=true},c={index=3}},
    collected={[1]=true,[2]=false,[3]=false}},
}
local result = c.collect(mission, {{farmId=1},{farmId=2}})
assert(result.enabled and result.catuaiMap, "DLC active")
assert(result.workersByFarm["1"].count == 2 and result.workersByFarm["1"].actionsRemainingToday == 235, "workers")
assert(result.workersByFarm["1"].washingStations == 1, "wash station")
assert(result.workersByFarm["2"].count == 1 and result.workersByFarm["2"].actionsRemainingToday == 120, "second farm")
assert(result.workersByFarm["1"].bananaPlants == 12 and result.workersByFarm["1"].plantsInWorkerReach == 8, "banana plants")
assert(result.washingCapacityByFarm["1"].freeLitres == 1500 and result.washingCapacityByFarm["1"].availableLitres == 900, "reserved capacity")
assert(result.washingCapacityByFarm["2"].availableLitres == 100, "farm isolation")
assert(result.orchardDiseaseEnabled == true and result.frostDamageEnabled == false, "settings")
assert(result.frostPendingKnown == true and #result.frostPendingFruitTypes == 1 and result.frostPendingFruitTypes[1] == "COFFEECHERRIES", "authoritative pending frost")
assert(result.collectibles.total == 3 and result.collectibles.found == 1 and result.collectibles.uncovered == 1, "discoveries")
assert(result.collectibles[1] == nil, "no discovery coordinates")
table.insert(mission.placeableSystem.placeables, {
  getIsBananaWashingStation=function() return true end, getOwnerFarmId=function() return 1 end,
  getFreeBananaCapacity=function() error("unavailable") end,
  getAvailableBananaCapacity=function() return 0 end,
})
local partial = c.collect(mission, {{farmId=1}})
assert(partial.washingCapacityByFarm["1"].stationCount == 2 and partial.washingCapacityByFarm["1"].availableLitres == nil, "partial measurement stays unknown")
mission.frostDamageSystem.isServer = false
local client = c.collect(mission, {{farmId=1}})
assert(client.frostPendingKnown == nil and client.frostPendingFruitTypes == nil, "client empty state is not a clear forecast")
return "ok"
`;
    const status = lauxlib.luaL_dostring(L, to_luastring(script));
    if (status !== lua.LUA_OK) throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
    expect(to_jsstring(lua.lua_tostring(L, -1))).toBe("ok");
  } finally {
    lua.lua_close(L);
  }
});
