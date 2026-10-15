"use strict";

/**
 * Boots every production Lua file listed in modDesc.xml (same order) inside one fengari state with the
 * ordinary-script-mod environment FS25 uses (modEnv with __index = engine table). Each machine gets its own
 * engine table (globals, Logging, profile path) so a dedicated server and a joined client can run the same
 * mod side by side and exchange real FarmDashboardExportEvent streams.
 *
 * The profile is in memory: XML documents keyed by path. io, os.rename and os.remove are removed before the
 * mod loads, so nothing touches the real disk.
 */
const fs = require("fs");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");

const modRoot = path.resolve(__dirname, "../../../FS25_FarmDashboard_Mod");

function modSourceFiles() {
    const desc = fs.readFileSync(path.join(modRoot, "modDesc.xml"), "utf8");
    const files = [];
    const re = /<sourceFile\s+filename="([^"]+)"/g;
    let m;
    while ((m = re.exec(desc)) !== null) files.push(m[1]);
    return files;
}

function longString(text) {
    let level = 0;
    while (text.includes("]" + "=".repeat(level) + "]")) level += 1;
    const eq = "=".repeat(level);
    return "[" + eq + "[\n" + text + "]" + eq + "]";
}

/** farmDashboard settings/modules attributes -> { "farmDashboard.settings#x": "v" } */
function configAttributes(xmlText) {
    const out = {};
    for (const section of ["settings", "modules"]) {
        const m = new RegExp(`<${section}\\s([^>]*)/>`).exec(xmlText);
        if (!m) continue;
        const re = /([A-Za-z0-9_]+)="([^"]*)"/g;
        let a;
        while ((a = re.exec(m[1])) !== null) out[`farmDashboard.${section}#${a[1]}`] = a[2];
    }
    return out;
}

// Shared engine natives (file API, streams). Each machine's engine table inherits these.
const natives = `
io = nil
os.rename = nil
os.remove = nil
unpack = unpack or table.unpack
loadstring = loadstring or load
function print(...) end
function printCallstack() end

FILES = {}
ENGINE_ERRORS = {}
local docs = {}
local nextHandle = 1
function createFolder(p) return true end
function fileExists(p) return FILES[p] ~= nil end
DELETED = {}
function deleteFile(p) DELETED[#DELETED + 1] = p; FILES[p] = nil end
function deleteFolder(p)
    DELETED[#DELETED + 1] = p .. "/"
    for k in pairs(FILES) do if string.sub(k, 1, #p + 1) == p .. "/" then FILES[k] = nil end end
end
function createXMLFile(name, p, root)
    local h = nextHandle; nextHandle = nextHandle + 1
    docs[h] = { path = p, fields = {} }
    return h
end
function loadXMLFile(name, p)
    if FILES[p] == nil then
        ENGINE_ERRORS[#ENGINE_ERRORS + 1] = "Failed to open xml file '" .. tostring(p) .. "'"
        return 0
    end
    local h = nextHandle; nextHandle = nextHandle + 1
    local copy = {}
    for k, v in pairs(FILES[p]) do copy[k] = v end
    docs[h] = { path = p, fields = copy }
    return h
end
function saveXMLFile(h)
    local d = docs[h]
    if d == nil then return false end
    if SAVE_FAIL and SAVE_FAIL(d.path) then return false end
    local copy = {}
    for k, v in pairs(d.fields) do copy[k] = v end
    FILES[d.path] = copy
    return true
end
function delete(h) docs[h] = nil end
function setXMLString(h, k, v) if docs[h] then docs[h].fields[k] = v end end
function setXMLInt(h, k, v) if docs[h] then docs[h].fields[k] = tostring(v) end end
function setXMLFloat(h, k, v) if docs[h] then docs[h].fields[k] = tostring(v) end end
function setXMLBool(h, k, v) if docs[h] then docs[h].fields[k] = v and "true" or "false" end end
function getXMLString(h, k) local d = docs[h]; if not d then return nil end; return d.fields[k] end
function getXMLInt(h, k) local n = tonumber(getXMLString(h, k)); if n then return math.floor(n) end; return nil end
function getXMLFloat(h, k) return tonumber(getXMLString(h, k)) end
function getXMLBool(h, k)
    local s = getXMLString(h, k)
    if s == "true" then return true elseif s == "false" then return false end
    return nil
end
function hasXMLProperty(h, k)
    local d = docs[h]; if not d then return false end
    for key in pairs(d.fields) do if string.sub(key, 1, #k) == k then return true end end
    return false
end
function getFiles() return {} end
COPY_CALLS = {}
function copyFile(src, dst, overwrite)
    COPY_CALLS[#COPY_CALLS + 1] = { src = src, dst = dst, overwriteType = type(overwrite) }
    if COPY_RESULT then return COPY_RESULT(src, dst, overwrite) end
    return false
end
function getDate(f) return "2026-10-06_21-07-18" end
function getTime() return 1759781238 end
function getAppVersion() return "1.23.1.0" end

-- Network stream: writeStream appends, readStream consumes in order.
STREAMS = {}
local function push(id, v) STREAMS[id] = STREAMS[id] or { q = {}, r = 1 }; local s = STREAMS[id]; s.q[#s.q + 1] = v end
local function pop(id) local s = STREAMS[id]; local v = s.q[s.r]; s.r = s.r + 1; return v end
function streamWriteString(id, v) push(id, tostring(v)) end
function streamWriteInt32(id, v) push(id, math.floor(tonumber(v) or 0)) end
function streamWriteBool(id, v) push(id, v == true) end
function streamWriteFloat32(id, v) push(id, tonumber(v) or 0) end
function streamReadString(id) return pop(id) end
function streamReadInt32(id) return pop(id) end
function streamReadBool(id) return pop(id) end
function streamReadFloat32(id) return pop(id) end
`;

const machineFactory = `
local SOURCES = ...
local function fmt(f, ...)
    local ok, s = pcall(string.format, f, ...)
    if ok then return s end
    return tostring(f)
end
function bootMachine(spec)
    local E = setmetatable({}, { __index = _G })
    E.LOG = {}
    E.Logging = {
        info = function(f, ...) E.LOG[#E.LOG + 1] = "I " .. fmt(f, ...) end,
        warning = function(f, ...) E.LOG[#E.LOG + 1] = "W " .. fmt(f, ...) end,
        error = function(f, ...) E.LOG[#E.LOG + 1] = "E " .. fmt(f, ...) end,
        devInfo = function() end,
        devWarning = function() end,
    }
    E.Event = {}
    function E.Event.new(mt) return setmetatable({}, mt) end
    E.Class = function(t, base) return { __index = t } end
    E.InitEventClass = function() end
    E.MOD_LISTENERS = {}
    E.addModEventListener = function(l) E.MOD_LISTENERS[#E.MOD_LISTENERS + 1] = l end
    E.Utils = {
        appendedFunction = function(a, b) return function(...) if a then a(...) end return b(...) end end,
        prependedFunction = function(a, b) return function(...) b(...) if a then return a(...) end end end,
        overwrittenFunction = function(a, b) return function(self, ...) return b(self, a, ...) end end,
        getNoNil = function(v, d) if v == nil then return d end return v end,
    }
    E.FSBaseMission = {
        sendInitialClientState = function() end,
        onFinishedReceivingDynamicData = function() end,
        onConnectionClosed = function() end,
    }
    E.FSCareerMissionInfo = { saveToXMLFile = function() return true end }
    E.SavegameController = { onSaveComplete = function() end }
    E.Vehicle = { load = function() end, register = function() end, delete = function() end }
    E.AccessHandler = { canPlayerAccess = function() return true end, update = function() end }
    E.MessageType = { CURRENT_MISSION_START = 101 }
    E.g_currentModDirectory = "mods/FS25_FarmDashboard/"
    E.g_currentModName = "FS25_FarmDashboard"
    E.PROFILE = spec.profile
    E.getUserProfileAppPath = function() return spec.profile end
    E.getTimeSec = function() return (E.g_time or 0) / 1000 end
    E.g_time = 20000
    E.g_modIsLoaded = { FS25_Courseplay = spec.courseplay == true }
    E.g_messageCenter = {
        subs = {},
        subscribe = function(self, evt, cb, obj) self.subs[#self.subs + 1] = { evt = evt, cb = cb, obj = obj } end,
        subscribeOneshot = function(self, evt, cb, obj) self.subs[#self.subs + 1] = { evt = evt, cb = cb, obj = obj, once = true } end,
        unsubscribe = function() end,
        unsubscribeAll = function() end,
        publish = function() end,
    }
    if spec.server then
        E.g_dedicatedServer = spec.dedicated and {} or nil
        E.g_server = { getIsServer = function() return true end, broadcastEvent = function() end, clientConnections = {} }
    else
        E.g_dedicatedServer = nil
        E.g_server = nil
        E.g_client = { getServerConnection = function() return nil end }
    end
    local fleet = {}
    for i = 1, (spec.vehicles or 0) do
        fleet[i] = {
            id = i, rootNode = 1000 + i, isDeleted = false, isDeleting = false, isLoading = false,
            configFileName = "data/vehicles/v" .. i .. ".xml",
            getOwnerFarmId = function() return 1 end,
            getName = function() return "Vehicle " .. i end,
            getFullName = function() return "Vehicle " .. i end,
            getIsOnField = function() return false end,
        }
    end
    local savegameDirectory = spec.profile .. "savegame1"
    E.g_currentMission = {
        missionInfo = {
            savegameDirectory = savegameDirectory,
            savegameIndex = 1,
            mapTitle = "Witcombe",
            mapId = "FS25_Witcombe.SampleModMap",
            xmlKey = "careerSavegame",
            baseDirectory = spec.profile .. "mods/FS25_Witcombe/",
            getIsLoadedFromSavegame = function() return true end,
        },
        missionDynamicInfo = { isMultiplayer = true, isClient = not spec.server, platformSessionId = spec.platformSessionId },
        vehicles = fleet,
        vehicleSystem = { vehicles = fleet, pendingVehicleLoads = {} },
        husbandrySystem = { placeables = {} },
        placeableSystem = { placeables = {} },
        paused = false,
    }
    if spec.config then
        FILES[spec.profile .. "modSettings/FS25_FarmDashboard/config.xml"] = spec.config
    end
    if spec.server then
        FILES[savegameDirectory .. "/careerSavegame.xml"] = FILES[savegameDirectory .. "/careerSavegame.xml"] or {
            ["careerSavegame.settings.savegameName"] = "Witcombe",
            ["careerSavegame.settings.mapId"] = "FS25_Witcombe.SampleModMap",
        }
    end
    local modEnv = setmetatable({}, { __index = E })
    modEnv._G = modEnv
    E.FS25_FarmDashboard = modEnv
    E.LOAD_ERRORS = {}
    for i = 1, #SOURCES do
        local fn, cerr = load(SOURCES[i].text, "=" .. SOURCES[i].name, "t", modEnv)
        if not fn then E.LOAD_ERRORS[#E.LOAD_ERRORS + 1] = SOURCES[i].name .. ": " .. tostring(cerr)
        else
            local ok, rerr = pcall(fn)
            if not ok then E.LOAD_ERRORS[#E.LOAD_ERRORS + 1] = SOURCES[i].name .. ": " .. tostring(rerr) end
        end
    end
    return { E = E, M = modEnv }
end
`;

function luaTable(obj) {
    return "{ " + Object.entries(obj).map(([k, v]) => `[${JSON.stringify(k)}] = ${JSON.stringify(v)}`).join(",\n") + " }";
}

/**
 * @param {object} opts
 * @param {string} opts.configXml   server config.xml text
 * @param {number} [opts.vehicles]  server fleet size (default 71)
 * @param {boolean} [opts.dedicated] g_dedicatedServer set on the server (default true)
 * @param {string} opts.script      Lua body run in the server's mod environment; SERVER and bootMachine are visible
 */
function runDedicated(opts) {
    const L = lauxlib.luaL_newstate();
    try {
        lualib.luaL_openlibs(L);
        const sources = "{ " + modSourceFiles().map(
            (file) => `{ name = ${JSON.stringify(file)}, text = ${longString(fs.readFileSync(path.join(modRoot, file), "utf8"))} }`,
        ).join(",\n") + " }";
        const vehicles = opts.vehicles == null ? 71 : opts.vehicles;
        const dedicated = opts.dedicated !== false;
        const chunk = [
            natives,
            `local SOURCES = ${sources}`,
            `assert(load(${longString(machineFactory)}, "=factory", "t", _G))(SOURCES)`,
            `SERVER = bootMachine({ server = true, dedicated = ${dedicated}, courseplay = true, vehicles = ${vehicles}, profile = "/server/", config = ${luaTable(configAttributes(opts.configXml || ""))} })`,
            `local body = assert(load(${longString(opts.script)}, "=harness", "t", SERVER.M))`,
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

/** Shared Lua prelude for scripts: boot like the dedicated log, frame helpers, a client and a connection pair. */
const DEDICATED_PRELUDE = `
local ENGINE = SERVER.E
local FD = FarmDashboard
local DC = FarmDashboardDataCollector
local ROUTE = FarmDashboardExportRoute
local function upvalue(fn, wanted)
    local i = 1
    while true do
        local name, value = debug.getupvalue(fn, i)
        if name == nil then return nil end
        if name == wanted then return value end
        i = i + 1
    end
end
local function routeJob() return upvalue(ROUTE.status, "job") end
local function setTime(t) ENGINE.g_time = t end
local clients = {}
local extraServers = {}
local function frame(dt)
    ENGINE.g_time = ENGINE.g_time + dt
    FD:update(dt)
    for _, s in ipairs(extraServers) do
        s.E.g_time = ENGINE.g_time
        s.M.FarmDashboard:update(dt)
    end
    for _, c in ipairs(clients) do
        c.E.g_time = ENGINE.g_time
        c.M.FarmDashboard:update(dt)
    end
end
local function grep(log, pattern)
    local out = {}
    for _, line in ipairs(log) do
        if string.find(line, pattern) then out[#out + 1] = line end
    end
    return out
end
local function bootLikeServerLog()
    setTime(20000)
    FD:loadMap()
    setTime(62649)
    FD:onEngineMissionStart(false)
    setTime(199723 - 23)
    frame(22.68)
end
local function state()
    local j = routeJob() or {}
    local pub = j.publisher and j.publisher.job or nil
    return {
        routePhase = tostring(j.phase),
        routeHeld = j.held ~= nil,
        routeHeldGen = j.held and tostring(j.held.generation) or "nil",
        routeActive = j.active ~= nil,
        publisherPhase = pub and tostring(pub.phase) or "nil",
        publisherWaiting = pub and pub.waiting ~= nil or false,
        xmlInFlight = DC._xmlInFlight == true,
        completed = tonumber(DC._completedGeneration) or 0,
        activeCandidate = tostring(DC._activeCandidateGeneration),
        jsonJob = DC._jsonWriteJob ~= nil,
        pendingDisk = DC._jsonPendingDisk ~= nil,
        jsonPending = DC._jsonWritePending ~= nil,
        heldGameplay = DC._heldGameplay ~= nil,
        incActive = tostring(DC._incActiveModule),
    }
end
local function stateLine(s)
    return string.format("route=%s held=%s(gen %s) active=%s pub=%s waiting=%s | inFlight=%s completed=%d candidate=%s jsonJob=%s pendingDisk=%s jsonPending=%s heldGameplay=%s inc=%s",
        s.routePhase, tostring(s.routeHeld), s.routeHeldGen, tostring(s.routeActive), s.publisherPhase, tostring(s.publisherWaiting),
        tostring(s.xmlInFlight), s.completed, s.activeCandidate, tostring(s.jsonJob), tostring(s.pendingDisk), tostring(s.jsonPending), tostring(s.heldGameplay), s.incActive)
end
local function commitsLogged()
    return #grep(ENGINE.LOG, "export committed generation=")
end
local function runUntil(pred, maxFrames, dt)
    for i = 1, maxFrames do
        frame(dt or 16)
        if pred() then return i end
    end
    return nil
end
-- A second dedicated server (its own profile, so its own saved career ID), stepped by frame().
local function addServer(name)
    local cfg = FILES["/server/modSettings/FS25_FarmDashboard/config.xml"]
    local s = bootMachine({ server = true, dedicated = true, courseplay = true, vehicles = 0, profile = "/" .. name .. "/", config = cfg })
    s.E.g_time = ENGINE.g_time
    s.M.FarmDashboard:loadMap()
    s.M.FarmDashboard:onEngineMissionStart(false)
    extraServers[#extraServers + 1] = s
    return s
end
local streamSerial = 0
-- Client-side connection object (to the server) and server-side connection object (to this client), then the
-- client's dynamic-data hook and the server's initial-state send. server = nil means the main dedicated server.
-- Events cross by class identity: the receiving machine reads the same event class from its own mod environment.
PAIRING_SENT = {}
local function deliver(event, fromM, toM, id, conn)
    local cls = getmetatable(event).__index
    local name = cls == fromM.FarmDashboardPairingEvent and "FarmDashboardPairingEvent" or "FarmDashboardExportEvent"
    if name == "FarmDashboardPairingEvent" then
        if PAIRING_DROP and PAIRING_DROP(event, toM) then return name end
        if PAIRING_TAMPER then PAIRING_TAMPER(event, toM) end
        PAIRING_SENT[#PAIRING_SENT + 1] = { kind = event.kind, a = event.a, b = event.b, c = event.c, d = event.d }
    end
    event:writeStream(id, nil)
    local incoming = toM[name].emptyNew()
    incoming:readStream(id, conn)
    STREAMS[id] = nil
    return name
end
local function connect(c, server, epoch)
    local S = server or SERVER
    local toServer = { epoch = epoch }
    local toClient = { client = c }
    function toServer:getIsServer() return true end
    function toServer:sendEvent(event)
        if c.toServer ~= toServer then return end
        streamSerial = streamSerial + 1
        deliver(event, c.M, S.M, "c" .. streamSerial, toClient)
    end
    function toClient:getIsServer() return false end
    function toClient:sendEvent(event)
        if c.toClient ~= toClient then return end
        streamSerial = streamSerial + 1
        if deliver(event, S.M, c.M, "s" .. streamSerial, toServer) == "FarmDashboardExportEvent" then
            c.received = (c.received or 0) + 1
        end
    end
    c.toServer, c.toClient, c.server = toServer, toClient, S
    S.E.FSBaseMission.sendInitialClientState(S.E.g_currentMission, toClient, nil, nil)
    c.E.FSBaseMission.onFinishedReceivingDynamicData(c.E.g_currentMission, toServer)
    clients[#clients + 1] = c
    return c
end
-- A joined client machine with its own profile. pairing = { sourceId, remoteSlot, serverKey } or nil.
local function joinClient(name, pairing, server)
    local c = bootMachine({ server = false, profile = "/" .. name .. "/", platformSessionId = pairing and pairing.serverKey or "join-" .. name })
    c.E.g_time = ENGINE.g_time
    if pairing then
        FILES[c.E.PROFILE .. "modSettings/FS25_FarmDashboard/replicaSources.xml"] = {
            ["farmDashboardReplicaSources.source(0)#sourceId"] = pairing.sourceId,
            ["farmDashboardReplicaSources.source(0)#remoteSlot"] = pairing.remoteSlot,
            ["farmDashboardReplicaSources.source(0)#serverKey"] = pairing.serverKey,
        }
    end
    c.M.FarmDashboard:loadMap()
    return connect(c, server, 1)
end
local function leaveClient(c)
    c.E.FSBaseMission.onConnectionClosed(c.E.g_currentMission, c.toServer, 0)
    c.server.M.FarmDashboardExportMirror:noteDisconnect(c.toClient)
    for i = #clients, 1, -1 do if clients[i] == c then table.remove(clients, i) end end
    c.toServer, c.toClient = { epoch = c.toServer.epoch }, {}
end
-- Same client machine reconnects with fresh connection objects (mod state on the client survives).
-- Every join gets a new platformSessionId, as FS25 does; joinKey overrides the generated one.
local function reconnectClient(c, joinKey, server)
    local epoch = (c.toServer and c.toServer.epoch or 1) + 1
    local info = c.E.g_currentMission.missionDynamicInfo
    info.platformSessionId = joinKey or (tostring(info.platformSessionId) .. "-r" .. epoch)
    return connect(c, server or c.server, epoch)
end
local REAL = getmetatable(ENGINE).__index
local function replicaOf(c, sourceId)
    local sel = FILES[c.E.PROFILE .. "modSettings/FS25_FarmDashboard/replicas/" .. sourceId .. "/selected.xml"]
    local slotA = FILES[c.E.PROFILE .. "modSettings/FS25_FarmDashboard/replicas/" .. sourceId .. "/slot-a.xml"]
    local slotB = FILES[c.E.PROFILE .. "modSettings/FS25_FarmDashboard/replicas/" .. sourceId .. "/slot-b.xml"]
    local best = nil
    for _, f in ipairs({ sel, slotA, slotB }) do
        if f then
            local g = tonumber(f["farmDashboardExport#exportGeneration"]) or 0
            if best == nil or g > (tonumber(best["farmDashboardExport#exportGeneration"]) or 0) then best = f end
        end
    end
    return best, sel
end
`;

module.exports = { runDedicated, DEDICATED_PRELUDE, configAttributes, modSourceFiles };
