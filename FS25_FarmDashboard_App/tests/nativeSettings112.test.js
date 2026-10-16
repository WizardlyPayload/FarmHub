"use strict";

/**
 * Pending recovery when the local snapshot capture (packConfigForNetwork) fails. A failed capture is not a
 * configuration: it spends one attempt of the existing budget at the retry point, sends nothing and keeps the
 * last valid identity. Same modEnv fixture as the 107/111 suites (extract/decompiled/scripts/mods.lua:300-311);
 * the production FarmDashboard.lua provides update/deleteMap.
 */
const fs = require("fs");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");

const modSrc = path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src");
const MOD_FILES = [
    "FarmDashboardDataCollector.lua",
    "FarmDashboardSettingsApi.lua",
    "FarmDashboardSettingsEvent.lua",
    "FarmDashboard.lua",
];

function longString(text) {
    let level = 0;
    while (text.includes("]" + "=".repeat(level) + "]")) level += 1;
    const eq = "=".repeat(level);
    return "[" + eq + "[\n" + text + "]" + eq + "]";
}

const engine = `
WARN = {}
DEVWARN = {}
FarmDashLog = { devWarn = function(f, ...) DEVWARN[#DEVWARN + 1] = string.format(f, ...) end, dev = function() end, error = function() end, info = function() end, isVerbose = function() return false end }
Logging = { info = function() end, warning = function(f, ...) WARN[#WARN + 1] = string.format(f, ...) end }
Event = {}
function Event.new(mt) return setmetatable({}, mt) end
function Class(t) return { __index = t } end
function InitEventClass() end
function addModEventListener() end
Utils = {
    appendedFunction = function(a, b) return function(...) if a then a(...) end return b(...) end end,
    getNoNil = function(v, d) if v == nil then return d end return v end,
}
FSBaseMission = { sendInitialClientState = function() end }
NetworkNode = { LOCAL_STREAM_ID = 0 }
g_currentModDirectory = "mods/FS25_FarmDashboard/"
ENGINE = _G
`;

const helpers = `
function E(name, value) ENGINE[name] = value end
E("g_server", nil)
E("g_client", nil)
E("g_currentMission", nil)
E("g_time", nil)
local FD = FarmDashboard
FD.auth = true
FD.isAuthority = function() return FD.auth end
local dc = FarmDashboardDataCollector
local api = FarmDashboardSettingsApi
local SE = FarmDashboardSettingsEvent
SAVES, CALLS, MENU = 0, 0, 0
FarmDashboardSettingsMenu = {
    syncAllControls = function() MENU = MENU + 1 end,
    syncControlPermissions = function() MENU = MENU + 1 end,
}
local function reset(auth)
    FD.auth = auth
    FD.isAuthority = function() return FD.auth end
    FarmDashboard = FD
    dc.config = { collectionCycleMs = 60000, enableAnimals = true, sliceBudgetMs = 4, enableWeather = true }
    SAVES, CALLS, MENU = 0, 0, 0
    dc.saveConfig = function() SAVES = SAVES + 1 end
    dc.applyDiagnosticsFromConfig = function() end
    dc.shutdown = function() end
    SE._pending = nil
    SE.replication = { state = "idle", attempts = 0 }
    SE._rejectLogged = {}
    E("g_currentMission", {})
    E("g_server", nil)
    E("g_client", nil)
end
local function recipient(failures)
    local r = { cycle = 60000, animals = true, slice = 4, weather = true, deliveries = 0, failures = failures or 0 }
    function r:sendEvent(e)
        if self.failures ~= 0 then
            if self.failures > 0 then self.failures = self.failures - 1 end
            error("synthetic connection closed")
        end
        self.deliveries = self.deliveries + 1
        self.cycle = e.intValues.collectionCycleMs
        self.animals = e.boolValues.enableAnimals
        self.slice = e.intValues.sliceBudgetMs
        self.weather = e.boolValues.enableWeather
    end
    return r
end
local function engineServer(...)
    local srv = { clientConnections = { [0] = { sendEvent = function() error("local stream must be skipped") end } } }
    for i, r in ipairs({ ... }) do srv.clientConnections[i] = r end
    function srv:broadcastEvent(event, sendLocal, ignoreConnection, ghostObject, force, connectionList)
        CALLS = CALLS + 1
        local connections = connectionList or self.clientConnections
        for streamId, connection in pairs(connections) do
            if (streamId ~= NetworkNode.LOCAL_STREAM_ID or sendLocal) and (ignoreConnection == nil or connection ~= ignoreConnection) then
                connection:sendEvent(event, false, force)
            end
        end
    end
    return srv
end
local function remote(admin)
    return { getIsServer = function() return false end, getIsServerAdmin = function() return admin end }
end
local function host()
    return dc.config.collectionCycleMs .. "|" .. tostring(dc.config.enableAnimals)
end
local function peer(r)
    return r.cycle .. "|" .. tostring(r.animals)
end
local function full(r)
    return r.cycle .. "," .. tostring(r.animals) .. "," .. r.slice .. "," .. tostring(r.weather)
end
local function hostFull()
    return dc.config.collectionCycleMs .. "," .. tostring(dc.config.enableAnimals) .. "," .. dc.config.sliceBudgetMs .. "," .. tostring(dc.config.enableWeather)
end
local function rep()
    return SE.replication.state .. ":" .. tostring(SE.replication.reason) .. ":" .. SE.replication.attempts .. ":" .. tostring(SE._pending ~= nil)
end
local function send(connection, cycle)
    local e = SE.emptyNew()
    e.boolValues = { enableAnimals = false }
    e.intValues = { collectionCycleMs = cycle or 90000 }
    local ok = pcall(function() e:run(connection) end)
    return tostring(ok) .. "|" .. host() .. "|" .. SAVES
end
local function ticks(n, dt)
    for i = 1, n do pcall(FD.update, FD, dt) end
end
`;

function run(body) {
    const L = lauxlib.luaL_newstate();
    try {
        lualib.luaL_openlibs(L);
        const sources = MOD_FILES.map((file) => `{ name = ${JSON.stringify(file)}, text = ${longString(fs.readFileSync(path.join(modSrc, file), "utf8"))} }`);
        const chunk = [
            engine,
            "local modEnv = {}",
            "setmetatable(modEnv, { __index = _G })",
            "modEnv._G = modEnv",
            "FS25_FarmDashboard = modEnv",
            `local SOURCES = { ${sources.join(",\n")} }`,
            "for i = 1, #SOURCES do local fn = assert(load(SOURCES[i].text, '=' .. SOURCES[i].name, 't', modEnv)); fn() end",
            `local body = assert(load(${longString(helpers + "\n" + body)}, '=body', 't', modEnv))`,
            "return body()",
        ].join("\n");
        const status = lauxlib.luaL_dostring(L, to_luastring(chunk));
        if (status !== lua.LUA_OK) {
            const err = lua.lua_tostring(L, -1);
            throw new Error(err ? to_jsstring(err) : `lua error ${status}`);
        }
        const value = lua.lua_tostring(L, -1);
        return value ? to_jsstring(value) : null;
    } finally {
        lua.lua_close(L);
    }
}

describe("failed snapshot capture spends the bounded budget", () => {
    test("persistent capture failure fails after three retry points with one warning and then does no work", () => {
        const result = run(`
            reset(true); local a, b = recipient(), recipient(); E("g_server", engineServer(a, b))
            local packs = 0
            api.packConfigForNetwork = function() packs = packs + 1; error("synthetic serializer unavailable") end
            local accepted = send(remote(true))
            ticks(2, 1000); local mid = packs .. "|" .. CALLS .. "|" .. rep() .. "|" .. #WARN
            ticks(1, 1000); local done = packs .. "|" .. CALLS .. "|" .. rep() .. "|" .. #WARN .. "|" .. SAVES
            ticks(20, 1000)
            return accepted .. "/" .. mid .. "/" .. done .. "/" .. packs .. "|" .. CALLS .. "|" .. SAVES .. "|" .. #WARN
        `);
        expect(result).toBe(
            "true|90000|false|1"
            + "/4|0|pending:capture-failed:2:true|0"
            + "/5|0|failed:retries-exhausted:3:false|1|1"
            + "/5|0|1|1",
        );
    });

    test("transient capture failure recovers the current values to both recipients and stops", () => {
        const result = run(`
            reset(true); local a, b = recipient(), recipient(); E("g_server", engineServer(a, b))
            local originalPack = api.packConfigForNetwork; local failures = 0
            api.packConfigForNetwork = function() failures = failures + 1; error("synthetic temporary serializer failure") end
            send(remote(true)); ticks(1, 1000); local during = rep() .. "|" .. CALLS
            api.packConfigForNetwork = originalPack
            dc.config.collectionCycleMs = 120000; dc.config.enableAnimals = true; ticks(1, 1000)
            local synced = host() .. "|" .. peer(a) .. "|" .. peer(b) .. "|" .. SAVES .. "|" .. CALLS .. "|" .. rep()
            ticks(20, 1000)
            return during .. "/" .. synced .. "/" .. CALLS .. "|" .. failures .. "|" .. #WARN
        `);
        expect(result).toBe(
            "pending:capture-failed:1:true|0"
            + "/120000|true|120000|true|120000|true|1|2|synced:recovered:1:false"
            + "/2|3|0",
        );
    });

    test("two failed captures then a first valid capture attach one identity; persistent send failure stays bounded", () => {
        const result = run(`
            reset(true); local a, b = recipient(-1), recipient(-1); E("g_server", engineServer(a, b))
            local originalPack = api.packConfigForNetwork; local packs = 0
            api.packConfigForNetwork = function() packs = packs + 1; error("synthetic serializer unavailable") end
            send(remote(true)); ticks(2, 1000)
            local failedTwice = rep() .. "|" .. CALLS .. "|" .. packs
            api.packConfigForNetwork = originalPack; ticks(1, 1000)
            local attached = rep() .. "|" .. CALLS
            ticks(2, 1000); local bounded = rep() .. "|" .. CALLS .. "|" .. #WARN
            ticks(50, 1000)
            return failedTwice .. "/" .. attached .. "/" .. bounded .. "/" .. CALLS .. "|" .. #WARN
        `);
        expect(result).toBe(
            "pending:capture-failed:2:true|0|4"
            + "/pending:retrying:1:true|2"
            + "/failed:retries-exhausted:3:false|6|1"
            + "/6|1",
        );
    });

    test("with a valid identity, intermittent capture failures never refresh the budget", () => {
        const result = run(`
            reset(true); local a, b = recipient(-1), recipient(); E("g_server", engineServer(a, b))
            send(remote(true), 90000)
            local originalPack = api.packConfigForNetwork; local n = 0
            api.packConfigForNetwork = function(self) n = n + 1; if n % 2 == 0 then error("synthetic flaky serializer") end return originalPack(self) end
            ticks(10, 1000); local r = rep() .. "|" .. CALLS .. "|" .. #WARN .. "|" .. n
            ticks(50, 1000)
            return r .. "/" .. CALLS .. "|" .. n
        `);
        expect(result).toBe("failed:retries-exhausted:3:false|4|1|3/4|3");
    });
});

describe("changed values while capture fails", () => {
    test("nobody is marked synced or sent new values on old targets; the next valid capture retargets everyone", () => {
        const result = run(`
            reset(true); local a, b = recipient(-1), recipient(); E("g_server", engineServer(a, b))
            send(remote(true), 90000); ticks(1, 1000)
            local narrowed = rep() .. "|" .. peer(b) .. "|" .. CALLS
            local originalPack = api.packConfigForNetwork
            api.packConfigForNetwork = function() error("synthetic serializer unavailable") end
            dc.config.collectionCycleMs = 120000; dc.config.enableAnimals = true
            a.failures = 0; ticks(1, 1000)
            local during = rep() .. "|" .. CALLS .. "|" .. peer(a) .. "|" .. peer(b)
            api.packConfigForNetwork = originalPack; ticks(1, 1000)
            local synced = peer(a) .. "|" .. peer(b) .. "|" .. CALLS .. "|" .. rep() .. "|" .. SAVES
            ticks(20, 1000)
            return narrowed .. "/" .. during .. "/" .. synced .. "/" .. CALLS .. "|" .. a.deliveries .. "|" .. b.deliveries
        `);
        expect(result).toBe(
            "pending:retrying:1:true|90000|false|3"
            + "/pending:capture-failed:2:true|3|60000|true|90000|false"
            + "/120000|true|120000|true|5|synced:recovered:1:false|1"
            + "/5|1|2",
        );
    });

    test("a capture that fails once while a later pack would succeed never reuses the narrowed target set", () => {
        const result = run(`
            reset(true); local a, b = recipient(-1), recipient(); E("g_server", engineServer(a, b))
            send(remote(true), 90000); ticks(1, 1000)
            local originalPack = api.packConfigForNetwork; local failNext = 1
            api.packConfigForNetwork = function(self) if failNext > 0 then failNext = failNext - 1; error("synthetic one-shot failure") end return originalPack(self) end
            dc.config.collectionCycleMs = 120000; dc.config.enableAnimals = true; a.failures = 0
            ticks(1, 1000); local during = rep() .. "|" .. CALLS .. "|" .. peer(a) .. "|" .. peer(b)
            ticks(1, 1000); local synced = peer(a) .. "|" .. peer(b) .. "|" .. CALLS .. "|" .. rep()
            ticks(20, 1000)
            return during .. "/" .. synced .. "/" .. CALLS
        `);
        expect(result).toBe(
            "pending:capture-failed:2:true|3|60000|true|90000|false"
            + "/120000|true|120000|true|5|synced:recovered:1:false"
            + "/5",
        );
    });

    test("retries send the captured snapshot and never repack per connection", () => {
        const result = run(`
            reset(true); local a, b = recipient(-1), recipient(); E("g_server", engineServer(a, b))
            send(remote(true), 90000)
            local originalPack = api.packConfigForNetwork; local packs = 0
            api.packConfigForNetwork = function(self) packs = packs + 1; return originalPack(self) end
            a.failures = 0; ticks(1, 1000)
            return packs .. "|" .. CALLS .. "|" .. peer(a) .. "|" .. peer(b) .. "|" .. rep()
        `);
        expect(result).toBe("1|3|90000|false|90000|false|synced:recovered:1:false");
    });

    test("unload during capture-failed recovery drops pending work and packs nothing more", () => {
        const result = run(`
            reset(true); local a, b = recipient(), recipient(); E("g_server", engineServer(a, b))
            local packs = 0
            api.packConfigForNetwork = function() packs = packs + 1; error("synthetic serializer unavailable") end
            send(remote(true)); ticks(1, 1000)
            FD:deleteMap(); local r = rep()
            ticks(10, 1000)
            return r .. "|" .. packs .. "|" .. CALLS
        `);
        expect(result).toBe("dropped:unload:1:false|3|0");
    });
});
