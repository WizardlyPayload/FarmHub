"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");
const { ingestWatchedSlot } = require("../exportIngress");
const { writeStrictPair } = require("../replicaPairContract.cjs");
const { recordIngress, projectStatus } = require("../ingressOrchestration");

const modSrc = path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src");

function runLua(files, chunk) {
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
        for (const file of files) parts.push(fs.readFileSync(path.join(modSrc, file), "utf8"));
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

const mirrorFiles = ["ExportEnvelopePublisher.lua", "FarmDashboardExportFinalizer.lua", "FarmDashboardExportEvent.lua", "FarmDashboardExportMirror.lua"];

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
local conn = { epoch = 1 }
function conn:getIsServer() return true end
function conn:sendEvent(event)
    resetQueue()
    event:writeStream(1, self)
    readAt = 1
    local incoming = FarmDashboardExportEvent.emptyNew()
    incoming:readStream(1, self)
end
FarmDashboardExportMirror._replicaRoot = "replica/"
FarmDashboardExportMirror:registerReplicaSource(conn, "source-a")
FarmDashboardExportMirror._clients = { [conn] = true }
local function publish(body, sequence, generation, sessionId)
    local payload = ExportEnvelopePublisher.encodeBase64(body)
    local crc = ExportEnvelopePublisher.checksum(body)
    local record = {
        schema = "2", careerId = "career-a", sessionId = sessionId or "session-a",
        publicationSequence = tostring(sequence), exportGeneration = tostring(generation),
        simulationTimeMs = "10", encoding = "base64", bytes = tostring(#body),
        crc = crc, payload = payload, sourceSlot = "savegame3", persistence = "saved",
        sessionToken = "token-a", targetDir = "virtual/career-a/", slot = "a",
    }
    local started = FarmDashboardExportMirror:onCommittedEnvelope(record)
    for _ = 1, 8 do FarmDashboardExportMirror:update(16) end
    local selected = files["replica/source-a/selected.xml"]
    local context = files["replica/source-a/replicaContext.xml"]
    return started, selected, context, record
end
`;

function materialize(xml, contextXml, revision) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-replica-path-"));
    fs.writeFileSync(path.join(dir, "selected.xml"), xml);
    fs.writeFileSync(path.join(dir, "replicaContext.xml"), contextXml);
    writeStrictPair(dir, xml, {
        sourceId: "source-a",
        sourceSlot: "savegame3",
        connectionEpoch: "1",
        slot: "a",
        replicaRevision: revision || 1,
    });
    return dir;
}

describe("replica integration path", () => {
    test("a committed envelope reaches status and a later generation progresses", () => {
        const first = runLua(mirrorFiles, host + `
            local started, selected, context = publish('{"vehicles":[{"id":7}],"authoritative":true}', 1, 1)
            return tostring(started) .. "\\n" .. tostring(selected) .. "\\n" .. tostring(context)
        `);
        const [started, selected, context] = first.split("\n");
        expect(started).toBe("started");
        const dir = materialize(selected, context);
        const clock = { t: 1000 };
        const trackerOpts = { now: () => clock.t, staleAfterMs: 5000, sourceId: "source-a", configuredSlot: "savegame3" };
        const ingress = ingestWatchedSlot(dir, trackerOpts);
        expect(ingress && ingress.status).toBe("replica");
        expect(ingress.authoritative).toBe(false);
        expect(ingress.payload.vehicles[0].id).toBe(7);
        expect(ingress.payload.authoritative).toBe(true);
        expect(ingress.freshness).toBe("unconfirmed");
        const state = { exportIngress: ingress };
        recordIngress(state, ingress.payload, { ...ingress.identity, freshness: ingress.freshness, replica: true });
        expect(projectStatus(state.exportIdentity, ingress.tracker).readiness).toBe("unconfirmed");
        const receipt = state.lastLuaReceivedAt;

        const second = runLua(mirrorFiles, host + `
            local started, selected, context = publish('{"vehicles":[{"id":8}]}', 2, 2)
            return tostring(started) .. "\\n" .. tostring(selected) .. "\\n" .. tostring(context)
        `);
        const parts = second.split("\n");
        fs.writeFileSync(path.join(dir, "selected.xml"), parts[1]);
        fs.writeFileSync(path.join(dir, "replicaContext.xml"), parts[2]);
        writeStrictPair(dir, parts[1], { sourceId: "source-a", sourceSlot: "savegame3", connectionEpoch: "1", slot: "b", replicaRevision: 2 });
        const progressed = ingestWatchedSlot(dir, { ...trackerOpts, tracker: ingress.tracker, previous: ingress });
        expect(progressed.freshness).toBe("live");
        expect(progressed.progress).toBe("progressing");
        expect(progressed.identity.exportGeneration).toBe(2);
        recordIngress(state, progressed.payload, { ...progressed.identity, freshness: progressed.freshness, replica: true });
        const progressedAt = state.lastLuaReceivedAt;
        expect(progressedAt).not.toBe(receipt);

        clock.t = 8000;
        const duplicate = ingestWatchedSlot(dir, { ...trackerOpts, tracker: ingress.tracker, previous: progressed });
        expect(duplicate.freshness).toBe("stale");
        recordIngress(state, duplicate.payload, { ...duplicate.identity, freshness: duplicate.freshness, replica: true });
        expect(state.lastLuaReceivedAt).toBe(progressedAt);
        expect(projectStatus(state.exportIdentity, ingress.tracker).freshness).toBe("stale");
    });

    test("a conflicting duplicate and a bad version do not publish", () => {
        const result = runLua(mirrorFiles, host + `
            local body = string.rep("a", 400)
            local payload = ExportEnvelopePublisher.encodeBase64(body)
            local crc = ExportEnvelopePublisher.checksum(body)
            local record = {
                schema = "2", careerId = "career-a", sessionId = "session-a",
                publicationSequence = "1", exportGeneration = "1", simulationTimeMs = "10",
                encoding = "base64", bytes = tostring(#body), crc = crc, payload = payload,
                sourceSlot = "savegame3", sessionToken = "token-a",
            }
            FarmDashboardExportMirror.CHUNK_BYTES = 256
            FarmDashboardExportMirror.CHUNKS_PER_FRAME = 1
            local started = FarmDashboardExportMirror:onCommittedEnvelope(record)
            local saved = nil
            local original = conn.sendEvent
            local seen = 0
            function conn:sendEvent(event)
                seen = seen + 1
                if seen == 1 then
                    original(self, event)
                    original(self, event)
                    event.payloadString = "xxxx"
                    original(self, event)
                else
                    original(self, event)
                end
            end
            FarmDashboardExportMirror:update(16)
            local conflict = FarmDashboardExportMirror._lastReplicaOutcome
            local bad = FarmDashboardExportEvent.emptyNew()
            bad.chunkIndex = 1
            bad.totalChunks = 1
            bad.payloadString = "abcd"
            bad.meta = { wireVersion = 9 }
            resetQueue()
            bad:writeStream(1, conn)
            readAt = 1
            local incoming = FarmDashboardExportEvent.emptyNew()
            incoming:readStream(1, conn)
            return tostring(conflict) .. "|" .. tostring(incoming.rejected) .. "|" .. tostring(files["replica/source-a/selected.xml"] ~= nil)
        `);
        expect(result).toContain("conflict");
        expect(result).toContain("version");
    });

    test("disconnect drops the old buffer and a reused serial does not merge", () => {
        const result = runLua(mirrorFiles, host + `
            local body = string.rep("b", 400)
            local payload = ExportEnvelopePublisher.encodeBase64(body)
            FarmDashboardExportMirror.CHUNK_BYTES = 256
            FarmDashboardExportMirror.CHUNKS_PER_FRAME = 1
            local record = {
                schema = "2", careerId = "career-a", sessionId = "session-a",
                publicationSequence = "1", exportGeneration = "1", simulationTimeMs = "10",
                encoding = "base64", bytes = tostring(#body), crc = ExportEnvelopePublisher.checksum(body),
                payload = payload, sourceSlot = "savegame3", sessionToken = "token-a",
            }
            local delivered = 0
            function conn:sendEvent(event)
                delivered = delivered + 1
                if delivered > 1 then return end
                resetQueue()
                event:writeStream(1, self)
                readAt = 1
                local incoming = FarmDashboardExportEvent.emptyNew()
                incoming:readStream(1, self)
            end
            FarmDashboardExportMirror:onCommittedEnvelope(record)
            FarmDashboardExportMirror:update(16)
            local before = 0
            for _ in pairs(FarmDashboardExportMirror._receiveBufs or {}) do before = before + 1 end
            FarmDashboardExportMirror:noteDisconnect(conn)
            conn.epoch = FarmDashboardExportMirror._sendEpoch
            local after = 0
            for _ in pairs(FarmDashboardExportMirror._receiveBufs or {}) do after = after + 1 end
            return "before=" .. tostring(before) .. "|after=" .. tostring(after) .. "|epoch=" .. tostring(conn.epoch)
        `);
        expect(result).toContain("before=1");
        expect(result).toContain("after=0");
        expect(result).toContain("epoch=2");
    });

    test("two source contexts with the same slot do not share last-good", () => {
        const result = runLua(mirrorFiles, host + `
            local _, selected, context = publish('{"vehicles":[{"id":1}]}', 1, 1)
            local other = { epoch = 1 }
            function other:getIsServer() return true end
            function other:sendEvent(event)
                resetQueue()
                event:writeStream(1, self)
                readAt = 1
                local incoming = FarmDashboardExportEvent.emptyNew()
                incoming:readStream(1, self)
            end
            FarmDashboardExportMirror:registerReplicaSource(other, "source-b")
            FarmDashboardExportMirror._clients = { [other] = true }
            local body = '{"vehicles":[{"id":2}]}'
            local payload = ExportEnvelopePublisher.encodeBase64(body)
            FarmDashboardExportMirror:onCommittedEnvelope({
                schema = "2", careerId = "career-a", sessionId = "session-b",
                publicationSequence = "1", exportGeneration = "1", simulationTimeMs = "10",
                encoding = "base64", bytes = tostring(#body), crc = ExportEnvelopePublisher.checksum(body),
                payload = payload, sourceSlot = "savegame3", sessionToken = "token-b",
            })
            for _ = 1, 16 do FarmDashboardExportMirror:update(16) end
            local a = files["replica/source-a/selected.xml"]
            local b = files["replica/source-b/selected.xml"]
            return tostring(a ~= nil) .. "|" .. tostring(b ~= nil) .. "|" .. tostring(a ~= b) .. "\\n" .. tostring(selected) .. "\\n" .. tostring(context) .. "\\n" .. tostring(b) .. "\\n" .. tostring(files["replica/source-b/replicaContext.xml"])
        `);
        const lines = result.split("\n");
        expect(lines[0]).toBe("true|true|true");
        const left = materialize(lines[1], lines[2]);
        const rightDir = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-replica-b-"));
        fs.writeFileSync(path.join(rightDir, "selected.xml"), lines[3]);
        fs.writeFileSync(path.join(rightDir, "replicaContext.xml"), lines[4]);
        writeStrictPair(rightDir, lines[3], { sourceId: "source-b", sourceSlot: "savegame3", connectionEpoch: "1", slot: "a", replicaRevision: 1 });
        const a = ingestWatchedSlot(left, { sourceId: "source-a", configuredSlot: "savegame3" });
        const b = ingestWatchedSlot(rightDir, { sourceId: "source-b", configuredSlot: "savegame3" });
        expect(a.payload.vehicles[0].id).toBe(1);
        expect(b.payload.vehicles[0].id).toBe(2);
        expect(ingestWatchedSlot(rightDir, { sourceId: "source-b", configuredSlot: "savegame99" }).status).toBe("unavailable");
    });

    test("held successor keeps its own envelope", () => {
        const result = runLua(mirrorFiles, host + `
            local function record(id, sequence)
                local body = '{"vehicles":[{"id":' .. id .. '}]}'
                return {
                    schema = "2", careerId = "career-a", sessionId = "session-a",
                    publicationSequence = tostring(sequence), exportGeneration = tostring(sequence),
                    simulationTimeMs = "10", encoding = "base64", bytes = tostring(#body),
                    crc = ExportEnvelopePublisher.checksum(body),
                    payload = ExportEnvelopePublisher.encodeBase64(body),
                    sourceSlot = "savegame3", sessionToken = "token-" .. id,
                }
            end
            local first = FarmDashboardExportMirror:onCommittedEnvelope(record(1, 1))
            local owned = FarmDashboardExportMirror._job.owned.payload
            local second = FarmDashboardExportMirror:onCommittedEnvelope(record(2, 2))
            local still = FarmDashboardExportMirror._job.owned.payload
            return first .. "|" .. second .. "|" .. tostring(owned == still)
        `);
        expect(result).toBe("started|held|true");
    });
});
