const fs = require("fs");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");

const source = fs.readFileSync(
    path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua"),
    "utf8",
);

function runLua(chunk) {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    const script = [
        "Logging = { info = function() end }",
        "FarmDashLog = { devWarn = function() end, dev = function() end, error = function() end }",
        source,
        chunk,
    ].join("\n");
    const status = lauxlib.luaL_dostring(L, to_luastring(script));
    if (status !== lua.LUA_OK) {
        const error = lua.lua_tostring(L, -1);
        throw new Error(error ? to_jsstring(error) : `lua error status ${status}`);
    }
    const result = lua.lua_tostring(L, -1);
    return result ? to_jsstring(result) : null;
}

test("persistent pen details cannot starve an active stock collector after JSON drains", () => {
    const result = runLua(`
        local C = FarmDashboardDataCollector
        _G.g_time = 1000
        C.config = { collectionCycleMs = 60000 }
        C._animalMode = "known"
        C._dirtyPens = { pen1 = true }
        C._exportFair = "pen"
        C._incActiveModule = "stock"
        C._jsonWriteJob = nil
        C._jsonPendingDisk = nil
        C._cycleTailJob = nil
        C._pollShopPendingLoads = function() end
        C._exportFillTypeHudIcons = function() end
        C._isServerExportHost = function() return true end
        C.getEnabledCollectorOrder = function() return { "stock" } end
        C.shouldDeferCollectionWork = function() return false end
        C._updateCollectionPauseLatch = function() end
        C._checkExportLiveness = function() return false end
        C._promoteQueuedSnapshot = function() end
        C._exportBudgetAllows = function() return true end
        C._exportHasGameplayRows = function() return true end
        local pens, steps = 0, 0
        C.processDetailQueueOnce = function() pens = pens + 1 return true end
        C.runIncrementalActiveStep = function() steps = steps + 1 end
        for _ = 1, 4 do C:_updateBody(16) end
        return tostring(pens) .. "|" .. tostring(steps)
    `);
    expect(result).toBe("2|2");
});
