"use strict";

const fs = require("fs");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");

const modSrc = path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src");
const modFiles = [
    "FarmDashboardSettingsApi.lua",
    "FarmDashboardSettingsEvent.lua",
    "ExportEnvelopePublisher.lua",
    "FarmDashboardExportFinalizer.lua",
    "FarmDashboardExportEvent.lua",
    "FarmDashboardExportMirror.lua",
];

const prelude = `
Logging = { info = function() end, warning = function() end }
FarmDashLog = { devWarn = function() end, dev = function() end, error = function() end, isVerbose = function() return false end }
Event = {}
function Event.new(mt) return setmetatable({}, mt) end
function Class(classTable) return { __index = classTable } end
function InitEventClass() end
function createFolder() end
Utils = {}
function Utils.getNoNil(value, default) if value == nil then return default end return value end
function Utils.appendedFunction(oldFunc, newFunc)
    return function(...) if oldFunc then oldFunc(...) end newFunc(...) end
end
FSBaseMission = { sendInitialClientState = function() end, onFinishedReceivingDynamicData = function() end }

AUTH = true
FarmDashboard = { UPDATE_INTERVAL = 60000 }
function FarmDashboard:isAuthority() return AUTH end
FarmDashboardDataCollector = { config = {} }
function FarmDashboardDataCollector:applyDiagnosticsFromConfig() end
function FarmDashboardDataCollector:saveConfig() end
`;

const host = `
local q, readAt, problem = {}, 1, nil
local function writer(kind) return function(_, value) q[#q + 1] = { kind = kind, value = value } end end
local function reader(kind)
    return function()
        local entry = q[readAt]
        readAt = readAt + 1
        if entry == nil then
            problem = problem or ("underflow:" .. kind)
            if kind == "bool" then return false elseif kind == "int32" then return 0 end
            return ""
        end
        if entry.kind ~= kind then problem = problem or ("type:" .. entry.kind .. "->" .. kind) end
        return entry.value
    end
end
streamWriteBool, streamReadBool = writer("bool"), reader("bool")
streamWriteInt32, streamReadInt32 = writer("int32"), reader("int32")
streamWriteString, streamReadString = writer("string"), reader("string")

function resetStream() q, readAt, problem = {}, 1, nil end

--- Reader result: everything the writer produced was consumed, in order, with matching types.
function streamReport()
    local consumed = readAt - 1
    local ok = problem == nil and consumed == #q
    return string.format("ok=%s written=%d consumed=%d problem=%s", tostring(ok), #q, consumed, tostring(problem))
end

function serverConn()
    local conn = { sent = {} }
    function conn:getIsServer() return true end
    function conn:sendEvent(event) self.sent[#self.sent + 1] = event end
    return conn
end
function clientConn()
    local conn = { sent = {} }
    function conn:getIsServer() return false end
    function conn:sendEvent(event) self.sent[#self.sent + 1] = event end
    return conn
end

function exportMeta(overrides)
    local meta = {
        wireVersion = 2, connectionEpoch = 1, transferId = "1-1", declaredBytes = 4, decodedBytes = 3,
        crc = "1", careerId = "career-a", sessionId = "session-a", publicationSequence = 1,
        exportGeneration = 1, sourceSlot = "savegame3", schema = "2", encoding = "base64",
        simulationTimeMs = "10",
    }
    for key, value in pairs(overrides or {}) do meta[key] = value end
    return meta
end

--- Server writes one export chunk; the client (non-authority unless told otherwise) reads it.
function exportRoundTrip(index, total, payload, meta, clientAuthority, connection)
    resetStream()
    AUTH = true
    FarmDashboardExportEvent.new(index, total, payload, meta):writeStream(1, nil)
    AUTH = clientAuthority == true
    local received = {}
    FarmDashboardExportMirror.onChunkReceived = function(_, i) received[#received + 1] = i end
    local incoming = FarmDashboardExportEvent.emptyNew()
    incoming:readStream(1, connection or serverConn())
    return streamReport() .. " delivered=" .. #received .. " rejected=" .. tostring(incoming.rejected)
end
`;

function runLua(chunk) {
    const L = lauxlib.luaL_newstate();
    try {
        lualib.luaL_openlibs(L);
        const parts = [prelude];
        for (const file of modFiles) parts.push(fs.readFileSync(path.join(modSrc, file), "utf8"));
        parts.push(host);
        parts.push(chunk);
        const status = lauxlib.luaL_dostring(L, to_luastring(parts.join("\n")));
        if (status !== lua.LUA_OK) {
            const err = lua.lua_tostring(L, -1);
            throw new Error(err ? to_jsstring(err) : `lua error ${status}`);
        }
        const value = lua.lua_tostring(L, -1);
        return value ? to_jsstring(value) : "";
    } finally {
        lua.lua_close(L);
    }
}

describe("join stream symmetry (server write == client read)", () => {
    test("join hook sends only the settings event while no export is committed", () => {
        const result = runLua(`
            AUTH = true
            local conn = serverConn()
            FSBaseMission.sendInitialClientState({}, conn, {}, {})
            for _ = 1, 50 do FarmDashboardExportMirror:update(16) end
            local names = {}
            for _, event in ipairs(conn.sent) do
                if getmetatable(event).__index == FarmDashboardSettingsEvent then names[#names + 1] = "settings"
                elseif getmetatable(event).__index == FarmDashboardExportEvent then names[#names + 1] = "export"
                else names[#names + 1] = "other" end
            end
            return table.concat(names, ",")
        `);
        expect(result).toBe("settings");
    });

    test("join hook on a non-authority sends nothing", () => {
        const result = runLua(`
            AUTH = false
            local conn = serverConn()
            FSBaseMission.sendInitialClientState({}, conn, {}, {})
            for _ = 1, 50 do FarmDashboardExportMirror:update(16) end
            return tostring(#conn.sent)
        `);
        expect(result).toBe("0");
    });

    const clientSetups = {
        "client defaults, no local config": "FarmDashboardDataCollector.config = {}",
        "client mirror disabled (mirrorExport/allowExportMirror false)":
            "FarmDashboardDataCollector.config = { mirrorExport = false, allowExportMirror = false }",
        "client diagnostics on and odd ints": "FarmDashboardDataCollector.config = { diagnostics = true, collectionCycleMs = 5, sliceBudgetMs = 999 }",
        "client with no data collector": "FarmDashboardDataCollector.config = nil",
    };

    for (const [name, setup] of Object.entries(clientSetups)) {
        test(`settings event consumed exactly on ${name}`, () => {
            const result = runLua(`
                FarmDashboardDataCollector.config = { mirrorExport = false, allowExportMirror = true, diagnostics = false, collectionCycleMs = 120000 }
                AUTH = true
                local conn = serverConn()
                FSBaseMission.sendInitialClientState({}, conn, {}, {})
                resetStream()
                conn.sent[1]:writeStream(1, conn)
                local expected = #FarmDashboardSettingsApi.BOOL_KEYS + #FarmDashboardSettingsApi.INT_KEYS
                AUTH = false
                ${setup}
                local incoming = FarmDashboardSettingsEvent.emptyNew()
                incoming:readStream(1, serverConn())
                return streamReport() .. " expected=" .. expected
            `);
            expect(result).toMatch(/^ok=true written=(\d+) consumed=\1 problem=nil expected=\1$/);
        });
    }

    test("settings event write size is fixed whatever the server's local config holds", () => {
        const result = runLua(`
            AUTH = true
            local sizes = {}
            for _, cfg in ipairs({ {}, { mirrorExport = false }, { diagnostics = true, collectionCycleMs = 1800000 } }) do
                FarmDashboardDataCollector.config = cfg
                resetStream()
                FarmDashboardSettingsEvent.newFromConfig():writeStream(1, nil)
                sizes[#sizes + 1] = streamReport():match("written=(%d+)")
            end
            return table.concat(sizes, ",")
        `);
        const sizes = result.split(",");
        expect(new Set(sizes).size).toBe(1);
    });

    test("settings event from a client is consumed exactly on the authority", () => {
        const result = runLua(`
            AUTH = false
            resetStream()
            FarmDashboardSettingsEvent.newFromConfig():writeStream(1, nil)
            AUTH = true
            local incoming = FarmDashboardSettingsEvent.emptyNew()
            incoming:readStream(1, clientConn())
            return streamReport()
        `);
        expect(result).toMatch(/^ok=true /);
    });

    const exportBranches = {
        "accepted chunk": ["1, 1, 'AAAA', exportMeta()", /delivered=1 rejected=nil$/],
        "writer on another wire version": ["1, 1, 'AAAA', exportMeta({ wireVersion = 1 })", /delivered=0 rejected=version$/],
        "range reject (zero chunks)": ["1, 0, 'AAAA', exportMeta()", /delivered=0 rejected=range$/],
        "range reject (index past total)": ["5, 2, 'AAAA', exportMeta()", /delivered=0 rejected=range$/],
        "chunk reject (empty payload)": ["1, 1, '', exportMeta()", /delivered=0 rejected=chunk$/],
        "chunk reject (oversize payload)": ["1, 1, string.rep('A', 1025), exportMeta()", /delivered=0 rejected=chunk$/],
        "identity reject (no transfer id)": ["1, 1, 'AAAA', exportMeta({ transferId = '' })", /delivered=0 rejected=identity$/],
        "identity reject (no crc)": ["1, 1, 'AAAA', exportMeta({ crc = '' })", /delivered=0 rejected=identity$/],
        "header reject (finalizer)": ["1, 1, 'AAAA', exportMeta({ schema = '3' })", /delivered=0 rejected=schema$/],
        "received on authority": ["1, 1, 'AAAA', exportMeta(), true", /delivered=0 /],
        "not from server connection": ["1, 1, 'AAAA', exportMeta(), false, clientConn()", /delivered=0 /],
    };

    for (const [name, [args, outcome]] of Object.entries(exportBranches)) {
        test(`export event consumed exactly: ${name}`, () => {
            const result = runLua(`return exportRoundTrip(${args})`);
            expect(result).toMatch(/^ok=true written=(\d+) consumed=\1 problem=nil /);
            expect(result).toMatch(outcome);
        });
    }
});
