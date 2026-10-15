"use strict";

/**
 * One authority publication path for accepted remote requests and local setters, with pending recovery bound
 * to a local snapshot of every transmitted BOOL_KEYS / INT_KEYS value. Same modEnv fixture as the 107 suite
 * (extract/decompiled/scripts/mods.lua:300-311); the production FarmDashboard.lua provides update/deleteMap.
 *
 * engineServer() follows network/Server.lua:484 Server:broadcastEvent: it loops connectionList or
 * clientConnections, skips the local stream unless sendLocal, and calls Connection:sendEvent in turn, so a
 * throw from one connection leaves earlier connections delivered and later ones not reached.
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

describe("R03 successor: newer local setting during narrowed recovery", () => {
    test("no exception; host, A and B all hold 120000 before synced; exactly 2 saves and 6 bounded calls; nothing stale after", () => {
        const result = run(`
            reset(true); local a, b = recipient(-1), recipient(); E("g_server", engineServer(a, b))
            send(remote(true), 90000); ticks(1, 1000)
            local narrowed = rep() .. "|" .. peer(b)
            local localOk = pcall(function() api:setInt("collectionCycleMs", 120000) end)
            local afterLocal = tostring(localOk) .. "|" .. rep() .. "|" .. CALLS
            a.failures = 0; ticks(1, 1000)
            local synced = host() .. "|" .. peer(a) .. "|" .. peer(b) .. "|" .. SAVES .. "|" .. CALLS .. "|" .. rep()
            ticks(20, 1000)
            return narrowed .. "/" .. afterLocal .. "/" .. synced .. "/" .. CALLS .. "|" .. a.deliveries .. "|" .. b.deliveries
        `);
        expect(result).toBe(
            "pending:retrying:1:true|90000|false"
            + "/true|pending:broadcast-failed:0:true|4"
            + "/120000|false|120000|false|120000|false|2|6|synced:recovered:1:false"
            + "/6|1|2",
        );
    });
});

describe("shared authority publication", () => {
    test("R04 successor: a healthy local publication clears older pending work and no older value is ever resent", () => {
        const result = run(`
            reset(true); local a, b = recipient(1), recipient(); E("g_server", engineServer(a, b))
            send(remote(true), 90000)
            local before = rep()
            api:setInt("collectionCycleMs", 120000)
            local after = rep() .. "|" .. CALLS
            ticks(50, 1000)
            return before .. "/" .. after .. "/" .. CALLS .. "|" .. a.deliveries .. "|" .. b.deliveries .. "|" .. SAVES .. "|" .. host() .. "|" .. peer(a) .. "|" .. peer(b)
        `);
        expect(result).toBe("pending:broadcast-failed:0:true/synced:local-publish:0:false|2/2|1|1|2|120000|false|120000|false|120000|false");
    });

    test("a healthy local setter saves once, sends once and reports synced", () => {
        const result = run(`
            reset(true); local a, b = recipient(), recipient(); E("g_server", engineServer(a, b))
            api:setInt("collectionCycleMs", 90000)
            return host() .. "|" .. SAVES .. "|" .. CALLS .. "|" .. peer(a) .. "|" .. peer(b) .. "|" .. rep()
        `);
        expect(result).toBe("90000|true|1|1|90000|true|90000|true|synced:local-publish:0:false");
    });

    test("a failing local setter does not raise, keeps and saves the host value once, and becomes pending", () => {
        const result = run(`
            reset(true); local a, b = recipient(-1), recipient(); E("g_server", engineServer(a, b))
            local ok = pcall(function() api:setBool("enableAnimals", false) end)
            return tostring(ok) .. "|" .. host() .. "|" .. SAVES .. "|" .. CALLS .. "|" .. rep()
        `);
        expect(result).toBe("true|60000|false|1|1|pending:broadcast-failed:0:true");
    });

    test("a newer local bool change during narrowed recovery reaches every recipient", () => {
        const result = run(`
            reset(true); local a, b = recipient(-1), recipient(); E("g_server", engineServer(a, b))
            send(remote(true), 90000); ticks(1, 1000)
            api:setBool("enableAnimals", true)
            a.failures = 0; ticks(1, 1000)
            return host() .. "|" .. peer(a) .. "|" .. peer(b) .. "|" .. SAVES .. "|" .. CALLS .. "|" .. rep()
        `);
        expect(result).toBe("90000|true|90000|true|90000|true|2|6|synced:recovered:1:false");
    });

    test("publishAuthoritative without a broadcaster sends nothing and creates no pending work", () => {
        expect(run(`reset(true); return tostring(SE.publishAuthoritative("local-publish")) .. "|" .. rep()`)).toBe("false|idle:nil:0:false");
    });

    test("local setters on a joined client still forward once and save nothing", () => {
        const result = run(`
            reset(false)
            local forwarded = 0
            E("g_client", { getServerConnection = function() return { sendEvent = function() forwarded = forwarded + 1 end } end })
            api:setInt("collectionCycleMs", 90000)
            return host() .. "|" .. SAVES .. "|" .. forwarded .. "|" .. rep()
        `);
        expect(result).toBe("90000|true|0|1|idle:nil:0:false");
    });
});

describe("pending targets are bound to the full snapshot", () => {
    test("control: with the snapshot unchanged a narrowed retry sends only to the failed connection", () => {
        const result = run(`
            reset(true); local a, b = recipient(-1), recipient(); E("g_server", engineServer(a, b))
            send(remote(true)); ticks(1, 1000)
            a.failures = 0; ticks(1, 1000)
            return CALLS .. "|" .. b.deliveries .. "|" .. rep()
        `);
        expect(result).toBe("4|1|synced:recovered:2:false");
    });

    test.each([
        ["an int key other than collectionCycleMs", "dc.config.sliceBudgetMs = 8", "90000,false,8,true"],
        ["a bool key other than enableAnimals", "dc.config.enableWeather = false", "90000,false,4,false"],
    ])("a direct change to %s retargets every connection with a fresh attempt budget", (_name, change, values) => {
        const result = run(`
            reset(true); local a, b = recipient(-1), recipient(); E("g_server", engineServer(a, b))
            send(remote(true)); ticks(1, 1000)
            ${change}
            a.failures = 0; ticks(1, 1000)
            return CALLS .. "|" .. hostFull() .. "|" .. full(a) .. "|" .. full(b) .. "|" .. b.deliveries .. "|" .. rep()
        `);
        expect(result).toBe(`5|${values}|${values}|${values}|2|synced:recovered:1:false`);
    });

    test("a snapshot change resets the attempt budget once and retries stay bounded", () => {
        const result = run(`
            reset(true); local a, b = recipient(-1), recipient(); E("g_server", engineServer(a, b))
            send(remote(true)); ticks(2, 1000)
            dc.config.sliceBudgetMs = 8
            ticks(3, 1000)
            local bounded = CALLS .. "|" .. full(b) .. "|" .. rep() .. "|" .. #WARN
            ticks(50, 1000)
            return bounded .. "/" .. CALLS
        `);
        expect(result).toBe("8|90000,false,8,true|failed:retries-exhausted:3:false|1/8");
    });
});

describe("connections and session", () => {
    test("a newer failed publication also targets a connection that joined during recovery", () => {
        const result = run(`
            reset(true); local a, b = recipient(-1), recipient(); local srv = engineServer(a, b); E("g_server", srv)
            send(remote(true), 90000); ticks(1, 1000)
            local c = recipient(); srv.clientConnections[3] = c
            api:setInt("collectionCycleMs", 120000)
            a.failures = 0; ticks(1, 1000)
            return peer(a) .. "|" .. peer(b) .. "|" .. peer(c) .. "|" .. rep()
        `);
        expect(result).toBe("120000|false|120000|false|120000|false|synced:recovered:1:false");
    });

    test("a connection that left is not retried after a failed local publication", () => {
        const result = run(`
            reset(true); local a, b = recipient(), recipient(-1); local srv = engineServer(a, b); E("g_server", srv)
            api:setInt("collectionCycleMs", 90000)
            srv.clientConnections[2] = nil
            ticks(1, 1000)
            return CALLS .. "|" .. peer(a) .. "|" .. rep()
        `);
        expect(result).toBe("2|90000|true|synced:recovered:1:false");
    });

    test("unload through FarmDashboard:deleteMap drops pending work created by a local publication", () => {
        const result = run(`
            reset(true); local a, b = recipient(-1), recipient(); E("g_server", engineServer(a, b))
            api:setInt("collectionCycleMs", 90000)
            FD:deleteMap()
            local r = rep()
            ticks(10, 1000)
            return r .. "|" .. CALLS
        `);
        expect(result).toBe("dropped:unload:0:false|1");
    });

    test("a new mission drops pending work created by a local publication without sending", () => {
        const result = run(`
            reset(true); local a, b = recipient(-1), recipient(); E("g_server", engineServer(a, b))
            api:setInt("collectionCycleMs", 90000)
            E("g_currentMission", {})
            ticks(5, 1000)
            return rep() .. "|" .. CALLS
        `);
        expect(result).toBe("dropped:session-changed:0:false|1");
    });
});
