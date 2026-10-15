"use strict";

const fs = require("fs");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");

const modSrc = path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src");
const mirrorFiles = [
    "ExportEnvelopePublisher.lua",
    "FarmDashboardExportFinalizer.lua",
    "FarmDashboardExportEvent.lua",
    "FarmDashboardExportMirror.lua",
];

const host = `
local files = {}
local saved = {}
local docs = {}
local nextId = 1
function createXMLFile(name, p, root)
    local id = nextId
    nextId = nextId + 1
    docs[id] = { path = p, root = root, fields = {} }
    return id
end
function setXMLString(handle, key, value)
    local doc = docs[handle]
    if not doc then return end
    local name = string.match(key, "#(.+)$") or key
    doc.fields[name] = value
end
function saveXMLFile(handle)
    local doc = docs[handle]
    if not doc then return false end
    local parts = { "<" .. doc.root }
    local order = {
        "schema", "careerId", "sessionId", "publicationSequence", "exportGeneration",
        "simulationTimeMs", "encoding", "bytes", "crc", "payload",
        "sourceId", "sourceSlot", "connectionEpoch", "replica", "slot",
    }
    for i = 1, #order do
        local name = order[i]
        if doc.fields[name] ~= nil then
            parts[#parts + 1] = " " .. name .. '="' .. doc.fields[name] .. '"'
        end
    end
    parts[#parts + 1] = "/>"
    local copy = {}
    for key, value in pairs(doc.fields) do copy[key] = value end
    saved[doc.path] = copy
    files[doc.path] = table.concat(parts)
    return true
end
function loadXMLFile(name, p)
    if saved[p] == nil then return 0 end
    local id = nextId
    nextId = nextId + 1
    local copy = {}
    for key, value in pairs(saved[p]) do copy[key] = value end
    docs[id] = { path = p, root = "farmDashboardExport", fields = copy }
    return id
end
function getXMLString(handle, key)
    local doc = docs[handle]
    if not doc then return nil end
    local name = string.match(key, "#(.+)$") or key
    return doc.fields[name]
end
function delete() end
function fileExists(p)
    return files[p] ~= nil
end
local q = {}
local readAt = 1
function streamWriteString(id, value) q[#q + 1] = value end
function streamWriteInt32(id, value) q[#q + 1] = value end
function streamReadString(id)
    local value = q[readAt]
    readAt = readAt + 1
    return value
end
function streamReadInt32(id)
    local value = q[readAt]
    readAt = readAt + 1
    return value
end
local function resetQueue()
    q = {}
    readAt = 1
end
local function makeConn(epoch)
    local conn = { epoch = epoch or 1 }
    function conn:getIsServer() return true end
    function conn:sendEvent(event)
        resetQueue()
        event:writeStream(1, self)
        readAt = 1
        local incoming = FarmDashboardExportEvent.emptyNew()
        incoming:readStream(1, self)
    end
    return conn
end
local function bind(conn, sourceId)
    FarmDashboardExportMirror._replicaRoot = "replica/"
    FarmDashboardExportMirror:registerReplicaSource(conn, sourceId)
    FarmDashboardExportMirror._clients = FarmDashboardExportMirror._clients or {}
    FarmDashboardExportMirror._clients[conn] = true
    return conn
end
local function recordFor(body, sequence, generation, sessionId)
    local payload = ExportEnvelopePublisher.encodeBase64(body)
    local crc = ExportEnvelopePublisher.checksum(body)
    return {
        schema = "2", careerId = "career-a", sessionId = sessionId or "session-a",
        publicationSequence = tostring(sequence), exportGeneration = tostring(generation),
        simulationTimeMs = "10", encoding = "base64", bytes = tostring(#body),
        crc = crc, payload = payload, sourceSlot = "savegame3", persistence = "saved",
        sessionToken = "token-a", targetDir = "virtual/career-a/", slot = "a",
    }, payload, crc
end
local function stored(sourceId)
    return files["replica/" .. sourceId .. "/selected.xml"] ~= nil
end
local function reserved()
    return FarmDashboardExportMirror._reservedBytes or 0
end
local function receiveCount()
    local n = 0
    for _ in pairs(FarmDashboardExportMirror._receiveBufs or {}) do n = n + 1 end
    return n
end
local function workLeft()
    return receiveCount() + #(FarmDashboardExportMirror._queued or {}) + ((FarmDashboardExportMirror._active and not FarmDashboardExportMirror._active.released) and 1 or 0)
end
local function baseMeta(transferId)
    return {
        wireVersion = 2,
        connectionEpoch = 1,
        transferId = transferId or "1-1",
        declaredBytes = 4,
        decodedBytes = 3,
        crc = "1",
        careerId = "career-a",
        sessionId = "session-a",
        publicationSequence = 1,
        exportGeneration = 1,
        sourceSlot = "savegame3",
        schema = "2",
        encoding = "base64",
        simulationTimeMs = "10",
    }
end
local function direct(conn, meta, index, total, payload)
    FarmDashboardExportMirror._lastReplicaOutcome = "none"
    local before = reserved()
    FarmDashboardExportMirror:onChunkReceived(index or 1, total or 1, payload or "AAAA", meta, conn)
    return tostring(FarmDashboardExportMirror._lastReplicaOutcome), reserved() == before
end
`;

function runLua(chunk) {
    const L = lauxlib.luaL_newstate();
    try {
        lualib.luaL_openlibs(L);
        const parts = [
            "Logging = { info = function() end, warning = function() end }",
            "FarmDashLog = { devWarn = function() end, dev = function() end, error = function() end, isVerbose = function() return false end }",
            "Event = {}",
            "function Event.new(mt) return setmetatable({}, mt) end",
            "function Class(classTable) return { __index = classTable } end",
            "function InitEventClass() end",
            "function createFolder() end",
        ];
        for (const file of mirrorFiles) parts.push(fs.readFileSync(path.join(modSrc, file), "utf8"));
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

describe("replica gate B", () => {
    test("1 disconnect before update retires a queued transfer and ignores a stale event", () => {
        const result = runLua(`
            local conn = bind(makeConn(1), "source-a")
            local record = recordFor('{"vehicles":[{"id":1}]}', 1, 1)
            FarmDashboardExportMirror:onCommittedEnvelope(record)
            FarmDashboardExportMirror:update(16)
            local queued = #(FarmDashboardExportMirror._queued or {})
            local job = FarmDashboardExportMirror._queued[1]
            local header = job.header
            local payload = job.parts[1]
            local total = job.totalChunks
            FarmDashboardExportMirror:noteDisconnect(conn)
            for _ = 1, 8 do FarmDashboardExportMirror:update(16) end
            local reason = direct(conn, header, 1, total, payload)
            return "queued=" .. queued
                .. "|stored=" .. tostring(stored("source-a"))
                .. "|work=" .. workLeft()
                .. "|reserved=" .. reserved()
                .. "|registered=" .. tostring(FarmDashboardExportMirror._replicaSources[conn] ~= nil)
                .. "|stale=" .. reason
        `);
        expect(result).toBe("queued=1|stored=false|work=0|reserved=0|registered=false|stale=unbound-source");
    });

    test("2 disconnect during decode and at the pre-publication boundary writes nothing", () => {
        const decode = runLua(`
            local conn = bind(makeConn(1), "source-a")
            local record = recordFor(string.rep("m", 5000), 1, 1)
            FarmDashboardExportMirror._finalizerBudget = 4
            FarmDashboardExportMirror:onCommittedEnvelope(record)
            local saw = false
            for _ = 1, 80 do
                FarmDashboardExportMirror:update(16)
                local job = FarmDashboardExportMirror._active or (FarmDashboardExportMirror._queued or {})[1]
                if job and job.phase == "decode" and (job.decodedCount or 0) > 0 then
                    saw = true
                    break
                end
            end
            FarmDashboardExportMirror:noteDisconnect(conn)
            for _ = 1, 8 do FarmDashboardExportMirror:update(16) end
            return tostring(saw) .. ":" .. tostring(stored("source-a")) .. ":" .. workLeft() .. ":" .. reserved()
        `);
        const boundary = runLua(`
            local conn = bind(makeConn(1), "source-a")
            local record = recordFor(string.rep("m", 5000), 1, 1)
            FarmDashboardExportMirror:onCommittedEnvelope(record)
            local saw = false
            for _ = 1, 40 do
                FarmDashboardExportMirror:update(16)
                local job = FarmDashboardExportMirror._active
                if job and job.phase == "candidate" and files["replica/source-a/slot-a.xml"] == nil then
                    saw = true
                    break
                end
            end
            FarmDashboardExportMirror:noteDisconnect(conn)
            for _ = 1, 8 do FarmDashboardExportMirror:update(16) end
            return tostring(saw) .. ":" .. tostring(stored("source-a")) .. ":" .. workLeft() .. ":" .. reserved()
        `);
        expect(decode).toBe("true:false:0:0");
        expect(boundary).toBe("true:false:0:0");
    });

    test("3 cancelJob drops receiving, queued, and active work and does not replay it", () => {
        const result = runLua(`
            local conn = bind(makeConn(1), "source-a")
            local partial = baseMeta("1-9")
            partial.declaredBytes = 8
            partial.decodedBytes = 6
            partial.crc = "1"
            direct(conn, partial, 1, 2, "AAAA")
            local record = recordFor(string.rep("q", 300), 1, 1)
            FarmDashboardExportMirror._finalizerBudget = 4
            FarmDashboardExportMirror:onCommittedEnvelope(record)
            FarmDashboardExportMirror:update(16)
            FarmDashboardExportMirror:update(16)
            local before = "recv=" .. receiveCount() .. "|queued=" .. #(FarmDashboardExportMirror._queued or {}) .. "|active=" .. tostring(FarmDashboardExportMirror._active ~= nil)
            FarmDashboardExportMirror:cancelJob()
            FarmDashboardExportMirror:cancelJob()
            local joined = {}
            local sent = 0
            function joined:sendEvent() sent = sent + 1 end
            FarmDashboardExportMirror:onClientJoined(joined)
            for _ = 1, 8 do FarmDashboardExportMirror:update(16) end
            return before
                .. "|afterRecv=" .. receiveCount()
                .. "|afterQueued=" .. #(FarmDashboardExportMirror._queued or {})
                .. "|active=" .. tostring(FarmDashboardExportMirror._active ~= nil)
                .. "|reserved=" .. reserved()
                .. "|stored=" .. tostring(stored("source-a"))
                .. "|cached=" .. tostring(FarmDashboardExportMirror._latestCommitted ~= nil)
                .. "|replay=" .. tostring(FarmDashboardExportMirror._joinReplay ~= nil)
                .. "|sent=" .. sent
        `);
        expect(result).toContain("afterRecv=0");
        expect(result).toContain("afterQueued=0");
        expect(result).toContain("active=false");
        expect(result).toContain("reserved=0");
        expect(result).toContain("stored=false");
        expect(result).toContain("cached=false");
        expect(result).toContain("replay=false");
        expect(result).toContain("sent=0");
        expect(result).toMatch(/recv=[1-9]/);
    });

    test("4 disconnect of source A leaves source B on the same epoch free to finish", () => {
        const result = runLua(`
            local a = bind(makeConn(1), "source-a")
            local b = bind(makeConn(1), "source-b")
            local record = recordFor('{"vehicles":[{"id":1}]}', 1, 1)
            FarmDashboardExportMirror:onCommittedEnvelope(record)
            FarmDashboardExportMirror:update(16)
            FarmDashboardExportMirror:noteDisconnect(a)
            FarmDashboardExportMirror:noteDisconnect(a)
            for _ = 1, 8 do FarmDashboardExportMirror:update(16) end
            return "a=" .. tostring(stored("source-a"))
                .. "|b=" .. tostring(stored("source-b"))
                .. "|epochA=" .. tostring(a.epoch)
                .. "|epochB=" .. tostring(b.epoch)
                .. "|work=" .. workLeft()
        `);
        expect(result).toBe("a=false|b=true|epochA=1|epochB=1|work=0");
    });

    test("5 an old queued job cannot publish into a rebound source or a new lifetime", () => {
        const result = runLua(`
            local conn = bind(makeConn(1), "source-a")
            local record = recordFor('{"vehicles":[{"id":1}]}', 1, 1)
            FarmDashboardExportMirror:onCommittedEnvelope(record)
            FarmDashboardExportMirror:update(16)
            local captured = FarmDashboardExportMirror._queued[1].owner.sourceId
            FarmDashboardExportMirror:registerReplicaSource(conn, "source-b")
            for _ = 1, 8 do FarmDashboardExportMirror:update(16) end
            local afterRebind = tostring(stored("source-a")) .. ":" .. tostring(stored("source-b"))
            local again = recordFor('{"vehicles":[{"id":2}]}', 2, 2)
            FarmDashboardExportMirror:onCommittedEnvelope(again)
            for _ = 1, 8 do FarmDashboardExportMirror:update(16) end
            local rebound = tostring(stored("source-a")) .. ":" .. tostring(stored("source-b"))
            FarmDashboardExportMirror:noteDisconnect(conn)
            local fresh = bind(makeConn(1), "source-a")
            local third = recordFor('{"vehicles":[{"id":3}]}', 3, 3)
            FarmDashboardExportMirror:onCommittedEnvelope(third)
            for _ = 1, 8 do FarmDashboardExportMirror:update(16) end
            return captured .. "|" .. afterRebind .. "|" .. rebound .. "|fresh=" .. tostring(stored("source-a")) .. "|same=" .. tostring(fresh ~= conn)
        `);
        expect(result).toBe("source-a|false:false|false:true|fresh=true|same=true");
    });

    test("6 twenty-five duplicate completions publish once", () => {
        const result = runLua(`
            local writes = 0
            local nativeSave = saveXMLFile
            function saveXMLFile(handle)
                local doc = docs[handle]
                if doc and string.find(doc.path, "slot-", 1, true) then writes = writes + 1 end
                return nativeSave(handle)
            end
            local conn = bind(makeConn(1), "source-a")
            local record = recordFor('{"vehicles":[{"id":1}]}', 1, 1)
            FarmDashboardExportMirror:onCommittedEnvelope(record)
            FarmDashboardExportMirror:update(16)
            local job = FarmDashboardExportMirror._queued[1]
            local header = job.header
            local payload = job.parts[1]
            local total = job.totalChunks
            for _ = 1, 8 do FarmDashboardExportMirror:update(16) end
            for _ = 1, 25 do
                FarmDashboardExportMirror:onChunkReceived(1, total, payload, header, conn)
            end
            for _ = 1, 4 do FarmDashboardExportMirror:update(16) end
            return "writes=" .. writes
                .. "|stored=" .. tostring(stored("source-a"))
                .. "|queued=" .. #(FarmDashboardExportMirror._queued or {})
                .. "|reserved=" .. reserved()
                .. "|tombstones=" .. #(FarmDashboardExportMirror._tombstones or {})
        `);
        expect(result).toContain("writes=1");
        expect(result).toContain("stored=true");
        expect(result).toContain("queued=0");
        expect(result).toContain("reserved=0");
        expect(result).toMatch(/tombstones=([1-9]|[1-9][0-9]|1[0-1][0-9]|12[0-8])$/);
    });

    test("7 admission caps, conflicts, and timeouts do not leak capacity", () => {
        const result = runLua(`
            local conn = bind(makeConn(1), "source-a")
            local other = bind(makeConn(2), "source-b")
            local conflictMeta = baseMeta("2-1")
            conflictMeta.declaredBytes = 8
            conflictMeta.decodedBytes = 1
            direct(other, conflictMeta, 1, 2, "AAAA")
            conflictMeta.crc = "2"
            local conflict = direct(other, conflictMeta, 1, 2, "AAAA")
            local function admitHuge(id)
                local meta = baseMeta(id)
                meta.declaredBytes = 11184812
                meta.decodedBytes = 1
                meta.totalChunks = 10923
                return direct(conn, meta, 1, 10923, "A")
            end
            local first = admitHuge("1-1")
            local second = admitHuge("1-2")
            local third = admitHuge("1-3")
            local peak = FarmDashboardExportMirror._peakReserved
            local resident = 0
            for _, job in pairs(FarmDashboardExportMirror._receiveBufs) do
                resident = resident + #(job.parts[1] or "")
            end
            g_time = 0
            local stale = baseMeta("3-1")
            stale.declaredBytes = 8
            stale.decodedBytes = 1
            direct(other, stale, 1, 2, "AAAA")
            g_time = 100000
            FarmDashboardExportMirror:update(16)
            local afterTimeout = reserved()
            local flood = "ok"
            for i = 1, 20 do
                local meta = baseMeta("4-" .. tostring(i))
                meta.declaredBytes = 4
                meta.decodedBytes = 1
                local reason, held = direct(conn, meta, 1, 1, "AAAA")
                if i > 2 and reason ~= "capacity" then flood = reason end
                if held == false and i > 2 then flood = "leaked" end
            end
            return "first=" .. first
                .. "|second=" .. second
                .. "|third=" .. third
                .. "|peak=" .. peak
                .. "|resident=" .. resident
                .. "|conflict=" .. conflict
                .. "|afterTimeout=" .. afterTimeout
                .. "|flood=" .. flood
                .. "|stored=" .. tostring(stored("source-a") or stored("source-b"))
        `);
        expect(result).toContain("third=capacity");
        expect(result).toContain("peak=22369624");
        expect(result).toContain("resident=2");
        expect(result).toContain("conflict=conflict");
        expect(result).toContain("flood=ok");
        expect(result).toContain("stored=false");
        expect(result).toMatch(/afterTimeout=0/);
    });

    test("8 two owners progress and a corrupt owner does not erase the other", () => {
        const result = runLua(`
            local a = bind(makeConn(1), "source-a")
            local b = bind(makeConn(1), "source-b")
            local goodBody = string.rep("g", 40)
            local good = recordFor(goodBody, 1, 1)
            local bad = baseMeta("9-1")
            bad.declaredBytes = 4
            bad.decodedBytes = 3
            bad.crc = "1"
            direct(b, bad, 1, 1, "!!!!")
            FarmDashboardExportMirror._clients[b] = nil
            FarmDashboardExportMirror:onCommittedEnvelope(good)
            FarmDashboardExportMirror._finalizerBudget = 8
            local seenA, seenB = 0, 0
            for _ = 1, 40 do
                FarmDashboardExportMirror:update(16)
                local metrics = FarmDashboardExportMirror._finalizerMetrics or {}
                local bySource = metrics.bySource or {}
                seenA = seenA + (bySource["source-a"] or 0)
                seenB = seenB + (bySource["source-b"] or 0)
            end
            return "a=" .. tostring(stored("source-a"))
                .. "|b=" .. tostring(stored("source-b"))
                .. "|seenA=" .. seenA
                .. "|seenB=" .. seenB
                .. "|reserved=" .. reserved()
                .. "|outcome=" .. tostring(FarmDashboardExportMirror._lastReplicaOutcome)
        `);
        expect(result).toContain("a=true");
        expect(result).toContain("b=false");
        expect(result).toContain("reserved=0");
        expect(result).toMatch(/seenA=[1-9]/);
        expect(result).toMatch(/seenB=[1-9]/);
    });

    test("9 declared decoded length is not rewritten to the real body", () => {
        const result = runLua(`
            local body = '{"vehicles":[{"id":1}]}'
            local function attempt(bytes)
                files = {}
                saved = {}
                local conn = bind(makeConn(1), "source-a")
                local record, payload, crc = recordFor(body, 1, 1)
                record.bytes = tostring(bytes)
                FarmDashboardExportMirror:onCommittedEnvelope(record)
                for _ = 1, 8 do FarmDashboardExportMirror:update(16) end
                local selected = files["replica/source-a/selected.xml"]
                return tostring(FarmDashboardExportMirror._lastReplicaOutcome)
                    .. ":" .. tostring(selected ~= nil)
                    .. ":" .. tostring(selected ~= nil and string.find(selected, 'bytes="23"', 1, true) ~= nil)
            end
            local encoded = ExportEnvelopePublisher.encodeBase64(string.rep("e", 24))
            local mismatch = baseMeta("8-1")
            mismatch.declaredBytes = #encoded + 4
            mismatch.decodedBytes = 24
            mismatch.crc = ExportEnvelopePublisher.checksum(string.rep("e", 24))
            local conn = bind(makeConn(1), "source-a")
            local mismatchReason = direct(conn, mismatch, 1, 1, encoded .. "AAAA")
            for _ = 1, 6 do FarmDashboardExportMirror:update(16) end
            mismatchReason = tostring(FarmDashboardExportMirror._lastReplicaOutcome)
            local overflow = baseMeta("8-2")
            overflow.decodedBytes = 8388609
            overflow.declaredBytes = 4
            local overflowReason = direct(conn, overflow, 1, 1, "AAAA")
            return "n05=" .. attempt(1)
                .. "|above=" .. attempt(24)
                .. "|below=" .. attempt(22)
                .. "|mismatch=" .. mismatchReason
                .. "|overflow=" .. overflowReason
                .. "|len=" .. #body
        `);
        expect(result).toContain("n05=overflow:false:false");
        expect(result).toContain("above=length:false:false");
        expect(result).toContain("below=overflow:false:false");
        expect(result).toContain("mismatch=overflow");
        expect(result).toContain("overflow=range");
        expect(result).toContain("len=23");
    });

    test("10 quartet boundaries match the frozen codec and malformed base64 does not publish", () => {
        const result = runLua(`
            local body = "quartet-boundary"
            local encoded = ExportEnvelopePublisher.encodeBase64(body)
            local crc = ExportEnvelopePublisher.checksum(body)
            local conn = bind(makeConn(1), "source-a")
            local meta = baseMeta("5-1")
            meta.declaredBytes = #encoded
            meta.decodedBytes = #body
            meta.crc = crc
            local sizes = { 1, 2, 3, 5 }
            local at = 1
            local index = 1
            while at <= #encoded do
                local size = sizes[((index - 1) % #sizes) + 1]
                local chunk = string.sub(encoded, at, math.min(#encoded, at + size - 1))
                at = at + #chunk
                index = index + 1
            end
            local total = index - 1
            at = 1
            index = 1
            while at <= #encoded do
                local size = sizes[((index - 1) % #sizes) + 1]
                local chunk = string.sub(encoded, at, math.min(#encoded, at + size - 1))
                FarmDashboardExportMirror:onChunkReceived(index, total, chunk, meta, conn)
                at = at + #chunk
                index = index + 1
            end
            FarmDashboardExportMirror._finalizerBudget = 4
            local codecCalls = 0
            local original = ExportEnvelopePublisher.decodeBase64
            ExportEnvelopePublisher.decodeBase64 = function(value)
                codecCalls = codecCalls + 1
                return original(value)
            end
            for _ = 1, 40 do FarmDashboardExportMirror:update(16) end
            local selected = files["replica/source-a/selected.xml"] or ""
            local published = string.find(selected, 'crc="' .. crc .. '"', 1, true) ~= nil
                and string.find(selected, 'bytes="' .. #body .. '"', 1, true) ~= nil
            local function bad(payload, id)
                local row = baseMeta(id)
                row.declaredBytes = #payload
                row.decodedBytes = 3
                row.crc = "1"
                local reason = direct(conn, row, 1, 1, payload)
                if reason == "none" then
                    FarmDashboardExportMirror:update(16)
                    reason = tostring((FarmDashboardExportMirror._finalizerMetrics or {}).outcome or FarmDashboardExportMirror._lastReplicaOutcome)
                end
                return reason
            end
            return "published=" .. tostring(published)
                .. "|codecDuringStep=" .. codecCalls
                .. "|alphabet=" .. bad("!!!!", "5-2")
                .. "|earlyPad=" .. bad("AA==", "5-3")
                .. "|garbage=" .. bad("AAAA====", "5-4")
                .. "|padBits=" .. bad("AA=A", "5-5")
        `);
        expect(result).toContain("published=true");
        expect(result).toContain("codecDuringStep=0");
        expect(result).toContain("alphabet=alphabet");
        expect(result).not.toContain("earlyPad=queued");
        expect(result).not.toContain("garbage=queued");
        expect(result).not.toContain("padBits=queued");
    });

    test("11 two large finalizers share one 4096-byte step and the full cap is numeric", () => {
        const result = runLua(`
            local a = bind(makeConn(1), "source-a")
            local b = bind(makeConn(1), "source-b")
            local body = string.rep("L", 65536)
            local record, payload, crc = recordFor(body, 1, 1)
            FarmDashboardExportMirror.CHUNKS_PER_FRAME = 80
            FarmDashboardExportMirror:onCommittedEnvelope(record)
            local maxBytes = 0
            local publishedA, publishedB = false, false
            for _ = 1, 250 do
                FarmDashboardExportMirror:update(16)
                local metrics = FarmDashboardExportMirror._finalizerMetrics or {}
                if (metrics.bytesThisStep or 0) > maxBytes then maxBytes = metrics.bytesThisStep end
                publishedA = stored("source-a")
                publishedB = stored("source-b")
                if publishedA and publishedB then break end
            end
            local selected = files["replica/source-a/selected.xml"] or ""
            local crcOk = string.find(selected, 'crc="' .. crc .. '"', 1, true) ~= nil
            local bytesOk = string.find(selected, 'bytes="65536"', 1, true) ~= nil
            local conn = bind(makeConn(3), "source-c")
            local function huge(id)
                local meta = baseMeta(id)
                meta.connectionEpoch = 3
                meta.declaredBytes = 11184812
                meta.decodedBytes = 1
                return direct(conn, meta, 1, 10923, "A")
            end
            local h1 = huge("3-1")
            local h2 = huge("3-2")
            local h3 = huge("3-3")
            return "max=" .. maxBytes
                .. "|a=" .. tostring(publishedA)
                .. "|b=" .. tostring(publishedB)
                .. "|crc=" .. tostring(crcOk)
                .. "|bytes=" .. tostring(bytesOk)
                .. "|encoded=" .. #payload
                .. "|h1=" .. h1
                .. "|h2=" .. h2
                .. "|h3=" .. h3
                .. "|peak=" .. tostring(FarmDashboardExportMirror._peakReserved)
        `);
        expect(result).toContain("a=true");
        expect(result).toContain("b=true");
        expect(result).toContain("crc=true");
        expect(result).toContain("bytes=true");
        expect(result).toContain("h3=capacity");
        const max = Number((result.match(/max=(\d+)/) || [])[1]);
        expect(max).toBeGreaterThan(0);
        expect(max).toBeLessThanOrEqual(4096);
    });

    test("12 byte and time budgets do no hidden work", () => {
        const result = runLua(`
            local conn = bind(makeConn(1), "source-a")
            local body = string.rep("b", 80)
            local record = recordFor(body, 1, 1)
            local calls = 0
            local originalDecode = ExportEnvelopePublisher.decodeBase64
            local originalSum = ExportEnvelopePublisher.checksum
            ExportEnvelopePublisher.decodeBase64 = function(...)
                calls = calls + 1
                return originalDecode(...)
            end
            ExportEnvelopePublisher.checksum = function(...)
                calls = calls + 1
                return originalSum(...)
            end
            FarmDashboardExportMirror:onCommittedEnvelope(record)
            FarmDashboardExportMirror:update(16)
            local function once(budget, clock)
                calls = 0
                FarmDashboardExportMirror._finalizerBudget = budget
                FarmDashboardExportMirror._clock = clock
                local before = FarmDashboardExportMirror._nativeOps or 0
                local outcome = "missing"
                FarmDashboardExportMirror:update(16)
                outcome = tostring((FarmDashboardExportMirror._finalizerMetrics or {}).outcome)
                local bytes = (FarmDashboardExportMirror._finalizerMetrics or {}).bytesThisStep or 0
                local ops = FarmDashboardExportMirror._nativeOps or 0
                return outcome .. ":" .. bytes .. ":" .. tostring(ops == before) .. ":" .. calls
            end
            local steady = 0
            local constantClock = function() return 10 end
            local jumping = function()
                steady = steady + 1
                if steady <= 2 then return 0 end
                return 50
            end
            return "zero=" .. once(0, nil)
                .. "|neg=" .. once(-5, nil)
                .. "|nan=" .. once(0/0, nil)
                .. "|inf=" .. once(math.huge, nil)
                .. "|tiny=" .. once(3, nil)
                .. "|jump=" .. once(4096, jumping)
                .. "|constant=" .. once(4096, constantClock)
                .. "|stored=" .. tostring(stored("source-a"))
        `);
        expect(result).toContain("zero=budget:0:true:0");
        expect(result).toContain("neg=budget:0:true:0");
        expect(result).toContain("nan=budget:0:true:0");
        expect(result).toContain("inf=budget:0:true:0");
        expect(result).toContain("tiny=budget:0:true:0");
        expect(result).toContain("jump=deadline:0:true:0");
        expect(result).toMatch(/constant=decoded:[1-9]/);
        expect(result).toContain("stored=false");
    });

    test("13 wire and direct calls reject malformed headers and keep a variable chunk", () => {
        const result = runLua(`
            local conn = bind(makeConn(1), "source-a")
            local function wire(meta, index, total, payload, tag, version)
                resetQueue()
                streamWriteString(1, tag or "FDX2")
                streamWriteInt32(1, version or 2)
                if (version or 2) == 2 and (tag or "FDX2") == "FDX2" then
                    streamWriteInt32(1, meta.connectionEpoch or 0)
                    streamWriteString(1, tostring(meta.transferId or ""))
                    streamWriteInt32(1, index or 0)
                    streamWriteInt32(1, total or 0)
                    streamWriteInt32(1, meta.declaredBytes or 0)
                    streamWriteInt32(1, meta.decodedBytes or 0)
                    streamWriteString(1, tostring(meta.crc or ""))
                    streamWriteString(1, tostring(meta.careerId or ""))
                    streamWriteString(1, tostring(meta.sessionId or ""))
                    streamWriteInt32(1, meta.publicationSequence or 0)
                    streamWriteInt32(1, meta.exportGeneration or 0)
                    streamWriteString(1, tostring(meta.sourceSlot or ""))
                    streamWriteString(1, tostring(meta.schema or ""))
                    streamWriteString(1, tostring(meta.encoding or ""))
                    streamWriteString(1, tostring(meta.simulationTimeMs or ""))
                    streamWriteString(1, payload or "")
                end
                local before = reserved()
                local incoming = FarmDashboardExportEvent.emptyNew()
                incoming:readStream(1, conn)
                local rejected = incoming.rejected
                if rejected == nil then rejected = FarmDashboardExportMirror._lastReplicaOutcome or "accepted" end
                return tostring(rejected) .. ":" .. tostring(reserved() == before)
            end
            local good = baseMeta("6-1")
            good.declaredBytes = 4
            good.decodedBytes = 1
            local accepted = wire(good, 1, 1, "AAAA")
            local directAccepted = direct(conn, good, 1, 1, "AAAA")
            local cases = {
                { "epoch", function(m) m.connectionEpoch = 0 end },
                { "fraction", function(m) m.publicationSequence = 1.5 end },
                { "startup", function(m) m.exportGeneration = 0 end },
                { "chunks", function(m) m._total = 10924 end },
                { "decoded", function(m) m.decodedBytes = 8388609 end },
                { "transfer", function(m) m.transferId = "t1" end },
                { "crc", function(m) m.crc = "01" end },
                { "schema", function(m) m.schema = "1" end },
                { "encoding", function(m) m.encoding = "utf8" end },
                { "path", function(m) m.careerId = "a/b" end },
                { "tick", function(m) m.simulationTimeMs = "1.5" end },
            }
            local failed = {}
            for i = 1, #cases do
                local name = cases[i][1]
                local meta = baseMeta("6-" .. tostring(i + 1))
                meta.declaredBytes = 4
                meta.decodedBytes = 1
                cases[i][2](meta)
                local total = meta._total or 1
                local wireResult = wire(meta, 1, total, "AAAA")
                local directResult = direct(conn, meta, 1, total, "AAAA")
                if string.find(wireResult, "capacity", 1, true) or string.find(wireResult, "queued", 1, true) or string.find(wireResult, "receiving", 1, true) then
                    failed[#failed + 1] = name .. "-wire"
                end
                if directResult == "queued" or directResult == "receiving" or directResult == "none" then
                    failed[#failed + 1] = name .. "-direct"
                end
            end
            FarmDashboardExportMirror.CHUNK_BYTES = 256
            local record = recordFor(string.rep("v", 400), 2, 2)
            FarmDashboardExportMirror:onCommittedEnvelope(record)
            for _ = 1, 16 do FarmDashboardExportMirror:update(16) end
            local selected = files["replica/source-a/selected.xml"] or ""
            local kept = string.find(selected, 'careerId="career-a"', 1, true) ~= nil
                and string.find(selected, 'sessionId="session-a"', 1, true) ~= nil
                and string.find(selected, 'publicationSequence="2"', 1, true) ~= nil
            return "accepted=" .. accepted
                .. "|direct=" .. directAccepted
                .. "|failed=" .. table.concat(failed, ",")
                .. "|kept=" .. tostring(kept)
                .. "|chunk256=" .. tostring(stored("source-a"))
        `);
        expect(result).toContain("failed=");
        expect(result).toMatch(/failed=\|/);
        expect(result).toContain("kept=true");
        expect(result).toContain("chunk256=true");
        expect(result).not.toContain("accepted=capacity");
    });

    test("14 a native failure or a cancel between phases does not commit an obsolete job", () => {
        const result = runLua(`
            local a = bind(makeConn(1), "source-a")
            local b = bind(makeConn(1), "source-b")
            local nativeSave = saveXMLFile
            local nativeDelete = delete
            local deletes = 0
            function delete(...)
                deletes = deletes + 1
                return nativeDelete(...)
            end
            function saveXMLFile(handle)
                local doc = docs[handle]
                if doc and string.find(doc.path, "source-a", 1, true) then return false end
                return nativeSave(handle)
            end
            local record = recordFor('{"vehicles":[{"id":1}]}', 1, 1)
            FarmDashboardExportMirror:onCommittedEnvelope(record)
            for _ = 1, 12 do FarmDashboardExportMirror:update(16) end
            local isolated = "a=" .. tostring(stored("source-a")) .. "|b=" .. tostring(stored("source-b")) .. "|outcome=" .. tostring(FarmDashboardExportMirror._lastReplicaOutcome)
            files = {}
            saved = {}
            function saveXMLFile(handle)
                local doc = docs[handle]
                if doc and string.find(doc.path, "selection-", 1, true) then
                    FarmDashboardExportMirror:cancelJob()
                end
                return nativeSave(handle)
            end
            local again = recordFor('{"vehicles":[{"id":9}]}', 4, 4)
            FarmDashboardExportMirror:onCommittedEnvelope(again)
            for _ = 1, 12 do FarmDashboardExportMirror:update(16) end
            return isolated
                .. "|cancelledStored=" .. tostring(stored("source-b"))
                .. "|cancelledOutcome=" .. tostring(FarmDashboardExportMirror._lastReplicaOutcome)
                .. "|deletes=" .. deletes
                .. "|reserved=" .. reserved()
        `);
        expect(result).toContain("a=false");
        expect(result).toContain("b=true");
        expect(result).toContain("cancelledStored=false");
        expect(result).toContain("cancelledOutcome=cancelled");
        expect(result).toMatch(/deletes=[1-9]/);
        expect(result).toContain("reserved=0");
    });

    test("B01 a cancelled mission does not admit the old packet, and a fresh registration can", () => {
        const result = runLua(`
            local function xmlCount()
                local n = 0
                for _ in pairs(files) do n = n + 1 end
                return n
            end
            local conn = bind(makeConn(1), "source-a")
            local record, payload = recordFor('{"vehicles":[{"id":1}]}', 1, 1)
            FarmDashboardExportMirror:onCommittedEnvelope(record)
            FarmDashboardExportMirror:update(16)
            local job = FarmDashboardExportMirror._queued[1]
            local header = {}
            for key, value in pairs(job.header) do header[key] = value end
            local chunk = job.parts[1]
            local total = job.totalChunks
            FarmDashboardExportMirror:cancelJob()
            FarmDashboardExportMirror:cancelJob()
            local kept = FarmDashboardExportMirror._bindings[conn] ~= nil
            conn:sendEvent(FarmDashboardExportEvent.new(1, total, chunk, header))
            local admitted = workLeft()
            for _ = 1, 8 do FarmDashboardExportMirror:update(16) end
            local stale = "kept=" .. tostring(kept)
                .. "|admitted=" .. admitted
                .. "|stored=" .. tostring(stored("source-a"))
                .. "|xml=" .. xmlCount()
                .. "|reserved=" .. reserved()
            local partial = bind(makeConn(1), "source-p")
            local partialMeta = baseMeta("7-1")
            partialMeta.declaredBytes = 8
            partialMeta.decodedBytes = 1
            direct(partial, partialMeta, 1, 2, "AAAA")
            FarmDashboardExportMirror:cancelJob()
            partial:sendEvent(FarmDashboardExportEvent.new(2, 2, "AAAA", partialMeta))
            for _ = 1, 4 do FarmDashboardExportMirror:update(16) end
            local partialResult = "partialWork=" .. workLeft() .. "|partialXml=" .. xmlCount()
            local active = bind(makeConn(1), "source-d")
            FarmDashboardExportMirror._finalizerBudget = 4
            FarmDashboardExportMirror:onCommittedEnvelope(recordFor(string.rep("d", 40), 3, 3))
            local saw = false
            for _ = 1, 6 do
                FarmDashboardExportMirror:update(16)
                local current = FarmDashboardExportMirror._active or (FarmDashboardExportMirror._queued or {})[1]
                if current and current.phase == "decode" then saw = true break end
            end
            FarmDashboardExportMirror:cancelJob()
            active:sendEvent(FarmDashboardExportEvent.new(1, 1, "AAAA", baseMeta("7-2")))
            for _ = 1, 4 do FarmDashboardExportMirror:update(16) end
            FarmDashboardExportMirror._finalizerBudget = nil
            bind(conn, "source-b")
            FarmDashboardExportMirror:onCommittedEnvelope(recordFor('{"vehicles":[{"id":2}]}', 5, 5))
            for _ = 1, 8 do FarmDashboardExportMirror:update(16) end
            return stale
                .. "|" .. partialResult
                .. "|sawDecode=" .. tostring(saw)
                .. "|activeStored=" .. tostring(stored("source-d"))
                .. "|freshA=" .. tostring(stored("source-a"))
                .. "|freshB=" .. tostring(stored("source-b"))
                .. "|freshWork=" .. workLeft()
        `);
        expect(result).toContain("kept=false");
        expect(result).toContain("admitted=0");
        expect(result).toContain("stored=false");
        expect(result).toContain("xml=0");
        expect(result).toContain("partialWork=0");
        expect(result).toContain("partialXml=0");
        expect(result).toContain("sawDecode=true");
        expect(result).toContain("activeStored=false");
        expect(result).toContain("freshA=false");
        expect(result).toContain("freshB=true");
        expect(result).toContain("freshWork=0");
    });

    test("B02 a conflict retires a queued, decoding, or pre-publication transfer", () => {
        const result = runLua(`
            local function copyHeader(header)
                local meta = {}
                for key, value in pairs(header) do meta[key] = value end
                return meta
            end
            local function queue()
                files = {}
                saved = {}
                FarmDashboardExportMirror._clients = {}
                local conn = bind(makeConn(1), "source-a")
                FarmDashboardExportMirror:onCommittedEnvelope(recordFor('{"vehicles":[{"id":1}]}', 1, 1))
                FarmDashboardExportMirror:update(16)
                return conn, FarmDashboardExportMirror._queued[1]
            end
            local conn, job = queue()
            local changed = copyHeader(job.header)
            changed.crc = "2"
            local headerReason = direct(conn, changed, 1, job.totalChunks, job.parts[1])
            local afterHeader = workLeft()
            conn:sendEvent(FarmDashboardExportEvent.new(1, job.totalChunks, job.parts[1] or "AAAA", job.header))
            for _ = 1, 6 do FarmDashboardExportMirror:update(16) end
            local headerCase = "header=" .. headerReason .. "|work=" .. afterHeader .. "|stored=" .. tostring(stored("source-a")) .. "|reserved=" .. reserved()
            conn, job = queue()
            local byteReason = direct(conn, copyHeader(job.header), 1, job.totalChunks, string.rep("B", #job.parts[1]))
            for _ = 1, 6 do FarmDashboardExportMirror:update(16) end
            local byteCase = "bytes=" .. byteReason .. "|stored=" .. tostring(stored("source-a")) .. "|reserved=" .. reserved()
            FarmDashboardExportMirror._clients = {}
            local decodeConn = bind(makeConn(2), "source-d")
            FarmDashboardExportMirror._finalizerBudget = 4
            FarmDashboardExportMirror:onCommittedEnvelope(recordFor(string.rep("q", 30), 2, 2))
            FarmDashboardExportMirror._clients = { [decodeConn] = true }
            for _ = 1, 8 do
                FarmDashboardExportMirror:update(16)
                local current = FarmDashboardExportMirror._queued[1]
                if current and current.phase == "decode" then
                    job = current
                    break
                end
            end
            local decodeReason = "missing"
            if job then
                local meta = copyHeader(job.header)
                decodeReason = direct(decodeConn, meta, 1, job.totalChunks, string.rep("C", #job.parts[1]))
            end
            FarmDashboardExportMirror._finalizerBudget = nil
            FarmDashboardExportMirror._clients = {}
            local a = bind(makeConn(1), "source-a")
            local b = bind(makeConn(1), "source-b")
            FarmDashboardExportMirror:onCommittedEnvelope(recordFor('{"vehicles":[{"id":4}]}', 4, 4))
            FarmDashboardExportMirror:update(16)
            local queuedA = nil
            for _, candidate in ipairs(FarmDashboardExportMirror._queued) do
                if candidate.owner and candidate.owner.sourceId == "source-a" then queuedA = candidate end
            end
            local peer = "missing"
            if queuedA then
                local meta = copyHeader(queuedA.header)
                meta.crc = "2"
                peer = direct(a, meta, 1, queuedA.totalChunks, queuedA.parts[1])
            end
            for _ = 1, 8 do FarmDashboardExportMirror:update(16) end
            return headerCase
                .. "|" .. byteCase
                .. "|decode=" .. decodeReason
                .. "|peer=" .. peer
                .. "|peerA=" .. tostring(stored("source-a"))
                .. "|peerB=" .. tostring(stored("source-b"))
                .. "|peerReserved=" .. reserved()
        `);
        expect(result).toContain("header=conflict");
        expect(result).toContain("work=0");
        expect(result).toContain("bytes=conflict");
        expect(result).toContain("decode=conflict");
        expect(result).toContain("peer=conflict");
        expect(result).toContain("peerA=false");
        expect(result).toContain("peerB=true");
        expect(result).toContain("peerReserved=0");
        expect(result).not.toContain("stored=true");
    });

    test("B03 and B04 publication waits for a usable budget and an unexpired deadline", () => {
        const result = runLua(`
            local conn = bind(makeConn(1), "source-a")
            local record = recordFor('{"vehicles":[{"id":1}]}', 1, 1)
            FarmDashboardExportMirror:onCommittedEnvelope(record)
            FarmDashboardExportMirror:update(16)
            FarmDashboardExportMirror:update(16)
            local before = (FarmDashboardExportMirror._queued[1] or FarmDashboardExportMirror._active).phase
            local reservedBefore = reserved()
            local function poke(budget, clock)
                FarmDashboardExportMirror._finalizerBudget = budget
                FarmDashboardExportMirror._clock = clock
                local ops = FarmDashboardExportMirror._nativeOps or 0
                FarmDashboardExportMirror:update(16)
                local metrics = FarmDashboardExportMirror._finalizerMetrics or {}
                local phase = FarmDashboardExportMirror._queued[1] and FarmDashboardExportMirror._queued[1].phase
                    or (FarmDashboardExportMirror._active and FarmDashboardExportMirror._active.phase)
                    or "none"
                return tostring(metrics.outcome) .. ":" .. tostring(metrics.bytesThisStep) .. ":" .. tostring((FarmDashboardExportMirror._nativeOps or 0) == ops) .. ":" .. phase .. ":" .. tostring(stored("source-a")) .. ":" .. tostring(reserved() == reservedBefore)
            end
            local steady = 0
            local jumping = function()
                steady = steady + 1
                if steady <= 2 then return 0 end
                return 50
            end
            local parked = "before=" .. before
                .. "|zero=" .. poke(0, nil)
                .. "|neg=" .. poke(-1, nil)
                .. "|nan=" .. poke(0/0, nil)
                .. "|inf=" .. poke(math.huge, nil)
                .. "|one=" .. poke(1, nil)
                .. "|three=" .. poke(3, nil)
                .. "|jump=" .. poke(4096, jumping)
            FarmDashboardExportMirror._clock = nil
            FarmDashboardExportMirror._finalizerBudget = 4096
            local writes = 0
            local nativeSave = saveXMLFile
            function saveXMLFile(handle)
                local doc = docs[handle]
                if doc and string.find(doc.path, "slot-", 1, true) then writes = writes + 1 end
                return nativeSave(handle)
            end
            for _ = 1, 8 do FarmDashboardExportMirror:update(16) end
            local firstWrites = writes
            local firstStored = stored("source-a")
            files = {}
            saved = {}
            FarmDashboardExportMirror._clock = nil
            FarmDashboardExportMirror:onCommittedEnvelope(recordFor('{"vehicles":[{"id":8}]}', 8, 8))
            FarmDashboardExportMirror:update(16)
            FarmDashboardExportMirror:update(16)
            local reads = 0
            FarmDashboardExportMirror._clock = function()
                reads = reads + 1
                if reads <= 3 then return 0 end
                return 100
            end
            FarmDashboardExportMirror:update(16)
            local midJob = FarmDashboardExportMirror._active or (FarmDashboardExportMirror._queued or {})[1]
            local midPhase = midJob and midJob.phase or "none"
            local midSlot = files["replica/source-a/slot-a.xml"] ~= nil
            local midSelection = files["replica/source-a/selection-a.xml"] ~= nil
            FarmDashboardExportMirror._clock = function() return 0 end
            for _ = 1, 6 do FarmDashboardExportMirror:update(16) end
            return parked
                .. "|writes=" .. firstWrites
                .. "|stored=" .. tostring(firstStored)
                .. "|mid=" .. midPhase
                .. "|midSlot=" .. tostring(midSlot)
                .. "|midSelection=" .. tostring(midSelection)
                .. "|finalStored=" .. tostring(files["replica/source-a/selected.xml"] ~= nil)
        `);
        expect(result).toContain("before=assemble");
        expect(result).toContain("zero=budget:0:true:");
        expect(result).toContain("three=budget:0:true:assemble:false:true");
        expect(result).toContain("jump=deadline:0:true:");
        expect(result).toContain("writes=1");
        expect(result).toContain("mid=candidate");
        expect(result).toContain("midSlot=false");
        expect(result).toContain("midSelection=false");
        expect(result).toContain("finalStored=true");
    });

    test("B05 a cancel inside create does not start the save, and a save already entered stays the only residual", () => {
        const result = runLua(`
            local hostCreate = createXMLFile
            local hostSave = saveXMLFile
            local hostLoad = loadXMLFile
            local hostGet = getXMLString
            local hostDelete = delete
            local hostSet = setXMLString
            local function runFault(where)
                files = {}
                saved = {}
                local open = 0
                local saves = 0
                function createXMLFile(...)
                    local id = hostCreate(...)
                    open = open + 1
                    if where == "create" then FarmDashboardExportMirror:cancelJob() end
                    return id
                end
                function setXMLString(...)
                    if where == "set" then FarmDashboardExportMirror:cancelJob() end
                    return hostSet(...)
                end
                function saveXMLFile(handle)
                    saves = saves + 1
                    if where == "save" then FarmDashboardExportMirror:cancelJob() end
                    return hostSave(handle)
                end
                function loadXMLFile(name, ...)
                    if where == "load" and name ~= "FarmDashReplicaRecover" then
                        FarmDashboardExportMirror:cancelJob()
                        return 0
                    end
                    return hostLoad(name, ...)
                end
                function getXMLString(...)
                    if where == "get" then FarmDashboardExportMirror:cancelJob() end
                    return hostGet(...)
                end
                function delete(...)
                    open = open - 1
                    return hostDelete(...)
                end
                bind(makeConn(1), "source-a")
                FarmDashboardExportMirror._clients = { }
                local conn = bind(makeConn(1), "source-a")
                FarmDashboardExportMirror:onCommittedEnvelope(recordFor('{"vehicles":[{"id":1}]}', 1, 1))
                for _ = 1, 8 do FarmDashboardExportMirror:update(16) end
                local slot = saved["replica/source-a/slot-a.xml"] ~= nil
                local selected = stored("source-a")
                return where .. ":" .. saves .. ":" .. tostring(slot) .. ":" .. tostring(selected) .. ":" .. tostring(FarmDashboardExportMirror._lastReplicaOutcome) .. ":" .. open .. ":" .. reserved()
            end
            return runFault("create") .. "|" .. runFault("set") .. "|" .. runFault("save") .. "|" .. runFault("load")
        `);
        expect(result).toContain("create:0:false:false:cancelled:0:0");
        expect(result).toContain("set:0:false:false:cancelled:0:0");
        expect(result).toContain("save:1:true:false:cancelled");
        expect(result).toContain("load:1:true:false:cancelled");
    });

    test("B3 a failed writer release stops before readback and a failed reader release stays closed", () => {
        const result = runLua(`
            local function queueBody(conn, body, transferId)
                local record, payload, crc = recordFor(body, 1, 1)
                local meta = baseMeta(transferId or "1-1")
                meta.declaredBytes = #payload
                meta.decodedBytes = #body
                meta.crc = crc
                local total = math.ceil(#payload / 256)
                for i = 1, total do
                    conn:sendEvent(FarmDashboardExportEvent.new(i, total, string.sub(payload, (i - 1) * 256 + 1, i * 256), meta))
                end
            end
            local hostCreate, hostLoad, hostSave = createXMLFile, loadXMLFile, saveXMLFile
            local function faultRun(fault, writerAt)
                FarmDashboardExportMirror:cancelJob()
                files = {}
                saved = {}
                FarmDashboardExportMirror._publishedSlots = {}
                FarmDashboardExportMirror._lastCleanupError = nil
                FarmDashboardExportMirror._lastCleanupPhase = nil
                FarmDashboardExportMirror._lastReplicaOutcome = nil
                local live = {}
                local releaseFailures = 0
                local releases = 0
                local savesA = 0
                local loadsA = 0
                local order = {}
                local writerHits = 0
                local originalCreate, originalLoad, originalSave = hostCreate, hostLoad, hostSave
                local a = bind(makeConn(1), "source-a")
                local b = bind(makeConn(1), "source-b")
                local function isA(handle)
                    local doc = docs[handle]
                    return doc and string.find(doc.path, "source-a/", 1, true) ~= nil
                end
                local function tail(handle)
                    local doc = docs[handle]
                    if not doc then return "?" end
                    return string.match(doc.path, "([^/]+)$") or doc.path
                end
                function createXMLFile(...)
                    local h = originalCreate(...)
                    live[h] = "writer"
                    return h
                end
                function loadXMLFile(name, path)
                    if string.find(path, "source-a/", 1, true) then
                        loadsA = loadsA + 1
                        order[#order + 1] = "load:" .. (string.match(path, "([^/]+)$") or path)
                    end
                    local h = originalLoad(name, path)
                    if h ~= 0 then live[h] = "reader" end
                    return h
                end
                function saveXMLFile(h)
                    if isA(h) then
                        savesA = savesA + 1
                        order[#order + 1] = "save:" .. tail(h)
                        if fault == "cancel-save" then FarmDashboardExportMirror:cancelJob() end
                    end
                    return originalSave(h)
                end
                function delete(h)
                    releases = releases + 1
                    local role = live[h]
                    if role == nil then error("unknown or double handle release") end
                    local throwWriter = isA(h) and role == "writer" and (fault == "delete-writer" or fault == "cancel-save")
                    if throwWriter then
                        writerHits = writerHits + 1
                        if writerAt == 0 or writerHits == writerAt then
                            releaseFailures = releaseFailures + 1
                            order[#order + 1] = "delete-fail:" .. tail(h)
                            error("reviewer-delete-failed")
                        end
                    end
                    if isA(h) and role == "reader" and fault == "delete-reader" then
                        releaseFailures = releaseFailures + 1
                        order[#order + 1] = "delete-fail:" .. tail(h)
                        error("reviewer-delete-failed")
                    end
                    live[h] = nil
                    docs[h] = nil
                    order[#order + 1] = "delete:" .. role
                end
                queueBody(a, '{"value":1}')
                queueBody(b, '{"value":2}', "2-1")
                for _ = 1, 12 do FarmDashboardExportMirror:update(16) end
                local open = 0
                for _ in pairs(live) do open = open + 1 end
                local function present(path) return saved[path] ~= nil end
                return "fault=" .. fault
                    .. "|aSelected=" .. tostring(stored("source-a"))
                    .. "|aSelection=" .. tostring(present("replica/source-a/selection-a.xml"))
                    .. "|aSlot=" .. tostring(present("replica/source-a/slot-a.xml"))
                    .. "|aContext=" .. tostring(present("replica/source-a/replicaContext.xml"))
                    .. "|bSelected=" .. tostring(stored("source-b"))
                    .. "|open=" .. open
                    .. "|releaseFailures=" .. releaseFailures
                    .. "|releases=" .. releases
                    .. "|aSaves=" .. savesA
                    .. "|aLoads=" .. loadsA
                    .. "|reserved=" .. reserved()
                    .. "|work=" .. workLeft()
                    .. "|outcome=" .. tostring(FarmDashboardExportMirror._lastReplicaOutcome)
                    .. "|cleanup=" .. tostring(FarmDashboardExportMirror._lastCleanupError)
                    .. "|phase=" .. tostring(FarmDashboardExportMirror._lastCleanupPhase)
                    .. "|order=" .. table.concat(order, ",")
            end
            return faultRun("healthy", 0)
                .. "||" .. faultRun("delete-writer", 0)
                .. "||" .. faultRun("delete-reader", 0)
                .. "||" .. faultRun("delete-writer", 2)
                .. "||" .. faultRun("delete-writer", 3)
                .. "||" .. faultRun("delete-writer", 4)
                .. "||" .. faultRun("cancel-save", 1)
        `);
        expect(result).toContain("fault=healthy|aSelected=true|aSelection=true|aSlot=true|aContext=true|bSelected=true|open=0|releaseFailures=0|releases=16|aSaves=4|aLoads=4|reserved=0|work=0|outcome=published|cleanup=nil|phase=nil");
        expect(result).toContain("fault=delete-writer|aSelected=false|aSelection=false|aSlot=true|aContext=false|bSelected=true|open=1|releaseFailures=1|releases=9|aSaves=1|aLoads=0|reserved=0|work=0|outcome=published|cleanup=cleanup-unconfirmed|phase=candidate");
        expect(result).toContain("save:slot-a.xml,delete-fail:slot-a.xml,delete:writer");
        expect(result).toContain("fault=delete-reader|aSelected=false|aSelection=false|aSlot=true|aContext=false|bSelected=true|open=1|releaseFailures=1|releases=10|aSaves=1|aLoads=1|reserved=0|work=0|outcome=published|cleanup=cleanup-unconfirmed|phase=candidate");
        expect(result).toContain("save:slot-a.xml,delete:writer,load:slot-a.xml,delete-fail:slot-a.xml,delete:writer");
        expect(result).toContain("fault=delete-writer|aSelected=false|aSelection=true|aSlot=true|aContext=false|bSelected=true|open=1|releaseFailures=1|releases=11|aSaves=2|aLoads=1|reserved=0|work=0|outcome=published|cleanup=cleanup-unconfirmed|phase=selection");
        expect(result).toContain("save:selection-a.xml,delete-fail:selection-a.xml,delete:writer");
        expect(result).toContain("aSaves=3|aLoads=2|reserved=0|work=0|outcome=published|cleanup=cleanup-unconfirmed|phase=selected");
        expect(result).toContain("save:selected.xml,delete-fail:selected.xml,delete:writer");
        expect(result).toContain("aSaves=4|aLoads=3|reserved=0|work=0|outcome=published|cleanup=cleanup-unconfirmed|phase=context");
        expect(result).toContain("save:replicaContext.xml,delete-fail:replicaContext.xml,delete:writer");
        expect(result).toContain("fault=cancel-save|aSelected=false|aSelection=false|aSlot=true|aContext=false|bSelected=false|open=1|releaseFailures=1|releases=1|aSaves=1|aLoads=0|reserved=0|work=0|outcome=cancelled|cleanup=cleanup-unconfirmed|phase=candidate");
        expect(result).toContain("save:slot-a.xml,delete-fail:slot-a.xml");
        expect(result).not.toContain("unknown or double handle release");
    });

    test("B4 an existing-file probe error is not permission to overwrite the alias", () => {
        const result = runLua(`
            local hostCreate, hostLoad, hostSave, hostDelete = createXMLFile, loadXMLFile, saveXMLFile, delete
            local function queueSeq(conn, body, sequence, transferId)
                local record, payload, crc = recordFor(body, sequence, sequence)
                local meta = baseMeta(transferId)
                meta.declaredBytes = #payload
                meta.decodedBytes = #body
                meta.crc = crc
                meta.publicationSequence = sequence
                meta.exportGeneration = sequence
                local total = math.ceil(#payload / 256)
                for i = 1, total do
                    conn:sendEvent(FarmDashboardExportEvent.new(i, total, string.sub(payload, (i - 1) * 256 + 1, i * 256), meta))
                end
            end
            local function reset()
                FarmDashboardExportMirror:cancelJob()
                files = {}
                saved = {}
                FarmDashboardExportMirror._publishedSlots = {}
                FarmDashboardExportMirror._lastCleanupError = nil
                FarmDashboardExportMirror._lastProbeError = nil
                FarmDashboardExportMirror._lastProbeResult = nil
                FarmDashboardExportMirror._lastReplicaOutcome = nil
                loadXMLFile = hostLoad
                createXMLFile = hostCreate
                saveXMLFile = hostSave
                delete = hostDelete
            end
            local function probeFault(fault)
                reset()
                local conn = bind(makeConn(1), "source-a")
                FarmDashboardExportMirror:onCommittedEnvelope(recordFor('{"value":1}', 1, 1))
                for _ = 1, 10 do FarmDashboardExportMirror:update(16) end
                local firstStored = stored("source-a")
                local firstOutcome = tostring(FarmDashboardExportMirror._lastReplicaOutcome)
                local firstProbe = tostring(FarmDashboardExportMirror._lastProbeResult)
                local before = files["replica/source-a/selected.xml"]
                local beforeContext = files["replica/source-a/replicaContext.xml"]
                local live = {}
                local probeHandles = {}
                local savesAfter = 0
                local aliasWrites = 0
                local contextWrites = 0
                local faultHits = 0
                local deleteCalls = 0
                function createXMLFile(...)
                    local handle = hostCreate(...)
                    live[handle] = "writer"
                    return handle
                end
                function loadXMLFile(name, path)
                    local isProbe = name == "FarmDashReplicaProbe" and path == "replica/source-a/selected.xml"
                    if isProbe and (fault == "load-throw" or fault == "cancel-load-throw") then
                        faultHits = faultHits + 1
                        if fault == "cancel-load-throw" then FarmDashboardExportMirror:cancelJob() end
                        error("reviewer-probe-load-failed")
                    end
                    if isProbe and fault == "cancel-load" then
                        faultHits = faultHits + 1
                        FarmDashboardExportMirror:cancelJob()
                    end
                    if isProbe and fault == "rebind-load" then
                        faultHits = faultHits + 1
                        FarmDashboardExportMirror:registerReplicaSource(conn, "source-new")
                    end
                    local handle = hostLoad(name, path)
                    if handle ~= 0 then
                        live[handle] = "reader"
                        if isProbe then probeHandles[handle] = true end
                    end
                    return handle
                end
                function delete(handle)
                    deleteCalls = deleteCalls + 1
                    if probeHandles[handle] and (fault == "delete-throw" or fault == "cancel-delete-throw") then
                        faultHits = faultHits + 1
                        if fault == "cancel-delete-throw" then FarmDashboardExportMirror:cancelJob() end
                        error("reviewer-probe-delete-failed")
                    end
                    if live[handle] == nil then error("unexpected or double release") end
                    live[handle] = nil
                    probeHandles[handle] = nil
                    docs[handle] = nil
                end
                function saveXMLFile(handle)
                    if faultHits > 0 then savesAfter = savesAfter + 1 end
                    local path = docs[handle] and docs[handle].path or ""
                    if path == "replica/source-a/selected.xml" then aliasWrites = aliasWrites + 1 end
                    if path == "replica/source-a/replicaContext.xml" then contextWrites = contextWrites + 1 end
                    return hostSave(handle)
                end
                if fault == "unavailable" then
                    local armed = false
                    local priorDelete = delete
                    function delete(handle)
                        local path = docs[handle] and docs[handle].path or ""
                        local role = live[handle]
                        priorDelete(handle)
                        if armed and role == "reader" and string.find(path, "selection-", 1, true) then
                            loadXMLFile = nil
                        end
                    end
                    armed = true
                end
                FarmDashboardExportMirror:onCommittedEnvelope(recordFor('{"value":2}', 2, 2))
                for _ = 1, 12 do FarmDashboardExportMirror:update(16) end
                local open = 0
                for _ in pairs(live) do open = open + 1 end
                local alias = saved["replica/source-a/selected.xml"]
                return "fault=" .. fault
                    .. "|firstStored=" .. tostring(firstStored)
                    .. "|firstOutcome=" .. firstOutcome
                    .. "|firstProbe=" .. firstProbe
                    .. "|oldAliasPreserved=" .. tostring(files["replica/source-a/selected.xml"] == before)
                    .. "|contextPreserved=" .. tostring(files["replica/source-a/replicaContext.xml"] == beforeContext)
                    .. "|aliasSequence=" .. tostring(alias and alias.publicationSequence or "nil")
                    .. "|aliasWrites=" .. aliasWrites
                    .. "|contextWrites=" .. contextWrites
                    .. "|savesAfterFault=" .. savesAfter
                    .. "|faultHits=" .. faultHits
                    .. "|open=" .. open
                    .. "|deleteCalls=" .. deleteCalls
                    .. "|outcome=" .. tostring(FarmDashboardExportMirror._lastReplicaOutcome)
                    .. "|cleanup=" .. tostring(FarmDashboardExportMirror._lastCleanupError)
                    .. "|probeError=" .. tostring(FarmDashboardExportMirror._lastProbeError)
                    .. "|probe=" .. tostring(FarmDashboardExportMirror._lastProbeResult)
                    .. "|reserved=" .. reserved()
                    .. "|work=" .. workLeft()
            end
            local function freshMissing()
                reset()
                bind(makeConn(1), "source-a")
                FarmDashboardExportMirror:onCommittedEnvelope(recordFor('{"value":1}', 1, 1))
                for _ = 1, 10 do FarmDashboardExportMirror:update(16) end
                local freshAlias = saved["replica/source-a/selected.xml"]
                return "freshStored=" .. tostring(stored("source-a"))
                    .. "|freshSeq=" .. tostring(freshAlias and freshAlias.publicationSequence or "nil")
                    .. "|freshContext=" .. tostring(saved["replica/source-a/replicaContext.xml"] ~= nil)
                    .. "|freshOutcome=" .. tostring(FarmDashboardExportMirror._lastReplicaOutcome)
                    .. "|freshProbe=" .. tostring(FarmDashboardExportMirror._lastProbeResult)
                    .. "|freshCleanup=" .. tostring(FarmDashboardExportMirror._lastCleanupError)
                    .. "|freshWork=" .. workLeft()
            end
            local function peer()
                reset()
                local a = bind(makeConn(1), "source-a")
                local b = bind(makeConn(1), "source-b")
                queueSeq(a, '{"value":1}', 1, "1-1")
                queueSeq(b, '{"value":2}', 1, "1-2")
                for _ = 1, 12 do FarmDashboardExportMirror:update(16) end
                local beforeA = files["replica/source-a/selected.xml"]
                local beforeB = files["replica/source-b/selected.xml"]
                local priorLoad = loadXMLFile
                function loadXMLFile(name, path)
                    if name == "FarmDashReplicaProbe" and path == "replica/source-a/selected.xml" then
                        error("reviewer-probe-load-failed")
                    end
                    return priorLoad(name, path)
                end
                queueSeq(a, '{"value":3}', 2, "2-1")
                queueSeq(b, '{"value":4}', 2, "2-2")
                for _ = 1, 12 do FarmDashboardExportMirror:update(16) end
                return "peerASame=" .. tostring(files["replica/source-a/selected.xml"] == beforeA)
                    .. "|peerBSame=" .. tostring(files["replica/source-b/selected.xml"] == beforeB)
                    .. "|peerBSlot=" .. tostring(saved["replica/source-b/slot-b.xml"] ~= nil)
                    .. "|peerOutcome=" .. tostring(FarmDashboardExportMirror._lastReplicaOutcome)
                    .. "|peerProbeError=" .. tostring(FarmDashboardExportMirror._lastProbeError)
                    .. "|peerWork=" .. workLeft()
                    .. "|peerReserved=" .. reserved()
            end
            return probeFault("healthy")
                .. "||" .. probeFault("load-throw")
                .. "||" .. probeFault("delete-throw")
                .. "||" .. probeFault("cancel-delete-throw")
                .. "||" .. probeFault("cancel-load")
                .. "||" .. probeFault("cancel-load-throw")
                .. "||" .. probeFault("rebind-load")
                .. "||" .. probeFault("unavailable")
                .. "||" .. freshMissing()
                .. "||" .. peer()
        `);
        expect(result).toContain("fault=healthy|firstStored=true|firstOutcome=published|firstProbe=missing|oldAliasPreserved=true|contextPreserved=true|aliasSequence=1|aliasWrites=0|contextWrites=0|savesAfterFault=0|faultHits=0|open=0|deleteCalls=7|outcome=published|cleanup=nil|probeError=nil|probe=existing|reserved=0|work=0");
        expect(result).toContain("fault=load-throw|firstStored=true|firstOutcome=published|firstProbe=missing|oldAliasPreserved=true|contextPreserved=true|aliasSequence=1|aliasWrites=0|contextWrites=0|savesAfterFault=0|faultHits=1|open=0|deleteCalls=6|outcome=probe-failed|cleanup=nil|probeError=probe-failed|probe=failed|reserved=0|work=0");
        expect(result).toContain("fault=delete-throw|firstStored=true|firstOutcome=published|firstProbe=missing|oldAliasPreserved=true|contextPreserved=true|aliasSequence=1|aliasWrites=0|contextWrites=0|savesAfterFault=0|faultHits=1|open=1|deleteCalls=7|outcome=cleanup-unconfirmed|cleanup=cleanup-unconfirmed|probeError=cleanup-unconfirmed|probe=failed|reserved=0|work=0");
        expect(result).toContain("fault=cancel-delete-throw|firstStored=true|firstOutcome=published|firstProbe=missing|oldAliasPreserved=true|contextPreserved=true|aliasSequence=1|aliasWrites=0|contextWrites=0|savesAfterFault=0|faultHits=1|open=1|deleteCalls=7|outcome=cancelled|cleanup=cleanup-unconfirmed|probeError=cleanup-unconfirmed|probe=retired|reserved=0|work=0");
        expect(result).toContain("fault=cancel-load|firstStored=true|firstOutcome=published|firstProbe=missing|oldAliasPreserved=true|contextPreserved=true|aliasSequence=1|aliasWrites=0|contextWrites=0|savesAfterFault=0|faultHits=1|open=0|deleteCalls=7|outcome=cancelled|cleanup=nil|probeError=nil|probe=retired|reserved=0|work=0");
        expect(result).toContain("fault=cancel-load-throw|firstStored=true|firstOutcome=published|firstProbe=missing|oldAliasPreserved=true|contextPreserved=true|aliasSequence=1|aliasWrites=0|contextWrites=0|savesAfterFault=0|faultHits=1|open=0|deleteCalls=6|outcome=cancelled|cleanup=nil|probeError=probe-failed|probe=retired|reserved=0|work=0");
        expect(result).toContain("fault=rebind-load|firstStored=true|firstOutcome=published|firstProbe=missing|oldAliasPreserved=true|contextPreserved=true|aliasSequence=1|aliasWrites=0|contextWrites=0|savesAfterFault=0|faultHits=1|open=0|deleteCalls=7|outcome=cancelled|cleanup=nil|probeError=nil|probe=retired|reserved=0|work=0");
        expect(result).toContain("fault=unavailable|firstStored=true|firstOutcome=published|firstProbe=missing|oldAliasPreserved=true|contextPreserved=true|aliasSequence=1|aliasWrites=0|contextWrites=0|savesAfterFault=0|faultHits=0|open=0|deleteCalls=2|outcome=probe-unknown|cleanup=nil|probeError=probe-unknown|probe=failed|reserved=0|work=0");
        expect(result).toContain("freshStored=true|freshSeq=1|freshContext=true|freshOutcome=published|freshProbe=missing|freshCleanup=nil|freshWork=0");
        expect(result).toContain("peerASame=true|peerBSame=true|peerBSlot=true|peerOutcome=published|peerProbeError=probe-failed|peerWork=0|peerReserved=0");
        expect(result).not.toContain("unexpected or double release");
    });

    test("B5 a no-reader result creates an alias only when fileExists is explicitly false", () => {
        const result = runLua(`
            local hostLoad, hostSave, hostExists = loadXMLFile, saveXMLFile, fileExists
            local function queueSeq(conn, body, sequence, transferId)
                local record, payload, crc = recordFor(body, sequence, sequence)
                local meta = baseMeta(transferId)
                meta.declaredBytes = #payload
                meta.decodedBytes = #body
                meta.crc = crc
                meta.publicationSequence = sequence
                meta.exportGeneration = sequence
                local total = math.ceil(#payload / 256)
                for i = 1, total do
                    conn:sendEvent(FarmDashboardExportEvent.new(i, total, string.sub(payload, (i - 1) * 256 + 1, i * 256), meta))
                end
            end
            local function noReaderCase(valueKind, presenceKind)
                FarmDashboardExportMirror:cancelJob()
                files = {}
                saved = {}
                FarmDashboardExportMirror._publishedSlots = {}
                FarmDashboardExportMirror._lastCleanupError = nil
                FarmDashboardExportMirror._lastProbeError = nil
                FarmDashboardExportMirror._lastProbeResult = nil
                FarmDashboardExportMirror._lastReplicaOutcome = nil
                loadXMLFile = hostLoad
                saveXMLFile = hostSave
                fileExists = hostExists
                bind(makeConn(1), "source-a")
                FarmDashboardExportMirror:onCommittedEnvelope(recordFor('{"value":1}', 1, 1))
                for _ = 1, 10 do FarmDashboardExportMirror:update(16) end
                local before = files["replica/source-a/selected.xml"]
                local beforeContext = files["replica/source-a/replicaContext.xml"]
                local presenceCalls = 0
                local noReaders = 0
                local afterWrites = 0
                local deletedInvalid = 0
                function fileExists(path)
                    presenceCalls = presenceCalls + 1
                    if presenceKind == "missing-api" then return nil end
                    if presenceKind == "unknown" then return nil end
                    if presenceKind == "string" then return "yes" end
                    if presenceKind == "number" then return 1 end
                    if presenceKind == "throw" then error("reviewer-presence-failed") end
                    if presenceKind == "cancel" then FarmDashboardExportMirror:cancelJob() end
                    return files[path] ~= nil
                end
                if presenceKind == "missing-api" then fileExists = nil end
                function loadXMLFile(name, path)
                    if name == "FarmDashReplicaProbe" and path == "replica/source-a/selected.xml" then
                        noReaders = noReaders + 1
                        if valueKind == "nil" then return nil end
                        if valueKind == "false" then return false end
                        return 0
                    end
                    return hostLoad(name, path)
                end
                function saveXMLFile(handle)
                    if noReaders > 0 then afterWrites = afterWrites + 1 end
                    return hostSave(handle)
                end
                function delete(handle)
                    if type(handle) ~= "number" or handle == 0 then
                        deletedInvalid = deletedInvalid + 1
                        error("invalid handle delete")
                    end
                end
                if presenceKind == "prior-cleanup" then
                    FarmDashboardExportMirror._lastCleanupError = "cleanup-unconfirmed"
                end
                FarmDashboardExportMirror:onCommittedEnvelope(recordFor('{"value":2}', 2, 2))
                for _ = 1, 12 do FarmDashboardExportMirror:update(16) end
                return "reader=" .. valueKind
                    .. "|presence=" .. presenceKind
                    .. "|wasPresent=" .. tostring(before ~= nil)
                    .. "|presenceCalls=" .. presenceCalls
                    .. "|noReaderReturns=" .. noReaders
                    .. "|aliasPreserved=" .. tostring(files["replica/source-a/selected.xml"] == before)
                    .. "|contextPreserved=" .. tostring(files["replica/source-a/replicaContext.xml"] == beforeContext)
                    .. "|postFailureWrites=" .. afterWrites
                    .. "|invalidDeletes=" .. deletedInvalid
                    .. "|probe=" .. tostring(FarmDashboardExportMirror._lastProbeResult)
                    .. "|probeError=" .. tostring(FarmDashboardExportMirror._lastProbeError)
                    .. "|cleanup=" .. tostring(FarmDashboardExportMirror._lastCleanupError)
                    .. "|outcome=" .. tostring(FarmDashboardExportMirror._lastReplicaOutcome)
                    .. "|work=" .. workLeft()
                    .. "|reserved=" .. reserved()
            end
            local function freshAbsent()
                FarmDashboardExportMirror:cancelJob()
                files = {}
                saved = {}
                FarmDashboardExportMirror._publishedSlots = {}
                FarmDashboardExportMirror._lastProbeError = nil
                FarmDashboardExportMirror._lastCleanupError = nil
                fileExists = hostExists
                loadXMLFile = hostLoad
                local absentBefore = files["replica/source-a/selected.xml"] == nil
                local presence = fileExists("replica/source-a/selected.xml")
                bind(makeConn(1), "source-a")
                FarmDashboardExportMirror:onCommittedEnvelope(recordFor('{"value":1}', 1, 1))
                for _ = 1, 10 do FarmDashboardExportMirror:update(16) end
                return "absentBefore=" .. tostring(absentBefore)
                    .. "|presenceFalse=" .. tostring(presence == false)
                    .. "|created=" .. tostring(stored("source-a"))
                    .. "|seq=" .. tostring(saved["replica/source-a/selected.xml"].publicationSequence)
                    .. "|context=" .. tostring(saved["replica/source-a/replicaContext.xml"] ~= nil)
                    .. "|probe=" .. tostring(FarmDashboardExportMirror._lastProbeResult)
                    .. "|outcome=" .. tostring(FarmDashboardExportMirror._lastReplicaOutcome)
            end
            local function peer()
                FarmDashboardExportMirror:cancelJob()
                files = {}
                saved = {}
                FarmDashboardExportMirror._publishedSlots = {}
                FarmDashboardExportMirror._lastCleanupError = "cleanup-unconfirmed"
                FarmDashboardExportMirror._lastProbeError = nil
                fileExists = hostExists
                loadXMLFile = hostLoad
                local a = bind(makeConn(1), "source-a")
                local b = bind(makeConn(1), "source-b")
                queueSeq(a, '{"value":1}', 1, "1-1")
                queueSeq(b, '{"value":2}', 1, "1-2")
                for _ = 1, 12 do FarmDashboardExportMirror:update(16) end
                local beforeA = files["replica/source-a/selected.xml"]
                local beforeB = files["replica/source-b/selected.xml"]
                function loadXMLFile(name, path)
                    if name == "FarmDashReplicaProbe" and path == "replica/source-a/selected.xml" then return 0 end
                    return hostLoad(name, path)
                end
                queueSeq(a, '{"value":3}', 2, "2-1")
                queueSeq(b, '{"value":4}', 2, "2-2")
                for _ = 1, 12 do FarmDashboardExportMirror:update(16) end
                return "peerASame=" .. tostring(files["replica/source-a/selected.xml"] == beforeA)
                    .. "|peerBSame=" .. tostring(files["replica/source-b/selected.xml"] == beforeB)
                    .. "|peerBSlot=" .. tostring(saved["replica/source-b/slot-b.xml"] ~= nil)
                    .. "|peerOutcome=" .. tostring(FarmDashboardExportMirror._lastReplicaOutcome)
                    .. "|peerProbeError=" .. tostring(FarmDashboardExportMirror._lastProbeError)
                    .. "|peerCleanup=" .. tostring(FarmDashboardExportMirror._lastCleanupError)
                    .. "|peerWork=" .. workLeft()
            end
            return noReaderCase("zero", "present")
                .. "||" .. noReaderCase("nil", "present")
                .. "||" .. noReaderCase("false", "present")
                .. "||" .. noReaderCase("zero", "unknown")
                .. "||" .. noReaderCase("zero", "throw")
                .. "||" .. noReaderCase("zero", "missing-api")
                .. "||" .. noReaderCase("zero", "string")
                .. "||" .. noReaderCase("zero", "number")
                .. "||" .. noReaderCase("zero", "cancel")
                .. "||" .. noReaderCase("zero", "prior-cleanup")
                .. "||" .. freshAbsent()
                .. "||" .. peer()
        `);
        expect(result).toContain("reader=zero|presence=present|wasPresent=true|presenceCalls=6|noReaderReturns=1|aliasPreserved=true|contextPreserved=true|postFailureWrites=0|invalidDeletes=0|probe=failed|probeError=probe-unreadable|cleanup=nil|outcome=probe-unreadable|work=0|reserved=0");
        expect(result).toContain("reader=nil|presence=present|wasPresent=true|presenceCalls=6|noReaderReturns=1|aliasPreserved=true|contextPreserved=true|postFailureWrites=0|invalidDeletes=0|probe=failed|probeError=probe-unreadable|cleanup=nil|outcome=probe-unreadable");
        expect(result).toContain("reader=false|presence=present|wasPresent=true|presenceCalls=6|noReaderReturns=1|aliasPreserved=true|contextPreserved=true|postFailureWrites=0|invalidDeletes=0|probe=failed|probeError=probe-unreadable|cleanup=nil|outcome=probe-unreadable");
        expect(result).toContain("reader=zero|presence=unknown|wasPresent=true|presenceCalls=6|noReaderReturns=0|aliasPreserved=true|contextPreserved=true|postFailureWrites=0|invalidDeletes=0|probe=failed|probeError=probe-unknown|cleanup=nil|outcome=probe-unknown");
        expect(result).toContain("reader=zero|presence=throw|wasPresent=true|presenceCalls=6|noReaderReturns=0|aliasPreserved=true|contextPreserved=true|postFailureWrites=0|invalidDeletes=0|probe=failed|probeError=probe-unknown|cleanup=nil|outcome=probe-unknown");
        expect(result).toContain("reader=zero|presence=missing-api|wasPresent=true|presenceCalls=0|noReaderReturns=0|aliasPreserved=true|contextPreserved=true|postFailureWrites=0|invalidDeletes=0|probe=failed|probeError=probe-unknown|cleanup=nil|outcome=probe-unknown");
        expect(result).toContain("reader=zero|presence=string|wasPresent=true|presenceCalls=6|noReaderReturns=0|aliasPreserved=true|contextPreserved=true|postFailureWrites=0|invalidDeletes=0|probe=failed|probeError=probe-unknown|cleanup=nil|outcome=probe-unknown");
        expect(result).toContain("reader=zero|presence=number|wasPresent=true|presenceCalls=6|noReaderReturns=0|aliasPreserved=true|contextPreserved=true|postFailureWrites=0|invalidDeletes=0|probe=failed|probeError=probe-unknown|cleanup=nil|outcome=probe-unknown");
        expect(result).toContain("reader=zero|presence=cancel|wasPresent=true|presenceCalls=1|noReaderReturns=0|aliasPreserved=true|contextPreserved=true|postFailureWrites=0|invalidDeletes=0|probe=retired|probeError=nil|cleanup=nil|outcome=cancelled");
        expect(result).toContain("reader=zero|presence=prior-cleanup|wasPresent=true|presenceCalls=6|noReaderReturns=1|aliasPreserved=true|contextPreserved=true|postFailureWrites=0|invalidDeletes=0|probe=failed|probeError=probe-unreadable|cleanup=cleanup-unconfirmed|outcome=probe-unreadable");
        expect(result).toContain("absentBefore=true|presenceFalse=true|created=true|seq=1|context=true|probe=missing|outcome=published");
        expect(result).toContain("peerASame=true|peerBSame=true|peerBSlot=true|peerOutcome=published|peerProbeError=probe-unreadable|peerCleanup=cleanup-unconfirmed|peerWork=0");
    });
});
