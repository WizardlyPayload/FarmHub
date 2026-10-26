const fs = require("fs");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");

const source = fs.readFileSync(
    path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua"),
    "utf8",
);
const fieldSource = fs.readFileSync(
    path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua"),
    "utf8",
);

function runLua(chunk) {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    const script = [
        "Logging = { info = function() end }",
        "FarmDashLog = { devWarn = function() end, dev = function() end, error = function() end }",
        source,
        fieldSource,
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

describe("Fields without Lua coroutines", () => {
    test("finishes a Fields slice when the field manager is not loaded yet", () => {
        const result = runLua(`
            coroutine = nil
            g_currentMission = {}
            g_fieldManager = nil
            FarmDashboardDataCollector.moduleCache = { fields = { { fieldId = 7 } } }
            FieldDataCollector:collectBegin()
            local done, kept = FieldDataCollector:collectStep({ batchSize = 1 })
            return tostring(done) .. "|" .. tostring(kept == FarmDashboardDataCollector.moduleCache.fields)
                .. "|" .. tostring(FieldDataCollector._fieldStep == nil)
        `);
        expect(result).toBe("true|true|true");
    });

    test("creates the per-field stepper when the game omits coroutine", () => {
        const result = runLua(`
            coroutine = nil
            g_fieldManager = { fields = { [1] = {}, [3] = {} } }
            FarmDashboardDataCollector.config = { useStateMachine_fields = false }
            FieldDataCollector:collectBegin()
            local st = FieldDataCollector._fieldStep
            return tostring(st ~= nil) .. "|" .. tostring(FieldDataCollector._fdCo == nil)
                .. "|" .. tostring(st and #st.fieldIds or 0)
        `);
        expect(result).toBe("true|true|2");
    });

    test("keeps Fields incremental without changing Economy or Production", () => {
        const result = runLua(`
            local C = FarmDashboardDataCollector
            C.coroutinesAvailable = false
            local stub = { collectBegin = function() end, collectStep = function() end }
            C.collectors = { fields = stub, economy = stub, production = stub }
            return tostring(C:collectorSupportsIncremental("fields")) .. "|"
                .. tostring(C:collectorSupportsIncremental("economy")) .. "|"
                .. tostring(C:collectorSupportsIncremental("production"))
        `);
        expect(result).toBe("true|false|false");
    });

    test("starts a Fields slice instead of a full synchronous collection", () => {
        const result = runLua(`
            local C = FarmDashboardDataCollector
            C.coroutinesAvailable = false
            C.config = { collectionCycleMs = 60000 }
            C.collectors = { fields = { collectBegin = function() end, collectStep = function() end } }
            C.nextSliceIdx = 1
            C._cycleFreshCount = function() return 1 end
            C._diagTrace = function() end
            local route = "none"
            C.startModuleSlice = function(_, name) route = "incremental:" .. name end
            C.runLegacyModuleSlice = function(_, name) route = "legacy:" .. name end
            C:consumeOneModuleSlot({ "fields" })
            return route
        `);
        expect(result).toBe("incremental:fields");
    });
});
