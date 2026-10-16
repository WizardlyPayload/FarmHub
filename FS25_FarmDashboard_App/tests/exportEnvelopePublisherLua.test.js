/**
 * @jest-environment ./tests/helpers/outer-fengari-environment.cjs
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("./helpers/outer-fengari.cjs");
const { decodeEnvelope, encodeEnvelope, adler32 } = require("../exportEnvelope");

const source = fs.readFileSync(path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src/ExportEnvelopePublisher.lua"), "utf8");

const host = `
local files = {}
local docs = {}
local nextId = 1
local deletes = 0
local commits = 0
local lastCommit = nil
local clock = 0
local clockMode = "advance"
local saveMode = "true"
local folderMode = "void"
local deleteMode = "ok"
function createFolder()
    if folderMode == "false" then return false end
    if folderMode == "throw" then error("folder") end
end
function fileExists(path) return files[path] ~= nil end
function deleteFile(path) files[path] = nil return true end
function createXMLFile(name, path)
    if saveMode == "open-false" then return 0 end
    local id = nextId
    nextId = nextId + 1
    docs[id] = { path = path, fields = {} }
    return id
end
function setXMLString(handle, key, value)
    local doc = docs[handle]
    if doc then doc.fields[key] = value end
end
function saveXMLFile(handle)
    if saveMode == "throw" then error("save") end
    if saveMode == "false" then return false end
    if saveMode == "nil" then return nil end
    if saveMode == "zero" then return 0 end
    local doc = docs[handle]
    local copy = {}
    for k, v in pairs(doc.fields) do copy[k] = v end
    if saveMode == "truncate" then
        copy["farmDashboardExport#payload"] = "QQ=="
        copy["farmDashboardExport#bytes"] = "1"
    end
    files[doc.path] = copy
    return true
end
function loadXMLFile(name, path)
    if saveMode == "load-throw" then error("load") end
    if files[path] == nil then return 0 end
    local id = nextId
    nextId = nextId + 1
    local copy = {}
    for k, v in pairs(files[path]) do copy[k] = v end
    docs[id] = { path = path, fields = copy }
    return id
end
function getXMLString(handle, key)
    local doc = docs[handle]
    if not doc then return nil end
    return doc.fields[key]
end
function delete(handle)
    deletes = deletes + 1
    docs[handle] = nil
    if deleteMode == "throw" then error("delete") end
end
local function now()
    if clockMode == "stuck" then return 5 end
    if clockMode == "back" then
        clock = clock - 1
        return clock
    end
    clock = clock + 1
    return clock
end
local currentBinding = {
    careerId = "career-a",
    sessionId = "session-a",
    targetDir = "C:/save/slot/",
    sessionToken = "tok-1",
}
function currentContext()
    return {
        careerId = currentBinding.careerId,
        sessionId = currentBinding.sessionId,
        targetDir = currentBinding.targetDir,
        sessionToken = currentBinding.sessionToken,
    }
end
local function publisher()
    return ExportEnvelopePublisher.new({
        createFolder = createFolder,
        createXMLFile = createXMLFile,
        setXMLString = setXMLString,
        saveXMLFile = saveXMLFile,
        loadXMLFile = loadXMLFile,
        getXMLString = getXMLString,
        delete = delete,
        fileExists = fileExists,
        deleteFile = deleteFile,
        now = now,
        currentContext = currentContext,
        isAuthority = function() return authority end,
        onGameplayCommitted = function(rec)
            commits = commits + 1
            lastCommit = rec.publicationSequence .. "|" .. rec.exportGeneration .. "|" .. rec.slot
        end,
    })
end
local function ctx(token, generation, career, session)
    currentBinding.careerId = career or "career-a"
    currentBinding.sessionId = session or "session-a"
    currentBinding.targetDir = "C:/save/slot/"
    currentBinding.sessionToken = token or "tok-1"
    return {
        targetDir = "C:/save/slot/",
        levels = { "C:/save/", "C:/save/slot/" },
        careerId = currentBinding.careerId,
        sessionId = currentBinding.sessionId,
        sessionToken = currentBinding.sessionToken,
        exportGeneration = generation or 1,
        simulationTime = 368082.625,
        authority = true,
    }
end
local function seed(path, payload, career, session, sequence, generation)
    files[path] = {
        ["farmDashboardExport#schema"] = "2",
        ["farmDashboardExport#careerId"] = career or "career-a",
        ["farmDashboardExport#sessionId"] = session or "session-a",
        ["farmDashboardExport#publicationSequence"] = tostring(sequence or 1),
        ["farmDashboardExport#exportGeneration"] = tostring(generation or 1),
        ["farmDashboardExport#simulationTimeMs"] = "1",
        ["farmDashboardExport#encoding"] = "base64",
        ["farmDashboardExport#bytes"] = tostring(#payload),
        ["farmDashboardExport#crc"] = ExportEnvelopePublisher.checksum(payload),
        ["farmDashboardExport#payload"] = ExportEnvelopePublisher.encodeBase64(payload),
    }
end
local function drive(pub)
    local guard = 0
    local maxWork = 0
    local steps = 0
    while guard < 20000 do
        guard = guard + 1
        local status = pub:getStatus()
        if status.phase == "committed" or status.phase == "startup" or status.phase == "failed"
            or status.phase == "cancelled" or status.phase == "redundant" then
            return status.phase .. "|" .. tostring(status.error) .. "|" .. tostring(commits) .. "|" .. tostring(lastCommit) .. "|" .. tostring(steps) .. "|" .. tostring(maxWork)
        end
        pub:step({ bytes = 4096, timeMs = 100000 })
        steps = steps + 1
        local work = pub:getStatus().stepWork or 0
        if work > maxWork then maxWork = work end
    end
    return "timeout"
end
authority = true
`;

function run(chunk) {
    const L = lauxlib.luaL_newstate();
    try {
        lualib.luaL_openlibs(L);
        const status = lauxlib.luaL_dostring(L, to_luastring([source, host, chunk].join("\n")));
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

describe("export envelope publisher", () => {
    test("F01 Lua schema 2 is accepted by Node and the reverse", () => {
        const xml = run(`
            local pub = publisher()
            pub:begin('{"a":1}', ctx("tok-1", 1))
            drive(pub)
            local stored = files["C:/save/slot/slot-a.xml"]
            local fields = {}
            for key, value in pairs(stored) do
                fields[string.match(key, "#(.+)$")] = value
            end
            return ExportEnvelopePublisher.toXml(fields)
        `);
        const decoded = decodeEnvelope(xml, { careerId: "career-a" });
        expect(decoded.status).toBe("valid");
        expect(decoded.payload.toString("utf8")).toBe('{"a":1}');
        expect(decoded.record.simulationTimeMs).toBe("368082");
        const nodeXml = encodeEnvelope(Buffer.from("CLOCK"), {
            careerId: "career-a",
            sessionId: "session-a",
            publicationSequence: 1,
            exportGeneration: 1,
            simulationTimeMs: "368082",
        });
        const back = run(`
            local fields = ExportEnvelopePublisher.parseXml(${JSON.stringify(nodeXml)})
            local record = ExportEnvelopePublisher.decodeFields(fields)
            return record.payload .. "|" .. record.simulationTimeMs .. "|" .. record.crc
        `);
        expect(back).toBe(`CLOCK|368082|${adler32(Buffer.from("CLOCK"))}`);
    });

    test("F03 rotation, new session, foreign career, overflow and conflict", () => {
        const rotated = run(`
            local pub = publisher()
            local slots = {}
            for i = 1, 3 do
                pub:begin("N" .. i, ctx("tok-" .. i, i, "career-a", i == 1 and "session-a" or "session-b"))
                drive(pub)
                slots[i] = pub:getStatus().slot
            end
            pub:begin("N4", ctx("tok-4", 1, "career-a", "session-c"))
            local fourth = drive(pub)
            local foreign = publisher()
            foreign:begin("NEW", ctx("tok-x", 1, "career-b", "session-z"))
            local refused = drive(foreign)
            return table.concat(slots, ",") .. "|" .. fourth .. "|" .. refused
        `);
        expect(rotated.startsWith("slot-a,slot-b,slot-a|")).toBe(true);
        expect(rotated).toContain("committed|nil|4|4|1|slot-b");
        expect(rotated).toContain("failed|foreign-slots|");

        const overflow = run(`
            files["C:/save/slot/slot-a.xml"] = {
                ["farmDashboardExport#schema"] = "2",
                ["farmDashboardExport#careerId"] = "career-a",
                ["farmDashboardExport#sessionId"] = "session-a",
                ["farmDashboardExport#publicationSequence"] = "2147483647",
                ["farmDashboardExport#exportGeneration"] = "1",
                ["farmDashboardExport#simulationTimeMs"] = "1",
                ["farmDashboardExport#encoding"] = "base64",
                ["farmDashboardExport#bytes"] = "1",
                ["farmDashboardExport#crc"] = ExportEnvelopePublisher.checksum("Z"),
                ["farmDashboardExport#payload"] = ExportEnvelopePublisher.encodeBase64("Z"),
            }
            local pub = publisher()
            pub:begin("NEXT", ctx("tok-over", 2))
            return drive(pub)
        `);
        expect(overflow.startsWith("failed|overflow|")).toBe(true);
    });

    test("F04 failures keep the selected slot and release once", () => {
        const saved = run(`
            local pub = publisher()
            pub:begin("GOOD", ctx("tok-good", 1))
            drive(pub)
            local before = files["C:/save/slot/slot-a.xml"]["farmDashboardExport#payload"]
            saveMode = "false"
            pub:begin("BAD", ctx("tok-bad", 2))
            local failed = drive(pub)
            saveMode = "true"
            local after = files["C:/save/slot/slot-a.xml"]["farmDashboardExport#payload"]
            folderMode = "false"
            local setup = publisher()
            setup:begin("NO", ctx("tok-setup", 1))
            local setupStatus = drive(setup)
            return failed .. "|" .. tostring(before == after) .. "|" .. setupStatus
        `);
        expect(saved).toContain("failed|save-denied|");
        expect(saved).toContain("|true|");
        expect(saved).toContain("failed|setup-failed|");
    });

    test("F05 cancel, coalesce, and authority loss do not double commit", () => {
        const result = run(`
            local pub = publisher()
            pub:begin("ONE", ctx("tok-1", 1))
            pub:step({ bytes = 4096, timeMs = 100000 })
            local coalesced = pub:begin("TWO", ctx("tok-1", 2))
            local waiting = pub:getStatus().waiting
            local cancelled = pub:cancel("tok-1")
            pub:begin("THREE", ctx("tok-3", 3))
            local done = drive(pub)
            authority = false
            local pub2 = publisher()
            pub2:begin("FOUR", ctx("tok-4", 4))
            local lost = drive(pub2)
            return coalesced .. "|" .. tostring(waiting) .. "|" .. cancelled .. "|" .. done .. "|" .. lost .. "|" .. tostring(commits)
        `);
        expect(result.startsWith("coalesced|true|cancelled|")).toBe(true);
        expect(result).toContain("committed|nil|1|1|3|slot-a");
        expect(result).toContain("failed|authority-lost|");
    });

    test("F06 one step cannot finish the large payload", () => {
        const result = run(`
            local payload = string.rep("Q", (2 * 1024 * 1024) + 64)
            local pub = publisher()
            local begun = pub:begin(payload, ctx("tok-large", 2))
            local status = pub:getStatus()
            local before = status.phase
            while pub:getStatus().phase ~= "encode" do pub:step({ bytes = 4096, timeMs = 100000 }) end
            pub:step({ bytes = 5000000, timeMs = 100000 })
            local mid = pub:getStatus()
            clockMode = "stuck"
            pub:step({ bytes = 5000000, timeMs = 100000 })
            local stuck = pub:getStatus().stepWork
            clockMode = "advance"
            local done = drive(pub)
            return begun .. "|" .. before .. "|" .. mid.phase .. "|" .. tostring(mid.stepWork) .. "|" .. tostring(stuck) .. "|" .. done
        `);
        expect(result.startsWith("begun|directories|encode|")).toBe(true);
        const stepWork = Number(result.split("|")[3]);
        const stuck = Number(result.split("|")[4]);
        expect(stepWork).toBeLessThanOrEqual(4096);
        expect(stepWork).toBeGreaterThan(0);
        expect(stuck).toBe(4095);
        expect(result).toContain("committed|nil|1|1|2|slot-a");
    }, 180000);

    test("generation 0 stores without a gameplay callback", () => {
        const result = run(`
            local pub = publisher()
            pub:begin("BOOT", ctx("tok-0", 0))
            return drive(pub)
        `);
        expect(result.startsWith("startup|nil|0|nil|")).toBe(true);
    });

    test("stale slot mutation cannot overwrite foreign data", () => {
        const result = run(`
            local pub = publisher()
            pub:begin("ONE", ctx("tok-1", 1))
            while pub:getStatus().phase ~= "encode" do pub:step({ bytes = 4096, timeMs = 100000 }) end
            files["C:/save/slot/slot-a.xml"] = {
                ["farmDashboardExport#schema"] = "2",
                ["farmDashboardExport#careerId"] = "career-b",
                ["farmDashboardExport#sessionId"] = "session-z",
                ["farmDashboardExport#publicationSequence"] = "1",
                ["farmDashboardExport#exportGeneration"] = "1",
                ["farmDashboardExport#simulationTimeMs"] = "1",
                ["farmDashboardExport#encoding"] = "base64",
                ["farmDashboardExport#bytes"] = "1",
                ["farmDashboardExport#crc"] = ExportEnvelopePublisher.checksum("Z"),
                ["farmDashboardExport#payload"] = ExportEnvelopePublisher.encodeBase64("Z"),
            }
            return drive(pub) .. "|" .. files["C:/save/slot/slot-a.xml"]["farmDashboardExport#careerId"]
        `);
        expect(result.startsWith("failed|stale-slots|")).toBe(true);
        expect(result.endsWith("|career-b")).toBe(true);
    });

    test("L01 authority lost at commit does not callback", () => {
        const result = run(`
            local pub = publisher()
            pub:begin("ONE", ctx("tok-l01", 1))
            for i = 1, 40 do
                if pub:getStatus().phase == "commit" then break end
                pub:step({ bytes = 4096, timeMs = 100000 })
            end
            authority = false
            pub:step({ bytes = 4096, timeMs = 100000 })
            return tostring(commits) .. "|" .. pub:getStatus().phase
        `);
        expect(result).toBe("0|failed");
    });

    test("L02 a 3 byte inspect does not decode the whole slot", () => {
        const result = run(`
            local payload = string.rep("Q", 192)
            files["C:/save/slot/slot-a.xml"] = {
                ["farmDashboardExport#schema"] = "2",
                ["farmDashboardExport#careerId"] = "career-a",
                ["farmDashboardExport#sessionId"] = "session-a",
                ["farmDashboardExport#publicationSequence"] = "1",
                ["farmDashboardExport#exportGeneration"] = "1",
                ["farmDashboardExport#simulationTimeMs"] = "1",
                ["farmDashboardExport#encoding"] = "base64",
                ["farmDashboardExport#bytes"] = tostring(#payload),
                ["farmDashboardExport#crc"] = ExportEnvelopePublisher.checksum(payload),
                ["farmDashboardExport#payload"] = ExportEnvelopePublisher.encodeBase64(payload),
            }
            local largest = 0
            local original = ExportEnvelopePublisher.decodeBase64
            ExportEnvelopePublisher.decodeBase64 = function(data)
                if #data > largest then largest = #data end
                return original(data)
            end
            local pub = publisher()
            pub:begin("NEW", ctx("tok-l02", 2))
            for i = 1, 10 do
                if pub:getStatus().phase == "inspect-a" then break end
                pub:step({ bytes = 4096, timeMs = 100000 })
            end
            pub:step({ bytes = 3, timeMs = 100000 })
            return tostring(largest) .. "|" .. tostring(pub:getStatus().stepWork)
        `);
        const [largest, work] = result.split("|").map(Number);
        expect(largest).toBeLessThanOrEqual(4);
        expect(work).toBeLessThanOrEqual(3);
        expect(work).toBeGreaterThan(0);
    });

    test("L03 a stuck clock still uses the byte cap", () => {
        const result = run(`
            clockMode = "stuck"
            local pub = publisher()
            pub:begin(string.rep("Q", 20000), ctx("tok-l03", 1))
            for i = 1, 20 do
                if pub:getStatus().phase == "encode" then break end
                pub:step({ bytes = 4096, timeMs = 100000 })
            end
            pub:step({ bytes = 4096, timeMs = 100000 })
            return tostring(pub:getStatus().stepWork)
        `);
        expect(result).toBe("4095");
    });

    test("L04 identical slots still publish the next sequence", () => {
        const result = run(`
            local function seed(path)
                local payload = "OLD"
                files[path] = {
                    ["farmDashboardExport#schema"] = "2",
                    ["farmDashboardExport#careerId"] = "career-a",
                    ["farmDashboardExport#sessionId"] = "session-a",
                    ["farmDashboardExport#publicationSequence"] = "1",
                    ["farmDashboardExport#exportGeneration"] = "1",
                    ["farmDashboardExport#simulationTimeMs"] = "1",
                    ["farmDashboardExport#encoding"] = "base64",
                    ["farmDashboardExport#bytes"] = "3",
                    ["farmDashboardExport#crc"] = ExportEnvelopePublisher.checksum(payload),
                    ["farmDashboardExport#payload"] = ExportEnvelopePublisher.encodeBase64(payload),
                }
            end
            seed("C:/save/slot/slot-a.xml")
            seed("C:/save/slot/slot-b.xml")
            local pub = publisher()
            pub:begin("NEW", ctx("tok-l04", 2))
            return drive(pub) .. "|" .. files["C:/save/slot/slot-a.xml"]["farmDashboardExport#publicationSequence"]
        `);
        expect(result.startsWith("committed|")).toBe(true);
        expect(result.endsWith("|1")).toBe(true);
    });

    test("L05 a different career cancels the old job", () => {
        const result = run(`
            local pub = publisher()
            pub:begin("ONE", ctx("tok-l05", 1))
            pub:step({ bytes = 4096, timeMs = 100000 })
            local status = pub:begin("TWO", ctx("tok-l05b", 1, "career-b", "session-b"))
            drive(pub)
            return status .. "|" .. tostring(commits)
        `);
        expect(result).toBe("context-change|0");
    });

    test("L06 a native XML declaration is accepted", () => {
        const xml = `<?xml version="1.0" encoding="utf-8"?>\n${encodeEnvelope(Buffer.from("HI"), {
            careerId: "career-a",
            sessionId: "session-a",
            publicationSequence: 1,
            exportGeneration: 1,
            simulationTimeMs: "1",
        })}`;
        const result = run(`
            local fields, err = ExportEnvelopePublisher.parseXml(${JSON.stringify(xml)})
            if fields == nil then return "rejected|" .. tostring(err) end
            local record = ExportEnvelopePublisher.decodeFields(fields)
            if record == nil then return "rejected" end
            return "accepted"
        `);
        expect(result).toBe("accepted");
    });

    test("L07 underscore identifiers are accepted", () => {
        const result = run(`
            local pub = publisher()
            return pub:begin("ONE", ctx("tok-l07", 1, "career_a", "session_a"))
        `);
        expect(result).toBe("begun");
    });

    test("L08 empty gameplay payload does not commit", () => {
        const result = run(`
            local pub = publisher()
            local status = pub:begin("", ctx("tok-l08", 1))
            return status .. "|" .. tostring(commits)
        `);
        expect(result).toBe("empty-payload|0");
    });

    test("L09 a foreign slot written before save is kept", () => {
        const result = run(`
            local pub = publisher()
            pub:begin("ONE", ctx("tok-l09", 1))
            for i = 1, 40 do
                if pub:getStatus().phase == "write" then break end
                pub:step({ bytes = 4096, timeMs = 100000 })
            end
            files["C:/save/slot/slot-a.xml"] = {
                ["farmDashboardExport#schema"] = "2",
                ["farmDashboardExport#careerId"] = "career-b",
                ["farmDashboardExport#sessionId"] = "session-b",
                ["farmDashboardExport#publicationSequence"] = "1",
                ["farmDashboardExport#exportGeneration"] = "1",
                ["farmDashboardExport#simulationTimeMs"] = "1",
                ["farmDashboardExport#encoding"] = "base64",
                ["farmDashboardExport#bytes"] = "1",
                ["farmDashboardExport#crc"] = ExportEnvelopePublisher.checksum("Z"),
                ["farmDashboardExport#payload"] = ExportEnvelopePublisher.encodeBase64("Z"),
            }
            pub:step({ bytes = 4096, timeMs = 100000 })
            return files["C:/save/slot/slot-a.xml"]["farmDashboardExport#careerId"]
        `);
        expect(result).toBe("career-b");
    });

    test("L10 a foreign replacement after save is not deleted", () => {
        const result = run(`
            local pub = publisher()
            pub:begin("ONE", ctx("tok-l10", 1))
            for i = 1, 40 do
                if pub:getStatus().phase == "open-reader" then break end
                pub:step({ bytes = 4096, timeMs = 100000 })
            end
            files["C:/save/slot/slot-a.xml"] = {
                ["farmDashboardExport#schema"] = "2",
                ["farmDashboardExport#careerId"] = "career-b",
                ["farmDashboardExport#sessionId"] = "session-b",
                ["farmDashboardExport#publicationSequence"] = "1",
                ["farmDashboardExport#exportGeneration"] = "1",
                ["farmDashboardExport#simulationTimeMs"] = "1",
                ["farmDashboardExport#encoding"] = "base64",
                ["farmDashboardExport#bytes"] = "1",
                ["farmDashboardExport#crc"] = ExportEnvelopePublisher.checksum("Z"),
                ["farmDashboardExport#payload"] = ExportEnvelopePublisher.encodeBase64("Z"),
            }
            drive(pub)
            return files["C:/save/slot/slot-a.xml"]["farmDashboardExport#careerId"]
        `);
        expect(result).toBe("career-b");
    });

    test("a callback that steps again is busy", () => {
        const result = run(`
            local nested = "none"
            local pub
            pub = ExportEnvelopePublisher.new({
                createFolder = createFolder,
                createXMLFile = createXMLFile,
                setXMLString = setXMLString,
                saveXMLFile = saveXMLFile,
                loadXMLFile = loadXMLFile,
                getXMLString = getXMLString,
                delete = delete,
                fileExists = fileExists,
                deleteFile = deleteFile,
                now = now,
                currentContext = currentContext,
                isAuthority = function() return true end,
                onGameplayCommitted = function()
                    nested = pub:step({ bytes = 4096, timeMs = 100000 })
                end,
            })
            pub:begin("ONE", ctx("tok-busy", 1))
            drive(pub)
            return tostring(nested)
        `);
        expect(result).toBe("busy");
    });

    test("schema 2 failure matrix keeps last-good bytes", () => {
        const result = run(`
            local function once(kind)
                commits = 0
                files = {}
                docs = {}
                saveMode = "true"
                folderMode = "void"
                deleteMode = "ok"
                authority = true
                local pub = publisher()
                pub:begin("GOOD", ctx("tok-good", 1))
                drive(pub)
                local before = files["C:/save/slot/slot-a.xml"]["farmDashboardExport#payload"]
                if kind == "save-false" then saveMode = "false" end
                if kind == "save-nil" then saveMode = "nil" end
                if kind == "save-zero" then saveMode = "zero" end
                if kind == "save-throw" then saveMode = "throw" end
                if kind == "open-false" then saveMode = "open-false" end
                if kind == "folder-false" then folderMode = "false" end
                if kind == "folder-throw" then folderMode = "throw" end
                if kind == "delete-throw" then deleteMode = "throw" end
                pub:begin("BAD", ctx("tok-bad", 2))
                local status = drive(pub)
                local after = files["C:/save/slot/slot-a.xml"]["farmDashboardExport#payload"]
                return kind .. "=" .. status .. "|kept=" .. tostring(before == after) .. "|commits=" .. tostring(commits)
            end
            local kinds = { "save-false", "save-nil", "save-zero", "save-throw", "open-false", "folder-false", "folder-throw", "delete-throw" }
            local rows = {}
            for i = 1, #kinds do rows[#rows + 1] = once(kinds[i]) end
            return table.concat(rows, ";")
        `);
        for (const row of result.split(";")) {
            expect(row).toContain("failed|");
            expect(row).toContain("|commits=1");
            if (row.startsWith("delete-throw=")) {
                expect(row).toContain("release-failed");
                expect(row).toContain("|kept=true|");
            } else {
                expect(row).toContain("|kept=true|");
            }
        }
    });

    test("X01 Lua tick text has no trailing fraction", () => {
        const result = run(`
            local pub = publisher()
            local made = ctx("tok-x01", 1)
            made.simulationTime = 2147483648
            pub:begin("ONE", made)
            drive(pub)
            return files["C:/save/slot/slot-a.xml"]["farmDashboardExport#simulationTimeMs"]
        `);
        expect(result).toBe("2147483648");
        const ticks = run(`
            local function tick(value)
                local pub = publisher()
                local made = ctx("tok-tick", 1)
                made.simulationTime = value
                return pub:begin("ONE", made)
            end
            return tick(2147483647) .. "|" .. tick(2147483648) .. "|" .. tick(999999999999999) .. "|" .. tick(368082.625) .. "|" .. tick(nil) .. "|" .. tick(-1) .. "|" .. tick(1000000000000000)
        `);
        expect(ticks).toBe("begun|begun|begun|begun|begun|bad-clock|bad-clock");
    });

    test("R21 and R22 unknown or unreadable presence does not overwrite", () => {
        const unknown = run(`
            local pub = publisher()
            pub:begin("NEW", ctx())
            for i = 1, 100 do
                if pub:getStatus().phase == "write" then break end
                pub:step({ bytes = 4096, timeMs = 100000 })
            end
            seed("C:/save/slot/slot-a.xml", "FOREIGN", "career-b", "session-z")
            pub.deps.fileExists = function(path) if path == "C:/save/slot/slot-a.xml" then return nil end return fileExists(path) end
            pub:step({ bytes = 4096, timeMs = 100000 })
            return files["C:/save/slot/slot-a.xml"]["farmDashboardExport#careerId"]
        `);
        const unreadable = run(`
            local pub = publisher()
            pub:begin("NEW", ctx())
            for i = 1, 100 do
                if pub:getStatus().phase == "write" then break end
                pub:step({ bytes = 4096, timeMs = 100000 })
            end
            seed("C:/save/slot/slot-a.xml", "FOREIGN", "career-b", "session-z")
            pub.deps.loadXMLFile = function(name, path) if path == "C:/save/slot/slot-a.xml" then return 0 end return loadXMLFile(name, path) end
            pub:step({ bytes = 4096, timeMs = 100000 })
            return files["C:/save/slot/slot-a.xml"]["farmDashboardExport#careerId"]
        `);
        expect(unknown).toBe("career-b");
        expect(unreadable).toBe("career-b");
    });

    test("R24 R25 R28 R29 R30 and R32 validation and recovery", () => {
        const clock = run(`
            seed("C:/save/slot/slot-a.xml", "OLD")
            files["C:/save/slot/slot-a.xml"]["farmDashboardExport#simulationTimeMs"] = "not-a-clock"
            local pub = publisher()
            pub:begin("NEW", ctx())
            for i = 1, 100 do
                if pub:getStatus().phase == "select" then break end
                pub:step({ bytes = 4096, timeMs = 100000 })
            end
            return pub.job.stateA.presence
        `);
        const recover = run(`
            seed("C:/save/slot/slot-a.xml", "BAD")
            files["C:/save/slot/slot-a.xml"]["farmDashboardExport#payload"] = "%%%="
            seed("C:/save/slot/slot-b.xml", "GOOD", "career-a", "session-a", 2, 1)
            local pub = publisher()
            pub:begin("NEW", ctx("tok-new", 2))
            drive(pub)
            return pub:getStatus().phase
        `);
        const encoding = run(`
            seed("C:/save/slot/slot-a.xml", "GOOD", "career-a", "session-a", 2, 1)
            seed("C:/save/slot/slot-b.xml", "OLDER", "career-a", "session-a", 1, 1)
            local pub = publisher()
            pub:begin("NEW", ctx("tok-new", 2))
            for i = 1, 100 do
                if pub:getStatus().phase == "write" then break end
                pub:step({ bytes = 4096, timeMs = 100000 })
            end
            files["C:/save/slot/slot-a.xml"]["farmDashboardExport#encoding"] = "hex"
            pub:step({ bytes = 4096, timeMs = 100000 })
            return tostring(pub:getStatus().error)
        `);
        const save = run(`
            local pub = publisher()
            pub.deps.saveXMLFile = function(handle)
                seed("C:/save/slot/slot-a.xml", "FOREIGN", "career-b", "session-z")
                return false
            end
            pub:begin("NEW", ctx())
            drive(pub)
            local rec = files["C:/save/slot/slot-a.xml"]
            return rec and rec["farmDashboardExport#careerId"] or "deleted"
        `);
        const padding = run(`
            seed("C:/save/slot/slot-a.xml", "AA")
            files["C:/save/slot/slot-a.xml"]["farmDashboardExport#payload"] = "QQ==QQ=="
            local pub = publisher()
            pub:begin("NEW", ctx())
            for i = 1, 100 do
                if pub:getStatus().phase == "select" then break end
                pub:step({ bytes = 4096, timeMs = 100000 })
            end
            return pub.job.stateA.presence
        `);
        const adjacent = run(`
            local fields = ExportEnvelopePublisher.parseXml("<farmDashboardExport schema=\\"2\\"careerId=\\"career-a\\" sessionId=\\"session-a\\" publicationSequence=\\"1\\" exportGeneration=\\"1\\" simulationTimeMs=\\"368082\\" encoding=\\"base64\\" bytes=\\"2\\" crc=\\"24445177\\" payload=\\"e30=\\"/>")
            if fields == nil then return "rejected" end
            local rec = ExportEnvelopePublisher.decodeFields(fields)
            return rec and "accepted" or "rejected"
        `);
        expect(clock).toBe("loaded-invalid");
        expect(recover).toBe("committed");
        expect(encoding).toBe("stale-slots");
        expect(save).toBe("career-b");
        expect(padding).toBe("loaded-invalid");
        expect(adjacent).toBe("rejected");
    });

    test("R26 and R27 session binding fails closed", () => {
        const mismatch = run(`
            local pub = publisher()
            pub.deps.currentContext = function() return { careerId = "career-a", sessionId = "session-a", targetDir = "C:/save/slot/", sessionToken = "different-token" } end
            pub:begin("NEW", ctx("original-token", 1))
            drive(pub)
            return tostring(commits)
        `);
        const missing = run(`
            local pub = publisher()
            pub.deps.currentContext = nil
            pub:begin("NEW", ctx())
            drive(pub)
            return tostring(commits)
        `);
        expect(mismatch).toBe("0");
        expect(missing).toBe("0");
    });

    test("R31 readback keeps a few blocks", () => {
        const result = run(`
            local pub = publisher()
            pub:begin(string.rep("Q", 8192), ctx())
            for i = 1, 200 do
                if pub:getStatus().phase == "match" then break end
                pub:step({ bytes = 4096, timeMs = 100000 })
            end
            return pub:getStatus().phase .. "|" .. tostring(#pub.job.decodeParts)
        `);
        const [phase, blocks] = result.split("|");
        expect(phase).toBe("match");
        expect(Number(blocks)).toBeLessThanOrEqual(3);
        expect(Number(blocks)).toBeGreaterThan(0);
    });

    test("a short budget does not consume a quantum", () => {
        const result = run(`
            local pub = publisher()
            pub:begin(string.rep("Q", 100), ctx())
            for i = 1, 20 do
                if pub:getStatus().phase == "encode" then break end
                pub:step({ bytes = 4096, timeMs = 100000 })
            end
            local status = pub:step({ bytes = 0, timeMs = 100000 })
            return status .. "|" .. pub:getStatus().phase .. "|" .. tostring(pub:getStatus().stepWork)
        `);
        expect(result).toBe("insufficient-budget|encode|0");
    });

    test("R33 uses this step's budget on an open inspection cursor", () => {
        const narrowed = run(`
            seed("C:/save/slot/slot-a.xml", string.rep("Q", 8192))
            local pub = publisher()
            pub:begin("NEW", ctx())
            for i = 1, 30 do
                if pub:getStatus().phase == "inspect-a" then break end
                pub:step({ bytes = 4096, timeMs = 100000 })
            end
            pub:step({ bytes = 4096, timeMs = 100000 })
            local before = pub:getStatus().phase
            local offset = pub.job.cursorA.offset
            pub:step({ bytes = 3, timeMs = 4 })
            local status = pub:getStatus()
            return before .. "|" .. status.phase .. "|" .. tostring(status.stepWork) .. "|" .. tostring(offset < pub.job.cursorA.offset)
        `);
        const held = run(`
            seed("C:/save/slot/slot-a.xml", string.rep("Q", 8192))
            local pub = publisher()
            pub:begin("NEW", ctx())
            for i = 1, 30 do
                if pub:getStatus().phase == "inspect-a" then break end
                pub:step({ bytes = 4096, timeMs = 100000 })
            end
            pub:step({ bytes = 4096, timeMs = 100000 })
            local offset = pub.job.cursorA.offset
            local phase = pub:getStatus().phase
            local loads = pub:getStatus().metrics.rawLoads
            local denied = pub:step({ bytes = 0, timeMs = 4 })
            local status = pub:getStatus()
            return denied .. "|" .. phase .. "|" .. status.phase .. "|" .. tostring(offset) .. "|" .. tostring(pub.job.cursorA.offset) .. "|" .. tostring(loads) .. "|" .. tostring(status.metrics.rawLoads)
        `);
        const grown = run(`
            local pub = publisher()
            pub:begin(string.rep("Q", 8192), ctx())
            for i = 1, 40 do
                if pub:getStatus().phase == "encode" then break end
                pub:step({ bytes = 4096, timeMs = 100000 })
            end
            pub:step({ bytes = 3, timeMs = 100000 })
            local small = pub:getStatus().stepWork
            pub:step({ bytes = 4096, timeMs = 1 })
            local timed = pub:getStatus().stepWork
            pub:step({ bytes = 4096, timeMs = 100000 })
            local wide = pub:getStatus().stepWork
            return tostring(small) .. "|" .. tostring(timed) .. "|" .. tostring(wide)
        `);
        const [before, after, work, moved] = narrowed.split("|");
        expect(before).toBe("inspect-a");
        expect(after).toBe("inspect-a");
        expect(Number(work)).toBeGreaterThan(0);
        expect(Number(work)).toBeLessThanOrEqual(3);
        expect(moved).toBe("true");
        const [denied, phaseBefore, phaseAfter, offsetBefore, offsetAfter, loadsBefore, loadsAfter] = held.split("|");
        expect(denied).toBe("insufficient-budget");
        expect(phaseAfter).toBe(phaseBefore);
        expect(offsetAfter).toBe(offsetBefore);
        expect(loadsAfter).toBe(loadsBefore);
        const [small, timed, wide] = grown.split("|").map(Number);
        expect(small).toBeGreaterThan(0);
        expect(small).toBeLessThanOrEqual(3);
        expect(timed).toBeGreaterThan(0);
        expect(timed).toBeLessThanOrEqual(3);
        expect(wide).toBeGreaterThan(timed);
    });

    test("R34 R35 and R36 measure the operation that spent the time", () => {
        const raw = run(`
            seed("C:/save/slot/slot-a.xml", "GOOD")
            local pub = publisher()
            local realLoad = loadXMLFile
            pub.deps.loadXMLFile = function(name, path)
                clock = clock + 1000
                return realLoad(name, path)
            end
            pub:begin("NEW", ctx())
            for i = 1, 30 do
                if pub:getStatus().phase == "inspect-a" then break end
                pub:step({ bytes = 4096, timeMs = 100000 })
            end
            pub:step({ bytes = 4096, timeMs = 100000 })
            return tostring(pub:getStatus().metrics.rawLoadClock)
        `);
        const native = run(`
            local pub = publisher()
            local realCreate = createXMLFile
            pub.deps.createXMLFile = function(name, path)
                clock = clock + 1000
                return realCreate(name, path)
            end
            pub:begin(string.rep("Q", 64), ctx())
            drive(pub)
            return tostring(pub:getStatus().metrics.nativeWriteClock)
        `);
        const luaTime = run(`
            local pub = publisher()
            pub:begin(string.rep("Q", 64), ctx())
            drive(pub)
            return tostring(pub:getStatus().metrics.luaClock)
        `);
        const thrown = run(`
            seed("C:/save/slot/slot-a.xml", "GOOD")
            local pub = publisher()
            pub.deps.loadXMLFile = function()
                clock = clock + 1000
                error("load")
            end
            pub:begin("NEW", ctx())
            for i = 1, 30 do
                if pub:getStatus().phase == "inspect-a" then break end
                pub:step({ bytes = 4096, timeMs = 100000 })
            end
            pub:step({ bytes = 4096, timeMs = 100000 })
            return tostring(pub:getStatus().metrics.rawLoadClock)
        `);
        expect(Number(raw)).toBeGreaterThanOrEqual(1000);
        expect(Number(native)).toBeGreaterThanOrEqual(1000);
        expect(Number(luaTime)).toBeGreaterThan(0);
        expect(Number(thrown)).toBeGreaterThanOrEqual(1000);
    });

    test("R37 a bad clock uses the byte cap and does not stall", () => {
        const nan = run(`
            local pub = publisher()
            pub:begin(string.rep("Q", 64), ctx())
            for i = 1, 80 do
                if pub:getStatus().phase == "decode" then break end
                pub:step({ bytes = 4096, timeMs = 100000 })
            end
            local started = pub:getStatus().phase
            pub.deps.now = function() return 0/0 end
            local lastWork = 0
            local lastPhase = started
            local lastError = nil
            for i = 1, 3 do
                pub:step({ bytes = 4096, timeMs = 4 })
                local status = pub:getStatus()
                lastPhase = status.phase
                lastWork = status.stepWork or 0
                lastError = status.error
            end
            local status = pub:getStatus()
            return started .. "|" .. lastPhase .. "|" .. tostring(lastWork) .. "|" .. tostring(lastError) .. "|" .. tostring(status.metrics.timingUnavailable)
        `);
        const matrix = run(`
            local function arm(kind)
                if kind == "nil" then return function() return nil end end
                if kind == "throw" then return function() error("clock") end end
                if kind == "nan" then return function() return 0/0 end end
                if kind == "inf" then return function() return math.huge end end
                if kind == "ninf" then return function() return -math.huge end end
                if kind == "back" then
                    clockMode = "back"
                    return now
                end
                if kind == "stuck" then
                    clockMode = "stuck"
                    return now
                end
            end
            local function reach(phase, payload)
                clockMode = "advance"
                local pub = publisher()
                if phase == "inspect-a" then seed("C:/save/slot/slot-a.xml", string.rep("Q", 8192)) end
                pub:begin(payload or "NEW", ctx())
                for i = 1, 40 do
                    if pub:getStatus().phase == phase then break end
                    pub:step({ bytes = 4096, timeMs = 100000 })
                end
                return pub
            end
            local function probe(phase, kind)
                local pub = reach(phase, phase == "encode" and string.rep("Q", 8192) or "NEW")
                local before = pub:getStatus().phase
                pub.deps.now = arm(kind)
                pub:step({ bytes = 4096, timeMs = 4 })
                local status = pub:getStatus()
                local moved = (status.stepWork or 0) > 0 or status.phase ~= before or status.error ~= nil
                local stalled = status.phase == before and (status.stepWork or 0) == 0 and status.error == nil
                return (moved and not stalled) and "1" or "0"
            end
            local out = {}
            local phases = { "encode", "inspect-a", "decode" }
            local kinds = { "nil", "throw", "nan", "inf", "ninf", "back", "stuck" }
            for p = 1, #phases do
                for k = 1, #kinds do
                    out[#out + 1] = phases[p] .. ":" .. kinds[k] .. ":" .. probe(phases[p], kinds[k])
                end
            end
            return table.concat(out, ",")
        `);
        const [started, phase, work, error, unavailable] = nan.split("|");
        expect(started).toBe("decode");
        const stalled = phase === "decode" && work === "0" && error === "nil";
        expect(stalled).toBe(false);
        expect(unavailable).toBe("true");
        expect(matrix.split(",").every((part) => part.endsWith(":1"))).toBe(true);
    });
});
