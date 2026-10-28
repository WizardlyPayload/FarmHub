"use strict";

const fs = require("fs");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");

const source = fs.readFileSync(path.resolve(__dirname,
  "../../FS25_FarmDashboard_Mod/src/collectors/HighlandsFishingDataCollector.lua"), "utf8");

function runLua(body) {
  const L = lauxlib.luaL_newstate();
  try {
    lualib.luaL_openlibs(L);
    const script = `
local env = setmetatable({}, { __index = _G })
env._G = env
assert(load([=[${source}]=], "=HighlandsFishingDataCollector.lua", "t", env))()
local collector = env.HighlandsFishingDataCollector
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

test("absent DLC and non-authoritative client never read farm statistics", () => {
  runLua(`
local reads = 0
env.g_farmManager = { getFarmById = function() reads = reads + 1; error("client read") end }
assert(collector.collect(nil, {}).enabled == false)
assert(collector.collect({}, {}).enabled == false)
local client = collector.collect({ fishingSystem = {}, getIsServer = function() return false end },
    {{ farmId = 1, isPlayer = true }})
assert(client.enabled and client.authoritative == false and next(client.byFarm) == nil)
assert(reads == 0)
local noAuthority = collector.collect({ fishingSystem = {} }, {{ farmId = 1, isPlayer = true }})
assert(noAuthority.authoritative == false and reads == 0)
`);
});

test("server exports only complete DLC counters for listed player farms", () => {
  runLua(`
local names = { numSoldFish = true, numReleasedFish = true, numCaugthTrashItems = true }
local calls = 0
local function stats(sold, released, trash)
    local totals = { numSoldFish = sold, numReleasedFish = released, numCaugthTrashItems = trash }
    local sessions = { numSoldFish = 2, numReleasedFish = 1, numCaugthTrashItems = 0 }
    return {
        getTotalValue = function(_, key) assert(names[key]); calls = calls + 1; return totals[key] end,
        getSessionValue = function(_, key) assert(names[key]); calls = calls + 1; return sessions[key] end,
    }
end
local farms = {
    [1] = { stats = stats(12, 7, 5) },
    [2] = { stats = stats(4, 0, 1) },
    [3] = { stats = stats(99, 99, 99) },
    [4] = { stats = stats(3, nil, 2) },
}
env.g_farmManager = { getFarmById = function(_, id) return farms[id] end }
local mission = { fishingSystem = { spots = {{ itemNames = { "secret" }, x = 10 }} },
    getIsServer = function() return true end }
local result = collector.collect(mission, {
    { farmId = 1, isPlayer = true }, { id = 2, isPlayer = true },
    { farmId = 1, isPlayer = true }, { farmId = 3, isPlayer = false },
    { farmId = 4, isPlayer = true }, { farmId = 5, isPlayer = true },
    { farmId = 100, isPlayer = true },
})
assert(result.enabled and result.schema == 1 and result.authoritative == true)
assert(result.byFarm["1"].total.soldFish == 12)
assert(result.byFarm["1"].total.releasedFish == 7)
assert(result.byFarm["1"].total.caughtTrashItems == 5)
assert(result.byFarm["1"].session.soldFish == 2)
assert(result.byFarm["2"].total.releasedFish == 0)
assert(result.byFarm["3"] == nil and result.byFarm["4"] == nil)
assert(result.byFarm["5"] == nil and result.byFarm["100"] == nil)
assert(result.spots == nil and result.items == nil and result.byFarm["1"].secret == nil)
assert(calls == 16, "duplicate and unlisted farms were not read: " .. tostring(calls))
`);
});

test("unavailable and invalid values stay unknown; farm scan is capped", () => {
  runLua(`
local visits = 0
env.g_farmManager = { getFarmById = function(_, id)
    visits = visits + 1
    if id == 1 then return { stats = {
        getTotalValue = function(_, key)
            if key == "numReleasedFish" then error("not ready") end
            return 0
        end,
        getSessionValue = function() return 0 end,
    }} end
    return { stats = {
        getTotalValue = function() return math.huge end,
        getSessionValue = function() return 0 end,
    }}
end }
local mission = { fishingSystem = {}, getIsServer = function() return true end }
local info = {}
for i = 1, 40 do info[i] = { farmId = i, isPlayer = true } end
local result = collector.collect(mission, info)
assert(result.authoritative and result.farmsTruncated == true)
assert(next(result.byFarm) == nil, "missing or infinite data cannot become zero")
assert(visits == 32, "bounded farm scan")
assert(collector.collect(mission, nil).authoritative == false)
`);
});
