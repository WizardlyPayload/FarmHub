"use strict";

/**
 * Production FarmDashboard.lua + FarmDashboardCareerIdentity.lua under the environment FS25 gives an
 * ordinary script mod (extract/decompiled/scripts/mods.lua:300-311 and :772-777):
 *   modEnv = {}; setmetatable(modEnv, { __index = _G }); modEnv._G = modEnv
 *   extraSourceFiles are sourced into modEnv.
 * Engine functions and mission state live only on the engine table and are inherited, never own keys.
 * "own" mode copies them onto modEnv, which is the flat layout older Fengari suites used.
 */
const fs = require("fs");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");

const modSrc = path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src");
const MOD_FILES = ["FarmDashboardCareerIdentity.lua", "FarmDashboardDataCollector.lua", "FarmDashboard.lua"];

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
FarmDashLog = { devWarn = function() end, dev = function() end, error = function() end, isVerbose = function() return false end }
Event = {}
function Event.new(mt) return setmetatable({}, mt) end
function Class(t) return { __index = t } end
function InitEventClass() end
function addModEventListener() end
g_currentModDirectory = "mods/FS25_FarmDashboard/"
g_time = 1000
Savegame = { ERROR_OK = 0 }
DISK = {}
HANDLES = {}
NEXT = 1
ENG = { saveResult = {}, denyLoad = {}, writes = {}, profile = "profile/" }
function getUserProfileAppPath() return ENG.profile end
function fileExists(p) return DISK[p] ~= nil end
function createFolder() return true end
function createXMLFile(name, p, root)
    local id = NEXT
    NEXT = NEXT + 1
    HANDLES[id] = { path = p, fields = {} }
    return id
end
function setXMLString(h, k, v)
    local d = HANDLES[h]
    if d == nil then error("invalid xml handle") end
    d.fields[k] = v
end
function saveXMLFile(h)
    local d = HANDLES[h]
    if d == nil then return false end
    for pat, res in pairs(ENG.saveResult) do
        if string.find(d.path, pat, 1, true) then
            if res == "void" then return end
            return res
        end
    end
    local c = {}
    for k, v in pairs(d.fields) do c[k] = v end
    DISK[d.path] = c
    ENG.writes[#ENG.writes + 1] = d.path
    return true
end
function loadXMLFile(name, p)
    if DISK[p] == nil then return 0 end
    for pat in pairs(ENG.denyLoad) do
        if string.find(p, pat, 1, true) then return 0 end
    end
    local id = NEXT
    NEXT = NEXT + 1
    local c = {}
    for k, v in pairs(DISK[p]) do c[k] = v end
    HANDLES[id] = { path = p, fields = c }
    return id
end
function getXMLString(h, k)
    local d = HANDLES[h]
    if d == nil then error("invalid xml handle") end
    return d.fields[k]
end
function delete(h) HANDLES[h] = nil end
ENGINE = _G
ENGINE_NAMES = { "getUserProfileAppPath", "fileExists", "createFolder", "createXMLFile", "setXMLString", "saveXMLFile", "loadXMLFile", "getXMLString", "delete", "Savegame" }
`;

const helpers = `
local NS = "0123456789abcdef"
local ROOT = "profile/modSettings/FS25_FarmDashboard/"
local function proposal()
    DISK[ROOT .. "identity-provision.xml"] = { ["identityProvision#version"] = "1", ["identityProvision#namespace"] = NS }
end
local function adopted(high)
    DISK[ROOT .. "allocator-a.xml"] = { ["allocator#namespace"] = NS, ["allocator#highWater"] = tostring(high), ["allocator#revision"] = tostring(high) }
    DISK[ROOT .. "identity-ready.xml"] = { ["identityReady#namespace"] = NS, ["identityReady#revision"] = tostring(high) }
end
local function loadedInfo(dir, careerId)
    DISK[dir .. "/careerSavegame.xml"] = { ["careerSavegame#revision"] = "1", ["careerSavegame.farmDashboard#careerId"] = careerId }
    return { isValid = true, xmlKey = "careerSavegame", savegameDirectory = dir, getIsLoadedFromSavegame = function(self) return self.isValid end }
end
local function newInfo(dir)
    return { isValid = false, xmlKey = "careerSavegame", savegameDirectory = dir, getIsLoadedFromSavegame = function(self) return self.isValid end }
end
local function mission(info)
    ENGINE.g_currentMission = { missionInfo = info }
    return ENGINE.g_currentMission
end
LOADS = 0
function FarmDashboardDataCollector:onMissionLoaded() LOADS = LOADS + 1 end
function FarmDashboardDataCollector:update() end
function FarmDashboardDataCollector:shutdown() end
FarmDashboardCareerIdentity.resetForTest()
FarmDashboard._missionLoadNotified = false
FarmDashboard._armedMission = nil
local function st()
    local s = FarmDashboardCareerIdentity.status()
    return table.concat({ tostring(s.careerId), tostring(s.sessionId), tostring(s.persisted), tostring(s.waitingForIdentity), tostring(s.recoveryNeeded), tostring(s.allocationFailed) }, ",")
end
local function count(pattern)
    local n = 0
    for i = 1, #LOG do
        if string.find(LOG[i], pattern, 1, true) then n = n + 1 end
    end
    return n
end
local function identityLines()
    local n = 0
    for i = 1, #LOG do
        if string.find(LOG[i], "dashboard identity", 1, true) then n = n + 1 end
    end
    return n
end
local function disk(p)
    local d = DISK[p]
    if d == nil then return "-" end
    return tostring(d["allocator#highWater"] or d["identityReady#revision"] or d["careerSavegame.farmDashboard#careerId"])
end
local function frames(n, each)
    for i = 1, n do
        if each then each(i) end
        FarmDashboard:update(16)
    end
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
            `if ${JSON.stringify(mode)} == "own" then for _, n in ipairs(ENGINE_NAMES) do rawset(modEnv, n, _G[n]) end end`,
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

const FD3 = "fd-0123456789abcdef-3";
const SES1 = "ses-0123456789abcdef-1";

describe("native mod environment", () => {
    test("N00 engine functions are inherited, not own keys, exactly like mods.lua", () => {
        const result = run("inherited", `
            return tostring(rawget(_G, "loadXMLFile")) .. "|" .. type(_G.loadXMLFile) .. "|" .. tostring(_G == ENGINE) .. "|" .. tostring(rawget(_G, "FarmDashboardCareerIdentity") ~= nil)
        `);
        expect(result).toBe("nil|function|false|true");
    });

    test("N01 [discriminator] a loaded career without an ID adopts a valid proposal and arms", () => {
        const result = run("inherited", `
            proposal()
            mission(loadedInfo("profile/savegame4", nil))
            local armed = FarmDashboard:armMission()
            return tostring(armed) .. "|" .. st() .. "|" .. disk(ROOT .. "allocator-a.xml") .. "|" .. disk(ROOT .. "allocator-b.xml") .. "|" .. disk(ROOT .. "identity-ready.xml") .. "|" .. LOADS .. "|" .. count("dashboard identity ready (source=new recoveredFrom=none)") .. "|" .. count("W ")
        `);
        expect(result).toBe(`true|${FD3},${SES1},false,false,false,false|3|2|3|1|1|0`);
    });

    test("N02 [control] the same career arms when engine functions are own keys (why flat suites passed)", () => {
        const result = run("own", `
            proposal()
            mission(loadedInfo("profile/savegame4", nil))
            local armed = FarmDashboard:armMission()
            return tostring(armed) .. "|" .. st() .. "|" .. LOADS
        `);
        expect(result).toBe(`true|${FD3},${SES1},false,false,false,false|1`);
    });

    test("N03 [discriminator] an absent proposal waits and says why, once", () => {
        const result = run("inherited", `
            mission(newInfo("profile/savegame5"))
            local a = FarmDashboard:armMission()
            local b = FarmDashboard:armMission()
            return tostring(a) .. tostring(b) .. "|" .. st() .. "|" .. #ENG.writes .. "|" .. count("waiting for dashboard identity (reason=waiting-proposal stage=identity-provision capability=nil)") .. "|" .. identityLines()
        `);
        expect(result).toBe("falsefalse|waiting,waiting,false,true,false,false|0|1|1");
    });

    test("N04 [discriminator] a late proposal arms once through the update fallback without churn", () => {
        const result = run("inherited", `
            FarmDashboard.readyAt = 0
            mission(newInfo("profile/savegame5"))
            local writesAtProposal = -1
            frames(1500, function(i)
                if i == 400 then proposal() writesAtProposal = #ENG.writes end
            end)
            return tostring(FarmDashboard._missionLoadNotified) .. "|" .. writesAtProposal .. "|" .. #ENG.writes .. "|" .. LOADS .. "|" .. st() .. "|" .. count("waiting for dashboard identity") .. "|" .. count("dashboard identity ready (source=new recoveredFrom=waiting-proposal)") .. "|" .. identityLines()
        `);
        expect(result).toBe(`true|0|6|1|${FD3},${SES1},false,false,false,false|1|1|2`);
    });

    test("N05 [discriminator] loadMap hands the export route the inherited engine XML functions", () => {
        const result = run("inherited", `
            local captured = nil
            FarmDashboardExportRoute = { reset = function(_, deps) captured = deps end }
            FarmDashboardDataCollector.init = function() end
            FarmDashboardDataCollector.assembleDataFromModuleCache = function() return nil end
            mission(newInfo("profile/savegame5"))
            FarmDashboard:loadMap()
            local out = {}
            for _, name in ipairs({ "createFolder", "createXMLFile", "setXMLString", "saveXMLFile", "loadXMLFile", "getXMLString", "delete", "fileExists" }) do
                out[#out + 1] = name .. "=" .. tostring(captured ~= nil and captured[name] == ENGINE[name])
            end
            return table.concat(out, ",")
        `);
        expect(result).toBe("createFolder=true,createXMLFile=true,setXMLString=true,saveXMLFile=true,loadXMLFile=true,getXMLString=true,delete=true,fileExists=true");
    });

    test("N06 [discriminator] a saved career keeps its persisted ID and continues the counter", () => {
        const result = run("inherited", `
            adopted(3)
            mission(loadedInfo("profile/savegame4", "${FD3}"))
            local armed = FarmDashboard:armMission()
            return tostring(armed) .. "|" .. st() .. "|" .. disk("profile/savegame4/careerSavegame.xml") .. "|" .. count("dashboard identity ready (source=saved")
        `);
        expect(result).toBe(`true|${FD3},ses-0123456789abcdef-4,true,false,false,false|${FD3}|1`);
    });

    test("N07 [discriminator] a stale in-memory career handle falls back to the saved file", () => {
        const result = run("inherited", `
            adopted(3)
            local info = loadedInfo("profile/savegame4", "${FD3}")
            info.xmlFile = 999
            mission(info)
            local armed = FarmDashboard:armMission()
            return tostring(armed) .. "|" .. st()
        `);
        expect(result).toBe(`true|${FD3},ses-0123456789abcdef-4,true,false,false,false`);
    });

    test("N08 [discriminator] malformed and unreadable careers are preserved, never replaced, and named", () => {
        const result = run("inherited", `
            proposal()
            mission(loadedInfo("profile/savegame4", "bad id"))
            local a = FarmDashboard:armMission()
            local malformed = tostring(a) .. "," .. st() .. "," .. #ENG.writes .. "," .. disk("profile/savegame4/careerSavegame.xml") .. "," .. count("reason=saved-career-damaged stage=career-file")
            FarmDashboard:deleteMap()
            ENG.denyLoad["savegame6/careerSavegame.xml"] = true
            mission(loadedInfo("profile/savegame6", "${FD3}"))
            local b = FarmDashboard:armMission()
            local unreadable = tostring(b) .. "," .. st() .. "," .. #ENG.writes .. "," .. disk("profile/savegame6/careerSavegame.xml") .. "," .. count("reason=saved-career-unreadable stage=career-file")
            return malformed .. "|" .. unreadable
        `);
        expect(result).toBe(`false,nil,nil,false,false,false,true,0,bad id,1|false,nil,nil,false,false,false,true,0,${FD3},1`);
    });

    test("N08b [control] malformed careers stay preserved when engine functions are own keys", () => {
        const result = run("own", `
            proposal()
            mission(loadedInfo("profile/savegame4", "bad id"))
            local a = FarmDashboard:armMission()
            return tostring(a) .. "," .. st() .. "," .. #ENG.writes .. "," .. disk("profile/savegame4/careerSavegame.xml")
        `);
        expect(result).toBe("false,nil,nil,false,false,false,true,0,bad id");
    });

    test("N09 [discriminator] allocator save failure or a void acknowledgement fails closed and is named", () => {
        const result = run("inherited", `
            proposal()
            ENG.saveResult["allocator-a"] = false
            mission(newInfo("profile/savegame5"))
            local a = FarmDashboard:armMission()
            local failed = tostring(a) .. "," .. st() .. "," .. disk(ROOT .. "identity-ready.xml") .. "," .. LOADS .. "," .. count("reason=allocator-write-failed stage=allocator-a")
            FarmDashboard:deleteMap()
            ENG.saveResult["allocator-a"] = "void"
            mission(newInfo("profile/savegame7"))
            local b = FarmDashboard:armMission()
            local void = tostring(b) .. "," .. st() .. "," .. disk(ROOT .. "identity-ready.xml") .. "," .. LOADS .. "," .. count("reason=allocator-write-failed stage=allocator-a")
            return failed .. "|" .. void
        `);
        expect(result).toBe("false,nil,nil,false,false,true,true,-,0,1|false,nil,nil,false,false,true,true,-,0,2");
    });

    test("N09b [control] a void save acknowledgement fails closed with own-key engine functions", () => {
        const result = run("own", `
            proposal()
            ENG.saveResult["allocator-a"] = "void"
            mission(newInfo("profile/savegame5"))
            local a = FarmDashboard:armMission()
            return tostring(a) .. "," .. st() .. "," .. disk(ROOT .. "identity-ready.xml") .. "," .. LOADS
        `);
        expect(result).toBe("false,nil,nil,false,false,true,true,-,0");
    });

    test("N10 [discriminator] corrupt adopted state over 3000 updates logs once and never writes", () => {
        const result = run("inherited", `
            FarmDashboard.readyAt = 0
            proposal()
            DISK[ROOT .. "allocator-a.xml"] = { ["allocator#namespace"] = NS, ["allocator#highWater"] = "2", ["allocator#revision"] = "x" }
            mission(newInfo("profile/savegame5"))
            frames(3000)
            return tostring(FarmDashboard._missionLoadNotified) .. "|" .. #ENG.writes .. "|" .. DISK[ROOT .. "allocator-a.xml"]["allocator#revision"] .. "|" .. count("reason=adopted-state-corrupt stage=allocator-a") .. "|" .. identityLines() .. "|" .. LOADS
        `);
        expect(result).toBe("false|0|x|1|1|0");
    });

    test("N11 [discriminator] a same-process save switch drops the old session and keeps the counters", () => {
        const result = run("inherited", `
            proposal()
            mission(loadedInfo("profile/savegame4", nil))
            local a = FarmDashboard:armMission()
            local first = st()
            local info = ENGINE.g_currentMission.missionInfo
            info.xmlFile = createXMLFile("careerSavegameXML", "", "careerSavegame")
            local pending = tostring(FarmDashboardCareerIdentity.onCareerSaved(info)) .. "," .. tostring(FarmDashboardCareerIdentity.status().savePending)
            FarmDashboard:deleteMap()
            local dropped = FarmDashboardCareerIdentity.status()
            local lateAck = FarmDashboardCareerIdentity.noteSaveComplete(0, "profile/savegame4")
            mission(newInfo("profile/savegame5"))
            local b = FarmDashboard:armMission()
            return pending .. "|" .. tostring(a) .. "|" .. first .. "|" .. tostring(dropped.captured) .. "," .. tostring(dropped.careerId) .. "," .. tostring(dropped.savePending) .. "|" .. tostring(lateAck) .. "|" .. tostring(b) .. "|" .. st() .. "|" .. count("dashboard identity ready") .. "|" .. LOADS
        `);
        expect(result).toBe(`true,true|true|${FD3},${SES1},false,false,false,false|false,nil,false|false|true|fd-0123456789abcdef-6,ses-0123456789abcdef-4,false,false,false,false|2|2`);
    });

    test("N12 [discriminator] a joining client never adopts or allocates identity", () => {
        const result = run("own", `
            proposal()
            local m = mission(newInfo("profile/savegame5"))
            m.missionDynamicInfo = { isMultiplayer = true, isClient = true }
            local a = FarmDashboard:armMission()
            local b = FarmDashboard:armMission()
            return tostring(a) .. tostring(b) .. "|" .. #ENG.writes .. "|" .. tostring(FarmDashboardCareerIdentity.status().captured) .. "|" .. count("reason=not-authority stage=client") .. "|" .. LOADS
        `);
        expect(result).toBe("falsefalse|0|false|1|0");
    });

    test("N13 [discriminator] a capture error is logged once as a fixed category without path, user or token", () => {
        const result = run("inherited", `
            local info = setmetatable({}, { __index = function(_, k)
                if k == "getIsLoadedFromSavegame" then error("denied C:/Users/someone/mods/probe.lua:9 token=N13_SYNTHETIC_TOKEN", 0) end
                return nil
            end })
            mission(info)
            local a = FarmDashboard:armMission()
            local b = FarmDashboard:armMission()
            local line = ""
            for i = 1, #LOG do if string.find(LOG[i], "capture-error", 1, true) then line = LOG[i] end end
            local all = table.concat(LOG, string.char(10))
            local function has(s) return tostring(string.find(all, s, 1, true) ~= nil) end
            return tostring(a) .. tostring(b) .. "|" .. count("reason=capture-error") .. "|" .. tostring(string.find(line, "reason=capture-error stage=capture capability=nil error=capture-exception)", 1, true) ~= nil) .. "|" .. has("C:/Users/someone/mods/probe.lua") .. has("someone") .. has("Users") .. has("probe.lua") .. has("N13_SYNTHETIC_TOKEN") .. has("denied")
        `);
        expect(result).toBe("falsefalse|1|true|falsefalsefalsefalsefalsefalse");
    });

    test("N14 [discriminator] a missing engine capability is named instead of reported as corruption", () => {
        const result = run("inherited", `
            ENGINE.getUserProfileAppPath = nil
            mission(newInfo("profile/savegame5"))
            FarmDashboard:armMission()
            local profile = count("reason=waiting-profile-path stage=profile-root capability=getUserProfileAppPath")
            FarmDashboard:deleteMap()
            ENGINE.loadXMLFile = nil
            mission(loadedInfo("profile/savegame4", "${FD3}"))
            local armed = FarmDashboard:armMission()
            return profile .. "|" .. tostring(armed) .. "|" .. count("reason=api-missing stage=career-read capability=loadXMLFile") .. "|" .. disk("profile/savegame4/careerSavegame.xml") .. "|" .. #ENG.writes
        `);
        expect(result).toBe(`1|false|1|${FD3}|0`);
    });

    test("N15 [discriminator] absent identity files never reach loadXMLFile and the wait backs off", () => {
        const result = run("inherited", `
            FarmDashboard.readyAt = 0
            mission(newInfo("profile/savegame5"))
            local baseLoad = ENGINE.loadXMLFile
            local missingOpens = 0
            ENGINE.loadXMLFile = function(name, p)
                if DISK[p] == nil then missingOpens = missingOpens + 1 end
                return baseLoad(name, p)
            end
            local attempts = 0
            local arm = FarmDashboard.armMission
            FarmDashboard.armMission = function(self) attempts = attempts + 1 return arm(self) end
            frames(18750)
            local waitingAttempts = attempts
            proposal()
            frames(3750)
            return missingOpens .. "|" .. waitingAttempts .. "|" .. tostring(FarmDashboard._missionLoadNotified) .. "|" .. LOADS .. "|" .. count("waiting for dashboard identity")
        `);
        expect(result).toBe("0|8|true|1|1");
    });

    const watchRoot = `
            local rootTouches = 0
            local baseLoad, baseExists = ENGINE.loadXMLFile, ENGINE.fileExists
            ENGINE.loadXMLFile = function(n, p)
                if string.find(p, ROOT, 1, true) == 1 then rootTouches = rootTouches + 1 end
                return baseLoad(n, p)
            end
            ENGINE.fileExists = function(p)
                if string.find(p, ROOT, 1, true) == 1 then rootTouches = rootTouches + 1 end
                return baseExists(p)
            end
    `;

    test("N16 [discriminator] a dedicated server owns its career identity, saves it with the savegame and reuses it after restart", () => {
        const result = run("inherited", watchRoot + `
            ENGINE.g_dedicatedServer = {}
            local dir = "profile/savegame7"
            local info = newInfo(dir)
            mission(info)
            local armed = FarmDashboard:armMission()
            local s = FarmDashboardCareerIdentity.status()
            local firstCareer, firstSession = s.careerId, s.sessionId
            local careerOk = string.match(firstCareer, "^fd%-[a-f0-9]+%-1$") ~= nil and #firstCareer == 21
            local sesOk = string.match(firstSession, "^ses%-[a-f0-9]+%-1$") ~= nil and #firstSession == 22
            local tokOk = string.match(s.sessionToken, "^tok%-[a-f0-9]+%-1$") ~= nil
            local provisional = tostring(s.persisted)
            info.xmlFile = createXMLFile("careerSavegameXML", dir .. "/careerSavegame.xml", "careerSavegame")
            local saved = FarmDashboardCareerIdentity.onCareerSaved(info)
            saveXMLFile(info.xmlFile)
            local confirmed = FarmDashboardCareerIdentity.noteSaveComplete(0, dir)
            local onDisk = disk(dir .. "/careerSavegame.xml")
            FarmDashboardCareerIdentity.rotateSession()
            local rotated = FarmDashboardCareerIdentity.status().sessionId
            local expectedRotated = string.gsub(firstSession, "%-1$", "-2")
            FarmDashboard:deleteMap()
            mission(loadedInfo(dir, onDisk))
            local again = FarmDashboard:armMission()
            local s2 = FarmDashboardCareerIdentity.status()
            FarmDashboard:deleteMap()
            mission(newInfo("profile/savegame8"))
            FarmDashboard:armMission()
            local other = FarmDashboardCareerIdentity.status().careerId
            return table.concat({
                tostring(armed), tostring(careerOk), tostring(sesOk), tostring(tokOk), provisional,
                tostring(saved), tostring(confirmed), tostring(onDisk == firstCareer), tostring(rotated == expectedRotated),
                tostring(again), tostring(s2.careerId == firstCareer), tostring(s2.persisted), tostring(s2.sessionId ~= firstSession),
                tostring(other ~= firstCareer and string.match(other, "^fd%-[a-f0-9]+%-1$") ~= nil),
                tostring(rootTouches), tostring(#ENG.writes), tostring(LOADS), tostring(count("owned by this server")), tostring(count("W ")),
            }, "|")
        `);
        expect(result).toBe("true|true|true|true|false|true|true|true|true|true|true|true|true|true|0|1|3|3|0");
    });

    test("N17 [discriminator] a dedicated server never reads or writes the desktop proposal or allocator files", () => {
        const result = run("inherited", watchRoot + `
            ENGINE.g_dedicatedServer = {}
            proposal()
            adopted(3)
            FarmDashboard.readyAt = 0
            mission(newInfo("profile/savegame5"))
            frames(3000)
            local s = FarmDashboardCareerIdentity.status()
            return tostring(FarmDashboard._missionLoadNotified) .. "|" .. tostring(string.find(s.careerId, NS, 1, true) == nil) .. "|" .. rootTouches .. "|" .. #ENG.writes .. "|" .. disk(ROOT .. "allocator-a.xml") .. "|" .. LOADS
        `);
        expect(result).toBe("true|true|0|0|3|1");
    });

    test("N18 [discriminator] an MP host keeps the desktop proposal flow unchanged", () => {
        const result = run("inherited", `
            ENGINE.g_server = { getIsServer = function() return true end }
            local m = mission(newInfo("profile/savegame5"))
            m.missionDynamicInfo = { isMultiplayer = true }
            local waiting = FarmDashboard:armMission()
            local w = st()
            proposal()
            local armed = FarmDashboard:armMission()
            return tostring(waiting) .. "|" .. w .. "|" .. tostring(armed) .. "|" .. st() .. "|" .. count("owned by this server")
        `);
        expect(result).toBe(`false|waiting,waiting,false,true,false,false|true|${FD3},${SES1},false,false,false,false|0`);
    });
});
