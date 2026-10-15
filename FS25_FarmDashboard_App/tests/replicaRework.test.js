"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");
const { ingestWatchedSlot, parseReplicaContext, createFreshnessTracker } = require("../exportIngress");
const { writeStrictPair } = require("../replicaPairContract.cjs");

const modSrc = path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src");
const repro = require("../../Pipeline/runs/FARMHUB-20260924-REPLICA-INTEGRATION-REWORK-002-REPRODUCTIONS.json");

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
        for (const file of ["ExportEnvelopePublisher.lua", "FarmDashboardExportFinalizer.lua", "FarmDashboardExportEvent.lua", "FarmDashboardExportMirror.lua"]) {
            parts.push(fs.readFileSync(path.join(modSrc, file), "utf8"));
        }
        parts.push(repro.host);
        parts.push("function fileExists(p) return files[p] ~= nil end");
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

function luaCase(id) {
    const found = repro.cases.find((entry) => entry.id === id);
    if (!found) throw new Error(`missing reproduction ${id}`);
    return runLua(found.chunk);
}

describe("replica rework regressions", () => {
    test("M01 unregistered traffic writes nothing", () => {
        expect(luaCase("M01-unregistered-production-connection")).toBe("unbound-source|stored=false");
    });

    test("M02 fresh profile creates the replicas parent before the source child", () => {
        const result = luaCase("M02-nonrecursive-fresh-store");
        expect(result).toContain("published");
        expect(result).toContain("replicasRoot=true");
    });

    test("M03 a failed selected overwrite keeps the first export", () => {
        const result = luaCase("M03-failed-selected-overwrite-loses-last-good");
        expect(result).toContain("lastGoodRetained=true");
        expect(result).not.toContain("<truncated");
    });

    test("M04 a later context failure cannot pair sequence 2 with savegame3", () => {
        const result = luaCase("M04-context-failure-pairs-new-envelope-old-origin");
        const lines = result.split("\n");
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-m04-"));
        fs.writeFileSync(path.join(dir, "selected.xml"), lines[1]);
        fs.writeFileSync(path.join(dir, "replicaContext.xml"), lines[2]);
        const ingested = ingestWatchedSlot(dir, { sourceId: "source-a", configuredSlot: "savegame3" });
        expect(ingested && ingested.identity && ingested.identity.publicationSequence).not.toBe(2);
        expect(String(lines[2])).toContain('sourceSlot="savegame3"');
        expect(String(lines[1])).not.toContain('publicationSequence="2"');
    });

    test("M05 chunks from two connections do not publish either source", () => {
        const result = luaCase("M05-mixed-connection-transfer-is-published");
        expect(result).toContain("sourceA=false");
        expect(result).toContain("sourceB=false");
    });

    test("M06 expired incomplete transfers free a later publish", () => {
        const result = luaCase("M06-two-incomplete-transfers-never-expire");
        expect(result).toContain("thirdStored=true");
        expect(result).not.toBe("buffers=2|thirdStored=false");
    });

    test("M07 a throwing native release is not published", () => {
        expect(luaCase("M07-native-release-failure-is-claimed-published")).not.toBe("published");
    });

    test("M08 a fresh join replays the committed record", () => {
        const result = luaCase("M08-fresh-join-does-not-replay-owned-commit");
        expect(result).toContain("joinedTracked=true");
        expect(result).toContain("cached=false");
        const sent = Number((result.match(/sent=(\d+)/) || [])[1]);
        expect(sent).toBeGreaterThan(0);
    });

    test("two sources complete the same sequence independently", () => {
        const result = runLua(`
            local connB = { epoch = 1 }
            function connB:getIsServer() return true end
            function connB:sendEvent(event)
                resetQueue()
                event:writeStream(1, self)
                readAt = 1
                local incoming = FarmDashboardExportEvent.emptyNew()
                incoming:readStream(1, self)
            end
            FarmDashboardExportMirror:registerReplicaSource(connB, "source-b")
            FarmDashboardExportMirror._clients[connB] = true
            publish('{"vehicles":[{"id":1}]}', 1, 1)
            return tostring(files["replica/source-a/selected.xml"] ~= nil) .. "|" .. tostring(files["replica/source-b/selected.xml"] ~= nil)
        `);
        expect(result).toBe("true|true");
    });

    test("M09 accepts an XML declaration and rejects a junk token", () => {
        const nodeCase = repro.nodeCases.find((entry) => entry.id === "M09");
        expect(parseReplicaContext(nodeCase.context)).toBeTruthy();
        expect(parseReplicaContext(nodeCase.withDeclaration)).toBeTruthy();
        expect(parseReplicaContext(nodeCase.withJunk)).toBeNull();
    });

    test("M10 a lower sequence stays last-known", () => {
        const nodeCase = repro.nodeCases.find((entry) => entry.id === "M10");
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-m10-"));
        const clock = { t: 1000 };
        const tracker = createFreshnessTracker({ now: () => clock.t, staleAfterMs: 5000 });
        let previous = null;
        const seen = [];
        for (const sequence of [2, 3, 1]) {
            const selected = nodeCase.selectionXml
                .replace('publicationSequence="2"', `publicationSequence="${sequence}"`)
                .replace('exportGeneration="2"', `exportGeneration="${sequence}"`);
            fs.writeFileSync(path.join(dir, "selected.xml"), selected);
            fs.writeFileSync(path.join(dir, "replicaContext.xml"), nodeCase.contextXml);
            writeStrictPair(dir, selected, {
                sourceId: "source-a",
                sourceSlot: "savegame3",
                connectionEpoch: "1",
                slot: "a",
                replicaRevision: sequence === 1 ? 3 : sequence - 1,
            });
            const ingested = ingestWatchedSlot(dir, {
                sourceId: "source-a",
                configuredSlot: "savegame3",
                tracker,
                previous,
                now: () => clock.t,
                staleAfterMs: 5000,
            });
            seen.push(ingested);
            if (sequence !== 1) previous = ingested;
            clock.t += 100;
        }
        expect(seen[0].status).toBe("replica");
        expect(seen[0].identity.publicationSequence).toBe(2);
        expect(seen[1].status).toBe("replica");
        expect(seen[1].identity.publicationSequence).toBe(3);
        expect(seen[2].status).toBe("last-known");
        expect(seen[2].reason).toBe("sequence-rollback");
        expect(seen[2].identity.publicationSequence).toBe(3);
    });
});
