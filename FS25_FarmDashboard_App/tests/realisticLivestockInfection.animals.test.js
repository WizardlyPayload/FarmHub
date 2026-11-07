"use strict";

const fs = require("fs");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");

const source = fs.readFileSync(path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src/collectors/AnimalDataCollector.lua"), "utf8");

test("Ritter disease history stays separate from current infectious records", () => {
  const L = lauxlib.luaL_newstate();
  try {
    lualib.luaL_openlibs(L);
    const script = `
local env = setmetatable({}, { __index=_G })
env._G = env
assert(load([=[${source}]=], "=AnimalDataCollector.lua", "t", env))()
local collector = env.AnimalDataCollector
local animals = {
  { isIndividual=true, uniqueId="a", subType="COW", age=24,
    diseases={ {state="EXPOSED"}, {state="RECOVERED"}, {state="INFECTIOUS"} } },
  { isIndividual=true, uniqueId="b", subType="COW", age=24,
    diseases={ {state="EXPOSED"}, {state="RECOVERED"} } },
  { isIndividual=true, uniqueId="c", subType="COW", age=24,
    diseases={ {title="legacy record without state"} } }
}
local detail = collector:collectPenDetail({ id=4, getOwnerFarmId=function() return 1 end,
  getClusters=function() return animals end })
assert(#detail.animals == 3, "three owned animals")
local byId = {}
for _, row in ipairs(detail.animals) do byId[row.uniqueId] = row end
assert(byId.a.diseaseCount == 3 and byId.a.infectiousDiseaseCount == 1,
  "only INFECTIOUS is current")
assert(byId.b.diseaseCount == 2 and byId.b.infectiousDiseaseCount == 0,
  "exposed and recovered history are not current")
assert(byId.c.diseaseCount == 1 and byId.c.infectiousDiseaseCount == nil,
  "legacy unknown state is not a measured zero")
return "ok"
`;
    const status = lauxlib.luaL_dostring(L, to_luastring(script));
    if (status !== lua.LUA_OK) throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
    expect(to_jsstring(lua.lua_tostring(L, -1))).toBe("ok");
  } finally {
    lua.lua_close(L);
  }
});
