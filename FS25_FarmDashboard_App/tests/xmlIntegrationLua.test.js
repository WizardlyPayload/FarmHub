"use strict";

const fs = require("fs");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");

const modSrc = path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src");

const host = `
local files = {}
local docs = {}
local nextId = 1
local saveMode = "true"
function createFolder() end
function fileExists(p) return files[p] ~= nil end
function createXMLFile(name, p)
    local id = nextId
    nextId = nextId + 1
    docs[id] = { path = p, fields = {} }
    return id
end
function setXMLString(handle, key, value)
    local doc = docs[handle]
    if doc then doc.fields[key] = value end
end
function saveXMLFile(handle)
    local doc = docs[handle]
    if saveMode == "false" and doc and string.sub(doc.path, -10) == "active.xml" then return false end
    local doc = docs[handle]
    local copy = {}
    for k, v in pairs(doc.fields) do copy[k] = v end
    files[doc.path] = copy
    return true
end
function loadXMLFile(name, p)
    if files[p] == nil then return 0 end
    local id = nextId
    nextId = nextId + 1
    local copy = {}
    for k, v in pairs(files[p]) do copy[k] = v end
    docs[id] = { path = p, fields = copy }
    return id
end
function getXMLString(handle, key)
    local doc = docs[handle]
    if not doc then return nil end
    return doc.fields[key]
end
function delete(handle) docs[handle] = nil end
function addModEventListener() end
function now() return 10 end
local function drive()
    for i = 1, 80 do
        local status = FarmDashboardExportRoute:step()
        if status == "routed" or status == "startup" or status == "failed" or status == "cancelled" or status == "route-failed" then
            return status
        end
    end
    return "timeout"
end
local reserveN = 0
function testReserve(prefix)
    reserveN = reserveN + 1
    return prefix .. "-testhost-" .. string.format("%x", reserveN)
end
`;

function runNamedChunk(L, source, name) {
    let status = lauxlib.luaL_loadbuffer(L, to_luastring(source), null, to_luastring(`@${name}`));
    if (status === lua.LUA_OK) status = lua.lua_pcall(L, 0, 0, 0);
    if (status !== lua.LUA_OK) {
        const err = lua.lua_tostring(L, -1);
        lua.lua_settop(L, 0);
        throw new Error(`[${name}] ${err ? to_jsstring(err) : `lua error ${status}`}`);
    }
    lua.lua_settop(L, 0);
}

function run(files, chunk) {
    const L = lauxlib.luaL_newstate();
    try {
        lualib.luaL_openlibs(L);
        runNamedChunk(L, [
            "Logging = { info = function() end, warning = function() end }",
            "FarmDashLog = { devWarn = function() end, dev = function() end, error = function() end, isVerbose = function() return false end }",
            "Event = {}",
            "function Event.new(mt) return setmetatable({}, mt) end",
            "function Class(classTable) return { __index = classTable } end",
            "function InitEventClass() end",
        ].join("\n"), "test-bootstrap");
        for (const file of files) runNamedChunk(L, fs.readFileSync(path.join(modSrc, file), "utf8"), file);
        const status = lauxlib.luaL_dostring(L, to_luastring([host, chunk].join("\n")));
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

const identityFiles = ["FarmDashboardCareerIdentity.lua"];
const routeFiles = ["ExportEnvelopePublisher.lua", "FarmDashboardCareerIdentity.lua", "FarmDashboardExportRoute.lua", "FarmDashboardDataCollector.lua"];

describe("career identity", () => {
    test("save hook keeps the previous wrapper return and persists one attribute", () => {
        const result = run(identityFiles, `
            FarmDashboardCareerIdentity.resetForTest()
            local class = {}
            local ran = false
            function class:saveToXMLFile()
                ran = true
                return "kept"
            end
            FarmDashboardCareerIdentity.install(class)
            local n = 0
            local function reserve(prefix)
                n = n + 1
                return prefix .. "-hook-" .. string.format("%x", n)
            end
            local info = { xmlFile = 7, xmlKey = "careerSavegame", getIsLoadedFromSavegame = function() return false end }
            FarmDashboardCareerIdentity.capture(info, { now = function() return 4 end, reserve = reserve })
            setXMLString = function(handle, key, value)
                files["attr"] = key .. "=" .. value
            end
            local returned = class.saveToXMLFile(info)
            local status = FarmDashboardCareerIdentity.status()
            return returned .. "|" .. tostring(ran) .. "|" .. tostring(status.persisted) .. "|" .. tostring(string.find(files["attr"], status.careerId, 1, true) ~= nil)
        `);
        expect(result).toBe("kept|true|false|true");
    });

    test("a new career ignores a leftover id and a restart reuses the saved id", () => {
        const result = run(identityFiles, `
            FarmDashboardCareerIdentity.resetForTest()
            local store = {}
            setXMLString = function(handle, key, value) store[key] = value end
            getXMLString = function(handle, key) return store[key] end
            local n = 0
            local function reserve(prefix)
                n = n + 1
                return prefix .. "-testns-" .. string.format("%x", n)
            end
            local fresh = { xmlFile = 1, xmlKey = "careerSavegame", getIsLoadedFromSavegame = function() return false end }
            local first = FarmDashboardCareerIdentity.capture(fresh, { now = function() return 8 end, reserve = reserve })
            classSave = function() end
            FarmDashboardCareerIdentity.onCareerSaved(fresh)
            FarmDashboardCareerIdentity.resetForTest()
            local restarted = { xmlFile = 1, xmlKey = "careerSavegame", getIsLoadedFromSavegame = function() return true end }
            local second = FarmDashboardCareerIdentity.capture(restarted, { now = function() return 9 end, getXMLString = getXMLString, reserve = reserve })
            FarmDashboardCareerIdentity.resetForTest()
            local again = FarmDashboardCareerIdentity.capture({ xmlFile = 1, xmlKey = "careerSavegame", getIsLoadedFromSavegame = function() return false end }, { now = function() return 8 end, getXMLString = getXMLString, reserve = reserve })
            return tostring(first.persisted) .. "|" .. tostring(second.careerId == store["careerSavegame.farmDashboard#careerId"]) .. "|" .. tostring(second.sessionId ~= first.sessionId) .. "|" .. tostring(again.careerId ~= second.careerId)
        `);
        expect(result).toBe("false|true|true|true");
    });

    test("quit without save stays provisional and damaged xml is not rewritten", () => {
        const result = run(identityFiles, `
            FarmDashboardCareerIdentity.resetForTest()
            local writes = 0
            setXMLString = function() writes = writes + 1 end
            local info = { xmlFile = 1, xmlKey = "careerSavegame", getIsLoadedFromSavegame = function() return true end }
            local status = FarmDashboardCareerIdentity.capture(info, {
                now = function() return 3 end,
                getXMLString = function() error("damaged") end,
            })
            return tostring(status.provisional) .. "|" .. tostring(status.persisted) .. "|" .. tostring(writes)
        `);
        expect(result).toBe("true|false|0");
    });
});

const allocatorDisk = `
local docs = {}
local handles = {}
local writes = {}
local n = 0
local failPhase = nil
local failKind = nil
local tripped = false
local deps = { provisionRoot = "fixture/" }
local function kindOf(p)
    if string.find(p, "allocator-", 1, true) then return "allocator" end
    if string.find(p, "identity-ready.xml", 1, true) then return "ready" end
    return "other"
end
local function trip(phase, kind)
    if failPhase == phase and failKind == kind and not tripped then
        tripped = true
        return true
    end
    return false
end
function deps.fileExists(p) return docs[p] ~= nil end
function deps.loadXMLFile(_, p)
    if docs[p] == nil then return 0 end
    if trip("readback", kindOf(p)) then return 0 end
    n = n + 1
    local copy = {}
    for k, v in pairs(docs[p]) do copy[k] = v end
    handles[n] = { path = p, fields = copy }
    return n
end
function deps.getXMLString(h, k)
    if h == "career" then return "fd-aabbccddeeff0011-3" end
    if type(handles[h]) ~= "table" then return nil end
    return handles[h].fields[string.match(k, "#(.+)$")]
end
function deps.delete(h)
    local path = type(handles[h]) == "table" and handles[h].path or ""
    if trip("release", kindOf(path)) then error("release-failed") end
    handles[h] = nil
end
function deps.createXMLFile(_, p)
    if trip("create", kindOf(p)) then return 0 end
    n = n + 1
    handles[n] = { path = p, fields = {} }
    return n
end
function deps.setXMLString(h, k, v)
    local path = type(handles[h]) == "table" and handles[h].path or ""
    if trip("set", kindOf(path)) then error("set-failed") end
    handles[h].fields[string.match(k, "#(.+)$")] = v
end
function deps.saveXMLFile(h)
    local x = handles[h]
    if trip("save", kindOf(x.path)) then return false end
    local copy = {}
    for k, v in pairs(x.fields) do copy[k] = v end
    docs[x.path] = copy
    writes[#writes + 1] = x.path .. ":" .. tostring(copy.highWater) .. ":" .. tostring(copy.revision)
    return true
end
local info = { getIsLoadedFromSavegame = function() return false end }
local function snap()
    local function one(p)
        local d = docs[p]
        if d == nil then return "-" end
        return tostring(d.namespace) .. "/" .. tostring(d.highWater) .. "/" .. tostring(d.revision)
    end
    return one("fixture/allocator-a.xml") .. ";" .. one("fixture/allocator-b.xml") .. ";" .. one("fixture/identity-ready.xml")
end
`;

describe("allocator reservation", () => {
    test("a proposal issues ses-1, tok-2 and fd-3", () => {
        const result = run(identityFiles, allocatorDisk + `
            docs["fixture/identity-provision.xml"] = { version = "1", namespace = "aabbccddeeff0011" }
            FarmDashboardCareerIdentity.resetForTest()
            local status = FarmDashboardCareerIdentity.capture(info, deps)
            return tostring(status.sessionId) .. "|" .. tostring(status.sessionToken) .. "|" .. tostring(status.careerId) .. "|" .. tostring(status.recoveryNeeded) .. "|" .. tostring(#writes) .. "|" .. snap()
        `);
        expect(result).toBe("ses-aabbccddeeff0011-1|tok-aabbccddeeff0011-2|fd-aabbccddeeff0011-3|false|6|aabbccddeeff0011/3/3;aabbccddeeff0011/2/2;aabbccddeeff0011/nil/3");
    });

    test("revision 2147483647 is recovery with the original allocator bytes", () => {
        const result = run(identityFiles, allocatorDisk + `
            docs["fixture/allocator-a.xml"] = { namespace = "aabbccddeeff0011", highWater = "1", revision = "2147483647" }
            FarmDashboardCareerIdentity.resetForTest()
            local status = FarmDashboardCareerIdentity.capture(info, deps)
            return tostring(status.recoveryNeeded) .. "|" .. tostring(status.careerId) .. "|" .. tostring(#writes) .. "|" .. snap()
        `);
        expect(result).toBe("true|nil|0|aabbccddeeff0011/1/2147483647;-;-");
    });

    test("highWater 2147483647 is recovery with the original allocator bytes", () => {
        const result = run(identityFiles, allocatorDisk + `
            docs["fixture/allocator-a.xml"] = { namespace = "aabbccddeeff0011", highWater = "2147483647", revision = "10" }
            FarmDashboardCareerIdentity.resetForTest()
            local status = FarmDashboardCareerIdentity.capture(info, deps)
            return tostring(status.recoveryNeeded) .. "|" .. tostring(status.careerId) .. "|" .. tostring(#writes) .. "|" .. snap()
        `);
        expect(result).toBe("true|nil|0|aabbccddeeff0011/2147483647/10;-;-");
    });

    test("the last three counters still allocate and the next one does not roll them back", () => {
        const result = run(identityFiles, allocatorDisk + `
            docs["fixture/allocator-a.xml"] = { namespace = "aabbccddeeff0011", highWater = "2147483644", revision = "10" }
            FarmDashboardCareerIdentity.resetForTest()
            local status = FarmDashboardCareerIdentity.capture(info, deps)
            local committed = snap() .. "|writes=" .. tostring(#writes)
            docs["fixture/allocator-a.xml"] = { namespace = "aabbccddeeff0011", highWater = "2147483645", revision = "10" }
            docs["fixture/allocator-b.xml"] = nil
            docs["fixture/identity-ready.xml"] = nil
            writes = {}
            FarmDashboardCareerIdentity.resetForTest()
            local blocked = FarmDashboardCareerIdentity.capture(info, deps)
            local held = snap()
            FarmDashboardCareerIdentity.resetForTest()
            local again = FarmDashboardCareerIdentity.capture(info, deps)
            return tostring(status.sessionId) .. "|" .. tostring(status.careerId) .. "|" .. committed .. "|" .. tostring(blocked.careerId) .. "|" .. tostring(blocked.recoveryNeeded) .. "|" .. held .. "|" .. tostring(again.careerId) .. "|" .. tostring(#writes)
        `);
        expect(result).toBe("ses-aabbccddeeff0011-2147483645|fd-aabbccddeeff0011-2147483647|aabbccddeeff0011/2147483646/12;aabbccddeeff0011/2147483647/13;aabbccddeeff0011/nil/13|writes=6|nil|true|aabbccddeeff0011/2147483647/12;aabbccddeeff0011/2147483646/11;aabbccddeeff0011/nil/12|nil|4");
    });

    test("a saved career keeps its id and the next session does not reuse a suffix", () => {
        const result = run(identityFiles, allocatorDisk + `
            docs["fixture/identity-provision.xml"] = { version = "1", namespace = "aabbccddeeff0011" }
            FarmDashboardCareerIdentity.resetForTest()
            local first = FarmDashboardCareerIdentity.capture(info, deps)
            FarmDashboardCareerIdentity.resetForTest()
            local loaded = { xmlFile = "career", xmlKey = "careerSavegame", getIsLoadedFromSavegame = function() return true end }
            local second = FarmDashboardCareerIdentity.capture(loaded, deps)
            return tostring(first.careerId) .. "|" .. tostring(second.careerId) .. "|" .. tostring(second.sessionId) .. "|" .. tostring(second.sessionToken) .. "|" .. tostring(second.persisted)
        `);
        expect(result).toBe("fd-aabbccddeeff0011-3|fd-aabbccddeeff0011-3|ses-aabbccddeeff0011-4|tok-aabbccddeeff0011-5|true");
    });

    test("damaged counters stay recovery and keep their bytes", () => {
        const result = run(identityFiles, allocatorDisk + `
            local function hold(fields)
                docs = { ["fixture/allocator-a.xml"] = fields }
                writes = {}
                FarmDashboardCareerIdentity.resetForTest()
                local status = FarmDashboardCareerIdentity.capture(info, deps)
                local kept = docs["fixture/allocator-a.xml"]
                return tostring(status.recoveryNeeded) .. ":" .. tostring(#writes) .. ":" .. tostring(kept.highWater) .. ":" .. tostring(kept.namespace)
            end
            return hold({ namespace = "aabbccddeeff0011", highWater = "-1", revision = "1" })
                .. "|" .. hold({ namespace = "aabbccddeeff0011", highWater = "01", revision = "1" })
                .. "|" .. hold({ namespace = "aabbccddeeff0011", highWater = "2147483648", revision = "1" })
                .. "|" .. hold({ namespace = "aabbccddeeff0011", highWater = "1", revision = "nope" })
        `);
        expect(result).toBe("true:0:-1:aabbccddeeff0011|true:0:01:aabbccddeeff0011|true:0:2147483648:aabbccddeeff0011|true:0:1:aabbccddeeff0011");
    });

    test("an interrupted reservation restarts without reusing or rolling back", () => {
        const result = run(identityFiles, allocatorDisk + `
            local phases = { "create", "set", "save", "release", "readback" }
            local kinds = { "allocator", "ready" }
            local lines = {}
            for _, kind in ipairs(kinds) do
                for _, phase in ipairs(phases) do
                    docs = { ["fixture/identity-provision.xml"] = { version = "1", namespace = "aabbccddeeff0011" } }
                    writes = {}
                    failPhase = phase
                    failKind = kind
                    tripped = false
                    FarmDashboardCareerIdentity.resetForTest()
                    local status = FarmDashboardCareerIdentity.capture(info, deps)
                    local midWrites = #writes
                    local mid = snap()
                    failPhase = nil
                    tripped = false
                    FarmDashboardCareerIdentity.resetForTest()
                    local again = FarmDashboardCareerIdentity.capture(info, deps)
                    lines[#lines + 1] = kind .. "-" .. phase .. ":" .. tostring(status.careerId) .. ":" .. tostring(midWrites) .. ":" .. mid .. ":" .. tostring(again.sessionId) .. ":" .. tostring(again.careerId)
                end
            end
            return table.concat(lines, "|")
        `);
        expect(result).toBe([
            "allocator-create:nil:0:-;-;-:ses-aabbccddeeff0011-1:fd-aabbccddeeff0011-3",
            "allocator-set:nil:0:-;-;-:ses-aabbccddeeff0011-1:fd-aabbccddeeff0011-3",
            "allocator-save:nil:0:-;-;-:ses-aabbccddeeff0011-1:fd-aabbccddeeff0011-3",
            "allocator-release:nil:1:aabbccddeeff0011/1/1;-;-:ses-aabbccddeeff0011-2:fd-aabbccddeeff0011-4",
            "allocator-readback:nil:1:aabbccddeeff0011/1/1;-;-:ses-aabbccddeeff0011-2:fd-aabbccddeeff0011-4",
            "ready-create:nil:1:aabbccddeeff0011/1/1;-;-:ses-aabbccddeeff0011-2:fd-aabbccddeeff0011-4",
            "ready-set:nil:1:aabbccddeeff0011/1/1;-;-:ses-aabbccddeeff0011-2:fd-aabbccddeeff0011-4",
            "ready-save:nil:1:aabbccddeeff0011/1/1;-;-:ses-aabbccddeeff0011-2:fd-aabbccddeeff0011-4",
            "ready-release:nil:2:aabbccddeeff0011/1/1;-;aabbccddeeff0011/nil/1:ses-aabbccddeeff0011-2:fd-aabbccddeeff0011-4",
            "ready-readback:nil:2:aabbccddeeff0011/1/1;-;aabbccddeeff0011/nil/1:ses-aabbccddeeff0011-2:fd-aabbccddeeff0011-4",
        ].join("|"));
    });
});

const loadedCollectorFiles = ["FarmDashboardCareerIdentity.lua", "FarmDashboardDataCollector.lua"];
const loadedDash = fs.readFileSync(path.join(modSrc, "FarmDashboard.lua"), "utf8");
function runLoaded(chunk) {
    return run(loadedCollectorFiles, loadedDash + "\n" + loadedSetup + chunk);
}

const loadedSetup = `
function getUserProfileAppPath() return "" end
FarmDashboardCareerIdentity.resetForTest()
FarmDashboard._missionLoadNotified = false
FarmDashboard._armedMission = nil
FarmDashboard._identityWaitLogged = nil
FarmDashboard._identityRecoveryLogged = nil
g_currentMission = { missionInfo = { getIsLoadedFromSavegame = function() return false end } }
local loads = 0
local failLoad = false
function FarmDashboardDataCollector:onMissionLoaded()
    if failLoad then error("load-failed") end
    loads = loads + 1
end
local saves = 0
local allowSave = true
local realSave = saveXMLFile
function saveXMLFile(handle)
    saves = saves + 1
    if not allowSave then return false end
    return realSave(handle)
end
local function proposal()
    files["modSettings/FS25_FarmDashboard/identity-provision.xml"] = {
        ["identityProvision#version"] = "1",
        ["identityProvision#namespace"] = "aabbccddeeff0011",
    }
end
local function report(armed)
    local s = FarmDashboardCareerIdentity.status()
    return tostring(armed) .. "|" .. tostring(FarmDashboard._missionLoadNotified) .. "|" .. tostring(s.waitingForIdentity) .. "|" .. tostring(s.recoveryNeeded) .. "|" .. tostring(s.allocationFailed) .. "|" .. tostring(s.careerId) .. "|" .. tostring(s.sessionId) .. "|" .. tostring(loads) .. "|" .. tostring(saves)
end
`;

describe("loaded session setup", () => {
    test("a late proposal arms once and does not rotate the captured session", () => {
        const result = runLoaded(`
            local before = FarmDashboard:armMission()
            local waiting = report(before)
            proposal()
            local armed = FarmDashboard:armMission()
            local ready = report(armed)
            local again = FarmDashboard:armMission()
            return waiting .. "||" .. ready .. "||" .. tostring(again) .. "|" .. tostring(loads) .. "|" .. tostring(saves)
        `);
        expect(result).toBe("false|false|true|false|false|waiting|waiting|0|0||true|true|false|false|false|fd-aabbccddeeff0011-3|ses-aabbccddeeff0011-1|1|6||true|1|6");
    });

    test("a collector load failure stays unarmed and the retry keeps the career", () => {
        const result = runLoaded(`
            proposal()
            failLoad = true
            local first = FarmDashboard:armMission()
            local mid = report(first)
            failLoad = false
            local second = FarmDashboard:armMission()
            return mid .. "||" .. report(second)
        `);
        expect(result).toBe("false|false|false|false|false|fd-aabbccddeeff0011-3|ses-aabbccddeeff0011-1|0|6||true|true|false|false|false|fd-aabbccddeeff0011-3|ses-aabbccddeeff0011-1|1|6");
    });

    test("a reset failure stays unarmed and the retry keeps the career", () => {
        const result = runLoaded(`
            proposal()
            local realReset = FarmDashboardDataCollector.resetStaggerState
            FarmDashboardDataCollector.resetStaggerState = function() error("reset-failed") end
            local first = FarmDashboard:armMission()
            local mid = report(first)
            FarmDashboardDataCollector.resetStaggerState = realReset
            local second = FarmDashboard:armMission()
            return mid .. "||" .. report(second)
        `);
        expect(result).toBe("false|false|false|false|false|fd-aabbccddeeff0011-3|ses-aabbccddeeff0011-1|0|6||true|true|false|false|false|fd-aabbccddeeff0011-3|ses-aabbccddeeff0011-1|1|6");
    });

    test("a failed capture does not arm and a later save can", () => {
        const result = runLoaded(`
            proposal()
            allowSave = false
            local first = FarmDashboard:armMission()
            local mid = report(first)
            allowSave = true
            local second = FarmDashboard:armMission()
            return mid .. "||" .. report(second)
        `);
        expect(result).toBe("false|false|false|true|true|nil|nil|0|1||true|true|false|false|false|fd-aabbccddeeff0011-3|ses-aabbccddeeff0011-1|1|7");
    });

    test("damaged allocator state does not arm or write", () => {
        const result = runLoaded(`
            files["modSettings/FS25_FarmDashboard/allocator-a.xml"] = {
                ["allocator#namespace"] = "aabbccddeeff0011",
                ["allocator#highWater"] = "1",
                ["allocator#revision"] = "nope",
            }
            local armed = FarmDashboard:armMission()
            local kept = files["modSettings/FS25_FarmDashboard/allocator-a.xml"]["allocator#revision"]
            return report(armed) .. "|" .. tostring(kept)
        `);
        expect(result).toBe("false|false|false|true|true|nil|nil|0|0|nope");
    });

    test("a saved career stays put when collector setup is retried", () => {
        const result = runLoaded(`
            files["modSettings/FS25_FarmDashboard/allocator-a.xml"] = {
                ["allocator#namespace"] = "aabbccddeeff0011",
                ["allocator#highWater"] = "3",
                ["allocator#revision"] = "3",
            }
            files["modSettings/FS25_FarmDashboard/identity-ready.xml"] = {
                ["identityReady#namespace"] = "aabbccddeeff0011",
                ["identityReady#revision"] = "3",
            }
            local realGet = getXMLString
            function getXMLString(handle, key)
                if key == "careerSavegame.farmDashboard#careerId" then return "fd-aabbccddeeff0011-3" end
                return realGet(handle, key)
            end
            g_currentMission.missionInfo = {
                xmlFile = 1,
                xmlKey = "careerSavegame",
                getIsLoadedFromSavegame = function() return true end,
            }
            failLoad = true
            local first = FarmDashboard:armMission()
            failLoad = false
            local second = FarmDashboard:armMission()
            local s = FarmDashboardCareerIdentity.status()
            return tostring(first) .. "|" .. tostring(second) .. "|" .. tostring(s.careerId) .. "|" .. tostring(s.sessionId) .. "|" .. tostring(s.persisted) .. "|" .. tostring(saves) .. "|" .. tostring(loads)
        `);
        expect(result).toBe("false|true|fd-aabbccddeeff0011-3|ses-aabbccddeeff0011-4|true|4|1");
    });

    test("an ordinary reset still rotates and cancels the route", () => {
        const result = runLoaded(`
            proposal()
            FarmDashboard:armMission()
            local session = FarmDashboardCareerIdentity.status().sessionId
            local cancelled = 0
            FarmDashboardExportRoute = { cancelCurrent = function() cancelled = cancelled + 1 end }
            local exportBefore = FarmDashboardDataCollector._exportSession
            FarmDashboardDataCollector:resetStaggerState({ preserveSession = true })
            local kept = FarmDashboardCareerIdentity.status().sessionId
            local exportKept = FarmDashboardDataCollector._exportSession
            FarmDashboardDataCollector:resetStaggerState()
            local rotated = FarmDashboardCareerIdentity.status().sessionId
            return session .. "|" .. kept .. "|" .. tostring(exportBefore) .. "|" .. tostring(exportKept) .. "|" .. tostring(cancelled) .. "|" .. rotated
        `);
        expect(result).toBe("ses-aabbccddeeff0011-1|ses-aabbccddeeff0011-1|1|2|2|ses-aabbccddeeff0011-4");
    });
});

describe("xml integration", () => {
    test("two collector snapshots commit generation 1 then 2 and a failed route does not", () => {
        const result = run(routeFiles, `
            local C = FarmDashboardDataCollector
            C.config = {}
            C._exportSession = 1
            C._completedGeneration = 0
            C._activeCandidateGeneration = nil
            C._wroteRichExport = false
            C.getSavegameDirName = function() return "savegame3" end
            C.getDataOutputDir = function() return "virtual/" end
            C.getMapBounds = function() return {} end
            C.refineMapBoundsFromWorldActivity = function(_, _, bounds) return bounds end
            FarmDashboardCareerIdentity.resetForTest()
            FarmDashboardCareerIdentity.capture({ getIsLoadedFromSavegame = function() return false end }, { now = now, reserve = testReserve })
            FarmDashboardExportRoute:reset({
                createFolder = createFolder, createXMLFile = createXMLFile, setXMLString = setXMLString,
                saveXMLFile = saveXMLFile, loadXMLFile = loadXMLFile, getXMLString = getXMLString,
                delete = delete, fileExists = fileExists, now = now,
                isAuthority = function() return true end,
                currentContext = function()
                    local s = FarmDashboardCareerIdentity.status()
                    return { careerId = s.careerId, sessionId = s.sessionId, sessionToken = s.sessionToken, targetDir = "virtual/" .. s.careerId .. "/" }
                end,
            })
            local queued = C:writeDataToFile({ fields = {}, vehicles = {}, animals = {} }, "gameplay")
            local before = tostring(C._completedGeneration or 0)
            local first = drive()
            local gen1 = tostring(C._completedGeneration)
            C:writeDataToFile({ fields = { { id = 1 } }, vehicles = {}, animals = {} }, "gameplay")
            local second = drive()
            local gen2 = tostring(C._completedGeneration)
            saveMode = "false"
            C:writeDataToFile({ fields = { { id = 2 } }, vehicles = {}, animals = {} }, "gameplay")
            local held = drive()
            local heldGen = tostring(C._completedGeneration)
            saveMode = "true"
            local repaired = drive()
            local repairedGen = tostring(C._completedGeneration)
            return tostring(queued) .. "|" .. before .. "|" .. first .. "|" .. gen1 .. "|" .. second .. "|" .. gen2 .. "|" .. held .. "|" .. heldGen .. "|" .. repaired .. "|" .. repairedGen
        `);
        expect(result).toBe("queued|0|routed|1|routed|2|route-failed|2|routed|3");
    });

    test("a session change drops an in-flight callback", () => {
        const result = run(routeFiles, `
            local C = FarmDashboardDataCollector
            C.config = {}
            C._exportSession = 1
            C._completedGeneration = 0
            C.getSavegameDirName = function() return "savegame3" end
            C.getDataOutputDir = function() return "virtual/" end
            C.getMapBounds = function() return {} end
            C.refineMapBoundsFromWorldActivity = function(_, _, bounds) return bounds end
            FarmDashboardCareerIdentity.resetForTest()
            FarmDashboardCareerIdentity.capture({ getIsLoadedFromSavegame = function() return false end }, { now = now, reserve = testReserve })
            FarmDashboardExportRoute:reset({
                createFolder = createFolder, createXMLFile = createXMLFile, setXMLString = setXMLString,
                saveXMLFile = saveXMLFile, loadXMLFile = loadXMLFile, getXMLString = getXMLString,
                delete = delete, fileExists = fileExists, now = now,
                isAuthority = function() return true end,
                currentContext = function()
                    local s = FarmDashboardCareerIdentity.status()
                    return { careerId = s.careerId, sessionId = s.sessionId, sessionToken = s.sessionToken, targetDir = "virtual/" .. s.careerId .. "/" }
                end,
            })
            C:writeDataToFile({ fields = {}, vehicles = {}, animals = {} }, "gameplay")
            FarmDashboardExportRoute:step()
            C:resetStaggerState()
            local after = drive()
            return tostring(C._completedGeneration or 0) .. "|" .. after
        `);
        expect(result.startsWith("0|")).toBe(true);
    });
});

describe("xml integration rework probes", () => {
    const setup = `
        local C = FarmDashboardDataCollector
        C.config = {}
        C._transportProtocol = "xml"
        C._exportSession = 1
        C._completedGeneration = 0
        C._activeCandidateGeneration = nil
        C._wroteRichExport = false
        C.getSavegameDirName = function() return "savegame3" end
        C.getDataOutputDir = function() return "virtual/" end
        C.getMapBounds = function() return {} end
        C.refineMapBoundsFromWorldActivity = function(_, _, bounds) return bounds end
        FarmDashboardCareerIdentity.resetForTest()
        FarmDashboardCareerIdentity.capture({ getIsLoadedFromSavegame = function() return false end }, { now = now, reserve = testReserve })
    `;

    test("I01 a revoked authority does not commit the held route", () => {
        const result = run(routeFiles, setup + `
            local authority = true
            local deps = {
                createFolder = createFolder, createXMLFile = createXMLFile, setXMLString = setXMLString,
                saveXMLFile = saveXMLFile, loadXMLFile = loadXMLFile, getXMLString = getXMLString,
                delete = delete, fileExists = fileExists, now = now,
                isAuthority = function() return authority end,
                currentContext = function()
                    local s = FarmDashboardCareerIdentity.status()
                    return { careerId = s.careerId, sessionId = s.sessionId, sessionToken = s.sessionToken, targetDir = "virtual/" .. s.careerId .. "/" }
                end,
            }
            FarmDashboardExportRoute:reset(deps)
            saveMode = "false"
            C:writeDataToFile({ fields = { { id = 1 } }, vehicles = {}, animals = {} }, "gameplay")
            local first = drive()
            authority = false
            saveMode = "true"
            local second = drive()
            return first .. "|" .. second .. "|" .. tostring(C._completedGeneration)
        `);
        expect(result).toBe("route-failed|cancelled|0");
    });

    test("I02 missing readback does not commit", () => {
        const result = run(routeFiles, setup + `
            local deps = {
                createFolder = createFolder, createXMLFile = createXMLFile, setXMLString = setXMLString,
                saveXMLFile = saveXMLFile, loadXMLFile = loadXMLFile, getXMLString = getXMLString,
                delete = delete, fileExists = fileExists, now = now,
                isAuthority = function() return true end,
                currentContext = function()
                    local s = FarmDashboardCareerIdentity.status()
                    return { careerId = s.careerId, sessionId = s.sessionId, sessionToken = s.sessionToken, targetDir = "virtual/" .. s.careerId .. "/" }
                end,
            }
            FarmDashboardExportRoute:reset(deps)
            saveMode = "false"
            C:writeDataToFile({ fields = { { id = 1 } }, vehicles = {}, animals = {} }, "gameplay")
            drive()
            deps.loadXMLFile = nil
            deps.getXMLString = nil
            saveMode = "true"
            return drive() .. "|" .. tostring(C._completedGeneration)
        `);
        expect(result).toBe("route-failed|0");
    });

    test("I03 a throwing handle release does not commit", () => {
        const result = run(routeFiles, setup + `
            local deps = {
                createFolder = createFolder, createXMLFile = createXMLFile, setXMLString = setXMLString,
                saveXMLFile = saveXMLFile, loadXMLFile = loadXMLFile, getXMLString = getXMLString,
                delete = delete, fileExists = fileExists, now = now,
                isAuthority = function() return true end,
                currentContext = function()
                    local s = FarmDashboardCareerIdentity.status()
                    return { careerId = s.careerId, sessionId = s.sessionId, sessionToken = s.sessionToken, targetDir = "virtual/" .. s.careerId .. "/" }
                end,
            }
            FarmDashboardExportRoute:reset(deps)
            saveMode = "false"
            C:writeDataToFile({ fields = { { id = 1 } }, vehicles = {}, animals = {} }, "gameplay")
            drive()
            deps.delete = function() error("release failed") end
            saveMode = "true"
            return drive() .. "|" .. tostring(C._completedGeneration)
        `);
        expect(result).toBe("route-failed|0");
    });

    test("I04 cancelCurrent stops a resource before it is written", () => {
        const result = run(routeFiles, setup + `
            local deps = {
                createFolder = createFolder, createXMLFile = createXMLFile, setXMLString = setXMLString,
                saveXMLFile = saveXMLFile, loadXMLFile = loadXMLFile, getXMLString = getXMLString,
                delete = delete, fileExists = fileExists, now = now,
                isAuthority = function() return true end,
                currentContext = function()
                    local s = FarmDashboardCareerIdentity.status()
                    return { careerId = s.careerId, sessionId = s.sessionId, sessionToken = s.sessionToken, targetDir = "virtual/" .. s.careerId .. "/" }
                end,
            }
            FarmDashboardExportRoute:reset(deps)
            local q = FarmDashboardExportRoute:submitResource("dirtyPens", "{\\"pens\\":[]}", C:_xmlRecord("{}", 0, 1, "resource"))
            FarmDashboardExportRoute:cancelCurrent()
            for _ = 1, 80 do FarmDashboardExportRoute:step() end
            local count = 0
            for k in pairs(files) do
                if string.find(k, "resources/", 1, true) then count = count + 1 end
            end
            return q .. "|resourceFiles=" .. count
        `);
        expect(result).toBe("queued|resourceFiles=0");
    });

    test("I05 a pen resource creates the nonrecursive parent directory", () => {
        const result = run(routeFiles, setup + `
            local deps = {
                createFolder = createFolder, createXMLFile = createXMLFile, setXMLString = setXMLString,
                saveXMLFile = saveXMLFile, loadXMLFile = loadXMLFile, getXMLString = getXMLString,
                delete = delete, fileExists = fileExists, now = now,
                isAuthority = function() return true end,
                currentContext = function()
                    local s = FarmDashboardCareerIdentity.status()
                    return { careerId = s.careerId, sessionId = s.sessionId, sessionToken = s.sessionToken, targetDir = "virtual/" .. s.careerId .. "/" }
                end,
            }
            FarmDashboardExportRoute:reset(deps)
            local dirs = { ["virtual/"] = true }
            local missing = {}
            deps.createFolder = function(p)
                local clean = string.gsub(p, "/$", "")
                local parent = string.match(clean, "^(.*)/[^/]+$")
                if parent and not dirs[parent .. "/"] then
                    missing[#missing + 1] = parent .. "/"
                    return
                end
                dirs[clean .. "/"] = true
            end
            local orig = deps.createXMLFile
            deps.createXMLFile = function(n, p, root)
                local parent = string.match(p, "^(.*)/[^/]+$")
                if parent and not dirs[parent .. "/"] then return 0 end
                return orig(n, p, root)
            end
            local rec = C:_xmlRecord("{}", 0, 1, "resource")
            rec.resourceId = "pen1"
            FarmDashboardExportRoute:submitResource("penDetail", "{\\"animals\\":[]}", rec)
            for _ = 1, 80 do FarmDashboardExportRoute:step() end
            local n = 0
            for _ in pairs(files) do n = n + 1 end
            return "files=" .. n .. "|missing=" .. table.concat(missing, ",")
        `);
        expect(result.startsWith("files=")).toBe(true);
        expect(result.endsWith("|missing=")).toBe(true);
        expect(result).not.toBe("files=0|missing=");
    });

    test("I06 two admitted snapshots commit generation 1 then 2", () => {
        const result = run(routeFiles, setup + `
            local deps = {
                createFolder = createFolder, createXMLFile = createXMLFile, setXMLString = setXMLString,
                saveXMLFile = saveXMLFile, loadXMLFile = loadXMLFile, getXMLString = getXMLString,
                delete = delete, fileExists = fileExists, now = now,
                isAuthority = function() return true end,
                currentContext = function()
                    local s = FarmDashboardCareerIdentity.status()
                    return { careerId = s.careerId, sessionId = s.sessionId, sessionToken = s.sessionToken, targetDir = "virtual/" .. s.careerId .. "/" }
                end,
            }
            FarmDashboardExportRoute:reset(deps)
            local seqs = {}
            local old = C.onExportTransactionCommitted
            C.onExportTransactionCommitted = function(self, info)
                seqs[#seqs + 1] = tostring(info.sequence) .. ":" .. tostring(info.generation)
                return old(self, info)
            end
            local a = C:writeDataToFile({ fields = { { id = 1 } }, vehicles = {}, animals = {} }, "gameplay")
            local b = C:writeDataToFile({ fields = { { id = 2 } }, vehicles = {}, animals = {} }, "gameplay")
            for _ = 1, 160 do FarmDashboardExportRoute:step() end
            return tostring(a) .. "|" .. tostring(b) .. "|commits=" .. table.concat(seqs, ",") .. "|phase=" .. FarmDashboardExportRoute:status().phase
        `);
        expect(result).toBe("queued|queued|commits=1:1,2:2|phase=idle");
    });

    test("I07 an unrelated save keeps every return and does not persist", () => {
        const result = run(routeFiles, setup + `
            local writes = 0
            setXMLString = function() writes = writes + 1 end
            local class = {}
            function class:saveToXMLFile() return 1, 2, 3, 4, 5, 6 end
            FarmDashboardCareerIdentity.install(class)
            local other = { xmlFile = 7, xmlKey = "careerSavegame" }
            local n = select("#", class.saveToXMLFile(other))
            return "otherWrites=" .. writes .. "|returns=" .. n .. "|persisted=" .. tostring(FarmDashboardCareerIdentity.status().persisted)
        `);
        expect(result).toBe("otherWrites=0|returns=6|persisted=false");
    });

    test("I08 a restart reads the career id from savegameDirectory", () => {
        const result = run(identityFiles, `
            files["profile/savegame3/careerSavegame.xml"] = { ["careerSavegame.farmDashboard#careerId"] = "saved-career" }
            FarmDashboardCareerIdentity.resetForTest()
            local status = FarmDashboardCareerIdentity.capture({
                savegameDirectory = "profile/savegame3",
                getIsLoadedFromSavegame = function() return true end,
            }, { now = now, getXMLString = getXMLString, loadXMLFile = loadXMLFile, delete = delete })
            return status.careerId .. "|persisted=" .. tostring(status.persisted)
        `);
        expect(result).toBe("saved-career|persisted=true");
    });

    test("I09 two fresh states do not mint the same career id", () => {
        const chunk = `
            FarmDashboardCareerIdentity.resetForTest()
            local status = FarmDashboardCareerIdentity.capture({ getIsLoadedFromSavegame = function() return false end }, { now = function() return 0 end })
            return status.careerId .. "|" .. status.sessionId .. "|" .. status.sessionToken
        `;
        const first = run(identityFiles, chunk);
        const second = run(identityFiles, chunk);
        expect(first).toBe("waiting|waiting|waiting");
        expect(second).toBe(first);
        expect(first.startsWith("fd-")).toBe(false);
    });

    test("I13 the update fallback captures identity from the current FarmDashboard.lua", () => {
        const dash = fs.readFileSync(path.join(modSrc, "FarmDashboard.lua"), "utf8");
        const result = run(routeFiles, dash + `
            local C = FarmDashboardDataCollector
            C.config = {}
            C._transportProtocol = "xml"
            C._exportSession = 1
            C._completedGeneration = 0
            C.getSavegameDirName = function() return "savegame3" end
            C.getDataOutputDir = function() return "virtual/" end
            C.getMapBounds = function() return {} end
            C.refineMapBoundsFromWorldActivity = function(_, _, bounds) return bounds end
            C.init = function() end
            C.onMissionLoaded = function() end
            C.assembleDataFromModuleCache = function() return nil end
            C.update = function(self) self:writeDataToFile({ fields = { { id = 1 } }, vehicles = {}, animals = {} }, "gameplay") end
            local errors = {}
            FarmDashLog.error = function(_, err) errors[#errors + 1] = tostring(err) end
            g_currentMission = { missionInfo = { getIsLoadedFromSavegame = function() return false end } }
            g_time = 10000
            FarmDashboard:loadMap()
            FarmDashboard:update(16)
            return "captured=" .. tostring(FarmDashboardCareerIdentity.status().captured) .. "|errors=" .. table.concat(errors, ",")
        `);
        expect(result).toBe("captured=true|errors=");
    });

    test("a proposal adopts a namespace and a missing allocator does not restart at 1", () => {
        const result = run(identityFiles, `
            function getUserProfileAppPath() return "" end
            files["modSettings/FS25_FarmDashboard/identity-provision.xml"] = {
                ["identityProvision#version"] = "1",
                ["identityProvision#namespace"] = "aabbccddeeff0011",
            }
            FarmDashboardCareerIdentity.resetForTest()
            local first = FarmDashboardCareerIdentity.capture({ getIsLoadedFromSavegame = function() return false end }, {})
            FarmDashboardCareerIdentity.resetForTest()
            local second = FarmDashboardCareerIdentity.capture({ getIsLoadedFromSavegame = function() return false end }, {})
            files["modSettings/FS25_FarmDashboard/allocator-a.xml"] = nil
            files["modSettings/FS25_FarmDashboard/allocator-b.xml"] = nil
            FarmDashboardCareerIdentity.resetForTest()
            local blocked = FarmDashboardCareerIdentity.capture({ getIsLoadedFromSavegame = function() return false end }, {})
            return tostring(first.careerId) .. "|" .. tostring(second.careerId) .. "|" .. tostring(blocked.careerId) .. "|" .. tostring(blocked.recoveryNeeded)
        `);
        expect(result).toBe("fd-aabbccddeeff0011-3|fd-aabbccddeeff0011-6|nil|true");
    });

    test("J01 a rotated session does not commit the held descriptor", () => {
        const result = run(routeFiles, setup + `
            FarmDashboardExportRoute:reset({
                createFolder = createFolder, createXMLFile = createXMLFile, setXMLString = setXMLString,
                saveXMLFile = saveXMLFile, loadXMLFile = loadXMLFile, getXMLString = getXMLString,
                delete = delete, fileExists = fileExists, now = now,
                isAuthority = function() return true end,
                currentContext = function()
                    local s = FarmDashboardCareerIdentity.status()
                    return { careerId = s.careerId, sessionId = s.sessionId, sessionToken = s.sessionToken, targetDir = "virtual/" .. s.careerId .. "/" }
                end,
            })
            saveMode = "false"
            C:writeDataToFile({ fields = { { id = 1 } }, vehicles = {}, animals = {} }, "gameplay")
            local first = drive()
            FarmDashboardCareerIdentity.rotateSession()
            saveMode = "true"
            local second = drive()
            return first .. "|" .. second .. "|generation=" .. tostring(C._completedGeneration)
        `);
        expect(result).toBe("route-failed|cancelled|generation=0");
    });

    test("J03 a terminal descriptor failure releases the collector", () => {
        const result = run(routeFiles, setup + `
            FarmDashboardExportRoute:reset({
                createFolder = createFolder, createXMLFile = createXMLFile, setXMLString = setXMLString,
                saveXMLFile = saveXMLFile, loadXMLFile = loadXMLFile, getXMLString = getXMLString,
                delete = delete, fileExists = fileExists, now = now,
                isAuthority = function() return true end,
                currentContext = function()
                    local s = FarmDashboardCareerIdentity.status()
                    return { careerId = s.careerId, sessionId = s.sessionId, sessionToken = s.sessionToken, targetDir = "virtual/" .. s.careerId .. "/" }
                end,
            })
            saveMode = "false"
            C:writeDataToFile({ fields = { { id = 1 } }, vehicles = {}, animals = {} }, "gameplay")
            for _ = 1, 100 do FarmDashboardExportRoute:step() end
            saveMode = "true"
            local queued = C:writeDataToFile({ fields = { { id = 2 } }, vehicles = {}, animals = {} }, "gameplay")
            for _ = 1, 100 do FarmDashboardExportRoute:step() end
            return tostring(queued) .. "|inFlight=" .. tostring(C._xmlInFlight) .. "|generation=" .. tostring(C._completedGeneration) .. "|phase=" .. FarmDashboardExportRoute:status().phase
        `);
        expect(result).toBe("queued|inFlight=false|generation=1|phase=idle");
    });

    test("J06 a failed pen write stays queued", () => {
        const result = run(routeFiles, `
            local C = FarmDashboardDataCollector
            C._dirtyPens = { pen1 = 1 }
            C._dirtyPensCount = 1
            C._writePenDetail = function() return false end
            local remaining = C:processDetailQueueOnce()
            return "remaining=" .. tostring(remaining) .. "|count=" .. tostring(C._dirtyPensCount) .. "|pending=" .. tostring(C._dirtyPens.pen1 ~= nil)
        `);
        expect(result).toBe("remaining=true|count=1|pending=true");
    });

    test("J05 a snapshot stamped during an in-flight export gets the next generation", () => {
        const result = run(routeFiles, setup + `
            FarmDashboardExportRoute:reset({
                createFolder = createFolder, createXMLFile = createXMLFile, setXMLString = setXMLString,
                saveXMLFile = saveXMLFile, loadXMLFile = loadXMLFile, getXMLString = getXMLString,
                delete = delete, fileExists = fileExists, now = now,
                isAuthority = function() return true end,
                currentContext = function()
                    local s = FarmDashboardCareerIdentity.status()
                    return { careerId = s.careerId, sessionId = s.sessionId, sessionToken = s.sessionToken, targetDir = "virtual/" .. s.careerId .. "/" }
                end,
            })
            local seqs = {}
            local old = C.onExportTransactionCommitted
            C.onExportTransactionCommitted = function(self, info)
                seqs[#seqs + 1] = tostring(info.generation)
                return old(self, info)
            end
            C:writeDataToFile({ fields = { { id = 1 } }, vehicles = {}, animals = {} }, "gameplay")
            local second = { fields = { { id = 2 } }, vehicles = {}, animals = {} }
            local stamped = C:_stampExportGeneration(second, "gameplay")
            C._jsonPendingDisk = { jsonString = C:toJSON(second), generation = stamped, session = C._exportSession, savegameDir = "savegame3" }
            drive()
            local queued = C:jsonDiskWriteStep()
            for _ = 1, 80 do FarmDashboardExportRoute:step() end
            return tostring(stamped) .. "|" .. tostring(queued) .. "|gens=" .. table.concat(seqs, ",")
        `);
        expect(result).toBe("2|queued|gens=1,2");
    });

    test("J09 a later chunk from another transfer is not published", () => {
        const result = run(["FarmDashboardExportMirror.lua"], `
            local published = {}
            FarmDashboardExportMirror._writeMirroredDataJson = function(self, payload, meta)
                published[#published + 1] = tostring(meta and meta.careerId)
            end
            local function meta(id, career)
                return { transferId = id, checksum = id, careerId = career, sessionId = "session-a", publicationSequence = 1, exportGeneration = 1, sourceSlot = "savegame3" }
            end
            FarmDashboardExportMirror:onChunkReceived(1, 2, '{"animal":1}', meta("t1", "career-a"))
            FarmDashboardExportMirror:onChunkReceived(1, 2, '{"animal":2}', meta("t2", "career-b"))
            FarmDashboardExportMirror:onChunkReceived(2, 2, "}", nil)
            return "published=" .. tostring(#published)
        `);
        expect(result).toBe("published=0");
    });

    test("J04 two resource admissions each become durable", () => {
        const result = run(routeFiles, setup + `
            FarmDashboardExportRoute:reset({
                createFolder = createFolder, createXMLFile = createXMLFile, setXMLString = setXMLString,
                saveXMLFile = saveXMLFile, loadXMLFile = loadXMLFile, getXMLString = getXMLString,
                delete = delete, fileExists = fileExists, now = now,
                isAuthority = function() return true end,
                currentContext = function()
                    local s = FarmDashboardCareerIdentity.status()
                    return { careerId = s.careerId, sessionId = s.sessionId, sessionToken = s.sessionToken, targetDir = "virtual/" .. s.careerId .. "/" }
                end,
            })
            local n = 0
            C.onResourceDurable = function() n = n + 1 end
            FarmDashboardExportRoute:submitResource("dirtyPens", "{\\"pens\\":[]}", C:_xmlRecord("{}", 0, 1, "resource"))
            for _ = 1, 40 do FarmDashboardExportRoute:step() end
            FarmDashboardExportRoute:submitResource("dirtyPens", "{\\"pens\\":[1]}", C:_xmlRecord("{}", 0, 1, "resource"))
            for _ = 1, 40 do FarmDashboardExportRoute:step() end
            return "durable=" .. tostring(n)
        `);
        expect(result).toBe("durable=2");
    });
});

describe("rework 005 reproductions", () => {
    const pack = JSON.parse(fs.readFileSync(path.resolve(__dirname, "fixtures/reproductions/xml-005.json"), "utf8"));
    const chunk = Object.fromEntries(pack.luaCases.map((item) => [item.id, item.chunk]));

    test("production reset without bindings is refused", () => {
        const result = run(routeFiles, `return FarmDashboardExportRoute:reset({})`);
        expect(result).toBe("refused");
    });

    test("K01 an unread allocator is not overwritten", () => {
        const result = run(identityFiles, chunk.K01);
        expect(result).toContain("unreadOverwrites=0");
        expect(result).toContain("second=nil");
        expect(result).toContain("recovery=true");
    });

    test("K02 a failed snapshot releases the collector", () => {
        const result = run(routeFiles, chunk.K02);
        expect(result).toContain("inFlight=false");
        expect(result).toContain("generation=1");
        expect(result).toContain("phase=idle");
    });

    test("K03 a session change during readback does not commit", () => {
        const result = run(routeFiles, chunk.K03);
        expect(result).toContain("rotated=true");
        expect(result).toContain("generation=0");
        expect(result.startsWith("routed")).toBe(false);
    });

    test("K04 the first resource callback matches the first payload", () => {
        const result = run(routeFiles, chunk.K04);
        expect(result).toContain("callback=1");
        expect(result).toContain("ledger=111");
        expect(result).toContain("111");
    });

    test("K05 an unrelated savegame does not confirm the active career", () => {
        const result = run(identityFiles, chunk.K05);
        expect(result).toBe("persisted=false|activeSaved=false");
    });

    test("K08 a checksum mismatch writes nothing", () => {
        const marker = "local M=FarmDashboardExportMirror";
        const tail = chunk.K08.slice(chunk.K08.indexOf(marker));
        const result = run(["FarmDashboardExportMirror.lua"], tail);
        expect(result).toContain("written=false");
    });

    test("a frame budget below one quantum defers the route step", () => {
        const result = run(routeFiles, `
            local C = FarmDashboardDataCollector
            C.config = {}
            C._exportSession = 1
            C._completedGeneration = 0
            C.getSavegameDirName = function() return "savegame3" end
            C.getDataOutputDir = function() return "virtual/" end
            C.getMapBounds = function() return {} end
            C.refineMapBoundsFromWorldActivity = function(_, _, bounds) return bounds end
            FarmDashboardCareerIdentity.resetForTest()
            FarmDashboardCareerIdentity.capture({ getIsLoadedFromSavegame = function() return false end }, { now = now, reserve = testReserve })
            FarmDashboardExportRoute:reset({
                createFolder = createFolder, createXMLFile = createXMLFile, setXMLString = setXMLString,
                saveXMLFile = saveXMLFile, loadXMLFile = loadXMLFile, getXMLString = getXMLString,
                delete = delete, fileExists = fileExists, now = now,
                isAuthority = function() return true end,
                currentContext = function()
                    local s = FarmDashboardCareerIdentity.status()
                    return { careerId = s.careerId, sessionId = s.sessionId, sessionToken = s.sessionToken, targetDir = "virtual/" .. s.careerId .. "/" }
                end,
            })
            C:writeDataToFile({ fields = { { id = 1 } }, vehicles = {}, animals = {} }, "gameplay")
            return FarmDashboardExportRoute:step({ bytes = 0, timeMs = 4, timingUnavailable = true })
        `);
        expect(result).toBe("deferred");
    });
});

describe("rework 006 resource and budget", () => {
    const pack = JSON.parse(fs.readFileSync(path.resolve(__dirname, "fixtures/reproductions/xml-006.json"), "utf8"));
    const chunk = Object.fromEntries(pack.luaCases.map((item) => [item.id, item.chunk]));

    test("M01 the first pen write records its own ledger", () => {
        const result = run(routeFiles, chunk.M01);
        expect(result).toContain("queued=queued");
        expect(result).toContain("ledger=true");
        expect(result).toContain("pending=false");
        expect(result).not.toContain("resourceFiles=0");
    });

    test("M02 the held resource is published before its callback", () => {
        const result = run(routeFiles, chunk.M02);
        expect(result).toContain("callbacks=1,2");
        expect(result).toContain("ledger=222");
        expect(result).toContain("eyJ2YWx1ZSI6MjIyfQ==");
    });

    test("M03 a zero byte budget does not publish a resource", () => {
        const result = run(routeFiles, chunk.M03);
        expect(result).toBe("resourceFiles=0");
    });
});

describe("rework 007 terminal resource and budget", () => {
    const pack = JSON.parse(fs.readFileSync(path.resolve(__dirname, "fixtures/reproductions/xml-007.json"), "utf8"));
    const chunk = Object.fromEntries(pack.lua.cases.map((item) => [item.id, item.chunk]));

    test("N09 toJSON stays a full serializer and does not charge a zero budget", () => {
        const result = run(routeFiles, chunk.N09);
        expect(result).toContain("remaining=0");
        expect(result).toContain("charged=0");
        expect(result).not.toContain("serializedBytes=0");
    });

    test("N10 a replaced held admission does not stay in the version map", () => {
        const result = run(routeFiles, chunk.N10);
        expect(result).toContain("callbacks=1,3");
        expect(result).toContain("ledger=333");
        expect(result).toContain("retainedAdmissions=0");
    });

    test("N11 a failed resource save settles both admissions", () => {
        const result = run(routeFiles, chunk.N11);
        expect(result).toContain("ledger=false");
        expect(result).toContain("pending=false");
        expect(result).toContain("retainedAdmissions=0");
    });

    test("N12 cancel settles the admission", () => {
        const result = run(routeFiles, chunk.N12);
        expect(result).toBe("phase=idle|pending=false|retainedAdmissions=0");
    });

    test("N13 a zero budget defers the real json walker", () => {
        const result = run(routeFiles, chunk.N13);
        expect(result).toContain("emittedBytes=0");
        expect(result).toContain("remaining=0");
        expect(result).toContain("charged=0");
        expect(result).toContain("stepResult=deferred");
    });
});

describe("rework 008 queued export budget", () => {
    const pack = JSON.parse(fs.readFileSync(path.resolve(__dirname, "fixtures/reproductions/xml-008.json"), "utf8"));
    const chunk = Object.fromEntries(pack.lua.cases.map((item) => [item.id, item.chunk]));

    test("P01 one byte does not emit the rest of a deferred value", () => {
        const result = run(routeFiles, chunk.P01);
        expect(result).toContain("emittedBytes=1");
        expect(result).toContain("remaining=0");
        expect(result).toContain("charged=1");
        expect(result).not.toContain("emittedBytes=8234");
    });

    test("P02 synchronous toJSON does not charge a one-byte frame", () => {
        const result = run(routeFiles, chunk.P02);
        expect(result).toContain("remaining=1");
        expect(result).toContain("charged=0");
        expect(result).not.toContain("serializedBytes=0");
    });

    test("P04 a zero-budget gameplay request stays queued", () => {
        const result = run(routeFiles, chunk.P04);
        expect(result).toContain("outcome=queued");
        expect(result).toContain("queuedWork=true");
        expect(result).toContain("activeGeneration=nil");
        expect(result).toContain("xmlInFlight=false");
    });

    test("P05 a failed pen write is retried once saves work again", () => {
        const result = run(routeFiles, chunk.P05);
        expect(result).toContain("ledger=true");
        expect(result).toContain("pending=false");
        expect(result).toContain("dirty=false");
        expect(result).not.toContain("resourceFiles=0");
    });

    test("P06 a zero allowance does not collect a pen", () => {
        const result = run(routeFiles, chunk.P06);
        expect(result).toContain("collected=0");
        expect(result).toContain("charged=0");
        expect(result).toContain("pending=false");
        expect(result).not.toContain("outcome=queued");
    });

    test("small budgets finish byte-for-byte with the synchronous serializer", () => {
        const result = run(routeFiles, `
            local C = FarmDashboardDataCollector
            C.config = { jsonTopLevelKeysPerFrame = 1, sliceBudgetMs = 4 }
            C._frameBudget = nil
            local data = { name = "Müller", note = string.rep("a", 30) .. string.char(92, 34, 10, 9) .. string.rep("b", 80), nest = { items = { 1, false, "x" } }, flag = true }
            C._jsonWriteJob = nil
            C._jsonPendingDisk = nil
            C._xmlInFlight = nil
            C:beginDeferredJsonWrite(data)
            C._frameBudget = nil
            local expected = C:toJSON(data, 0)
            local over = false
            for _ = 1, 400 do
                C._frameBudget = { bytes = 17, timeMs = 4, charged = 0, timingUnavailable = true }
                local step = C:jsonWriteStep()
                local emitted = C._frameBudget.charged or 0
                if emitted > 17 then over = true end
                if step == true or C._jsonWriteJob == nil then break end
                if step == true then break end
            end
            local got = C._jsonPendingDisk and C._jsonPendingDisk.jsonString or ""
            return "match=" .. tostring(got == expected) .. "|over=" .. tostring(over) .. "|len=" .. #got
        `);
        expect(result).toContain("match=true");
        expect(result).toContain("over=false");
    });

    test("a failed pen waits for the mission clock before retrying", () => {
        const result = run(routeFiles, `
            local C = FarmDashboardDataCollector
            C.config = {}
            C._transportProtocol = "xml"
            C._exportSession = 1
            C.getSavegameDirName = function() return "savegame3" end
            C.getDataOutputDir = function() return "virtual/" end
            C._detailLedger = {}
            C._resourcePending = {}
            C._resourceByVersion = {}
            C._dirtyPens = {}
            C._dirtyPensCount = 0
            C._penRetryAt = nil
            C._idScheme = "integer-v1"
            C._animalMode = "base"
            C._ensureDetailsWritable = function() return true end
            C._findPlaceableByKey = function() return { id = 1 } end
            C._detailDirPath = function() return "virtual/details/" end
            local collected = 0
            AnimalDataCollector = { collectPenDetail = function() collected = collected + 1 return { animals = { { id = 101 } } } end }
            g_time = 0
            C._frameBudget = nil
            C._dirtyPens["1"] = 1
            C._dirtyPensCount = 1
            local permit = false
            local nativeSave = saveXMLFile
            saveXMLFile = function(h)
                local d = docs[h]
                if d and string.find(d.path, "penDetail/1/", 1, true) and not permit then return false end
                return nativeSave(h)
            end
            FarmDashboardCareerIdentity.resetForTest()
            FarmDashboardCareerIdentity.capture({ getIsLoadedFromSavegame = function() return false end }, { reserve = testReserve })
            FarmDashboardExportRoute:reset({
                createFolder = createFolder, createXMLFile = createXMLFile, setXMLString = setXMLString,
                saveXMLFile = saveXMLFile, loadXMLFile = loadXMLFile, getXMLString = getXMLString,
                delete = delete, fileExists = fileExists, now = function() return g_time end,
                isAuthority = function() return true end,
                currentContext = function()
                    local s = FarmDashboardCareerIdentity.status()
                    return { careerId = s.careerId, sessionId = s.sessionId, sessionToken = s.sessionToken, targetDir = "virtual/" .. s.careerId .. "/" }
                end,
            })
            C:processDetailQueueOnce()
            for _ = 1, 40 do FarmDashboardExportRoute:step() end
            local early = C:processDetailQueueOnce()
            g_time = 1000
            permit = true
            C:processDetailQueueOnce()
            for _ = 1, 40 do FarmDashboardExportRoute:step() end
            return "early=" .. tostring(early) .. "|collected=" .. collected .. "|ledger=" .. tostring(C._detailLedger["1"] ~= nil)
        `);
        expect(result).toContain("early=false");
        expect(result).toContain("collected=2");
        expect(result).toContain("ledger=true");
    });
});

describe("rework 009 queue promotion and fair publication", () => {
    const pack = JSON.parse(fs.readFileSync(path.resolve(__dirname, "fixtures/reproductions/xml-009.json"), "utf8"));
    const chunk = Object.fromEntries(pack.lua.cases.map((item) => [item.id, item.chunk]));

    test("Q01 a retained gameplay request commits after the budget returns", () => {
        const result = run(routeFiles, chunk.Q01);
        expect(result).toContain("admitted=queued");
        expect(result).toContain("held=false");
        expect(result).not.toContain("completed=0");
        expect(result).not.toContain("files=0");
    });

    test("Q02 a queued bootstrap stays generation 0", () => {
        const result = run(routeFiles, chunk.Q02);
        expect(result).toContain("class=bootstrap");
        expect(result).toContain("generation=0");
        expect(result).toContain("activeGeneration=nil");
    });

    test("Q03 a long nested key does not emit the whole key in one byte", () => {
        const result = run(routeFiles, chunk.Q03);
        expect(result).toContain("done=false");
        expect(result).not.toContain("emitted=8201");
    });

    test("Q04 a sentinel array does not finish in one byte", () => {
        const result = run(routeFiles, chunk.Q04);
        expect(result).toContain("done=false");
        expect(result).not.toContain("emitted=802");
    });

    test("Q05 a failed dirty index stays due until a later save succeeds", () => {
        const result = run(routeFiles, chunk.Q05);
        expect(result).toContain("detailLedger=true");
        expect(result).toContain("due=false");
        expect(result).not.toContain("indexFiles=0");
    });

    test("Q06 pen publication proceeds while snapshots keep committing", () => {
        const result = run(routeFiles, chunk.Q06);
        expect(result).toContain("detailLedger=true");
        expect(result).not.toContain("resourceFiles=0");
        expect(result).not.toContain("snapshotCommits=0");
    });
});

describe("rework 010 document walker index lifecycle and resource cursor", () => {
    const pack = JSON.parse(fs.readFileSync(path.resolve(__dirname, "fixtures/reproductions/xml-010.json"), "utf8"));
    const chunk = Object.fromEntries(pack.lua.cases.map((item) => [item.id, item.chunk]));

    test("S01 a one-byte document step does not append unmetered framing", () => {
        const result = run(routeFiles, chunk.S01);
        expect(result).toContain("overrunFrames=0");
        expect(result).toContain("maxEmitted=1");
        expect(result).toContain("complete=true");
    });

    test("S02 a second pen becomes durable under repeated first-pen traffic", () => {
        const result = run(routeFiles, chunk.S02);
        expect(result).toContain("firstLedger=true");
        expect(result).toContain("secondLedger=true");
        expect(result).not.toContain("secondFiles=0");
    });

    test("S03 ordinary index deferral does not arm a retry delay", () => {
        const result = run(routeFiles, chunk.S03);
        expect(result).toContain("indexJob=true");
        expect(result).not.toContain("retryAt=2000");
    });

    test("S04 session reset drops the old index job and retry state", () => {
        const result = run(routeFiles, chunk.S04);
        expect(result).toContain("sessionChanged=true");
        expect(result).toContain("sameIndexJob=false");
        expect(result).toContain("revision=nil");
        expect(result).toContain("retryAt=nil");
        expect(result).toContain("penRetrySkips=false");
    });

    test("S05 a failed index save waits for the mission clock", () => {
        const result = run(routeFiles, chunk.S05);
        expect(result).toContain("clock=1000");
        expect(result).toContain("due=true");
        expect(result).toContain("retryAt=2000");
        expect(result).not.toContain("indexSaveAttempts=18");
    });
});

describe("replica capture at the authoritative commit", () => {
    const setup = `
        local C = FarmDashboardDataCollector
        C.config = {}
        C._transportProtocol = "xml"
        C._exportSession = 1
        C._completedGeneration = 0
        C._activeCandidateGeneration = nil
        C._wroteRichExport = false
        C.getSavegameDirName = function() return "savegame3" end
        C.getDataOutputDir = function() return "virtual/" end
        C.getMapBounds = function() return {} end
        C.refineMapBoundsFromWorldActivity = function(_, _, bounds) return bounds end
        FarmDashboardCareerIdentity.resetForTest()
        FarmDashboardCareerIdentity.capture({ getIsLoadedFromSavegame = function() return false end }, { now = now, reserve = testReserve })
    `;

    test("R01 commit captures the selected slot and a later overwrite is not relabelled", () => {
        const result = run(routeFiles, setup + `
            FarmDashboardExportRoute:reset({
                createFolder = createFolder, createXMLFile = createXMLFile, setXMLString = setXMLString,
                saveXMLFile = saveXMLFile, loadXMLFile = loadXMLFile, getXMLString = getXMLString,
                delete = delete, fileExists = fileExists, now = now,
                isAuthority = function() return true end,
                currentContext = function()
                    local s = FarmDashboardCareerIdentity.status()
                    return { careerId = s.careerId, sessionId = s.sessionId, sessionToken = s.sessionToken, targetDir = "virtual/" .. s.careerId .. "/" }
                end,
            })
            C:writeDataToFile({ fields = { { id = 1 } }, vehicles = {}, animals = {} }, "gameplay")
            local driven = drive()
            local first = FarmDashboardExportRoute:mirrorCaptureStatus()
            local s = FarmDashboardCareerIdentity.status()
            local smashed = false
            for _, name in ipairs({ "slot-a.xml", "slot-b.xml" }) do
                local path = "virtual/" .. s.careerId .. "/" .. name
                if fileExists(path) then
                    local handle = loadXMLFile("smash", path)
                    setXMLString(handle, "farmDashboardExport#publicationSequence", "99")
                    saveXMLFile(handle)
                    delete(handle)
                    smashed = true
                end
            end
            local again, reason = FarmDashboardExportRoute:recaptureCommitted()
            return driven .. "|" .. first .. "|smashed=" .. tostring(smashed) .. "|again=" .. tostring(again ~= nil) .. "|reason=" .. tostring(reason)
        `);
        expect(result).toContain("routed");
        expect(result).toContain("captured|true|true");
        expect(result).toContain("smashed=true");
        expect(result).toContain("again=false");
        expect(result).toContain("reason=sequence");
    });

    test("R02 the captured envelope is the replica that reaches the store", () => {
        const result = run(routeFiles.concat(["FarmDashboardExportFinalizer.lua", "FarmDashboardExportEvent.lua", "FarmDashboardExportMirror.lua"]), setup + `
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
            local conn = { epoch = 1 }
            function conn:getIsServer() return true end
            function conn:sendEvent(event)
                q = {}
                readAt = 1
                event:writeStream(1, self)
                readAt = 1
                local incoming = FarmDashboardExportEvent.emptyNew()
                incoming:readStream(1, self)
            end
            FarmDashboardExportMirror._replicaRoot = "replica/"
            FarmDashboardExportMirror:registerReplicaSource(conn, "source-a")
            FarmDashboardExportMirror._clients = { [conn] = true }
            FarmDashboardExportRoute:reset({
                createFolder = createFolder, createXMLFile = createXMLFile, setXMLString = setXMLString,
                saveXMLFile = saveXMLFile, loadXMLFile = loadXMLFile, getXMLString = getXMLString,
                delete = delete, fileExists = fileExists, now = now,
                isAuthority = function() return true end,
                currentContext = function()
                    local s = FarmDashboardCareerIdentity.status()
                    return { careerId = s.careerId, sessionId = s.sessionId, sessionToken = s.sessionToken, targetDir = "virtual/" .. s.careerId .. "/" }
                end,
            })
            C:writeDataToFile({ fields = { { id = 1 } }, vehicles = {}, animals = {} }, "gameplay")
            local driven = drive()
            for _ = 1, 40 do FarmDashboardExportMirror:update(16) end
            return driven .. "|" .. FarmDashboardExportRoute:mirrorCaptureStatus() .. "|stored=" .. tostring(fileExists("replica/source-a/selected.xml")) .. "|outcome=" .. tostring(FarmDashboardExportMirror._lastReplicaOutcome)
        `);
        expect(result).toContain("routed");
        expect(result).toContain("captured|true|true");
        expect(result).toContain("stored=true");
        expect(result).toContain("outcome=published");
    });

    test("R03 a dedicated server-owned identity commits, streams and is stored by the joined client", () => {
        const result = run(routeFiles.concat(["FarmDashboardExportFinalizer.lua", "FarmDashboardExportEvent.lua", "FarmDashboardExportMirror.lua"]), setup + `
            FarmDashboardCareerIdentity.resetForTest()
            FarmDashboardCareerIdentity.capture({ getIsLoadedFromSavegame = function() return false end }, { now = now, reserve = FarmDashboardCareerIdentity.serverReserve("savegame3") })
            local ident = FarmDashboardCareerIdentity.status()
            local q = {}
            local readAt = 1
            local arrivedCareer = nil
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
            local conn = { epoch = 1 }
            function conn:getIsServer() return true end
            function conn:sendEvent(event)
                q = {}
                readAt = 1
                event:writeStream(1, self)
                readAt = 1
                local incoming = FarmDashboardExportEvent.emptyNew()
                incoming:readStream(1, self)
                arrivedCareer = incoming.meta and incoming.meta.careerId or arrivedCareer
            end
            FarmDashboardExportMirror._replicaRoot = "replica/"
            FarmDashboardExportMirror:registerReplicaSource(conn, "source-a")
            FarmDashboardExportMirror._clients = { [conn] = true }
            FarmDashboardExportRoute:reset({
                createFolder = createFolder, createXMLFile = createXMLFile, setXMLString = setXMLString,
                saveXMLFile = saveXMLFile, loadXMLFile = loadXMLFile, getXMLString = getXMLString,
                delete = delete, fileExists = fileExists, now = now,
                isAuthority = function() return true end,
                currentContext = function()
                    local s = FarmDashboardCareerIdentity.status()
                    return { careerId = s.careerId, sessionId = s.sessionId, sessionToken = s.sessionToken, targetDir = "virtual/" .. s.careerId .. "/" }
                end,
            })
            C:writeDataToFile({ fields = { { id = 1 } }, vehicles = {}, animals = {} }, "gameplay")
            local driven = drive()
            for _ = 1, 40 do FarmDashboardExportMirror:update(16) end
            local idOk = string.match(ident.careerId, "^fd%-[a-f0-9]+%-1$") ~= nil and string.match(ident.sessionId, "^ses%-[a-f0-9]+%-1$") ~= nil
            return driven .. "|ids=" .. tostring(idOk) .. "|arrived=" .. tostring(arrivedCareer == ident.careerId) .. "|stored=" .. tostring(fileExists("replica/source-a/selected.xml")) .. "|outcome=" .. tostring(FarmDashboardExportMirror._lastReplicaOutcome)
        `);
        expect(result).toBe("routed|ids=true|arrived=true|stored=true|outcome=published");
    });
});

describe("XML integration rework 011", () => {
    const pack = JSON.parse(fs.readFileSync(path.resolve(__dirname, "fixtures/reproductions/xml-011.json"), "utf8"));
    const chunk = Object.fromEntries(pack.lua.cases.map((item) => [item.id, item.chunk]));

    test("T02 one ledger scan and the creating session stay on the same index job", () => {
        const result = run(routeFiles, chunk.T02);
        expect(result).toContain("ledgerScans=1");
        expect(result).toContain("sameJob=true");
        expect(result).toContain("jobSession=1");
        expect(result).toContain("collectorSession=1");
    });

    test("T03 an older durable ack does not release a newer held index revision", () => {
        const result = run(routeFiles, chunk.T03);
        expect(result).toContain("first=queued");
        expect(result).toContain("second=held");
        expect(result).toContain("markerAfterOlderAck=2");
        expect(result).toContain("admissionsBeforeTail=2");
        expect(result).toContain("admissionsAfterTail=2");
        expect(result).toContain("tail=queued");
    });

    test("T04 stripped controls are charged beyond the emitted quote", () => {
        const result = run(routeFiles, chunk.T04);
        expect(result).toContain("scannedSourceBytes=16");
        expect(result).toContain("emitted=1");
        expect(result).toContain("charged=17");
        expect(result).toContain("remaining=0");
        expect(result).toContain("done=false");
    });
});
