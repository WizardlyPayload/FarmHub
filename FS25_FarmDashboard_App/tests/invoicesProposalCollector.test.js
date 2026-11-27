"use strict";

const fs = require("fs");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");

const source = fs.readFileSync(
  path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src/collectors/InvoicesDataCollector.lua"),
  "utf8"
);

test("an unapproved proposal follows the mod's issuer/requester direction and is not unpaid", () => {
  const L = lauxlib.luaL_newstate();
  try {
    lualib.luaL_openlibs(L);
    const script = `
local env = setmetatable({}, { __index = _G })
env._G = env
assert(load([=[${source}]=], "=InvoicesDataCollector.lua", "t", env))()
env.g_modIsLoaded = { FS25_Invoices = true }
env.g_farmManager = { farms = { [1] = { farmId = 1, name = "Farm 1", players = { [1] = true } } } }
local proposed = { id = 1, senderFarmId = 1, recipientFarmId = 2, state = 5, totalAmount = 120, lineItems = {} }
local sent = { id = 2, senderFarmId = 1, recipientFarmId = 2, state = 2, totalAmount = 80, lineItems = {} }
local manager = {
  getIncomingInvoices = function(_, farmId) return farmId == 1 and { proposed } or {} end,
  getOutgoingInvoices = function(_, farmId) return farmId == 1 and { sent } or {} end,
}
env.g_currentMission = { invoicesManager = manager }
local result = env.InvoicesDataCollector:collect()
local farm = result.byFarm["1"]
assert(farm.summary.incomingCount == 1 and farm.summary.outgoingCount == 1)
assert(farm.summary.unpaidIncomingCount == 0 and farm.summary.unpaidOutgoingCount == 1)
assert(farm.items[1].id == 2 and farm.items[1].direction == "outgoing")
assert(farm.items[2].id == 1 and farm.items[2].direction == "incoming")
assert(farm.items[2].stateName == "proposed")
return "ok"
`;
    const status = lauxlib.luaL_dostring(L, to_luastring(script));
    if (status !== lua.LUA_OK) throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
    expect(to_jsstring(lua.lua_tostring(L, -1))).toBe("ok");
  } finally {
    lua.lua_close(L);
  }
});
