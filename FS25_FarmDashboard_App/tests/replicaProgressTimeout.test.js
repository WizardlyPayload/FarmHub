"use strict";

const fs = require("fs");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");
const repro = require("./fixtures/reproductions/replica-002.json");

function runLua(scenario) {
    const state = lauxlib.luaL_newstate();
    try {
        lualib.luaL_openlibs(state);
        const src = path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src");
        const files = [
            "ExportEnvelopePublisher.lua",
            "FarmDashboardExportFinalizer.lua",
            "FarmDashboardExportEvent.lua",
            "FarmDashboardExportMirror.lua",
        ];
        const bootstrap = `
Logging = { info = function() end, warning = function() end }
FarmDashLog = { devWarn = function() end, dev = function() end, error = function() end, isVerbose = function() return false end }
Event = {}
function Event.new(mt) return setmetatable({}, mt) end
function Class(value) return { __index = value } end
function InitEventClass() end
function createFolder() end
`;
        const luaSource = [
            bootstrap,
            ...files.map((file) => fs.readFileSync(path.join(src, file), "utf8")),
            repro.host,
            "function fileExists(p) return files[p] ~= nil end",
            scenario,
        ].join("\n");
        const status = lauxlib.luaL_dostring(state, to_luastring(luaSource));
        if (status !== lua.LUA_OK) {
            const error = lua.lua_tostring(state, -1);
            throw new Error(error ? to_jsstring(error) : `Lua status ${status}`);
        }
        const result = lua.lua_tostring(state, -1);
        return result ? to_jsstring(result) : "";
    } finally {
        lua.lua_close(state);
    }
}

const setup = `
local tick = 0
FarmDashboardExportMirror._clock = function() return tick end
FarmDashboardExportMirror.CHUNK_BYTES = 64
FarmDashboardExportMirror.CHUNKS_PER_FRAME = 1
local body = '{"x":"' .. string.rep("m", 256) .. '"}'
local record = {
    schema = "2", careerId = "career-a", sessionId = "session-a",
    publicationSequence = "1", exportGeneration = "1", simulationTimeMs = "10",
    encoding = "base64", bytes = tostring(#body), crc = ExportEnvelopePublisher.checksum(body),
    payload = ExportEnvelopePublisher.encodeBase64(body), sourceSlot = "savegame3", sessionToken = "token-a",
}
FarmDashboardExportMirror:onCommittedEnvelope(record)
`;

describe("replica transfer progress timeout", () => {
    test("continuous slow chunks can finish after 60 seconds", () => {
        const result = runLua(setup + `
            for _ = 1, 30 do
                tick = tick + 15000
                FarmDashboardExportMirror:update(16)
                if saved["replica/source-a/selection-a.xml"] ~= nil then break end
            end
            local selection = saved["replica/source-a/selection-a.xml"]
            return tostring(selection and selection.publicationSequence) .. "|" .. tostring(FarmDashboardExportMirror._lastReplicaOutcome)
        `);
        expect(result).toBe("1|published");
    });

    test("an inactive partial transfer still expires", () => {
        const result = runLua(setup + `
            FarmDashboardExportMirror:update(16)
            tick = FarmDashboardExportFinalizer.RECEIVE_TIMEOUT_MS + 1
            FarmDashboardExportFinalizer.sweep(FarmDashboardExportMirror)
            local count = 0
            for _ in pairs(FarmDashboardExportMirror._receiveBufs) do count = count + 1 end
            return tostring(count) .. "|" .. tostring(FarmDashboardExportMirror._reservedBytes) .. "|" .. tostring(FarmDashboardExportMirror._lastReplicaOutcome)
        `);
        expect(result).toBe("0|0|timeout");
    });

    test("a continuously fed transfer still has a hard lifetime cap", () => {
        const result = runLua(setup.replace('string.rep("m", 256)', 'string.rep("m", 8192)') + `
            for _ = 1, 21 do
                tick = tick + 30000
                FarmDashboardExportMirror:update(16)
            end
            local count = 0
            for _ in pairs(FarmDashboardExportMirror._receiveBufs) do count = count + 1 end
            return tostring(count) .. "|" .. tostring(FarmDashboardExportMirror._reservedBytes) .. "|" .. tostring(FarmDashboardExportMirror._lastReplicaOutcome)
        `);
        expect(result).toBe("0|0|timeout");
    });
});
