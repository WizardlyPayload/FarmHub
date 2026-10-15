"use strict";

/**
 * Remote settings authority under the environment FS25 gives an ordinary script mod
 * (extract/decompiled/scripts/mods.lua:300-311): modEnv inherits engine globals through __index and _G = modEnv.
 * Direction comes from Connection:getIsServer (network/Connection.lua:148), admin evidence from the connection's
 * getIsServerAdmin and userManager:getIsConnectionMasterUser (users/UserManager.lua:173, vanilla SaveEvent pattern).
 * Each request reports "run ok|collectionCycleMs|enableAnimals|saves|broadcasts".
 */
const fs = require("fs");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");

const modSrc = path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src");
const MOD_FILES = ["FarmDashboardDataCollector.lua", "FarmDashboardSettingsApi.lua", "FarmDashboardSettingsEvent.lua"];

function longString(text) {
    let level = 0;
    while (text.includes("]" + "=".repeat(level) + "]")) level += 1;
    const eq = "=".repeat(level);
    return "[" + eq + "[\n" + text + "]" + eq + "]";
}

const engine = `
FarmDashLog = { devWarn = function() end, dev = function() end, error = function() end, info = function() end, isVerbose = function() return false end }
Logging = { info = function() end, warning = function() end }
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
g_currentModDirectory = "mods/FS25_FarmDashboard/"
ENGINE = _G
`;

const helpers = `
function E(name, value) ENGINE[name] = value end
E("g_server", nil)
E("g_client", nil)
E("g_currentMission", nil)
FarmDashboard = { auth = true, isAuthority = function(self) return self.auth end }
local dc = FarmDashboardDataCollector
local api = FarmDashboardSettingsApi
SAVES, SENT, EVENTS, MENU = 0, 0, {}, 0
FarmDashboardSettingsMenu = {
    syncAllControls = function() MENU = MENU + 1 end,
    syncControlPermissions = function() MENU = MENU + 1 end,
}
local function reset(auth)
    FarmDashboard.auth = auth
    dc.config = { collectionCycleMs = 60000, enableAnimals = true }
    SAVES, SENT, EVENTS, MENU = 0, 0, {}, 0
    dc.saveConfig = function() SAVES = SAVES + 1 end
    dc.applyDiagnosticsFromConfig = function() end
end
local function goodServer()
    return { broadcastEvent = function(self, e) SENT = SENT + 1; EVENTS[#EVENTS + 1] = e end }
end
local function remote(admin)
    return { getIsServer = function() return false end, getIsServerAdmin = function() return admin end }
end
local function fromServer()
    return { getIsServer = function() return true end }
end
local function state()
    return dc.config.collectionCycleMs .. "|" .. tostring(dc.config.enableAnimals) .. "|" .. SAVES .. "|" .. SENT
end
local function send(connection, cycle)
    local e = FarmDashboardSettingsEvent.emptyNew()
    e.boolValues = { enableAnimals = false }
    e.intValues = { collectionCycleMs = cycle or 90000 }
    local ok = pcall(function() e:run(connection) end)
    return tostring(ok) .. "|" .. state()
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

const UNCHANGED = "true|60000|true|0|0";
const APPLIED_ADMIN = "true|90000|false|1|1";

describe("settings event direction", () => {
    test.each([
        ["nil connection", "nil"],
        ["string connection", '"conn"'],
        ["missing getIsServer", "{ getIsServerAdmin = function() return true end }"],
        ["wrong-type getIsServer", '{ getIsServer = "no", getIsServerAdmin = function() return true end }'],
        ["getIsServer returns nil", "{ getIsServer = function() return nil end, getIsServerAdmin = function() return true end }"],
        ["getIsServer returns string false", '{ getIsServer = function() return "false" end, getIsServerAdmin = function() return true end }'],
        ["getIsServer returns 0", "{ getIsServer = function() return 0 end, getIsServerAdmin = function() return true end }"],
        ["getIsServer throws", '{ getIsServer = function() error("closed") end, getIsServerAdmin = function() return true end }'],
        ["connection index throws", 'setmetatable({}, { __index = function() error("gone") end })'],
    ])("D %s on an admin-capable healthy host fails closed", (_name, conn) => {
        expect(run(`reset(true); E("g_server", goodServer()); return send(${conn})`)).toBe(UNCHANGED);
    });

    test("D a server-direction message on the authority is refused and syncs no menu", () => {
        expect(run(`reset(true); E("g_server", goodServer()); return send(fromServer()) .. "|" .. MENU`)).toBe(UNCHANGED + "|0");
    });

    test("D a client-direction admin message on a non-authority is refused", () => {
        expect(run(`reset(false); E("g_server", goodServer()); return send(remote(true))`)).toBe(UNCHANGED);
    });

    test("D a throwing or non-boolean authority answer is not authority", () => {
        const result = run(`
            reset(true); E("g_server", goodServer())
            FarmDashboard.isAuthority = function() error("mission gone") end
            local a = send(remote(true))
            FarmDashboard.isAuthority = function() return "yes" end
            local b = send(remote(true))
            return a .. "/" .. b
        `);
        expect(result).toBe(`${UNCHANGED}/${UNCHANGED}`);
    });
});

describe("settings event transport", () => {
    test.each([
        ["missing server", "nil"],
        ["false server", "false"],
        ["string server", '"server"'],
        ["number server", "7"],
        ["server without broadcaster", "{}"],
        ["string broadcaster", '{ broadcastEvent = "x" }'],
        ["server index throws", 'setmetatable({}, { __index = function() error("gone") end })'],
    ])("T %s: an authenticated admin request is refused whole", (_name, server) => {
        expect(run(`reset(true); E("g_server", ${server}); return send(remote(true))`)).toBe(UNCHANGED);
    });

    test("T a throwing broadcaster retains accepted host settings and bounds recovery", () => {
        const result = run(`
            reset(true)
            local calls = 0
            E("g_server", { broadcastEvent = function()
                calls = calls + 1
                error("transport down")
            end })
            local initial = send(remote(true))
            local se = FarmDashboardSettingsEvent
            local pending = se.replication.state .. ":" .. se.replication.reason .. ":" .. se.replication.attempts
            for i = 1, 3 do se.tickReplication(1000) end
            local atLimit = calls
            for i = 1, 20 do se.tickReplication(1000) end
            return initial .. "|" .. pending .. "/" .. state() .. "|" .. atLimit .. "|" .. calls
                .. "|" .. se.replication.state .. ":" .. se.replication.reason .. ":" .. se.replication.attempts
                .. "|" .. tostring(se._pending == nil)
        `);
        expect(result).toBe(
            "true|90000|false|1|0|pending:broadcast-failed:0"
            + "/90000|false|1|0|4|4|failed:retries-exhausted:3|true",
        );
    });

    test("T a metatable-backed Server instance (Server.new shape) is a valid broadcaster", () => {
        const result = run(`
            reset(true)
            local Server = { broadcastEvent = function(self, e) SENT = SENT + 1 end }
            E("g_server", setmetatable({}, { __index = Server }))
            return send(remote(true))
        `);
        expect(result).toBe(APPLIED_ADMIN);
    });
});

describe("settings event admin evidence", () => {
    test.each([
        ["getIsServerAdmin nil", "{ getIsServer = function() return false end, getIsServerAdmin = function() return nil end }", UNCHANGED],
        ["getIsServerAdmin string true", '{ getIsServer = function() return false end, getIsServerAdmin = function() return "true" end }', UNCHANGED],
        ["getIsServerAdmin table", "{ getIsServer = function() return false end, getIsServerAdmin = function() return {} end }", UNCHANGED],
        ["no admin source at all", "{ getIsServer = function() return false end }", UNCHANGED],
    ])("A %s", (_name, conn, expected) => {
        expect(run(`reset(true); E("g_server", goodServer()); return send(${conn})`)).toBe(expected);
    });

    test.each([
        ["master user true alone", "nil", "function(self, c) SEEN = c; return true end", APPLIED_ADMIN + "|true"],
        ["master user returns 1", "nil", "function() return 1 end", UNCHANGED + "|false"],
        ["master user throws", "nil", 'function() error("only on server") end', UNCHANGED + "|false"],
        ["admin true but master user false", "true", "function() return false end", UNCHANGED + "|false"],
        ["admin and master user both true", "true", "function(self, c) SEEN = c; return true end", APPLIED_ADMIN + "|true"],
        ["admin true but master user method wrong type", "true", '"x"', UNCHANGED + "|false"],
    ])("A %s", (_name, admin, master, expected) => {
        const result = run(`
            reset(true); E("g_server", goodServer()); SEEN = nil
            local conn = { getIsServer = function() return false end }
            if ${admin} ~= nil then conn.getIsServerAdmin = function() return ${admin} end end
            E("g_currentMission", { userManager = { getIsConnectionMasterUser = ${master} } })
            return send(conn) .. "|" .. tostring(SEEN == conn)
        `);
        expect(result).toBe(expected);
    });

    test("A a wrong-type current mission is not an admin source and does not block a true admin", () => {
        expect(run(`reset(true); E("g_server", goodServer()); E("g_currentMission", 5); return send(remote(true))`)).toBe(APPLIED_ADMIN);
    });

    test("A a valid admin request applies, saves once and broadcasts the new values", () => {
        const result = run(`
            reset(true); E("g_server", goodServer())
            local r = send(remote(true))
            local e = EVENTS[1]
            return r .. "|" .. tostring(e.intValues.collectionCycleMs) .. "|" .. tostring(e.boolValues.enableAnimals)
        `);
        expect(result).toBe(APPLIED_ADMIN + "|90000|false");
    });
});

describe("legitimate paths stay unchanged", () => {
    test("L local setters on a host save and broadcast through the inherited server", () => {
        const result = run(`
            reset(true); E("g_server", goodServer())
            api:setInt("collectionCycleMs", 90000)
            api:setBool("enableAnimals", false)
            return state()
        `);
        expect(result).toBe("90000|false|2|2");
    });

    test("L local setters on a joined client forward to the server connection and save nothing", () => {
        const result = run(`
            reset(false)
            local forwarded = 0
            E("g_client", { getServerConnection = function() return { sendEvent = function() forwarded = forwarded + 1 end } end })
            api:setInt("collectionCycleMs", 90000)
            return state() .. "|" .. forwarded
        `);
        expect(result).toBe("90000|true|0|0|1");
    });

    test("L a confirmed server-to-client sync applies on a client and refreshes the menu", () => {
        expect(run(`reset(false); return send(fromServer()) .. "|" .. MENU`)).toBe("true|90000|false|0|0|2");
    });
});

describe("current-save transition", () => {
    test("S authority follows the live server and mission across unload and a new save", () => {
        const result = run(`
            reset(true)
            local first = goodServer()
            E("g_server", first)
            E("g_currentMission", { userManager = { getIsConnectionMasterUser = function() return true end } })
            local a = send({ getIsServer = function() return false end }, 90000)
            E("g_server", nil)
            E("g_currentMission", nil)
            FarmDashboard.auth = false
            local b = send(remote(true), 120000)
            local secondSent = 0
            E("g_server", { broadcastEvent = function() secondSent = secondSent + 1 end })
            E("g_currentMission", { userManager = { getIsConnectionMasterUser = function() return false end } })
            FarmDashboard.auth = true
            local c = send({ getIsServer = function() return false end }, 150000)
            E("g_currentMission", {})
            local d = send(remote(true), 150000)
            return a .. "/" .. b .. "/" .. c .. "/" .. d .. "/" .. secondSent
        `);
        expect(result).toBe("true|90000|false|1|1/true|90000|false|1|1/true|90000|false|1|1/true|150000|false|2|1/1");
    });
});

describe("rejection logging", () => {
    test("R repeated refusals log once per reason", () => {
        const result = run(`
            local lines = {}
            FarmDashLog = { devWarn = function(f, ...) lines[#lines + 1] = string.format(f, ...) end }
            reset(true); E("g_server", goodServer())
            for i = 1, 50 do send(remote(false)); send({}) end
            E("g_server", nil)
            for i = 1, 50 do send(remote(true)) end
            table.sort(lines)
            return #lines .. "|" .. table.concat(lines, ";") .. "|" .. state()
        `);
        expect(result).toBe(
            "3|settings sync rejected (reason=broadcast-unavailable);settings sync rejected (reason=not-admin);settings sync rejected (reason=unknown-direction)|60000|true|0|0",
        );
    });
});
