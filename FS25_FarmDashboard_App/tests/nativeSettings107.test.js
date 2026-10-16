"use strict";

/**
 * Settings role and replication recovery under the environment FS25 gives an ordinary script mod
 * (extract/decompiled/scripts/mods.lua:300-311): modEnv inherits engine globals through __index and _G = modEnv.
 * The production FarmDashboard.lua is loaded so its update/deleteMap hooks are the ones exercised; only its
 * isAuthority answer is replaced per case.
 *
 * engineServer() follows network/Server.lua:484 Server:broadcastEvent: it loops connectionList or
 * clientConnections, skips the local stream unless sendLocal, and calls Connection:sendEvent in turn, so a
 * throw from one connection leaves earlier connections delivered.
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
SAVES, SENT, CALLS, MENU = 0, 0, 0, 0
FarmDashboardSettingsMenu = {
    syncAllControls = function() MENU = MENU + 1 end,
    syncControlPermissions = function() MENU = MENU + 1 end,
}
local MISSION = {}
local function reset(auth)
    FD.auth = auth
    FD.isAuthority = function() return FD.auth end
    FarmDashboard = FD
    dc.config = { collectionCycleMs = 60000, enableAnimals = true }
    SAVES, SENT, CALLS, MENU = 0, 0, 0, 0
    dc.saveConfig = function() SAVES = SAVES + 1 end
    dc.applyDiagnosticsFromConfig = function() end
    dc.shutdown = function() end
    SE._pending = nil
    SE.replication = { state = "idle", attempts = 0 }
    SE._rejectLogged = {}
    MISSION = {}
    E("g_currentMission", MISSION)
    E("g_server", nil)
end
local function recipient(failures)
    local r = { cycle = 60000, animals = true, deliveries = 0, failures = failures or 0, isConnected = true }
    function r:sendEvent(e)
        if self.failures ~= 0 then
            if self.failures > 0 then self.failures = self.failures - 1 end
            error("synthetic connection closed")
        end
        self.deliveries = self.deliveries + 1
        self.cycle = e.intValues.collectionCycleMs
        self.animals = e.boolValues.enableAnimals
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
        SENT = SENT + 1
    end
    return srv
end
local function remote(admin)
    return { getIsServer = function() return false end, getIsServerAdmin = function() return admin end }
end
local function fromServer()
    return { getIsServer = function() return true end }
end
local function host()
    return dc.config.collectionCycleMs .. "|" .. tostring(dc.config.enableAnimals)
end
local function peer(r)
    return r.cycle .. "|" .. tostring(r.animals)
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

const UNKNOWN = [
    ["U module absent", "FarmDashboard = nil"],
    ["U method absent", "FD.isAuthority = nil"],
    ["U method throws", 'FD.isAuthority = function() error("synthetic mission unavailable") end'],
    ["U returns nil", "FD.isAuthority = function() return nil end"],
    ["U returns non-boolean", 'FD.isAuthority = function() return "yes" end'],
    ["U module index throws", 'FarmDashboard = setmetatable({}, { __index = function() error("gone") end })'],
];

describe("tri-state authority", () => {
    test("authorityState reports true, false and unknown; isAuthorityMachine stays boolean", () => {
        const result = run(`
            reset(true)
            local out = {}
            local function probe() out[#out + 1] = tostring(api:authorityState()) .. "/" .. tostring(api:isAuthorityMachine()) end
            probe()
            FD.auth = false; probe()
            FD.isAuthority = function() return 1 end; probe()
            FD.isAuthority = function() error("x") end; probe()
            FarmDashboard = nil; probe()
            return table.concat(out, ",")
        `);
        expect(result).toBe("true/true,false/false,unknown/false,unknown/false,unknown/false");
    });

    test.each(UNKNOWN)("%s: a server-direction sync is refused before any apply, save, broadcast or menu update", (_name, setup) => {
        const result = run(`
            reset(true); local r = recipient(); E("g_server", engineServer(r))
            ${setup}
            return send(fromServer()) .. "|" .. MENU .. "|" .. CALLS .. "|" .. rep()
        `);
        expect(result).toBe("true|60000|true|0|0|0|idle:nil:0:false");
    });

    test.each(UNKNOWN)("%s: an admin client request is refused before any apply, save or broadcast", (_name, setup) => {
        const result = run(`
            reset(true); local r = recipient(); E("g_server", engineServer(r))
            ${setup}
            return send(remote(true)) .. "|" .. MENU .. "|" .. CALLS .. "|" .. peer(r) .. "|" .. rep()
        `);
        expect(result).toBe("true|60000|true|0|0|0|60000|true|idle:nil:0:false");
    });

    test("unknown authority is logged once as its own reason", () => {
        const result = run(`
            reset(true); FD.isAuthority = function() return nil end
            for i = 1, 20 do send(fromServer()); send(remote(true)) end
            return table.concat(DEVWARN, ";")
        `);
        expect(result).toBe("settings sync rejected (reason=unknown-authority)");
    });

    test("a confirmed client (strict false) applies a server sync and refreshes the menu", () => {
        expect(run(`reset(false); return send(fromServer()) .. "|" .. MENU .. "|" .. rep()`)).toBe("true|90000|false|0|2|idle:nil:0:false");
    });

    test("a confirmed host (strict true) refuses a server-direction sync; a confirmed client refuses a client request", () => {
        const result = run(`
            reset(true); local a = send(fromServer()) .. "|" .. MENU
            reset(false); E("g_server", engineServer(recipient())); local b = send(remote(true)) .. "|" .. CALLS
            return a .. "/" .. b
        `);
        expect(result).toBe("true|60000|true|0|0/true|60000|true|0|0");
    });
});

describe("healthy and refused paths", () => {
    test("a healthy broadcast is one broadcastEvent call, one save, synced, and later ticks send nothing", () => {
        const result = run(`
            reset(true); local a, b = recipient(), recipient(); E("g_server", engineServer(a, b))
            local r = send(remote(true)) .. "|" .. CALLS .. "|" .. peer(a) .. "|" .. peer(b) .. "|" .. rep()
            ticks(10, 1000)
            return r .. "|" .. CALLS
        `);
        expect(result).toBe("true|90000|false|1|1|90000|false|90000|false|synced:client-request:0:false|1");
    });

    test("a missing broadcaster before acceptance still refuses with zero mutation and no pending work", () => {
        expect(run(`reset(true); E("g_server", {}); return send(remote(true)) .. "|" .. rep()`)).toBe("true|60000|true|0|idle:nil:0:false");
    });

    test("local setters on a host still save and broadcast once each", () => {
        const result = run(`
            reset(true); local a = recipient(); E("g_server", engineServer(a))
            api:setInt("collectionCycleMs", 90000)
            api:setBool("enableAnimals", false)
            return host() .. "|" .. SAVES .. "|" .. CALLS .. "|" .. peer(a)
        `);
        expect(result).toBe("90000|false|2|2|90000|false");
    });

    test("local setters on a joined client forward to the server connection and save nothing", () => {
        const result = run(`
            reset(false)
            local forwarded = 0
            E("g_client", { getServerConnection = function() return { sendEvent = function() forwarded = forwarded + 1 end } end })
            api:setInt("collectionCycleMs", 90000)
            return host() .. "|" .. SAVES .. "|" .. forwarded
        `);
        expect(result).toBe("90000|true|0|1");
    });
});

describe("partial delivery recovery", () => {
    test("B01 successor (reviewer double, no clientConnections): host and first recipient agree, failure is bounded and never reported as success", () => {
        const result = run(`
            reset(true)
            local first = { collectionCycleMs = 60000, enableAnimals = true, deliveries = 0 }
            local a = { sendEvent = function(self, e) first.collectionCycleMs = e.intValues.collectionCycleMs; first.enableAnimals = e.boolValues.enableAnimals; first.deliveries = first.deliveries + 1 end }
            local b = { sendEvent = function() error("synthetic second recipient closed") end }
            local recipients = { a, b }
            E("g_server", { broadcastEvent = function(self, e) CALLS = CALLS + 1; for _, c in ipairs(recipients) do c:sendEvent(e) end end })
            local r = send(remote(true))
            local consistent = dc.config.collectionCycleMs == first.collectionCycleMs and dc.config.enableAnimals == first.enableAnimals
            local afterRequest = r .. "|" .. first.collectionCycleMs .. "|" .. tostring(first.enableAnimals) .. "|" .. tostring(consistent) .. "|" .. CALLS .. "|" .. rep()
            ticks(40, 250)
            local final = CALLS .. "|" .. first.deliveries .. "|" .. rep() .. "|" .. #WARN .. "|" .. tostring(api:authorityState())
            ticks(40, 1000)
            return afterRequest .. "/" .. final .. "/" .. CALLS
        `);
        expect(result).toBe(
            "true|90000|false|1|90000|false|true|1|pending:broadcast-failed:0:true"
            + "/4|4|failed:retries-exhausted:3:false|1|true"
            + "/4",
        );
    });

    test("two recipients, transient failure: one per-connection resync restores equality with exact bounded calls", () => {
        const result = run(`
            reset(true); local a, b = recipient(), recipient(1); E("g_server", engineServer(a, b))
            local r = send(remote(true)) .. "|" .. CALLS .. "|" .. peer(a) .. "|" .. peer(b) .. "|" .. rep()
            ticks(3, 300)
            local early = CALLS
            ticks(1, 100)
            return r .. "/" .. early .. "/" .. CALLS .. "|" .. host() .. "|" .. peer(a) .. "|" .. peer(b) .. "|" .. a.deliveries .. "|" .. b.deliveries .. "|" .. SAVES .. "|" .. rep() .. "|" .. tostring(api:authorityState())
        `);
        expect(result).toBe(
            "true|90000|false|1|1|90000|false|60000|true|pending:broadcast-failed:0:true"
            + "/1/3|90000|false|90000|false|90000|false|2|1|1|synced:recovered:1:false|true",
        );
    });

    test("permanent failure of one connection: healthy recipient is not blocked, retries stop at the bound, state is failed", () => {
        const result = run(`
            reset(true); local a, b = recipient(), recipient(-1); E("g_server", engineServer(a, b))
            send(remote(true))
            ticks(3, 1000)
            local bounded = CALLS .. "|" .. a.deliveries .. "|" .. peer(a) .. "|" .. peer(b) .. "|" .. rep() .. "|" .. #WARN
            ticks(100, 1000)
            return bounded .. "/" .. CALLS .. "|" .. host() .. "|" .. SAVES
        `);
        expect(result).toBe("5|2|90000|false|60000|true|failed:retries-exhausted:3:false|1/5|90000|false|1");
    });

    test("a retry sends the current authoritative snapshot, not the value that first failed", () => {
        const result = run(`
            reset(true); local a, b = recipient(), recipient(2); E("g_server", engineServer(a, b))
            send(remote(true), 90000)
            send(remote(true), 120000)
            local mid = rep() .. "|" .. peer(b)
            ticks(1, 1000)
            return mid .. "/" .. host() .. "|" .. peer(a) .. "|" .. peer(b) .. "|" .. rep()
        `);
        expect(result).toBe("pending:broadcast-failed:0:true|60000|true/120000|false|120000|false|120000|false|synced:recovered:1:false");
    });

    test("a recipient that disconnected before the retry is not retried; remaining connections resync", () => {
        const result = run(`
            reset(true); local a, b = recipient(), recipient(-1); local srv = engineServer(a, b); E("g_server", srv)
            send(remote(true))
            srv.clientConnections[2] = nil
            ticks(1, 1000)
            return CALLS .. "|" .. peer(a) .. "|" .. rep()
        `);
        expect(result).toBe("2|90000|false|synced:recovered:1:false");
    });

    test("retries never run inside the same frame and ignore missing or negative frame times", () => {
        const result = run(`
            reset(true); local a, b = recipient(), recipient(-1); E("g_server", engineServer(a, b))
            send(remote(true))
            ticks(62, 16)
            local a1 = CALLS
            pcall(FD.update, FD, nil); pcall(FD.update, FD, -5000); pcall(FD.update, FD, "1000")
            local a2 = CALLS
            ticks(1, 16)
            return a1 .. "|" .. a2 .. "|" .. CALLS .. "|" .. rep()
        `);
        expect(result).toBe("1|1|3|pending:retrying:1:true");
    });
});

describe("pending work is tied to one mission and session", () => {
    test("unload through FarmDashboard:deleteMap drops pending work; the next session sends nothing stale", () => {
        const result = run(`
            reset(true); local a, b = recipient(), recipient(-1); E("g_server", engineServer(a, b))
            send(remote(true))
            FD:deleteMap()
            local afterUnload = rep()
            ticks(10, 1000)
            return afterUnload .. "|" .. CALLS
        `);
        expect(result).toBe("dropped:unload:0:false|1");
    });

    test("a save switch (new mission) drops pending work without sending", () => {
        const result = run(`
            reset(true); local a, b = recipient(), recipient(-1); E("g_server", engineServer(a, b))
            send(remote(true))
            E("g_currentMission", {})
            ticks(5, 1000)
            return rep() .. "|" .. CALLS
        `);
        expect(result).toBe("dropped:session-changed:0:false|1");
    });

    test("a replaced server object drops pending work without resending to either server", () => {
        const result = run(`
            reset(true); local a, b = recipient(), recipient(-1); E("g_server", engineServer(a, b))
            send(remote(true))
            local c = recipient(); E("g_server", engineServer(c))
            ticks(5, 1000)
            return rep() .. "|" .. CALLS .. "|" .. c.deliveries
        `);
        expect(result).toBe("dropped:session-changed:0:false|1|0");
    });

    test("authority becoming unknown drops pending work without sending", () => {
        const result = run(`
            reset(true); local a, b = recipient(), recipient(-1); E("g_server", engineServer(a, b))
            send(remote(true))
            local sent = CALLS
            FD.isAuthority = function() error("mission gone") end
            ticks(5, 1000)
            return sent .. "|" .. rep() .. "|" .. CALLS
        `);
        expect(result).toBe("1|dropped:session-changed:0:false|1");
    });

    test("a later healthy broadcast clears earlier pending work", () => {
        const result = run(`
            reset(true); local a, b = recipient(), recipient(1); E("g_server", engineServer(a, b))
            send(remote(true), 90000)
            send(remote(true), 120000)
            ticks(5, 1000)
            return rep() .. "|" .. CALLS .. "|" .. peer(b)
        `);
        expect(result).toBe("synced:client-request:0:false|2|120000|false");
    });
});
