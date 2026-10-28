"use strict";

const fs = require("fs");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");

const source = fs.readFileSync(path.resolve(__dirname,
  "../../FS25_FarmDashboard_Mod/src/collectors/PumpsAndHosesDataCollector.lua"), "utf8");

function runLua(body) {
  const L = lauxlib.luaL_newstate();
  try {
    lualib.luaL_openlibs(L);
    const script = `
local env = setmetatable({}, { __index = _G })
env._G = env
assert(load([=[${source}]=], "=PumpsAndHosesDataCollector.lua", "t", env))()
local collector = env.PumpsAndHosesDataCollector
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

test("absent DLC and client do not read vehicle state", () => {
  runLua(`
assert(collector.collect({}, {}).enabled == false)
local reads = 0
local client = collector.collect({ pumpsAndHoses = {},
    getIsServer = function() return false end,
    vehicleSystem = { vehicles = { setmetatable({}, { __index = function()
        reads = reads + 1; error("client read") end }) } }
}, {{ farmId = 1, isPlayer = true }})
assert(client.enabled and client.authoritative == false)
assert(client.vehicleCoverage == "unknown" and next(client.byFarm) == nil)
assert(reads == 0)
`);
});

test("server counts only listed player farms, including genuine zeroes", () => {
  runLua(`
local function pump(owner, active, circulating)
    return { spec_umbilicalPump = { pumpIsActive = active,
        pumpIsCirculating = circulating },
        getOwnerFarmId = function() return owner end }
end
local mission = { pumpsAndHoses = {}, getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
        pump(1, true, false), pump(1, true, true), pump(2, false, false),
        pump(3, true, false), pump(100, true, false), pump(0, false, false),
        { getOwnerFarmId = function() error("ordinary vehicle read") end },
    } } }
local result = collector.collect(mission, {
    { farmId = 1, isPlayer = true }, { id = 2, isPlayer = true },
    { farmId = 1, isPlayer = true }, { farmId = 3, isPlayer = false },
    { farmId = 4, isPlayer = true },
})
assert(result.enabled and result.schema == 1 and result.authoritative)
assert(result.vehicleCoverage == "complete")
assert(result.byFarm["1"].ownedVehiclePumps == 2)
assert(result.byFarm["1"].activeVehiclePumps == 2)
assert(result.byFarm["1"].circulatingVehiclePumps == 1)
assert(result.byFarm["2"].ownedVehiclePumps == 1)
assert(result.byFarm["2"].activeVehiclePumps == 0)
assert(result.byFarm["4"].ownedVehiclePumps == 0)
assert(result.byFarm["3"] == nil and result.byFarm["100"] == nil)
`);
});

test("unknown state or failed ownership is never presented as zero", () => {
  runLua(`
local mission = { pumpsAndHoses = {}, getIsServer = function() return true end,
    vehicleSystem = { vehicles = { { spec_umbilicalPump = {
        pumpIsActive = nil, pumpIsCirculating = false },
        getOwnerFarmId = function() return 1 end } } } }
local info = {{ farmId = 1, isPlayer = true }}
local missing = collector.collect(mission, info)
assert(not missing.authoritative and next(missing.byFarm) == nil)
mission.vehicleSystem.vehicles[1].spec_umbilicalPump.pumpIsActive = false
mission.vehicleSystem.vehicles[1].getOwnerFarmId = function() error("not ready") end
local broken = collector.collect(mission, info)
assert(not broken.authoritative and next(broken.byFarm) == nil)
mission.vehicleSystem = nil
assert(collector.collect(mission, info).vehicleCoverage == "unknown")
`);
});

test("farm and vehicle scans are capped before reading oversized lists", () => {
  runLua(`
local visits = 0
local vehicles = {}
for i = 1, 1025 do
    vehicles[i] = setmetatable({}, { __index = function()
        visits = visits + 1; error("oversized scan") end })
end
local mission = { pumpsAndHoses = {}, getIsServer = function() return true end,
    vehicleSystem = { vehicles = vehicles } }
local info = {{ farmId = 1, isPlayer = true }}
local oversized = collector.collect(mission, info)
assert(oversized.truncated and not oversized.authoritative and visits == 0)
mission.vehicleSystem.vehicles = {}
for i = 2, 40 do info[i] = { farmId = i, isPlayer = true } end
local farms = collector.collect(mission, info)
assert(farms.truncated and not farms.authoritative and next(farms.byFarm) == nil)
`);
});
