"use strict";

const fs = require("fs");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");

const source = fs.readFileSync(path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src/collectors/AnimalDataCollector.lua"), "utf8");
const quote = (value) => `[=[${value}]=]`;

test("alpaca names, happiness and fleece reach summary and individual detail", () => {
  const L = lauxlib.luaL_newstate();
  try {
    lualib.luaL_openlibs(L);
    const script = `
local env = setmetatable({}, { __index=_G })
env._G = env
assert(load(${quote(source)}, "=AnimalDataCollector.lua", "t", env))()
local collector = env.AnimalDataCollector
collector._collectConsumptionData = function() end
local shearReads, amountReads = 0, 0
local alpaca = { numAnimals=1, subType="ALPACA_WHITE", subTypeIndex=12,
  name="Daisy", age=16, gender="female", health=1, happiness=0, fleeceState=72,
  getCanBeSheared=function() shearReads = shearReads + 1; return false end,
  getFleeceAmount=function() amountReads = amountReads + 1; return 12.5 end }
local cow = { numAnimals=2, subType="COW", subTypeIndex=3, age=16, gender="female", health=1,
  getCanBeSheared=function() error("cow shearing getter must not run") end }
local state = { row={ ownerFarmId=1 }, buckets={}, bucketKeys={} }
assert(collector:_walkBase({ alpaca, cow }, state, 10), "walk")
local summary = collector:_finalizePen({}, state)
assert(summary.animalCount == 3, "count")
local alpacaRow, cowRow
for _, row in ipairs(summary.clusters) do
  if row.subType == "ALPACA_WHITE" then alpacaRow = row else cowRow = row end
end
assert(alpacaRow.avgHappiness == 0 and alpacaRow.avgFleeceState == 72, "alpaca aggregate")
assert(alpacaRow.canBeSheared == false and alpacaRow.shearableCount == 0, "false is measured, not missing")
assert(alpacaRow.fleeceLiters == 12.5 and alpacaRow.totalFleeceLiters == 12.5, "fleece litres")
assert(cowRow.avgHappiness == nil and cowRow.avgFleeceState == nil, "cow aggregate")
assert(cowRow.canBeSheared == nil and cowRow.fleeceLiters == nil, "cow remains untouched")
local detail = collector:collectPenDetail({ id=4, getOwnerFarmId=function() return 1 end,
  getClusters=function() return { alpaca, cow } end })
local alpacaDetail, cowDetail
for _, row in ipairs(detail.animals) do
  if row.subType == "ALPACA_WHITE" then alpacaDetail = row else cowDetail = row end
end
assert(alpacaDetail.name == "Daisy", "alpaca name")
assert(alpacaDetail.happiness == 0 and alpacaDetail.fleeceState == 72, "alpaca detail")
assert(alpacaDetail.canBeSheared == false and alpacaDetail.fleeceLiters == 12.5, "detail shearing")
assert(cowDetail.happiness == nil and cowDetail.fleeceState == nil, "cow detail")
assert(cowDetail.canBeSheared == nil and cowDetail.fleeceLiters == nil, "no cow shearing")
assert(shearReads == 2 and amountReads == 2, "once per existing summary/detail pass")

local unowned = { row={ ownerFarmId=0 }, buckets={}, bucketKeys={} }
assert(collector:_walkBase({ alpaca }, unowned, 10), "unowned walk")
local unownedSummary = collector:_finalizePen({}, unowned)
assert(unownedSummary.clusters[1].canBeSheared == nil and unownedSummary.clusters[1].fleeceLiters == nil, "unowned summary")
local unownedDetail = collector:collectPenDetail({ id=5, getOwnerFarmId=function() return 0 end,
  getClusters=function() return { alpaca } end })
assert(unownedDetail.animals[1].canBeSheared == nil and unownedDetail.animals[1].fleeceLiters == nil, "unowned detail")
assert(shearReads == 2 and amountReads == 2, "unowned clusters do not call DLC getters")

local failing = { numAnimals=1, subType="ALPACA_BROWN", subTypeIndex=13,
  getCanBeSheared=function() error("visual unavailable") end,
  getFleeceAmount=function() return 0 end }
local failingDetail = collector:collectPenDetail({ id=6, getOwnerFarmId=function() return 1 end,
  getClusters=function() return { failing } end })
assert(failingDetail.animals[1].canBeSheared == nil and failingDetail.animals[1].fleeceLiters == 0, "partial failure and zero preserved")

local ready = { numAnimals=1, subType="ALPACA_WHITE", subTypeIndex=12,
  age=16, gender="female", getCanBeSheared=function() return true end,
  getFleeceAmount=function() return 0 end }
local mixed = { row={ ownerFarmId=1 }, buckets={}, bucketKeys={} }
assert(collector:_walkBase({ alpaca, ready }, mixed, 10), "mixed alpaca walk")
local mixedSummary = collector:_finalizePen({}, mixed)
assert(mixedSummary.clusters[1].count == 2 and mixedSummary.clusters[1].shearableCount == 1, "mixed readiness counts")
assert(mixedSummary.clusters[1].canBeSheared == nil, "no individual status invented for an aggregate")
assert(mixedSummary.clusters[1].totalFleeceLiters == 12.5, "mixed litre total keeps zero")
return "ok"
`;
    const status = lauxlib.luaL_dostring(L, to_luastring(script));
    if (status !== lua.LUA_OK) throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
    expect(to_jsstring(lua.lua_tostring(L, -1))).toBe("ok");
  } finally {
    lua.lua_close(L);
  }
});
