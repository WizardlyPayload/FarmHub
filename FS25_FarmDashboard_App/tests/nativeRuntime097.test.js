"use strict";

/**
 * Production mirror, finalizer, settings, replica and collector files under the environment FS25 gives an
 * ordinary script mod (extract/decompiled/scripts/mods.lua:300-311 and :772-777):
 *   modEnv = {}; setmetatable(modEnv, { __index = _G }); modEnv._G = modEnv
 * Engine clocks, server, mission, GUI, message centre, event classes and other mod namespaces live only on the
 * engine table and are inherited. "own" mode also writes them onto modEnv, the flat layout older suites used.
 */
const fs = require("fs");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");

const modSrc = path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src");
const MOD_FILES = [
    "FarmDashboardDataCollector.lua",
    "FarmDashboardSettingsApi.lua",
    "FarmDashboardSettingsEvent.lua",
    "FarmDashboardReplicaConfig.lua",
    "FarmDashboardExportFinalizer.lua",
    "FarmDashboardExportMirror.lua",
];

function longString(text) {
    let level = 0;
    while (text.includes("]" + "=".repeat(level) + "]")) level += 1;
    const eq = "=".repeat(level);
    return "[" + eq + "[\n" + text + "]" + eq + "]";
}

const engine = `
LOG = {}
Logging = {
    info = function(f, ...) LOG[#LOG + 1] = "I " .. string.format(f, ...) end,
    warning = function(f, ...) LOG[#LOG + 1] = "W " .. string.format(f, ...) end,
}
FarmDashLog = { devWarn = function() end, dev = function() end, error = function() end, info = function() end, isVerbose = function() return false end }
Event = {}
function Event.new(mt) return setmetatable({}, mt) end
function Class(t) return { __index = t } end
function InitEventClass() end
function addModEventListener() end
Utils = {
    appendedFunction = function(a, b) return function(...) if a then a(...) end return b(...) end end,
    getNoNil = function(v, d) if v == nil then return d end return v end,
}
FSBaseMission = {
    sendInitialClientState = function() end,
    onFinishedReceivingDynamicData = function() end,
    onConnectionClosed = function() end,
}
g_currentModDirectory = "mods/FS25_FarmDashboard/"
ENGINE = _G
`;

const helpers = `
function E(name, value)
    ENGINE[name] = value
    if MODE == "own" then rawset(_G, name, value) end
end
E("g_time", nil)
E("g_server", nil)
E("g_currentMission", nil)
E("g_gui", nil)
E("g_messageCenter", nil)
E("g_modIsLoaded", nil)
FarmDashboard = { auth = true, isAuthority = function(self) return self.auth end }
FarmDashboardExportEvent = { MAX_CHUNKS = 10923, MAX_DECLARED_BYTES = 11184812, new = function(i) return { chunk = i } end }
local M = FarmDashboardExportMirror
local F = FarmDashboardExportFinalizer
local R = FarmDashboardReplicaConfig
local dc = FarmDashboardDataCollector
local function center()
    local c = { subs = {} }
    function c:subscribe(evt, cb, obj) self.subs[#self.subs + 1] = evt; return #self.subs end
    function c:unsubscribeAll(obj) self.cleared = true end
    return c
end
`;

function run(mode, body) {
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
            `rawset(modEnv, "MODE", ${JSON.stringify(mode)})`,
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

const STREAM_THROTTLE = `
    E("g_time", 1000)
    local a = M:_beginOwnedJob({ payload = "abc" }, false)
    M._job = nil
    E("g_time", 2000)
    local b = M:_beginOwnedJob({ payload = "abc" }, false)
    local pending = tostring(M._pendingJob ~= nil)
    M._pendingJob = nil
    E("g_time", 16000)
    local c = M:_beginOwnedJob({ payload = "abc" }, false)
    return tostring(a) .. "," .. tostring(b) .. "," .. pending .. "," .. tostring(c) .. "," .. tostring(M._lastJobStartMs)
`;

const PENDING_UPDATE = `
    E("g_time", 1000)
    M:_beginOwnedJob({ payload = "abc" }, false)
    M._job = nil
    M._pendingJob = { owned = { payload = "abc" } }
    E("g_time", 5000)
    M:update(16)
    local early = tostring(M._pendingJob ~= nil)
    E("g_time", 16500)
    M:update(16)
    return early .. "," .. tostring(M._pendingJob ~= nil)
`;

const SERVER_FALLBACK = `
    M._clients = {}
    local calls = {}
    E("g_server", { broadcastEvent = function(self, e, sendLocal) calls[#calls + 1] = tostring(sendLocal) end })
    local host = tostring(M:hasRemoteClients())
    local _, _, bc = M:_dispatchChunk(1, 1, "abc", {})
    return host .. "," .. tostring(bc) .. "," .. #calls .. "," .. table.concat(calls, "")
`;

const SWEEP_TIMEOUT = `
    local m = {}
    F.ensure(m)
    m._receiveBufs["k1"] = { key = "k1", firstSeen = 1000, owner = { lifetime = 1 }, reserved = 10 }
    m._reservedBytes = 10
    E("g_time", 30000)
    F.sweep(m)
    local mid = tostring(m._receiveBufs["k1"] ~= nil)
    E("g_time", 61000)
    F.sweep(m)
    return mid .. "," .. tostring(m._receiveBufs["k1"] ~= nil) .. "," .. tostring(m._lastReplicaOutcome) .. "," .. m._reservedBytes .. "," .. tostring(m._tombstones[1] and m._tombstones[1].at)
`;

const SETTINGS_HOST = `
    FarmDashboard.auth = true
    dc.config = { collectionCycleMs = 60000, enableAnimals = true }
    local saves = 0
    dc.saveConfig = function() saves = saves + 1 end
    dc.applyDiagnosticsFromConfig = function() end
    local sent = 0
    E("g_server", { broadcastEvent = function() sent = sent + 1 end })
    local function ev()
        local e = FarmDashboardSettingsEvent.emptyNew()
        e.boolValues = { enableAnimals = false }
        e.intValues = { collectionCycleMs = 90000 }
        return e
    end
    local function conn(admin)
        return { getIsServer = function() return false end, getIsServerAdmin = function() return admin end }
    end
    ev():run(conn(false))
    local rejected = tostring(dc.config.collectionCycleMs) .. "," .. tostring(dc.config.enableAnimals) .. "," .. saves .. "," .. sent
    ev():run(conn(true))
    local admin = tostring(dc.config.collectionCycleMs) .. "," .. tostring(dc.config.enableAnimals) .. "," .. saves .. "," .. sent
    return rejected .. "|" .. admin .. "|" .. tostring(FarmDashboardSettingsApi:canBroadcastSettings())
`;

const SESSION_KEY = `
    E("g_currentMission", { missionDynamicInfo = { platformSessionId = "sessA_1" } })
    local a = R:sessionKey()
    E("g_currentMission", { missionDynamicInfo = { platformSessionId = "sessB-2" } })
    local b = R:sessionKey()
    E("g_currentMission", { missionDynamicInfo = { platformSessionId = "../x" } })
    local c = R:sessionKey()
    E("g_currentMission", { missionDynamicInfo = "bad" })
    local d = R:sessionKey()
    E("g_currentMission", nil)
    local e = R:sessionKey()
    return table.concat({ tostring(a), tostring(b), tostring(c), tostring(d), tostring(e) }, ",")
`;

const FLEET = `
    FarmDashboard.auth = true
    E("BuyVehicleEvent", {})
    E("SellVehicleEvent", {})
    E("ChangeVehicleConfigEvent", {})
    local c1 = center()
    E("g_messageCenter", c1)
    dc.collectors = {}
    dc._vehicleFleetSubscribed = false
    dc:_subscribeToVehicleFleetEvents()
    local first = #c1.subs .. "," .. tostring(c1.subs[1] == ENGINE.BuyVehicleEvent) .. "," .. tostring(dc._vehicleFleetSubscribed)
    dc:shutdown()
    local reset = tostring(c1.cleared) .. "," .. tostring(dc._vehicleFleetSubscribed)
    local c2 = center()
    E("g_messageCenter", c2)
    dc:_subscribeToVehicleFleetEvents()
    return first .. "|" .. reset .. "|" .. #c2.subs
`;

describe("native mod environment: inherited engine runtime", () => {
    test("R00 engine state is inherited, not own keys, exactly like mods.lua", () => {
        const result = run("inherited", `
            E("g_time", 5)
            return tostring(rawget(_G, "g_time")) .. "|" .. type(_G.g_time) .. "|" .. tostring(_G == ENGINE) .. "|" .. tostring(rawget(_G, "FarmDashboardExportMirror") ~= nil)
        `);
        expect(result).toBe("nil|number|false|true");
    });

    test("R01 [discriminator] mirror stream starts are throttled by the inherited engine clock and resume after the gap", () => {
        expect(run("inherited", STREAM_THROTTLE)).toBe("started,throttled,true,started,16000");
    });

    test("R02 [discriminator] a throttled payload stays pending until the late-changing clock passes the gap", () => {
        expect(run("inherited", PENDING_UPDATE)).toBe("true,false");
    });

    test("R03 [discriminator] the host sees the inherited g_server for remote clients and broadcast fallback", () => {
        expect(run("inherited", SERVER_FALLBACK)).toBe("true,true,1,false");
    });

    test("R04 [control] absent or wrong-type g_server means no remote clients and no broadcast, without errors", () => {
        const result = run("inherited", `
            M._clients = {}
            E("g_server", nil)
            local _, _, a = M:_dispatchChunk(1, 1, "abc", {})
            local none = tostring(M:hasRemoteClients()) .. "," .. tostring(a)
            E("g_server", 7)
            local _, _, b = M:_dispatchChunk(1, 1, "abc", {})
            local wrong = tostring(M:hasRemoteClients()) .. "," .. tostring(b)
            E("g_server", { broadcastEvent = "no" })
            return none .. "|" .. wrong .. "|" .. tostring(M:hasRemoteClients())
        `);
        expect(result).toBe("false,false|false,false|false");
    });

    test("R05 [control] a non-authority client never starts a mirror stream even with a queued payload", () => {
        const result = run("inherited", `
            FarmDashboard.auth = false
            E("g_time", 90000)
            M._pendingJob = { owned = { payload = "abc" } }
            M._lastJobStartMs = nil
            M:update(16)
            return tostring(M._pendingJob ~= nil) .. "," .. tostring(M._job == nil) .. "," .. tostring(FarmDashboardSettingsApi:canBroadcastSettings())
        `);
        expect(result).toBe("true,true,false");
    });

    test("R06 [discriminator] unfinished receive buffers time out on the advancing inherited clock", () => {
        expect(run("inherited", SWEEP_TIMEOUT)).toBe("true,false,timeout,0,61000");
    });

    test("R07 [control] an absent or wrong-type clock never times out a receive buffer", () => {
        const result = run("inherited", `
            local m = {}
            F.ensure(m)
            m._receiveBufs["k1"] = { key = "k1", firstSeen = 0, owner = { lifetime = 1 } }
            E("g_time", nil)
            F.sweep(m)
            E("g_time", "99999999")
            F.sweep(m)
            return tostring(m._receiveBufs["k1"] ~= nil) .. "," .. #m._tombstones
        `);
        expect(result).toBe("true,0");
    });

    test("R08 [discriminator] the host rejects non-admin client settings and rebroadcasts admin settings", () => {
        expect(run("inherited", SETTINGS_HOST)).toBe("60000,true,0,0|90000,false,1,1|true");
    });

    test("R09 [control] a client applies settings sent by the server and cannot broadcast", () => {
        const result = run("inherited", `
            FarmDashboard.auth = false
            dc.config = { collectionCycleMs = 60000, enableAnimals = true }
            dc.saveConfig = function() error("client must not save authority config") end
            dc.applyDiagnosticsFromConfig = function() end
            local e = FarmDashboardSettingsEvent.emptyNew()
            e.boolValues = { enableAnimals = false }
            e.intValues = { collectionCycleMs = 90000 }
            e:run({ getIsServer = function() return true end })
            return tostring(dc.config.collectionCycleMs) .. "," .. tostring(dc.config.enableAnimals) .. "," .. tostring(FarmDashboardSettingsApi:canBroadcastSettings())
        `);
        expect(result).toBe("90000,false,false");
    });

    test("R10 [discriminator] the replica session key follows the current mission, including a save switch", () => {
        expect(run("inherited", SESSION_KEY)).toBe("sessA_1,sessB-2,nil,nil,nil");
    });

    test("R11 [discriminator] vehicle shop events subscribe via inherited classes and resubscribe after shutdown", () => {
        expect(run("inherited", FLEET)).toBe("3,true,true|true,false|3");
    });

    test("R12 [control] a non-authority process subscribes to no vehicle shop events", () => {
        const result = run("inherited", `
            FarmDashboard.auth = false
            E("BuyVehicleEvent", {})
            local c = center()
            E("g_messageCenter", c)
            dc._vehicleFleetSubscribed = false
            dc:_subscribeToVehicleFleetEvents()
            return #c.subs .. "," .. tostring(dc._vehicleFleetSubscribed)
        `);
        expect(result).toBe("0,false");
    });

    test("R13 [discriminator] the RL animal cluster event subscribes via the inherited class on the authority only", () => {
        const result = run("inherited", `
            local evt = {}
            E("AnimalClusterUpdateEvent", evt)
            local c = center()
            E("g_messageCenter", c)
            FarmDashboard.auth = false
            dc._rlSubscribed = false
            dc._rlSubscriptionTokens = {}
            dc:_subscribeToRLEvents()
            local client = #c.subs
            E("AnimalClusterUpdateEvent", "x")
            FarmDashboard.auth = true
            dc:_subscribeToRLEvents()
            local wrong = #c.subs
            E("AnimalClusterUpdateEvent", evt)
            dc:_subscribeToRLEvents()
            return client .. "," .. wrong .. "," .. #c.subs .. "," .. tostring(c.subs[1] == evt) .. "," .. tostring(dc._rlSubscribed) .. "," .. #dc._rlSubscriptionTokens
        `);
        expect(result).toBe("0,0,1,true,true,1");
    });

    test("R14 [discriminator] the current GUI name is read from the inherited g_gui", () => {
        const result = run("inherited", `
            E("g_gui", { currentGuiName = "InGameMenu" })
            local a = dc:_getCurrentGuiName()
            E("g_gui", { currentGuiName = "" })
            local b = dc:_getCurrentGuiName()
            E("g_gui", 5)
            local c = dc:_getCurrentGuiName()
            return tostring(a) .. "," .. tostring(b) .. "," .. tostring(c)
        `);
        expect(result).toBe("InGameMenu,nil,nil");
    });

    test("R15 [discriminator] Precision Farming counts as loaded only when its inherited namespace holds g_precisionFarming", () => {
        const result = run("inherited", `
            E("g_modIsLoaded", {})
            local loaded = setmetatable({}, { __index = ENGINE })
            rawset(loaded, "g_precisionFarming", {})
            E("FS25_precisionFarming", loaded)
            local a = dc:isPrecisionFarmingLoaded()
            E("FS25_precisionFarming", setmetatable({}, { __index = ENGINE }))
            local b = dc:isPrecisionFarmingLoaded()
            E("FS25_precisionFarming", "x")
            local c = dc:isPrecisionFarmingLoaded()
            E("FS25_precisionFarming", nil)
            local d = dc:isPrecisionFarmingLoaded()
            return tostring(a) .. "," .. tostring(b) .. "," .. tostring(c) .. "," .. tostring(d)
        `);
        expect(result).toBe("true,false,false,false");
    });

    test("R16 [control] g_modIsLoaded detection already works through normal lookup for PF, RL, ADS and mileage", () => {
        const result = run("inherited", `
            E("g_modIsLoaded", { FS25_precisionFarming = true, FS25_RealisticLivestock = true, FS25_AdvancedDamageSystem = true, FS25_VehicleMileage = true })
            local on = tostring(dc:isPrecisionFarmingLoaded()) .. tostring(dc:isRealisticLivestockLoaded())
            E("g_modIsLoaded", {})
            E("RealisticLivestock", {})
            local off = tostring(dc:isPrecisionFarmingLoaded()) .. tostring(dc:isRealisticLivestockLoaded())
            return on .. "," .. off
        `);
        expect(result).toBe("truetrue,falsefalse");
    });

    test("R17 [control] readFile already resolves through the normal-lookup branch (no change needed)", () => {
        const result = run("inherited", `
            ExportEnvelopePublisher = ExportEnvelopePublisher or {}
            FarmDashboardExportRoute = FarmDashboardExportRoute or {}
            dc._transportProtocol = nil
            E("readFile", function() return "" end)
            local a = dc:_usesXmlTransport()
            local raw = tostring(rawget(_G, "readFile"))
            E("readFile", nil)
            local b = dc:_usesXmlTransport()
            return tostring(a) .. "," .. raw .. "," .. tostring(b)
        `);
        expect(result).toBe("false,nil,true");
    });
});

describe("flat-layout controls (engine state also written as own keys)", () => {
    test.each([
        ["stream throttle", STREAM_THROTTLE, "started,throttled,true,started,16000"],
        ["pending update", PENDING_UPDATE, "true,false"],
        ["server fallback", SERVER_FALLBACK, "true,true,1,false"],
        ["sweep timeout", SWEEP_TIMEOUT, "true,false,timeout,0,61000"],
        ["settings host", SETTINGS_HOST, "60000,true,0,0|90000,false,1,1|true"],
        ["session key", SESSION_KEY, "sessA_1,sessB-2,nil,nil,nil"],
        ["vehicle fleet", FLEET, "3,true,true|true,false|3"],
    ])("C %s behaves the same in the flat layout", (_name, body, expected) => {
        expect(run("own", body)).toBe(expected);
    });
});
