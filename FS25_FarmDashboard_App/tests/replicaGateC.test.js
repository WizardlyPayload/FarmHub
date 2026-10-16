"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");
const { adler32, encodeEnvelope, decodeEnvelope, createFreshnessTracker } = require("../exportEnvelope");
const { ingestWatchedSlot, parseSelectionRecord } = require("../exportIngress");
const { renderSelection, writeStrictPair, SELECTION_ATTRS } = require("../replicaPairContract.cjs");

const modSrc = path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src");

function runLua(chunk) {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
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
    doc.fields[string.match(key, "#(.+)$") or key] = value
end
function saveXMLFile(handle)
    local doc = docs[handle]
    if not doc then return false end
    local parts = { "<" .. doc.root }
    local order = {
        "selectionSchema", "replicaRevision", "sourceId", "sourceSlot", "connectionEpoch", "replica", "slot",
        "schema", "careerId", "sessionId", "publicationSequence", "exportGeneration",
        "simulationTimeMs", "encoding", "bytes", "crc", "payload",
    }
    for i = 1, #order do
        local name = order[i]
        if doc.fields[name] ~= nil then parts[#parts + 1] = " " .. name .. '="' .. doc.fields[name] .. '"' end
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
    docs[id] = { fields = copy }
    return id
end
function getXMLString(handle, key)
    local doc = docs[handle]
    if not doc then return nil end
    return doc.fields[string.match(key, "#(.+)$") or key]
end
function delete() end
function fileExists(p) return files[p] ~= nil end
function createFolder() end
local q = {}
local readAt = 1
function streamWriteString(id, value) q[#q + 1] = value end
function streamWriteInt32(id, value) q[#q + 1] = value end
function streamReadString(id) local v = q[readAt]; readAt = readAt + 1; return v end
function streamReadInt32(id) local v = q[readAt]; readAt = readAt + 1; return v end
local function resetQueue() q = {}; readAt = 1 end
local function makeConn()
    local conn = { epoch = 1 }
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
local conn = makeConn()
FarmDashboardExportMirror._replicaRoot = "replica/"
FarmDashboardExportMirror:registerReplicaSource(conn, "source-a")
FarmDashboardExportMirror._clients = { [conn] = true }
local function publish(body, sequence, sessionId)
    local payload = ExportEnvelopePublisher.encodeBase64(body)
    local crc = ExportEnvelopePublisher.checksum(body)
    FarmDashboardExportMirror:onCommittedEnvelope({
        schema = "2", careerId = "career-a", sessionId = sessionId or "session-a",
        publicationSequence = tostring(sequence), exportGeneration = tostring(sequence),
        simulationTimeMs = "10", encoding = "base64", bytes = tostring(#body), crc = crc,
        payload = payload, sourceSlot = "savegame3", sessionToken = "token-a",
    })
    for _ = 1, 8 do FarmDashboardExportMirror:update(16) end
    return crc
end
`;
    const files = [
        "ExportEnvelopePublisher.lua",
        "FarmDashboardExportFinalizer.lua",
        "FarmDashboardExportEvent.lua",
        "FarmDashboardExportMirror.lua",
    ].map((file) => fs.readFileSync(path.join(modSrc, file), "utf8"));
    const source = [
        "Logging = { info = function() end, warning = function() end }",
        "FarmDashLog = { devWarn = function() end, dev = function() end, error = function() end, isVerbose = function() return false end }",
        "Event = {}",
        "function Event.new(mt) return setmetatable({}, mt) end",
        "function Class(classTable) return { __index = classTable } end",
        "function InitEventClass() end",
        "function createFolder() end",
        ...files,
        host,
        chunk,
    ].join("\n");
    if (lauxlib.luaL_dostring(L, to_luastring(source)) !== lua.LUA_OK) {
        throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
    }
    return to_jsstring(lua.lua_tostring(L, -1));
}

function envelope(payload, sequence, extra) {
    return encodeEnvelope(payload, Object.assign({
        careerId: "career-a",
        sessionId: "session-a",
        publicationSequence: sequence,
        exportGeneration: sequence,
        simulationTimeMs: 10,
    }, extra || {}));
}

describe("replica gate C", () => {
    test("a stored pair round-trips through ingest and a mutated identity is rejected", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-gate-c-"));
        const xml = envelope('{"vehicles":[{"id":7}]}', 2);
        writeStrictPair(dir, xml, { sourceId: "source-a", sourceSlot: "savegame3", replicaRevision: 4, slot: "a" });
        const ingested = ingestWatchedSlot(dir, { sourceId: "source-a", configuredSlot: "savegame3" });
        expect(ingested.status).toBe("replica");
        expect(ingested.authoritative).toBe(false);
        expect(ingested.replica).toBe(true);
        expect(ingested.identity.careerId).toBe("career-a");
        expect(ingested.identity.sessionId).toBe("session-a");
        expect(ingested.identity.publicationSequence).toBe(2);
        expect(ingested.identity.exportGeneration).toBe(2);
        expect(ingested.payload.vehicles[0].id).toBe(7);
        expect(ingested.identity.payloadProof).toEqual(expect.any(String));

        const selection = fs.readFileSync(path.join(dir, "selection-a.xml"), "utf8").replace('careerId="career-a"', 'careerId="career-b"');
        fs.writeFileSync(path.join(dir, "selection-a.xml"), selection);
        fs.writeFileSync(path.join(dir, "selected.xml"), xml);
        const rejected = ingestWatchedSlot(dir, { sourceId: "source-a", configuredSlot: "savegame3", previous: ingested });
        expect(rejected.status).toBe("last-known");
        expect(rejected.payload.vehicles[0].id).toBe(7);
        expect(rejected.identity.careerId).toBe("career-a");
    });

    test("adjacent attributes fail and declared whitespace still parses", () => {
        const good = renderSelection({
            selectionSchema: "1", replicaRevision: "1", sourceId: "source-a", sourceSlot: "savegame3",
            connectionEpoch: "1", replica: "true", slot: "a", schema: "2", careerId: "career-a",
            sessionId: "session-a", publicationSequence: "1", exportGeneration: "1",
            simulationTimeMs: "10", encoding: "base64", bytes: "2", crc: "1",
        });
        expect(parseSelectionRecord(`<?xml version="1.0" encoding="utf-8"?>\n${good}`).sourceId).toBe("source-a");
        expect(SELECTION_ATTRS[0]).toBe("selectionSchema");
        const adjacent = good.replace(' sourceSlot=', 'sourceSlot=');
        expect(parseSelectionRecord(adjacent)).toBeNull();
        expect(parseSelectionRecord(good.replace('replicaRevision="1"', 'replicaRevision="01"'))).toBeNull();
        expect(parseSelectionRecord(good.replace('replicaRevision="1"', 'replicaRevision="0"'))).toBeNull();
        expect(parseSelectionRecord(good.replace('replicaRevision="1"', 'replicaRevision="2147483648"'))).toBeNull();
        expect(parseSelectionRecord(good.replace('selectionSchema="1"', 'selectionSchema="2"'))).toBeNull();
        expect(parseSelectionRecord(good.replace("farmDashboardReplicaSelection", "farmDashboardExport"))).toBeNull();
        expect(parseSelectionRecord(good.replace(' sourceId="source-a"', ' sourceId=source-a'))).toBeNull();
        expect(parseSelectionRecord(good.replace(' sourceSlot="savegame3"', ' extra="1" sourceSlot="savegame3"'))).toBeNull();
        expect(parseSelectionRecord(good.replace(' publicationSequence="1"', ""))).toBeNull();
        expect(parseSelectionRecord(`<!--note-->${good}`)).toBeNull();
        expect(parseSelectionRecord(good.replace('sourceId="source-a"', 'sourceId="source-&amp;a"'))).toBeNull();
        expect(parseSelectionRecord("")).toBeNull();
        expect(parseSelectionRecord(good + "<junk/>")).toBeNull();
    });

    test("restart keeps the newest pair when memory is cleared and the next write is partial", () => {
        const result = runLua(`
            publish('{"vehicles":[{"id":1}]}', 1)
            publish('{"vehicles":[{"id":2}]}', 2)
            publish('{"vehicles":[{"id":3}]}', 3)
            local kept = saved["replica/source-a/slot-a.xml"].publicationSequence
            FarmDashboardExportMirror._publishedSlots = {}
            FarmDashboardExportMirror._storeTurns = nil
            local hostSave = saveXMLFile
            function saveXMLFile(handle)
                local doc = docs[handle]
                if doc and string.find(doc.path, "slot-b.xml", 1, true) then return false end
                return hostSave(handle)
            end
            publish('{"vehicles":[{"id":4}]}', 4)
            return "kept=" .. tostring(kept)
                .. "|still=" .. tostring(saved["replica/source-a/slot-a.xml"].publicationSequence)
                .. "|payload=" .. tostring(saved["replica/source-a/slot-a.xml"].payload ~= nil)
                .. "|outcome=" .. tostring(FarmDashboardExportMirror._lastReplicaOutcome)
        `);
        expect(result).toContain("kept=3");
        expect(result).toContain("still=3");
        expect(result).toContain("outcome=candidate-failed");
    });

    test("an exact repeat does not write a new revision and a contradictory sequence conflicts", () => {
        const result = runLua(`
            publish('{"vehicles":[{"id":1}]}', 1)
            local before = files["replica/source-a/selection-a.xml"]
            publish('{"vehicles":[{"id":1}]}', 1)
            local same = files["replica/source-a/selection-a.xml"] == before
            local dup = FarmDashboardExportMirror._lastReplicaOutcome
            publish('{"vehicles":[{"id":9}]}', 1)
            return "same=" .. tostring(same) .. "|dup=" .. dup
                .. "|seq=" .. tostring(saved["replica/source-a/slot-a.xml"].publicationSequence)
                .. "|conflict=" .. tostring(FarmDashboardExportMirror._lastReplicaOutcome)
                .. "|rev=" .. tostring(saved["replica/source-a/selection-a.xml"].replicaRevision)
        `);
        expect(result).toContain("same=true");
        expect(result).toContain("dup=duplicate");
        expect(result).toContain("conflict=conflict");
        expect(result).toContain("rev=1");
    });

    test("equal checksum with different bytes is a conflict on disk and in ingress", () => {
        const left = '{"k":"mmmmmmmm"}';
        const right = '{"k":"emuumemm"}';
        expect(adler32(Buffer.from(left))).toBe(adler32(Buffer.from(right)));
        expect(left).not.toBe(right);
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-gate-c-crc-"));
        const first = envelope(left, 1);
        writeStrictPair(dir, first, { sourceId: "source-a", sourceSlot: "savegame3", replicaRevision: 1, slot: "a" });
        const opened = ingestWatchedSlot(dir, { sourceId: "source-a", configuredSlot: "savegame3" });
        const second = encodeEnvelope(right, {
            careerId: "career-a", sessionId: "session-a", publicationSequence: 1,
            exportGeneration: 1, simulationTimeMs: 10,
        });
        writeStrictPair(dir, second, { sourceId: "source-a", sourceSlot: "savegame3", replicaRevision: 2, slot: "b" });
        const conflict = ingestWatchedSlot(dir, { sourceId: "source-a", configuredSlot: "savegame3", previous: opened });
        expect(conflict.status).toBe("last-known");
        expect(conflict.reason).toBe("conflict");
        expect(conflict.identity.payloadProof).toBe(opened.identity.payloadProof);
    });

    test("a new career with a lower sequence stays unconfirmed and does not borrow live status", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-gate-c-career-"));
        const clock = { t: 1000 };
        const tracker = createFreshnessTracker({ now: () => clock.t, staleAfterMs: 5000 });
        writeStrictPair(dir, envelope('{"vehicles":[{"id":1}]}', 9), {
            sourceId: "source-a", sourceSlot: "savegame3", replicaRevision: 1, slot: "a",
        });
        const first = ingestWatchedSlot(dir, { sourceId: "source-a", configuredSlot: "savegame3", tracker, now: () => clock.t, staleAfterMs: 5000 });
        expect(first.freshness).toBe("unconfirmed");
        writeStrictPair(dir, envelope('{"vehicles":[{"id":2}]}', 10), {
            sourceId: "source-a", sourceSlot: "savegame3", replicaRevision: 2, slot: "b",
        });
        const live = ingestWatchedSlot(dir, { sourceId: "source-a", configuredSlot: "savegame3", tracker: first.tracker, previous: first, now: () => clock.t, staleAfterMs: 5000 });
        expect(live.freshness).toBe("live");
        writeStrictPair(dir, envelope('{"vehicles":[{"id":3}]}', 1, { careerId: "career-b", sessionId: "session-b" }), {
            sourceId: "source-a", sourceSlot: "savegame3", replicaRevision: 3, slot: "a",
        });
        const next = ingestWatchedSlot(dir, { sourceId: "source-a", configuredSlot: "savegame3", tracker: first.tracker, previous: live, now: () => clock.t, staleAfterMs: 5000 });
        expect(next.identity.careerId).toBe("career-b");
        expect(next.identity.publicationSequence).toBe(1);
        expect(next.freshness).toBe("unconfirmed");
    });

    test("an invalid pair does not fall through to selected.xml unless legacy is explicit", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-gate-c-legacy-"));
        fs.writeFileSync(path.join(dir, "slot-a.xml"), "<farmDashboardExport schema=\"2\"/>");
        fs.writeFileSync(path.join(dir, "selection-a.xml"), "<farmDashboardReplicaSelection/>");
        fs.writeFileSync(path.join(dir, "selected.xml"), envelope('{"vehicles":[{"id":1}]}', 1));
        fs.writeFileSync(path.join(dir, "replicaContext.xml"), '<farmDashboardReplicaContext sourceId="source-a" sourceSlot="savegame3" connectionEpoch="1" replica="true"/>');
        const blocked = ingestWatchedSlot(dir, { sourceId: "source-a", configuredSlot: "savegame3" });
        expect(blocked.status).toBe("unavailable");
        expect(blocked.payload).toBeNull();
        const only = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-gate-c-preview-"));
        fs.writeFileSync(path.join(only, "selected.xml"), envelope('{"vehicles":[{"id":4}]}', 1));
        fs.writeFileSync(path.join(only, "replicaContext.xml"), '<farmDashboardReplicaContext sourceId="source-a" sourceSlot="savegame3" connectionEpoch="1" replica="true"/>');
        expect(ingestWatchedSlot(only, { sourceId: "source-a", configuredSlot: "savegame3" }).status).toBe("unavailable");
        const preview = ingestWatchedSlot(only, { sourceId: "source-a", configuredSlot: "savegame3", explicitLegacy: true });
        expect(preview.legacy).toBe(true);
        expect(preview.freshness).toBe("unconfirmed");
        expect(preview.payload.vehicles[0].id).toBe(4);
    });

    test("recovery comparison yields across updates under a short slice", () => {
        const result = runLua(`
            publish('{"vehicles":[{"id":1}]}', 1)
            FarmDashboardExportMirror._recoverySlice = 4
            local ticks = 0
            FarmDashboardExportMirror._clock = function()
                ticks = ticks + 1
                return math.floor((ticks - 1) / 40) * 3
            end
            local body = '{"vehicles":[{"id":2,"pad":"' .. string.rep("x", 30) .. '"}]}'
            local payload = ExportEnvelopePublisher.encodeBase64(body)
            FarmDashboardExportMirror:onCommittedEnvelope({
                schema = "2", careerId = "career-a", sessionId = "session-a",
                publicationSequence = "2", exportGeneration = "2",
                simulationTimeMs = "10", encoding = "base64", bytes = tostring(#body),
                crc = ExportEnvelopePublisher.checksum(body), payload = payload,
                sourceSlot = "savegame3", sessionToken = "token-a",
            })
            for _ = 1, 24 do FarmDashboardExportMirror:update(16) end
            local selection = saved["replica/source-a/selection-b.xml"]
            local slot = saved["replica/source-a/slot-b.xml"]
            local names = {}
            for key, _ in pairs(saved) do names[#names + 1] = key end
            return "rev=" .. tostring(selection and selection.replicaRevision)
                .. "|kept=" .. tostring(saved["replica/source-a/slot-a.xml"].publicationSequence)
                .. "|slotb=" .. tostring(slot and slot.publicationSequence)
                .. "|outcome=" .. tostring(FarmDashboardExportMirror._lastReplicaOutcome)
                .. "|phase=" .. tostring(FarmDashboardExportMirror._finalizerMetrics and FarmDashboardExportMirror._finalizerMetrics.phase)
                .. "|keys=" .. table.concat(names, ",")
        `);
        expect(result).toContain("rev=2");
        expect(result).toContain("kept=1");
        expect(result).toContain("outcome=published");
    });

    test("each repeated identity mismatch, a swapped selection, and the wrong source are rejected", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-gate-c-identity-"));
        const xml = envelope('{"vehicles":[{"id":7}]}', 2);
        writeStrictPair(dir, xml, { sourceId: "source-a", sourceSlot: "savegame3", replicaRevision: 4, slot: "a" });
        const opened = ingestWatchedSlot(dir, { sourceId: "source-a", configuredSlot: "savegame3" });
        const selectionPath = path.join(dir, "selection-a.xml");
        const original = fs.readFileSync(selectionPath, "utf8");
        const fields = ["careerId", "sessionId", "exportGeneration", "publicationSequence", "simulationTimeMs", "bytes", "crc", "schema", "encoding"];
        for (const field of fields) {
            const mutated = original.replace(new RegExp(`${field}="[^"]*"`), `${field}="9"`);
            fs.writeFileSync(selectionPath, mutated);
            const rejected = ingestWatchedSlot(dir, { sourceId: "source-a", configuredSlot: "savegame3", previous: opened });
            expect(rejected.status).toBe("last-known");
            expect(rejected.identity.careerId).toBe("career-a");
            expect(rejected.payload.vehicles[0].id).toBe(7);
        }
        fs.writeFileSync(selectionPath, original);
        writeStrictPair(dir, envelope('{"vehicles":[{"id":8}]}', 3), {
            sourceId: "source-a", sourceSlot: "savegame3", replicaRevision: 5, slot: "b",
        });
        const selectionA = fs.readFileSync(path.join(dir, "selection-a.xml"), "utf8");
        const selectionB = fs.readFileSync(path.join(dir, "selection-b.xml"), "utf8");
        fs.writeFileSync(path.join(dir, "selection-a.xml"), selectionB);
        fs.writeFileSync(path.join(dir, "selection-b.xml"), selectionA);
        const swapped = ingestWatchedSlot(dir, { sourceId: "source-a", configuredSlot: "savegame3", previous: opened });
        expect(swapped.status).toBe("last-known");
        expect(swapped.payload.vehicles[0].id).toBe(7);
        const wrong = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-gate-c-wrong-"));
        writeStrictPair(wrong, xml, { sourceId: "source-a", sourceSlot: "savegame3", replicaRevision: 1, slot: "a" });
        expect(ingestWatchedSlot(wrong, { sourceId: "source-b", configuredSlot: "savegame3" }).status).toBe("unavailable");
        expect(ingestWatchedSlot(wrong, { sourceId: "source-a", configuredSlot: "savegame9" }).status).toBe("unavailable");
    });

    test("a valid pair stays readable beside an invalid inactive candidate and equal sequences conflict", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-gate-c-repair-"));
        writeStrictPair(dir, envelope('{"vehicles":[{"id":3}]}', 3), {
            sourceId: "source-a", sourceSlot: "savegame3", replicaRevision: 2, slot: "a",
        });
        fs.writeFileSync(path.join(dir, "slot-b.xml"), "<farmDashboardExport schema=\"2\"/>");
        fs.writeFileSync(path.join(dir, "selection-b.xml"), "<farmDashboardReplicaSelection/>");
        const kept = ingestWatchedSlot(dir, { sourceId: "source-a", configuredSlot: "savegame3" });
        expect(kept.status).toBe("replica");
        expect(kept.identity.publicationSequence).toBe(3);
        const conflictDir = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-gate-c-ab-"));
        writeStrictPair(conflictDir, envelope('{"vehicles":[{"id":1}]}', 1), {
            sourceId: "source-a", sourceSlot: "savegame3", replicaRevision: 1, slot: "a",
        });
        writeStrictPair(conflictDir, envelope('{"vehicles":[{"id":2}]}', 1), {
            sourceId: "source-a", sourceSlot: "savegame3", replicaRevision: 2, slot: "b",
        });
        expect(ingestWatchedSlot(conflictDir, { sourceId: "source-a", configuredSlot: "savegame3" }).status).toBe("unavailable");
        const generationDir = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-gate-c-gen-"));
        const firstXml = envelope('{"vehicles":[{"id":1}]}', 1);
        writeStrictPair(generationDir, firstXml, { sourceId: "source-a", sourceSlot: "savegame3", replicaRevision: 1, slot: "a" });
        const first = ingestWatchedSlot(generationDir, { sourceId: "source-a", configuredSlot: "savegame3", tracker: createFreshnessTracker({ now: () => 0, staleAfterMs: 1000 }) });
        writeStrictPair(generationDir, envelope('{"vehicles":[{"id":1}]}', 1, { exportGeneration: 9 }), {
            sourceId: "source-a", sourceSlot: "savegame3", replicaRevision: 2, slot: "b",
        });
        const generation = ingestWatchedSlot(generationDir, { sourceId: "source-a", configuredSlot: "savegame3", previous: first, tracker: first.tracker });
        expect(generation.status).toBe("last-known");
        expect(generation.reason).toBe("conflict");
        expect(generation.identity.exportGeneration).toBe(1);
        const replayDir = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-gate-c-replay-"));
        writeStrictPair(replayDir, envelope('{"vehicles":[{"id":5}]}', 5), {
            sourceId: "source-a", sourceSlot: "savegame3", replicaRevision: 4, slot: "b",
        });
        const newer = ingestWatchedSlot(replayDir, { sourceId: "source-a", configuredSlot: "savegame3", tracker: createFreshnessTracker({ now: () => 0, staleAfterMs: 1000 }) });
        writeStrictPair(replayDir, envelope('{"vehicles":[{"id":1}]}', 1), {
            sourceId: "source-a", sourceSlot: "savegame3", replicaRevision: 1, slot: "a",
        });
        const replay = ingestWatchedSlot(replayDir, { sourceId: "source-a", configuredSlot: "savegame3", previous: newer, tracker: newer.tracker });
        expect(replay.identity.publicationSequence).toBe(5);
        expect(replay.payload.vehicles[0].id).toBe(5);
    });

    test("an exact repeat does not refresh freshness", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-gate-c-fresh-"));
        const clock = { t: 0 };
        const tracker = createFreshnessTracker({ now: () => clock.t, staleAfterMs: 1000 });
        writeStrictPair(dir, envelope('{"vehicles":[{"id":1}]}', 1), { sourceId: "source-a", sourceSlot: "savegame3", replicaRevision: 1, slot: "a" });
        const first = ingestWatchedSlot(dir, { sourceId: "source-a", configuredSlot: "savegame3", tracker, now: () => clock.t, staleAfterMs: 1000 });
        expect(first.freshness).toBe("unconfirmed");
        writeStrictPair(dir, envelope('{"vehicles":[{"id":2}]}', 2), { sourceId: "source-a", sourceSlot: "savegame3", replicaRevision: 2, slot: "b" });
        const second = ingestWatchedSlot(dir, { sourceId: "source-a", configuredSlot: "savegame3", tracker, previous: first, now: () => clock.t, staleAfterMs: 1000 });
        expect(second.freshness).toBe("live");
        clock.t = 500;
        const again = ingestWatchedSlot(dir, { sourceId: "source-a", configuredSlot: "savegame3", tracker, previous: second, now: () => clock.t, staleAfterMs: 1000 });
        expect(again.status).toBe("replica");
        clock.t = 1600;
        const stale = ingestWatchedSlot(dir, { sourceId: "source-a", configuredSlot: "savegame3", tracker, previous: again, now: () => clock.t, staleAfterMs: 1000 });
        expect(stale.freshness).toBe("stale");
    });

    test("restart protects the newest B pair, an unknown directory is not empty, and a generation change conflicts", () => {
        const newest = runLua(`
            publish('{"vehicles":[{"id":1}]}', 1)
            publish('{"vehicles":[{"id":2}]}', 2)
            FarmDashboardExportMirror._publishedSlots = {}
            FarmDashboardExportMirror._storeTurns = nil
            local hostSave = saveXMLFile
            function saveXMLFile(handle)
                local doc = docs[handle]
                if doc and string.find(doc.path, "slot-a.xml", 1, true) then return false end
                return hostSave(handle)
            end
            publish('{"vehicles":[{"id":3}]}', 3)
            return "kept=" .. tostring(saved["replica/source-a/slot-b.xml"].publicationSequence)
                .. "|outcome=" .. tostring(FarmDashboardExportMirror._lastReplicaOutcome)
        `);
        expect(newest).toContain("kept=2");
        expect(newest).toContain("outcome=candidate-failed");
        const unknown = runLua(`
            function fileExists() return nil end
            publish('{"vehicles":[{"id":1}]}', 1)
            return "outcome=" .. tostring(FarmDashboardExportMirror._lastReplicaOutcome)
                .. "|slot=" .. tostring(saved["replica/source-a/slot-a.xml"] ~= nil)
        `);
        expect(unknown).toContain("outcome=probe-unknown");
        expect(unknown).toContain("slot=false");
        const generation = runLua(`
            publish('{"vehicles":[{"id":1}]}', 1)
            local body = '{"vehicles":[{"id":1}]}'
            local payload = ExportEnvelopePublisher.encodeBase64(body)
            FarmDashboardExportMirror:onCommittedEnvelope({
                schema = "2", careerId = "career-a", sessionId = "session-a",
                publicationSequence = "1", exportGeneration = "9",
                simulationTimeMs = "10", encoding = "base64", bytes = tostring(#body),
                crc = ExportEnvelopePublisher.checksum(body), payload = payload,
                sourceSlot = "savegame3", sessionToken = "token-a",
            })
            for _ = 1, 8 do FarmDashboardExportMirror:update(16) end
            return "outcome=" .. tostring(FarmDashboardExportMirror._lastReplicaOutcome)
                .. "|rev=" .. tostring(saved["replica/source-a/selection-a.xml"].replicaRevision)
                .. "|slotb=" .. tostring(saved["replica/source-a/slot-b.xml"] ~= nil)
        `);
        expect(generation).toContain("outcome=conflict");
        expect(generation).toContain("rev=1");
        expect(generation).toContain("slotb=false");
        const repair = runLua(`
            publish('{"vehicles":[{"id":1}]}', 1)
            saved["replica/source-a/selection-b.xml"] = { selectionSchema = "0" }
            files["replica/source-a/selection-b.xml"] = "<bad/>"
            publish('{"vehicles":[{"id":2}]}', 2)
            return "kept=" .. tostring(saved["replica/source-a/slot-a.xml"].publicationSequence)
                .. "|next=" .. tostring(saved["replica/source-a/slot-b.xml"].publicationSequence)
                .. "|outcome=" .. tostring(FarmDashboardExportMirror._lastReplicaOutcome)
        `);
        expect(repair).toContain("kept=1");
        expect(repair).toContain("next=2");
        expect(repair).toContain("outcome=published");
    });

    test("a corrupt higher sequence does not replace the only valid pair", () => {
        const result = runLua(`
            publish('{"value":1}', 1)
            publish('{"value":2}', 2)
            local keptPayload = saved["replica/source-a/slot-a.xml"].payload
            local keptSelection = files["replica/source-a/selection-a.xml"]
            saved["replica/source-a/slot-b.xml"].payload = "!!!!"
            files["replica/source-a/slot-b.xml"] = string.gsub(files["replica/source-a/slot-b.xml"], 'payload="[^"]*"', 'payload="!!!!"')
            FarmDashboardExportMirror._publishedSlots = nil
            FarmDashboardExportMirror._storeTurns = nil
            local nativeSave = saveXMLFile
            local target = "none"
            function saveXMLFile(handle)
                local doc = docs[handle]
                if doc and string.find(doc.path, "slot-", 1, true) and doc.fields.publicationSequence == "3" then
                    target = doc.path
                    files[doc.path] = "<truncated"
                    saved[doc.path] = nil
                    return false
                end
                return nativeSave(handle)
            end
            publish('{"value":3}', 3)
            return "writeTarget=" .. target
                .. "|valid=" .. tostring(saved["replica/source-a/slot-a.xml"] ~= nil and saved["replica/source-a/slot-a.xml"].payload == keptPayload)
                .. "|selection=" .. tostring(files["replica/source-a/selection-a.xml"] == keptSelection)
                .. "|corrupt=" .. tostring(saved["replica/source-a/slot-b.xml"] ~= nil)
                .. "|outcome=" .. tostring(FarmDashboardExportMirror._lastReplicaOutcome)
        `);
        expect(result).toContain("writeTarget=replica/source-a/slot-b.xml");
        expect(result).toContain("valid=true");
        expect(result).toContain("selection=true");
        expect(result).toContain("corrupt=false");
        expect(result).toContain("outcome=candidate-failed");
    });

    test("stored equal sequence with a different generation is a conflict", () => {
        const result = runLua(`
            publish('{"value":1}', 1)
            publish('{"value":1}', 2)
            local slot = saved["replica/source-a/slot-b.xml"]
            local selection = saved["replica/source-a/selection-b.xml"]
            slot.publicationSequence = "1"
            selection.publicationSequence = "1"
            slot.exportGeneration = "9"
            selection.exportGeneration = "9"
            publish('{"value":2}', 2)
            return "outcome=" .. tostring(FarmDashboardExportMirror._lastReplicaOutcome)
                .. "|rev=" .. tostring(saved["replica/source-a/selection-a.xml"].replicaRevision)
                .. "|seq=" .. tostring(saved["replica/source-a/slot-a.xml"].publicationSequence)
        `);
        expect(result).toContain("outcome=conflict");
        expect(result).toContain("rev=1");
        expect(result).toContain("seq=1");
    });

    test("recovery stays inside the shared budget and a terminal job drops its payload", () => {
        const result = runLua(`
            FarmDashboardExportMirror.CHUNKS_PER_FRAME = 80
            publish('{"value":"' .. string.rep("x", 8192) .. '"}', 1)
            for _ = 1, 40 do FarmDashboardExportMirror:update(16) end
            FarmDashboardExportMirror._clock = function() return 0 end
            FarmDashboardExportMirror._finalizerBudget = 4
            local body = '{"value":2}'
            FarmDashboardExportMirror:onCommittedEnvelope({
                schema = "2", careerId = "career-a", sessionId = "session-a",
                publicationSequence = "2", exportGeneration = "2",
                simulationTimeMs = "10", encoding = "base64", bytes = tostring(#body),
                crc = ExportEnvelopePublisher.checksum(body), payload = ExportEnvelopePublisher.encodeBase64(body),
                sourceSlot = "savegame3", sessionToken = "token-a",
            })
            local maxAdvance = 0
            local reportedAtPeak = 0
            local oldAt = 0
            for _ = 1, 12 do
                FarmDashboardExportMirror:update(16)
                local turns = FarmDashboardExportMirror._storeTurns or {}
                local job = FarmDashboardExportMirror._active or turns["replica/source-a/"]
                if job and job.header and tostring(job.header.publicationSequence) == "2" then
                    local at = job._compareAt or 0
                    local delta = at - oldAt
                    if delta > maxAdvance then
                        maxAdvance = delta
                        reportedAtPeak = (FarmDashboardExportMirror._finalizerMetrics or {}).bytesThisStep or 0
                    end
                    oldAt = at
                end
            end
            local published = saved["replica/source-a/selection-b.xml"] ~= nil
            FarmDashboardExportMirror:cancelJob()
            local turn = (FarmDashboardExportMirror._storeTurns or {})["replica/source-a/"]
            return "advance=" .. tostring(maxAdvance)
                .. "|reported=" .. tostring(reportedAtPeak)
                .. "|published=" .. tostring(published)
                .. "|turn=" .. tostring(turn ~= nil)
        `);
        expect(result).toContain("advance=4");
        expect(result).toContain("reported=4");
        expect(result).toContain("published=false");
        expect(result).toContain("turn=false");
        const cleaned = runLua(`
            publish('{"vehicles":[{"id":1}]}', 1)
            local job = (FarmDashboardExportMirror._storeTurns or {})["replica/source-a/"]
            FarmDashboardExportMirror:cancelJob()
            return "before=" .. tostring(job == nil)
                .. "|after=" .. tostring((FarmDashboardExportMirror._storeTurns or {})["replica/source-a/"] == nil)
                .. "|payload=" .. tostring(job == nil or job.recoverPairs == nil)
        `);
        expect(cleaned).toContain("before=true");
        expect(cleaned).toContain("after=true");
        expect(cleaned).toContain("payload=true");
        const drained = runLua(`
            FarmDashboardExportMirror.CHUNKS_PER_FRAME = 80
            publish('{"value":"' .. string.rep("x", 64) .. '"}', 1)
            local primed = 0
            while saved["replica/source-a/selection-a.xml"] == nil and primed < 40 do
                FarmDashboardExportMirror:update(16)
                primed = primed + 1
            end
            FarmDashboardExportMirror._clock = function() return 0 end
            FarmDashboardExportMirror._finalizerBudget = 4
            local body = '{"value":2}'
            FarmDashboardExportMirror:onCommittedEnvelope({
                schema = "2", careerId = "career-a", sessionId = "session-a",
                publicationSequence = "2", exportGeneration = "2",
                simulationTimeMs = "10", encoding = "base64", bytes = tostring(#body),
                crc = ExportEnvelopePublisher.checksum(body), payload = ExportEnvelopePublisher.encodeBase64(body),
                sourceSlot = "savegame3", sessionToken = "token-a",
            })
            local guard = 0
            while saved["replica/source-a/selection-b.xml"] == nil and guard < 200 do
                FarmDashboardExportMirror:update(16)
                guard = guard + 1
            end
            local turn = (FarmDashboardExportMirror._storeTurns or {})["replica/source-a/"]
            return "published=" .. tostring(saved["replica/source-a/selection-b.xml"] ~= nil)
                .. "|steps=" .. tostring(guard)
                .. "|turn=" .. tostring(turn == nil)
                .. "|seq=" .. tostring(saved["replica/source-a/slot-b.xml"] and saved["replica/source-a/slot-b.xml"].publicationSequence)
                .. "|outcome=" .. tostring(FarmDashboardExportMirror._lastReplicaOutcome)
        `);
        expect(drained).toContain("published=true");
        expect(drained).toContain("turn=true");
        expect(drained).toContain("seq=2");
        expect(Number(drained.match(/steps=(\d+)/)[1])).toBeGreaterThan(1);
    });

    test("node rejects equal revisions, tick changes, and a foreign previous", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-gate-c-rework-"));
        const tracker = createFreshnessTracker({ now: () => 1000, staleAfterMs: 5000 });
        const read = (extra) => ingestWatchedSlot(dir, Object.assign({
            sourceId: "source-a", configuredSlot: "savegame3", tracker, now: () => 1000, staleAfterMs: 5000,
        }, extra || {}));
        writeStrictPair(dir, envelope('{"vehicles":[{"id":1}]}', 1), { sourceId: "source-a", sourceSlot: "savegame3", replicaRevision: 1, slot: "a" });
        const before = read();
        expect(String(before.identity.simulationTimeMs)).toBe("10");
        writeStrictPair(dir, envelope('{"vehicles":[{"id":1}]}', 1, { simulationTimeMs: 11 }), {
            sourceId: "source-a", sourceSlot: "savegame3", replicaRevision: 2, slot: "a",
        });
        const tick = read({ previous: before });
        expect(tick.status).toBe("last-known");
        expect(tick.reason).toBe("equal-sequence-conflict");
        expect(String(tick.identity.simulationTimeMs)).toBe("10");
        expect(tick.identity.replicaRevision).toBe(1);
        const cross = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-gate-c-cross-"));
        writeStrictPair(cross, envelope('{"vehicles":[{"id":1}]}', 1), { sourceId: "source-a", sourceSlot: "savegame3", replicaRevision: 7, slot: "a" });
        writeStrictPair(cross, envelope('{"vehicles":[{"id":1}]}', 1, { careerId: "career-b", sessionId: "session-b" }), {
            sourceId: "source-a", sourceSlot: "savegame3", replicaRevision: 7, slot: "b",
        });
        const crossed = ingestWatchedSlot(cross, { sourceId: "source-a", configuredSlot: "savegame3", tracker });
        expect(crossed.status).toBe("unavailable");
        expect(crossed.reason).toBe("conflict");
        expect(crossed.payload).toBeNull();
        const same = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-gate-c-rev-"));
        writeStrictPair(same, envelope('{"vehicles":[{"id":1}]}', 1), { sourceId: "source-a", sourceSlot: "savegame3", replicaRevision: 7, slot: "a" });
        writeStrictPair(same, envelope('{"vehicles":[{"id":2}]}', 2), { sourceId: "source-a", sourceSlot: "savegame3", replicaRevision: 7, slot: "b" });
        const ambiguous = ingestWatchedSlot(same, { sourceId: "source-a", configuredSlot: "savegame3", tracker });
        expect(ambiguous.status).toBe("unavailable");
        expect(ambiguous.reason).toBe("conflict");
        fs.writeFileSync(path.join(dir, "selection-a.xml"), "<farmDashboardReplicaSelection/>");
        const foreign = ingestWatchedSlot(dir, { sourceId: "source-b", configuredSlot: "savegame4", previous: before });
        expect(foreign.status).toBe("unavailable");
        expect(foreign.payload).toBeNull();
        expect(foreign.identity).toBeUndefined();
    });

    test("lua slot xml is the document node ingress reads", () => {
        const packed = runLua(`
            publish('{"vehicles":[{"id":7}]}', 1)
            return files["replica/source-a/slot-a.xml"] .. string.char(10) .. "<<<PAIR>>>" .. string.char(10) .. files["replica/source-a/selection-a.xml"]
        `);
        const parts = packed.split("\n<<<PAIR>>>\n");
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-gate-c-bridge-"));
        fs.writeFileSync(path.join(dir, "slot-a.xml"), parts[0]);
        fs.writeFileSync(path.join(dir, "selection-a.xml"), parts[1]);
        const opened = ingestWatchedSlot(dir, { sourceId: "source-a", configuredSlot: "savegame3", tracker: createFreshnessTracker({ now: () => 0, staleAfterMs: 1000 }) });
        expect(opened.status).toBe("replica");
        expect(opened.authoritative).toBe(false);
        expect(opened.identity.publicationSequence).toBe(1);
        expect(opened.payload.vehicles[0].id).toBe(7);
    });

    test("payload lengths with zero one and two padding characters publish the next sequence", () => {
        const shapes = ["{\"x\":1}", "{\"x\":11}", "{\"x\":111}", "{\"x\":1} "];
        shapes.forEach((body, index) => {
            const result = runLua(`
                publish(${JSON.stringify(body)}, 1)
                FarmDashboardExportMirror._publishedSlots = nil
                FarmDashboardExportMirror._storeTurns = nil
                publish(${JSON.stringify(body)}, 2)
                local again = publish(${JSON.stringify(body)}, 2)
                return "second=" .. tostring(saved["replica/source-a/slot-b.xml"] ~= nil and saved["replica/source-a/slot-b.xml"].publicationSequence == "2")
                    .. "|repeat=" .. tostring(FarmDashboardExportMirror._lastReplicaOutcome)
                    .. "|rev=" .. tostring(saved["replica/source-a/selection-b.xml"].replicaRevision)
            `);
            expect(result).toContain("second=true");
            expect(result).toContain("repeat=duplicate");
            expect(result).toContain("rev=2");
            expect(index).toBeGreaterThanOrEqual(0);
        });
    });

    test("checksum-valid non-json and invalid utf-8 do not replace the earlier pair", () => {
        const result = runLua(`
            publish('{"value":1}', 1)
            publish('{"value":2}', 2)
            local function install(raw)
                local payload = ExportEnvelopePublisher.encodeBase64(raw)
                local bytes = tostring(#raw)
                local crc = ExportEnvelopePublisher.checksum(raw)
                local function patch(path)
                    saved[path].bytes = bytes
                    saved[path].crc = crc
                    if saved[path].payload ~= nil then saved[path].payload = payload end
                    local text = files[path]
                    text = string.gsub(text, 'bytes="[^"]*"', 'bytes="' .. bytes .. '"')
                    text = string.gsub(text, 'crc="[^"]*"', 'crc="' .. crc .. '"')
                    text = string.gsub(text, 'payload="[^"]*"', 'payload="' .. payload .. '"')
                    files[path] = text
                end
                patch("replica/source-a/slot-b.xml")
                patch("replica/source-a/selection-b.xml")
            end
            install("not-json")
            local packed = files["replica/source-a/slot-a.xml"]
                .. string.char(10) .. "<<<PAIR>>>" .. string.char(10) .. files["replica/source-a/selection-a.xml"]
                .. string.char(10) .. "<<<PAIR>>>" .. string.char(10) .. files["replica/source-a/slot-b.xml"]
                .. string.char(10) .. "<<<PAIR>>>" .. string.char(10) .. files["replica/source-a/selection-b.xml"]
            local keptPayload = saved["replica/source-a/slot-a.xml"].payload
            local keptSelection = files["replica/source-a/selection-a.xml"]
            FarmDashboardExportMirror._publishedSlots = nil
            FarmDashboardExportMirror._storeTurns = nil
            local nativeSave = saveXMLFile
            local target = "none"
            function saveXMLFile(handle)
                local doc = docs[handle]
                if doc and string.find(doc.path, "slot-", 1, true) and doc.fields.publicationSequence == "3" then
                    target = doc.path
                    files[doc.path] = "<truncated"
                    saved[doc.path] = nil
                    return false
                end
                return nativeSave(handle)
            end
            publish('{"value":3}', 3)
            return packed .. string.char(10) .. "<<<END>>>" .. string.char(10)
                .. "writeTarget=" .. target
                .. "|valid=" .. tostring(saved["replica/source-a/slot-a.xml"] ~= nil and saved["replica/source-a/slot-a.xml"].payload == keptPayload)
                .. "|selection=" .. tostring(files["replica/source-a/selection-a.xml"] == keptSelection)
                .. "|outcome=" .. tostring(FarmDashboardExportMirror._lastReplicaOutcome)
        `);
        const split = result.split("\n<<<END>>>\n");
        expect(split[1]).toContain("writeTarget=replica/source-a/slot-b.xml");
        expect(split[1]).toContain("valid=true");
        expect(split[1]).toContain("selection=true");
        expect(split[1]).toContain("outcome=candidate-failed");
        const parts = split[0].split("\n<<<PAIR>>>\n");
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-gate-c-json-"));
        ["slot-a.xml", "selection-a.xml", "slot-b.xml", "selection-b.xml"].forEach((name, index) => {
            fs.writeFileSync(path.join(dir, name), parts[index]);
        });
        const opened = ingestWatchedSlot(dir, { sourceId: "source-a", configuredSlot: "savegame3", tracker: createFreshnessTracker({ now: () => 0, staleAfterMs: 1000 }) });
        expect(opened.status).toBe("replica");
        expect(opened.identity.publicationSequence).toBe(1);
        const utf = runLua(`
            publish('{"value":1}', 1)
            publish('{"value":2}', 2)
            local raw = '{"x":"' .. string.char(255) .. '"}'
            local payload = ExportEnvelopePublisher.encodeBase64(raw)
            local bytes = tostring(#raw)
            local crc = ExportEnvelopePublisher.checksum(raw)
            saved["replica/source-a/slot-b.xml"].payload = payload
            saved["replica/source-a/slot-b.xml"].bytes = bytes
            saved["replica/source-a/slot-b.xml"].crc = crc
            saved["replica/source-a/selection-b.xml"].bytes = bytes
            saved["replica/source-a/selection-b.xml"].crc = crc
            local kept = saved["replica/source-a/slot-a.xml"].payload
            FarmDashboardExportMirror._publishedSlots = nil
            FarmDashboardExportMirror._storeTurns = nil
            local nativeSave = saveXMLFile
            local target = "none"
            function saveXMLFile(handle)
                local doc = docs[handle]
                if doc and string.find(doc.path, "slot-", 1, true) and doc.fields.publicationSequence == "3" then
                    target = doc.path
                    saved[doc.path] = nil
                    return false
                end
                return nativeSave(handle)
            end
            publish('{"value":3}', 3)
            return "writeTarget=" .. target
                .. "|valid=" .. tostring(saved["replica/source-a/slot-a.xml"].payload == kept)
                .. "|outcome=" .. tostring(FarmDashboardExportMirror._lastReplicaOutcome)
        `);
        expect(utf).toContain("writeTarget=replica/source-a/slot-b.xml");
        expect(utf).toContain("valid=true");
        expect(utf).toContain("outcome=candidate-failed");
    });

    test("recovery checks the update deadline inside payload validation", () => {
        const result = runLua(`
            publish('{"x":"${"a".repeat(180)}"}', 1)
            local clock = 0
            FarmDashboardExportMirror._clock = function() return clock end
            local nativeAbsorb = FarmDashboardExportMirror._absorbDecoded
            FarmDashboardExportMirror._absorbDecoded = function(check, byte)
                clock = clock + 1
                return nativeAbsorb(check, byte)
            end
            FarmDashboardExportMirror._finalizerBudget = 4096
            local body = '{"x":20}'
            FarmDashboardExportMirror:onCommittedEnvelope({
                schema = "2", careerId = "career-a", sessionId = "session-a",
                publicationSequence = "2", exportGeneration = "2", simulationTimeMs = "10",
                encoding = "base64", bytes = tostring(#body), crc = ExportEnvelopePublisher.checksum(body),
                payload = ExportEnvelopePublisher.encodeBase64(body), sourceSlot = "savegame3", sessionToken = "token-a",
            })
            local peak = 0
            local workAtPeak = 0
            for _ = 1, 20 do
                local before = clock
                FarmDashboardExportMirror:update(16)
                local elapsed = clock - before
                if elapsed > peak then
                    peak = elapsed
                    workAtPeak = (FarmDashboardExportMirror._finalizerMetrics or {}).bytesThisStep or 0
                end
            end
            return "peak=" .. tostring(peak)
                .. "|work=" .. tostring(workAtPeak)
                .. "|slotb=" .. tostring(saved["replica/source-a/slot-b.xml"] ~= nil)
                .. "|turn=" .. tostring(FarmDashboardExportMirror._storeTurns["replica/source-a/"] ~= nil)
        `);
        const peak = Number(result.match(/peak=(\d+)/)[1]);
        const work = Number(result.match(/work=(\d+)/)[1]);
        expect(peak).toBeGreaterThan(0);
        expect(peak).toBeLessThanOrEqual(3);
        expect(work).toBeLessThanOrEqual(4);
        expect(result).toContain("slotb=false");
        expect(result).toContain("turn=true");
    });

    test("an equal checksum does not skip the incoming payload comparison", () => {
        const left = '{"k":"mmmmmmmm"} ';
        const right = '{"k":"emuumemm"} ';
        expect(adler32(left)).toBe(adler32(right));
        const result = runLua(`
            publish(${JSON.stringify(left)}, 1)
            local function copy(source)
                local out = {}
                for key, value in pairs(source) do out[key] = value end
                return out
            end
            local slot = copy(saved["replica/source-a/slot-a.xml"])
            local selection = copy(saved["replica/source-a/selection-a.xml"])
            selection.replicaRevision = "2"
            selection.slot = "b"
            saved["replica/source-a/slot-b.xml"] = slot
            saved["replica/source-a/selection-b.xml"] = selection
            files["replica/source-a/slot-b.xml"] = files["replica/source-a/slot-a.xml"]
            local selectionText = files["replica/source-a/selection-a.xml"]
            selectionText = string.gsub(selectionText, 'replicaRevision="1"', 'replicaRevision="2"')
            selectionText = string.gsub(selectionText, 'slot="a"', 'slot="b"')
            files["replica/source-a/selection-b.xml"] = selectionText
            FarmDashboardExportMirror._publishedSlots = nil
            FarmDashboardExportMirror._storeTurns = nil
            publish(${JSON.stringify(right)}, 1)
            return "outcome=" .. tostring(FarmDashboardExportMirror._lastReplicaOutcome)
                .. "|revisionB=" .. tostring(saved["replica/source-a/selection-b.xml"].replicaRevision)
                .. "|slotA=" .. tostring(saved["replica/source-a/slot-a.xml"].publicationSequence)
        `);
        expect(result).toContain("outcome=conflict");
        expect(result).toContain("revisionB=2");
        expect(result).toContain("slotA=1");
    });

    test("incoming comparison yields inside the shared budget", () => {
        const left = '{"k":"mmmmmmmm"} ';
        const right = '{"k":"emuumemm"} ';
        const result = runLua(`
            publish(${JSON.stringify(left)}, 1)
            local function copy(source)
                local out = {}
                for key, value in pairs(source) do out[key] = value end
                return out
            end
            local selection = copy(saved["replica/source-a/selection-a.xml"])
            selection.replicaRevision = "2"
            selection.slot = "b"
            saved["replica/source-a/slot-b.xml"] = copy(saved["replica/source-a/slot-a.xml"])
            saved["replica/source-a/selection-b.xml"] = selection
            FarmDashboardExportMirror._publishedSlots = nil
            FarmDashboardExportMirror._storeTurns = nil
            FarmDashboardExportMirror._clock = function() return 0 end
            FarmDashboardExportMirror._finalizerBudget = 4
            local body = ${JSON.stringify(right)}
            FarmDashboardExportMirror:onCommittedEnvelope({
                schema = "2", careerId = "career-a", sessionId = "session-a",
                publicationSequence = "1", exportGeneration = "1", simulationTimeMs = "10",
                encoding = "base64", bytes = tostring(#body), crc = ExportEnvelopePublisher.checksum(body),
                payload = ExportEnvelopePublisher.encodeBase64(body), sourceSlot = "savegame3", sessionToken = "token-a",
            })
            local maxAdvance = 0
            local oldAt = 0
            for _ = 1, 80 do
                FarmDashboardExportMirror:update(16)
                local turns = FarmDashboardExportMirror._storeTurns or {}
                local job = FarmDashboardExportMirror._active or turns["replica/source-a/"]
                if job then
                    local at = job._incomingAt or 0
                    local delta = at - oldAt
                    if delta > maxAdvance then maxAdvance = delta end
                    oldAt = at
                end
            end
            return "advance=" .. tostring(maxAdvance)
                .. "|outcome=" .. tostring(FarmDashboardExportMirror._lastReplicaOutcome)
                .. "|revisionB=" .. tostring(saved["replica/source-a/selection-b.xml"].replicaRevision)
        `);
        expect(result).toContain("advance=4");
        expect(result).toContain("outcome=conflict");
        expect(result).toContain("revisionB=2");
    });

    const suppliedBodies = [
        "{}",
        " { \"a\": [1,true,false,null,{\"b\":\"ok\"}] } ",
        "{\"x\":-0.1e+2}",
        "{\"x\":0}",
        "{\"x\":1e309}",
        "{\"x\":\"\\ud800\"}",
        "{{}}",
        "{ {\"x\":1} }",
        "{\"x\":-.1}",
        "{\"x\":-e1}",
        "{\"x\":-E+1}",
        "{\"x\":01}",
        "{\"x\":1.}",
        "{\"x\":1e}",
        "{\"x\":1e+}",
        "{\"x\":true,}",
        "{\"x\":[1,]}",
        "{\"__proto__\":1}",
        "{\"\\u005f_proto__\":1}",
        "{\"con\\u0073tructor\":1}",
        "{\"proto\\u0074ype\":1}",
        "{\"constructor\\u0058\":1}",
        "{\"__proto__\\u0078\":1}",
        "{\"nested\":{\"con\\u0073tructor\":1}}",
        "{\"x\":\"caf\u00e9\"}",
        "{\"x\":\"\uD83D\uDE00\"}",
        "{\"x\":\"\\n\\t\\b\\f\\r\\/\\\\\\\"\"}",
        "[]",
        "true",
        "null",
        "not-json",
        "{\"x\":1} garbage",
    ];

    function luaByteList(body) {
        return "string.char(" + [...Buffer.from(body, "utf8")].join(",") + ")";
    }

    function nodeEnvelopeStatus(body) {
        return decodeEnvelope(encodeEnvelope(Buffer.from(body, "utf8"), {
            careerId: "career-a",
            sessionId: "session-a",
            publicationSequence: 1,
            exportGeneration: 1,
            simulationTimeMs: 10,
        })).status;
    }

    function luaVerdicts(bodies) {
        const lines = bodies.map((body, index) => `bodies[${index + 1}] = ${luaByteList(body)}`).join("\n");
        const packed = runLua(`
            local bodies = {}
            ${lines}
            local function verdict(body, budget)
                local payload = ExportEnvelopePublisher.encodeBase64(body)
                local crc = ExportEnvelopePublisher.checksum(body)
                local check = FarmDashboardExportMirror._beginPayloadCheck(payload, tostring(#body), crc)
                if check == nil then return "invalid" end
                local status = "continue"
                local guard = 0
                while status == "continue" and guard < 20000 do
                    status = FarmDashboardExportMirror._stepPayloadCheck(check, { remaining = budget, used = 0, expired = function() return false end })
                    guard = guard + 1
                end
                return status
            end
            local out = {}
            for i = 1, #bodies do
                out[#out + 1] = verdict(bodies[i], 4) .. "/" .. verdict(bodies[i], 100000)
            end
            return table.concat(out, "\\n")
        `);
        return packed.split("\n");
    }

    test("the supplied JSON corpus matches the node decoder at both budgets", () => {
        const rows = luaVerdicts(suppliedBodies);
        expect(rows).toHaveLength(suppliedBodies.length);
        const mismatches = [];
        suppliedBodies.forEach((body, index) => {
            const nodeOk = nodeEnvelopeStatus(body) === "valid";
            const [small, wide] = rows[index].split("/");
            if ((small === "valid") !== nodeOk || (wide === "valid") !== nodeOk || small !== wide) {
                mismatches.push({ index, body, small, wide, node: nodeEnvelopeStatus(body) });
            }
        });
        expect(mismatches).toEqual([]);
    });

    test("a seeded grammar corpus stays aligned with the node decoder", () => {
        const seed = 20260924;
        let state = seed >>> 0;
        const next = () => {
            state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
            return state;
        };
        const atoms = ["0", "-1", "0.5", "1e2", "1E-2", "-0.1e+2", "true", "false", "null", '""', '{"k":1}', "[1,{}]"];
        const bodies = ["{}", '{"a":0}', '{"a":-0}', '{"s":"constructor"}', '{"ok\\u0058":1}'];
        for (let i = 0; i < 16; i += 1) {
            bodies.push(`{"k${next() % 20}":${atoms[next() % atoms.length]}}`);
        }
        bodies.push("{{}}", '{"a":-.1}', '{"a":-e1}', '{"a":01}', '{"a":1.}', '{"a":1e+}', "[]", "true", '{"\\u005f_proto__":1}');
        const generated = bodies.concat(bodies.map((body) => (body.startsWith("{") ? `{${body}` : `${body}x`)));
        const rows = luaVerdicts(generated);
        const mismatches = [];
        generated.forEach((body, index) => {
            const nodeOk = nodeEnvelopeStatus(body) === "valid";
            const [small, wide] = rows[index].split("/");
            if ((small === "valid") !== nodeOk || small !== wide) mismatches.push(index);
        });
        expect(mismatches).toEqual([]);
        expect(seed).toBe(20260924);
        expect(generated.length).toBeGreaterThanOrEqual(40);
    });

    test("malformed and escaped blocked slots do not replace a valid pair", () => {
        const blocked = ["{{}}", '{"\\u005f_proto__":1}', '{"con\\u0073tructor":1}'];
        blocked.forEach((raw) => {
            const result = runLua(`
                publish('{"value":1}', 1)
                publish('{"value":2}', 2)
                local raw = ${luaByteList(raw)}
                local payload = ExportEnvelopePublisher.encodeBase64(raw)
                local bytes = tostring(#raw)
                local crc = ExportEnvelopePublisher.checksum(raw)
                saved["replica/source-a/slot-b.xml"].payload = payload
                saved["replica/source-a/slot-b.xml"].bytes = bytes
                saved["replica/source-a/slot-b.xml"].crc = crc
                saved["replica/source-a/selection-b.xml"].bytes = bytes
                saved["replica/source-a/selection-b.xml"].crc = crc
                local keptPayload = saved["replica/source-a/slot-a.xml"].payload
                local keptSelection = files["replica/source-a/selection-a.xml"]
                FarmDashboardExportMirror._publishedSlots = nil
                FarmDashboardExportMirror._storeTurns = nil
                local nativeSave = saveXMLFile
                local target = "none"
                function saveXMLFile(handle)
                    local doc = docs[handle]
                    if doc and string.find(doc.path, "slot-", 1, true) and doc.fields.publicationSequence == "3" then
                        target = doc.path
                        saved[doc.path] = nil
                        files[doc.path] = "<truncated"
                        return false
                    end
                    return nativeSave(handle)
                end
                publish('{"value":3}', 3)
                return "writeTarget=" .. target
                    .. "|valid=" .. tostring(saved["replica/source-a/slot-a.xml"].payload == keptPayload)
                    .. "|selection=" .. tostring(files["replica/source-a/selection-a.xml"] == keptSelection)
                    .. "|outcome=" .. tostring(FarmDashboardExportMirror._lastReplicaOutcome)
            `);
            expect(result).toContain("writeTarget=replica/source-a/slot-b.xml");
            expect(result).toContain("valid=true");
            expect(result).toContain("selection=true");
            expect(result).toContain("outcome=candidate-failed");
        });
    });

    test("a harmless escaped property name recovers and repeats", () => {
        const result = runLua(`
            local body = ${luaByteList('{"constructor\\u0058":1}')}
            publish(body, 1)
            local first = saved["replica/source-a/slot-a.xml"] ~= nil
            FarmDashboardExportMirror._publishedSlots = nil
            FarmDashboardExportMirror._storeTurns = nil
            publish(body, 2)
            local repeatBody = publish(body, 2)
            return "first=" .. tostring(first)
                .. "|second=" .. tostring(saved["replica/source-a/slot-b.xml"] ~= nil and saved["replica/source-a/slot-b.xml"].publicationSequence == "2")
                .. "|repeat=" .. tostring(FarmDashboardExportMirror._lastReplicaOutcome)
                .. "|rev=" .. tostring(saved["replica/source-a/selection-b.xml"].replicaRevision)
        `);
        expect(result).toContain("first=true");
        expect(result).toContain("second=true");
        expect(result).toContain("repeat=duplicate");
        expect(result).toContain("rev=2");
    });

    test("an invalid quartet is debited before the next slot is read", () => {
        const measure = (budget) => runLua(`
            publish('{"x":10}', 1)
            publish('{"x":20}', 2)
            local raw = "not-json"
            for _, letter in ipairs({ "a", "b" }) do
                local slot = saved["replica/source-a/slot-" .. letter .. ".xml"]
                local selection = saved["replica/source-a/selection-" .. letter .. ".xml"]
                slot.payload = ExportEnvelopePublisher.encodeBase64(raw)
                slot.bytes = tostring(#raw)
                slot.crc = ExportEnvelopePublisher.checksum(raw)
                selection.bytes = slot.bytes
                selection.crc = slot.crc
            end
            FarmDashboardExportMirror._finalizerBudget = ${budget}
            FarmDashboardExportMirror._clock = function() return 0 end
            local examined = 0
            local nativeValue = FarmDashboardExportMirror._recoveryAlphabetValue
            FarmDashboardExportMirror._recoveryAlphabetValue = function(ch)
                examined = examined + 1
                return nativeValue(ch)
            end
            local incoming = '{"x":30}'
            FarmDashboardExportMirror:onCommittedEnvelope({
                schema = "2", careerId = "career-a", sessionId = "session-a",
                publicationSequence = "3", exportGeneration = "3", simulationTimeMs = "10",
                encoding = "base64", bytes = tostring(#incoming), crc = ExportEnvelopePublisher.checksum(incoming),
                payload = ExportEnvelopePublisher.encodeBase64(incoming), sourceSlot = "savegame3", sessionToken = "token-a",
            })
            local peak = 0
            local reported = 0
            for _ = 1, 20 do
                local before = examined
                FarmDashboardExportMirror:update(16)
                local used = examined - before
                if used > peak then
                    peak = used
                    reported = (FarmDashboardExportMirror._finalizerMetrics or {}).bytesThisStep or 0
                end
            end
            return "peak=" .. tostring(peak) .. "|reported=" .. tostring(reported) .. "|outcome=" .. tostring(FarmDashboardExportMirror._lastReplicaOutcome)
        `);
        const tight = measure(4);
        expect(tight).toContain("peak=4");
        expect(tight).toContain("reported=4");
        expect(tight).toContain("outcome=recover-unproven");
        const wider = measure(8);
        const peak = Number(wider.match(/peak=(\d+)/)[1]);
        const reported = Number(wider.match(/reported=(\d+)/)[1]);
        expect(peak).toBeLessThanOrEqual(8);
        expect(reported).toBe(peak);
        expect(wider).toContain("outcome=recover-unproven");
        const openBudget = measure(4096);
        const openPeak = Number(openBudget.match(/peak=(\d+)/)[1]);
        const openReported = Number(openBudget.match(/reported=(\d+)/)[1]);
        expect(openPeak).toBeLessThanOrEqual(4096);
        expect(openReported).toBe(openPeak);
        expect(openBudget).toContain("outcome=recover-unproven");
        const later = runLua(`
            publish('{"x":10}', 1)
            publish('{"x":20}', 2)
            local raw = '{"x":-.1}'
            for _, letter in ipairs({ "a", "b" }) do
                local slot = saved["replica/source-a/slot-" .. letter .. ".xml"]
                local selection = saved["replica/source-a/selection-" .. letter .. ".xml"]
                slot.payload = ExportEnvelopePublisher.encodeBase64(raw)
                slot.bytes = tostring(#raw)
                slot.crc = ExportEnvelopePublisher.checksum(raw)
                selection.bytes = slot.bytes
                selection.crc = slot.crc
            end
            FarmDashboardExportMirror._finalizerBudget = 4
            FarmDashboardExportMirror._clock = function() return 0 end
            local examined = 0
            local nativeValue = FarmDashboardExportMirror._recoveryAlphabetValue
            FarmDashboardExportMirror._recoveryAlphabetValue = function(ch)
                examined = examined + 1
                return nativeValue(ch)
            end
            local incoming = '{"x":30}'
            FarmDashboardExportMirror:onCommittedEnvelope({
                schema = "2", careerId = "career-a", sessionId = "session-a",
                publicationSequence = "3", exportGeneration = "3", simulationTimeMs = "10",
                encoding = "base64", bytes = tostring(#incoming), crc = ExportEnvelopePublisher.checksum(incoming),
                payload = ExportEnvelopePublisher.encodeBase64(incoming), sourceSlot = "savegame3", sessionToken = "token-a",
            })
            local peak = 0
            local reported = 0
            for _ = 1, 30 do
                local before = examined
                FarmDashboardExportMirror:update(16)
                local used = examined - before
                if used > peak then
                    peak = used
                    reported = (FarmDashboardExportMirror._finalizerMetrics or {}).bytesThisStep or 0
                end
            end
            return "peak=" .. tostring(peak) .. "|reported=" .. tostring(reported) .. "|outcome=" .. tostring(FarmDashboardExportMirror._lastReplicaOutcome)
        `);
        expect(later).toContain("peak=4");
        expect(later).toContain("reported=4");
        expect(later).toContain("outcome=recover-unproven");
        const alphabet = runLua(`
            publish('{"x":10}', 1)
            local slot = saved["replica/source-a/slot-a.xml"]
            local selection = saved["replica/source-a/selection-a.xml"]
            slot.payload = "!!!!"
            slot.bytes = "3"
            slot.crc = "1"
            selection.bytes = "3"
            selection.crc = "1"
            FarmDashboardExportMirror._publishedSlots = nil
            FarmDashboardExportMirror._storeTurns = nil
            FarmDashboardExportMirror._finalizerBudget = 4
            FarmDashboardExportMirror._clock = function() return 0 end
            local examined = 0
            local nativeValue = FarmDashboardExportMirror._recoveryAlphabetValue
            FarmDashboardExportMirror._recoveryAlphabetValue = function(ch)
                examined = examined + 1
                return nativeValue(ch)
            end
            local incoming = '{"x":30}'
            FarmDashboardExportMirror:onCommittedEnvelope({
                schema = "2", careerId = "career-a", sessionId = "session-a",
                publicationSequence = "2", exportGeneration = "2", simulationTimeMs = "10",
                encoding = "base64", bytes = tostring(#incoming), crc = ExportEnvelopePublisher.checksum(incoming),
                payload = ExportEnvelopePublisher.encodeBase64(incoming), sourceSlot = "savegame3", sessionToken = "token-a",
            })
            local peak = 0
            local reported = 0
            for _ = 1, 8 do
                local before = examined
                FarmDashboardExportMirror:update(16)
                local used = examined - before
                if used > peak then
                    peak = used
                    reported = (FarmDashboardExportMirror._finalizerMetrics or {}).bytesThisStep or 0
                end
            end
            return "peak=" .. tostring(peak) .. "|reported=" .. tostring(reported)
        `);
        expect(Number(alphabet.match(/peak=(\d+)/)[1])).toBeLessThanOrEqual(4);
        expect(alphabet).toContain("reported=4");
    });
});
