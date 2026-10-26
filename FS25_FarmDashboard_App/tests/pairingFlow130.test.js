"use strict";

/**
 * FARMHUB-20261006-PAIRING-FLOW-130: confirm once per server. Real modDesc sources on a dedicated server and
 * joined clients with clean profiles (no replicaSources.xml). "Approve" below writes the row the desktop app
 * publishes after Link this server; the app side of that publish is covered in pairingFlow130App.test.js.
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");
const { runDedicated, DEDICATED_PRELUDE } = require("./helpers/dedicatedHarness");

const repoRoot = path.resolve(__dirname, "../..");
const pairingSource = path.join(repoRoot, "FS25_FarmDashboard_Mod/src/FarmDashboardReplicaPairing.lua");
const observedConfig = path.join(repoRoot, "Pipeline/runs/FARMHUB-20261006-DEDICATED-CODEX/server-config.xml");
const FALLBACK_CONFIG = `<farmDashboard>
    <settings enabled="true" updateInterval="10000" collectionCycleMs="60000" diagnostics="false" useStateMachine_economy="false" useStateMachine_fields="false" useStateMachine_production="false" postLoadCollectionGraceSec="45" sliceBudgetMs="4" jsonTopLevelKeysPerFrame="1"/>
    <modules vehicles="true" fields="true" weather="true" economy="true" animals="true" production="true" finance="true"/>
</farmDashboard>`;
const configXml = fs.existsSync(observedConfig) ? fs.readFileSync(observedConfig, "utf8") : FALLBACK_CONFIG;

function run(body) {
    return JSON.parse(runDedicated({ configXml, vehicles: 8, script: DEDICATED_PRELUDE + HELPERS + body }));
}

const HELPERS = `
local function enc(v)
    local t = type(v)
    if t == "table" then
        if next(v) == nil then return "[]" end
        local parts = {}
        if #v > 0 then
            for i = 1, #v do parts[#parts + 1] = enc(v[i]) end
            return "[" .. table.concat(parts, ",") .. "]"
        end
        for k, x in pairs(v) do parts[#parts + 1] = string.format("%q", tostring(k)) .. ":" .. enc(x) end
        return "{" .. table.concat(parts, ",") .. "}"
    elseif t == "number" or t == "boolean" then return tostring(v)
    elseif v == nil then return "null" end
    return string.format("%q", tostring(v))
end
local DASH = "modSettings/FS25_FarmDashboard/"
local function gen(f) return tonumber(f and f["farmDashboardExport#exportGeneration"]) or 0 end
local function pending(c)
    local f = FILES[c.E.PROFILE .. DASH .. "replicaPending.xml"]
    if f == nil then return nil end
    local out = {}
    for k, v in pairs(f) do out[string.match(k, "#(.+)$")] = v end
    return out
end
local function rows(path, root, row, fields)
    local f = FILES[path] or {}
    local out = {}
    for i = 0, 99 do
        local base = string.format("%s.%s(%d)#", root, row, i)
        if f[base .. fields[1]] == nil then break end
        local r = {}
        for _, n in ipairs(fields) do r[n] = f[base .. n] end
        out[#out + 1] = r
    end
    return out
end
local function trust(c) return rows(c.E.PROFILE .. DASH .. "replicaTrust.xml", "farmDashboardReplicaTrust", "link", { "sourceId", "careerId", "keyId", "key" }) end
local function serverKeys(S) return rows(S.E.PROFILE .. DASH .. "replicaClients.xml", "farmDashboardReplicaClients", "client", { "keyId", "key", "careerId" }) end
local function sources(c) return rows(c.E.PROFILE .. DASH .. "replicaSources.xml", "farmDashboardReplicaSources", "source", { "sourceId", "remoteSlot", "serverKey" }) end
-- What the desktop app publishes after Link this server: one more row carrying this join's token.
local function approve(c, sourceId, p)
    local path = c.E.PROFILE .. DASH .. "replicaSources.xml"
    local f = FILES[path] or {}
    local n = #sources(c)
    local base = string.format("farmDashboardReplicaSources.source(%d)#", n)
    f[base .. "sourceId"] = sourceId
    f[base .. "remoteSlot"] = p.sourceSlot
    f[base .. "serverKey"] = p.serverKey
    FILES[path] = f
end
local function sourceDirs(c)
    local seen, out = {}, {}
    local prefix = c.E.PROFILE .. DASH .. "replicas/"
    for p in pairs(FILES) do
        if string.sub(p, 1, #prefix) == prefix then
            local dir = string.match(string.sub(p, #prefix + 1), "^([^/]+)/")
            if dir and not seen[dir] then seen[dir] = true; out[#out + 1] = dir end
        end
    end
    table.sort(out)
    return out
end
local function logsContain(text)
    local logs = { ENGINE.LOG }
    for _, c in ipairs(clients) do logs[#logs + 1] = c.E.LOG end
    for _, s in ipairs(extraServers) do logs[#logs + 1] = s.E.LOG end
    for _, log in ipairs(logs) do
        for _, line in ipairs(log) do
            if string.find(line, text, 1, true) then return true end
        end
    end
    return false
end
local function settle(c) runUntil(function() return not c.M.FarmDashboardExportMirror:hasReceiveWork() end, 300, 16) end
-- After pairing, exercise the real mirror sender/receivers without collecting
-- another gameplay generation that can replace an intentionally injected replay.
local function mirrorOnlyUntil(pred, maxFrames, dt)
    for i = 1, maxFrames do
        ENGINE.g_time = ENGINE.g_time + (dt or 100)
        SERVER.E.g_time = ENGINE.g_time
        SERVER.M.FarmDashboardExportMirror:update(dt or 100)
        for _, s in ipairs(extraServers) do
            s.E.g_time = ENGINE.g_time
            s.M.FarmDashboardExportMirror:update(dt or 100)
        end
        for _, c in ipairs(clients) do
            c.E.g_time = ENGINE.g_time
            c.M.FarmDashboardExportMirror:update(dt or 100)
        end
        if pred() then return i end
    end
    return nil
end
local function linkFirstTime(name, sourceId)
    local c = joinClient(name, nil)
    runUntil(function() return pending(c) ~= nil end, 200, 100)
    local p = pending(c)
    approve(c, sourceId, p)
    runUntil(function() return replicaOf(c, sourceId) ~= nil end, 300, 100)
    settle(c)
    return c, p
end
`;

jest.setTimeout(300000);

describe("confirm once per server (130)", () => {
    test("first join stores nothing and asks; approval links in the same session at generation N then N+1", () => {
        const r = run(`
bootLikeServerLog()
runUntil(function() return commitsLogged() >= 1 end, 200, 100)
local careerId = FarmDashboardCareerIdentity.status().careerId
local c = joinClient("clientA", nil)
local asked = runUntil(function() return pending(c) ~= nil end, 200, 100)
local p = pending(c)
for i = 1, 60 do frame(100) end
local waitingDirs = sourceDirs(c)
local waitingState = c.M.FarmDashboardReplicaPairing:clientState()
local waitingPrompts = #grep(c.E.LOG, "not linked on this PC")
approve(c, "mp-0a1b2c3d4e5f", p)
local bound = runUntil(function() return replicaOf(c, "mp-0a1b2c3d4e5f") ~= nil end, 300, 100)
settle(c)
local firstGen = gen(replicaOf(c, "mp-0a1b2c3d4e5f"))
local advanced = runUntil(function() return gen(replicaOf(c, "mp-0a1b2c3d4e5f")) > firstGen end, 400, 100)
settle(c)
local t = trust(c)
local k = serverKeys(SERVER)
local _, selected = replicaOf(c, "mp-0a1b2c3d4e5f")
return enc({
    careerId = careerId,
    asked = asked or -1,
    pendingFields = p,
    checkOk = p.check == c.M.FarmDashboardReplicaPairing.pendingCheck(p),
    waitingDirs = waitingDirs,
    waitingState = waitingState,
    waitingPrompts = waitingPrompts,
    bound = bound or -1,
    firstGen = firstGen,
    secondGen = gen(replicaOf(c, "mp-0a1b2c3d4e5f")),
    advanced = advanced or -1,
    selected = selected ~= nil,
    dirs = sourceDirs(c),
    pendingAfter = pending(c) ~= nil,
    state = c.M.FarmDashboardReplicaPairing:clientState(),
    trustCount = #t,
    trustSource = t[1] and t[1].sourceId,
    trustCareer = t[1] and t[1].careerId,
    serverKeyCount = #k,
    keysMatch = t[1] ~= nil and k[1] ~= nil and t[1].keyId == k[1].keyId and t[1].key == k[1].key,
    keyInLogs = t[1] ~= nil and logsContain(t[1].key),
    tokenInLogs = logsContain(p.serverKey),
    clientErrors = c.E.LOAD_ERRORS,
    engineErrors = ENGINE_ERRORS,
})
`);
        expect(r.clientErrors).toEqual([]);
        expect(r.asked).toBeGreaterThan(0);
        expect(Object.keys(r.pendingFields).sort()).toEqual(
            ["careerId", "check", "mapTitle", "pendingId", "schema", "serverKey", "serverName", "sourceSlot"]);
        expect(r.pendingFields.schema).toBe("1");
        expect(r.pendingFields.careerId).toBe(r.careerId);
        expect(r.pendingFields.serverKey).toBe("join-clientA");
        expect(r.pendingFields.mapTitle).toBe("Witcombe");
        expect(r.pendingFields.pendingId).toMatch(/^[0-9a-f]{16}$/);
        expect(r.checkOk).toBe(true);
        expect(r.waitingDirs).toEqual([]);
        expect(r.waitingState).toBe("pending");
        expect(r.waitingPrompts).toBe(1);
        expect(r.bound).toBeGreaterThan(0);
        expect(r.firstGen).toBeGreaterThanOrEqual(1);
        expect(r.advanced).toBeGreaterThan(0);
        expect(r.secondGen).toBeGreaterThan(r.firstGen);
        expect(r.selected).toBe(true);
        expect(r.dirs).toEqual(["mp-0a1b2c3d4e5f"]);
        expect(r.pendingAfter).toBe(false);
        expect(r.state).toBe("bound");
        expect(r.trustCount).toBe(1);
        expect(r.trustSource).toBe("mp-0a1b2c3d4e5f");
        expect(r.trustCareer).toBe(r.careerId);
        expect(r.serverKeyCount).toBe(1);
        expect(r.keysMatch).toBe(true);
        expect(r.keyInLogs).toBe(false);
        expect(r.tokenInLogs).toBe(false);
        expect(r.engineErrors).toEqual([]);
    });

    test("decline (no approval, then leave) stores nothing anywhere and removes the pending record", () => {
        const r = run(`
bootLikeServerLog()
runUntil(function() return commitsLogged() >= 1 end, 200, 100)
local c = joinClient("clientD", nil)
runUntil(function() return pending(c) ~= nil end, 200, 100)
local hadPending = pending(c) ~= nil
for i = 1, 40 do frame(100) end
leaveClient(c)
runUntil(function() return commitsLogged() >= 3 end, 400, 100)
return enc({
    hadPending = hadPending,
    pendingAfter = pending(c) ~= nil,
    dirs = sourceDirs(c),
    trust = #trust(c),
    sources = FILES[c.E.PROFILE .. DASH .. "replicaSources.xml"] ~= nil,
    serverKeys = #serverKeys(SERVER),
    registers = (function() local n = 0 for _, e in ipairs(PAIRING_SENT) do if e.kind == 2 then n = n + 1 end end return n end)(),
})
`);
        expect(r.hadPending).toBe(true);
        expect(r.pendingAfter).toBe(false);
        expect(r.dirs).toEqual([]);
        expect(r.trust).toBe(0);
        expect(r.sources).toBe(false);
        expect(r.serverKeys).toBe(0);
        expect(r.registers).toBe(0);
    });

    test("writes stop on leave; a rejoin with a rotated platformSessionId is verified by proof and advances the same source", () => {
        const r = run(`
bootLikeServerLog()
runUntil(function() return commitsLogged() >= 1 end, 200, 100)
local c, p = linkFirstTime("clientR", "mp-111111111111")
local genAtLeave = gen(replicaOf(c, "mp-111111111111"))
leaveClient(c)
local before = commitsLogged()
runUntil(function() return commitsLogged() >= before + 2 end, 400, 100)
local genAfterLeave = gen(replicaOf(c, "mp-111111111111"))
PAIRING_SENT = {}
reconnectClient(c)
local token2 = c.E.g_currentMission.missionDynamicInfo.platformSessionId
local stateAfterJoin = c.M.FarmDashboardReplicaPairing:clientState()
local advanced = runUntil(function() return gen(replicaOf(c, "mp-111111111111")) > genAfterLeave end, 400, 100)
settle(c)
local kinds = {}
for _, e in ipairs(PAIRING_SENT) do kinds[#kinds + 1] = e.kind end
return enc({
    token1 = p.serverKey,
    token2 = token2,
    tokenStillListed = (function() for _, s in ipairs(sources(c)) do if s.serverKey == token2 then return true end end return false end)(),
    genAtLeave = genAtLeave,
    genAfterLeave = genAfterLeave,
    stateAfterJoin = stateAfterJoin,
    advanced = advanced or -1,
    genNow = gen(replicaOf(c, "mp-111111111111")),
    kinds = kinds,
    verified = #grep(c.E.LOG, "linked server verified; storing under replicas/mp%-111111111111/"),
    pendingAfter = pending(c) ~= nil,
    dirs = sourceDirs(c),
    trust = #trust(c),
    serverKeys = #serverKeys(SERVER),
    prompts = #grep(c.E.LOG, "not linked on this PC"),
    engineErrors = ENGINE_ERRORS,
})
`);
        expect(r.token2).not.toBe(r.token1);
        expect(r.tokenStillListed).toBe(false);
        expect(r.genAtLeave).toBeGreaterThanOrEqual(1);
        expect(r.genAfterLeave).toBe(r.genAtLeave);
        expect(r.stateAfterJoin).toBe("bound");
        expect(r.kinds).toEqual([1, 3]);
        expect(r.verified).toBe(1);
        expect(r.advanced).toBeGreaterThan(0);
        expect(r.genNow).toBeGreaterThan(r.genAfterLeave);
        expect(r.pendingAfter).toBe(false);
        expect(r.dirs).toEqual(["mp-111111111111"]);
        expect(r.trust).toBe(1);
        expect(r.serverKeys).toBe(1);
        expect(r.prompts).toBe(1);
        expect(r.engineErrors).toEqual([]);
    });

    test("spoofed servers (same career ID, no key or a replayed proof) are asked about again and never write the linked folder", () => {
        const r = run(`
bootLikeServerLog()
runUntil(function() return commitsLogged() >= 1 end, 200, 100)
local careerId = FarmDashboardCareerIdentity.status().careerId
local c = linkFirstTime("clientS", "mp-222222222222")
local linkedGen = gen(replicaOf(c, "mp-222222222222"))
local goodProof = nil
leaveClient(c)
PAIRING_SENT = {}
reconnectClient(c)
for _, e in ipairs(PAIRING_SENT) do if e.kind == 3 and e.d ~= "" then goodProof = e end end
settle(c)
linkedGen = gen(replicaOf(c, "mp-222222222222"))
leaveClient(c)

-- Spoof 1: another server claiming the same career ID, holding no key for this PC.
local S2 = addServer("spoof")
local status2 = S2.M.FarmDashboardCareerIdentity.status
S2.M.FarmDashboardCareerIdentity.status = function(...)
    local s = status2(...)
    local copy = {}
    for k, v in pairs(s) do copy[k] = v end
    copy.careerId = careerId
    return copy
end
runUntil(function() return #grep(S2.E.LOG, "export committed generation=") >= 1 end, 400, 100)
reconnectClient(c, nil, S2)
runUntil(function() return pending(c) ~= nil end, 200, 100)
local spoof1 = {
    state = c.M.FarmDashboardReplicaPairing:clientState(),
    pending = pending(c) ~= nil,
    refused = #grep(c.E.LOG, "could not prove an earlier link"),
}
for i = 1, 40 do frame(100) end
spoof1.dirs = sourceDirs(c)
spoof1.linkedGen = gen(replicaOf(c, "mp-222222222222"))
leaveClient(c)

-- Spoof 2: the same server replays the proof captured from the earlier verified join.
PAIRING_TAMPER = function(event, toM)
    if toM == c.M and event.kind == 3 and goodProof then
        event.b, event.c, event.d = goodProof.b, goodProof.c, goodProof.d
    end
end
reconnectClient(c, nil, S2)
runUntil(function() return pending(c) ~= nil end, 200, 100)
local spoof2 = {
    state = c.M.FarmDashboardReplicaPairing:clientState(),
    pending = pending(c) ~= nil,
    refused = #grep(c.E.LOG, "could not prove an earlier link"),
}
for i = 1, 40 do frame(100) end
spoof2.dirs = sourceDirs(c)
spoof2.linkedGen = gen(replicaOf(c, "mp-222222222222"))
PAIRING_TAMPER = nil
return enc({
    careerId = careerId,
    goodProof = goodProof ~= nil,
    linkedGen = linkedGen,
    spoof1 = spoof1,
    spoof2 = spoof2,
    spoofKeys = #serverKeys(S2),
    trust = #trust(c),
    engineErrors = ENGINE_ERRORS,
})
`);
        expect(r.goodProof).toBe(true);
        expect(r.linkedGen).toBeGreaterThanOrEqual(1);
        for (const s of [r.spoof1, r.spoof2]) {
            expect(s.state).toBe("pending");
            expect(s.pending).toBe(true);
            expect(s.dirs).toEqual(["mp-222222222222"]);
            expect(s.linkedGen).toBe(r.linkedGen);
        }
        expect(r.spoof1.refused).toBe(1);
        expect(r.spoof2.refused).toBe(2);
        expect(r.spoofKeys).toBe(0);
        expect(r.trust).toBe(1);
        expect(r.engineErrors).toEqual([]);
    });

    test("two servers with the same career ID keep separate folders and freshness; a save switch while linked is held, not stored", () => {
        const r = run(`
bootLikeServerLog()
runUntil(function() return commitsLogged() >= 1 end, 200, 100)
local careerId = FarmDashboardCareerIdentity.status().careerId
local a = linkFirstTime("clientT", "mp-aaaaaaaaaaaa")
local genA = gen(replicaOf(a, "mp-aaaaaaaaaaaa"))

-- Same-career second server, approved separately by the user: its own desktop source ID.
local S2 = addServer("twin")
local status2 = S2.M.FarmDashboardCareerIdentity.status
S2.M.FarmDashboardCareerIdentity.status = function(...)
    local s = status2(...)
    local copy = {}
    for k, v in pairs(s) do copy[k] = v end
    copy.careerId = careerId
    return copy
end
runUntil(function() return #grep(S2.E.LOG, "export committed generation=") >= 1 end, 400, 100)
settle(a)
genA = gen(replicaOf(a, "mp-aaaaaaaaaaaa"))
leaveClient(a)
reconnectClient(a, nil, S2)
runUntil(function() return pending(a) ~= nil end, 200, 100)
approve(a, "mp-bbbbbbbbbbbb", pending(a))
runUntil(function() return replicaOf(a, "mp-bbbbbbbbbbbb") ~= nil end, 300, 100)
settle(a)
local dirsAfterTwin = sourceDirs(a)
local genAAfterTwin = gen(replicaOf(a, "mp-aaaaaaaaaaaa"))

-- Server save switch while linked: the stream now claims another career.
leaveClient(a)
reconnectClient(a, nil, SERVER)
settle(a)
local genBeforeSwitch = gen(replicaOf(a, "mp-aaaaaaaaaaaa"))
local drainedBeforeSwitch = mirrorOnlyUntil(function()
    return SERVER.M.FarmDashboardExportMirror._job == nil
        and SERVER.M.FarmDashboardExportMirror._pendingJob == nil
end, 500, 100)
local switched = {}
for k, v in pairs(FarmDashboardExportMirror._latestCommitted) do switched[k] = v end
switched.careerId = "fd-00000000000000ff-1"
FarmDashboardExportMirror._latestCommitted = switched
FarmDashboardExportMirror:onClientJoined(a.toClient)
-- The paced mirror may wait for an in-flight stream plus its 15 s settle gap.
-- Observe the actual rejection, with a bounded 50 s simulated-time limit.
local sawMismatch = mirrorOnlyUntil(function()
    return a.M.FarmDashboardExportMirror._lastReplicaOutcome == "career-mismatch"
end, 500, 100) ~= nil
return enc({
    careerId = careerId,
    genA = genA,
    dirsAfterTwin = dirsAfterTwin,
    genAAfterTwin = genAAfterTwin,
    twinCareer = replicaOf(a, "mp-bbbbbbbbbbbb")["farmDashboardExport#careerId"],
    trust = (function() local out = {} for _, t in ipairs(trust(a)) do out[#out + 1] = t.sourceId end table.sort(out) return out end)(),
    reboundA = #grep(a.E.LOG, "linked server verified; storing under replicas/mp%-aaaaaaaaaaaa/"),
    sawMismatch = sawMismatch,
    careerAfterSwitch = replicaOf(a, "mp-aaaaaaaaaaaa")["farmDashboardExport#careerId"],
    genBeforeSwitch = genBeforeSwitch,
    drainedBeforeSwitch = drainedBeforeSwitch,
    engineErrors = ENGINE_ERRORS,
})
`);
        expect(r.dirsAfterTwin).toEqual(["mp-aaaaaaaaaaaa", "mp-bbbbbbbbbbbb"]);
        expect(r.genAAfterTwin).toBe(r.genA);
        expect(r.twinCareer).toBe(r.careerId);
        expect(r.trust).toEqual(["mp-aaaaaaaaaaaa", "mp-bbbbbbbbbbbb"]);
        expect(r.reboundA).toBe(1);
        expect(r.drainedBeforeSwitch).not.toBeNull();
        expect(r.sawMismatch).toBe(true);
        expect(r.careerAfterSwitch).toBe(r.careerId);
        expect(r.engineErrors).toEqual([]);
    });

    test("an older generation replayed to a linked client is refused and the last good replica stays", () => {
        const r = run(`
bootLikeServerLog()
runUntil(function() return commitsLogged() >= 1 end, 200, 100)
local old = {}
for k, v in pairs(FarmDashboardExportMirror._latestCommitted) do old[k] = v end
local c = linkFirstTime("clientO", "mp-333333333333")
runUntil(function() return gen(replicaOf(c, "mp-333333333333")) >= 2 end, 400, 100)
settle(c)
local before = gen(replicaOf(c, "mp-333333333333"))
local drainedBeforeReplay = mirrorOnlyUntil(function()
    return SERVER.M.FarmDashboardExportMirror._job == nil
        and SERVER.M.FarmDashboardExportMirror._pendingJob == nil
end, 500, 100)
FarmDashboardExportMirror._latestCommitted = old
FarmDashboardExportMirror:onClientJoined(c.toClient)
local lowest = before
-- Wait for the replay stream to reach the client at the production byte rate.
local sawRollback = mirrorOnlyUntil(function()
    local g = gen(replicaOf(c, "mp-333333333333"))
    if g < lowest then lowest = g end
    return c.M.FarmDashboardExportMirror._lastReplicaOutcome == "sequence-rollback"
end, 500, 100) ~= nil
return enc({ before = before, drainedBeforeReplay = drainedBeforeReplay, sawRollback = sawRollback, lowest = lowest })
`);
        expect(r.before).toBeGreaterThanOrEqual(2);
        expect(r.drainedBeforeReplay).not.toBeNull();
        expect(r.sawRollback).toBe(true);
        expect(r.lowest).toBe(r.before);
    });

    test("a saved server whose row matches this join binds without a prompt and registers for later renewal", () => {
        const r = run(`
bootLikeServerLog()
runUntil(function() return commitsLogged() >= 1 end, 200, 100)
local c = joinClient("clientE", { sourceId = "pc-a", remoteSlot = "savegame1", serverKey = "join-key-a" })
local joined = runUntil(function() return replicaOf(c, "pc-a") ~= nil end, 200, 100)
settle(c)
leaveClient(c)
reconnectClient(c)
local before = gen(replicaOf(c, "pc-a"))
local advanced = runUntil(function() return gen(replicaOf(c, "pc-a")) > before end, 400, 100)
return enc({
    joined = joined or -1,
    advanced = advanced or -1,
    prompts = #grep(c.E.LOG, "not linked on this PC"),
    pendingEver = (function() for _, p in ipairs(DELETED) do if string.find(p, "/clientE/.*replicaPending") then return true end end return false end)(),
    trust = #trust(c),
    verified = #grep(c.E.LOG, "linked server verified"),
})
`);
        expect(r.joined).toBeGreaterThan(0);
        expect(r.advanced).toBeGreaterThan(0);
        expect(r.prompts).toBe(0);
        expect(r.trust).toBe(1);
        expect(r.verified).toBe(1);
    });

    test("hostile pairing input: path-like IDs, oversized, malformed, misdirected or flooded messages are dropped", () => {
        const r = run(`
bootLikeServerLog()
runUntil(function() return commitsLogged() >= 1 end, 200, 100)
local c = bootMachine({ server = false, profile = "/clientH/", platformSessionId = "join-h" })
c.M.FarmDashboard:loadMap()
local P = c.M.FarmDashboardReplicaPairing
local conn = { getIsServer = function() return true end, sendEvent = function() end }
P:onJoin(conn)
P:beginUnpaired(conn)
local results = {}
for _, meta in ipairs({
    { careerId = "../evil", sourceSlot = "savegame1" },
    { careerId = "fd-0000000000000001-1", sourceSlot = "..\\\\x" },
    { careerId = "fd/x", sourceSlot = "savegame1" },
    { careerId = string.rep("a", 65), sourceSlot = "savegame1" },
    { careerId = nil, sourceSlot = "savegame1" },
}) do
    P:noteUnboundHeader(conn, meta)
    results[#results + 1] = FILES["/clientH/" .. DASH .. "replicaPending.xml"] ~= nil
end
local label = P._label('Big <Farm> "&" ' .. string.char(1, 2, 9) .. string.rep("\\195\\169", 60))
local labelUtf8 = string.match(label, "^[%z\\1-\\127\\194-\\244][\\128-\\191]*") ~= nil

-- Client side: a PROOF from a connection that is not the server, and a server-only kind from the server.
local notServer = { getIsServer = function() return false end }
c.M.FarmDashboardPairingEvent.new(3, "register", "0123456789abcdef", "fd-0000000000000001-1", string.rep("0", 64)):run(notServer)
c.M.FarmDashboardPairingEvent.new(2, string.rep("a", 32), "0123456789abcdef", string.rep("b", 64)):run(conn)

-- Server side: malformed, oversized, client-only kind and flood.
local S = SERVER.M
local sent = {}
local cconn = { getIsServer = function() return false end, sendEvent = function(_, e) sent[#sent + 1] = e.kind end }
S.FarmDashboardPairingEvent.new(2, string.rep("a", 32), "0123456789abcdef", "not-hex"):run(cconn)
S.FarmDashboardPairingEvent.new(2, "short", "0123456789abcdef", string.rep("b", 64)):run(cconn)
S.FarmDashboardPairingEvent.new(3, "renew", "0123456789abcdef", "x", "y"):run(cconn)
local big = S.FarmDashboardPairingEvent.new(1, string.rep("a", 32), string.rep("0", 272))
big:writeStream("big", cconn)
local incoming = S.FarmDashboardPairingEvent.emptyNew()
incoming:readStream("big", cconn)
local sentAfterBad = #sent
for i = 1, 5 do S.FarmDashboardPairingEvent.new(1, string.rep("c", 32), "0123456789abcdef"):run(cconn) end
local flood = #sent
ENGINE.g_time = ENGINE.g_time + 3500
S.FarmDashboardPairingEvent.new(1, string.rep("d", 32), "0123456789abcdef"):run(cconn)
return enc({
    results = results,
    label = label,
    labelBytes = #label,
    labelUtf8 = labelUtf8,
    clientTrust = FILES["/clientH/" .. DASH .. "replicaTrust.xml"] ~= nil,
    clientServerFile = FILES["/clientH/" .. DASH .. "replicaClients.xml"] ~= nil,
    serverKeys = #serverKeys(SERVER),
    sentAfterBad = sentAfterBad,
    oversizedRejected = incoming.rejected == true,
    flood = flood,
    afterWindow = #sent,
})
`);
        expect(r.results).toEqual([false, false, false, false, false]);
        expect(r.label).not.toMatch(/[<>"&\u0000-\u001f]/);
        expect(Buffer.byteLength(r.label, "latin1")).toBeLessThanOrEqual(80);
        expect(r.labelBytes).toBeLessThanOrEqual(80);
        expect(r.labelUtf8).toBe(true);
        expect(r.clientTrust).toBe(false);
        expect(r.clientServerFile).toBe(false);
        expect(r.serverKeys).toBe(0);
        expect(r.sentAfterBad).toBe(0);
        expect(r.oversizedRejected).toBe(true);
        expect(r.flood).toBe(1);
        expect(r.afterWindow).toBe(2);
    });
});

function runPairingLua(script) {
    const L = lauxlib.luaL_newstate();
    try {
        lualib.luaL_openlibs(L);
        const src = fs.readFileSync(pairingSource, "utf8");
        const chunk = `${src}\n${script}`;
        if (lauxlib.luaL_dostring(L, to_luastring(chunk)) !== lua.LUA_OK) {
            throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
        }
        return to_jsstring(lua.lua_tostring(L, -1));
    } finally {
        lua.lua_close(L);
    }
}

describe("pure-Lua SHA-256 / HMAC-SHA256 match Node crypto", () => {
    const messages = ["", "abc", "a".repeat(55), "a".repeat(56), "a".repeat(64), "a".repeat(1000),
        "FDPAIR1|renew|0123456789abcdef0123456789abcdef|fd-1a2b3c4d5e6f7a8b-1", "\u00e9\u00e8 farm"];
    test.each(messages.map((m) => [m]))("sha256 of %#", (m) => {
        const bytes = [...Buffer.from(m, "utf8")];
        const parts = [];
        for (let i = 0; i < bytes.length; i += 200) parts.push(`string.char(${bytes.slice(i, i + 200).join(",")})`);
        const expr = parts.length ? parts.join(" .. ") : '""';
        const out = runPairingLua(`return FarmDashboardReplicaPairing.toHex(FarmDashboardReplicaPairing.sha256(${expr}))`);
        expect(out).toBe(crypto.createHash("sha256").update(Buffer.from(m, "utf8")).digest("hex"));
    });
    test("hmac with 32-byte, short and 100-byte keys", () => {
        const keys = ["00".repeat(32), "0b".repeat(20), "aa".repeat(100), crypto.randomBytes(32).toString("hex")];
        for (const key of keys) {
            for (const m of messages) {
                if (/[^\x20-\x7e]/.test(m)) continue;
                const out = runPairingLua(`return FarmDashboardReplicaPairing.hmacSha256Hex(${JSON.stringify(key)}, ${JSON.stringify(m)})`);
                expect(out).toBe(crypto.createHmac("sha256", Buffer.from(key, "hex")).update(m).digest("hex"));
            }
        }
    });
    test("random IDs are lowercase hex of the requested length and differ", () => {
        const out = runPairingLua(`
local a, b = FarmDashboardReplicaPairing._randomHex(32), FarmDashboardReplicaPairing._randomHex(32)
return a .. "|" .. b .. "|" .. FarmDashboardReplicaPairing._randomHex(8)`).split("|");
        expect(out[0]).toMatch(/^[0-9a-f]{64}$/);
        expect(out[1]).toMatch(/^[0-9a-f]{64}$/);
        expect(out[0]).not.toBe(out[1]);
        expect(out[2]).toMatch(/^[0-9a-f]{16}$/);
    });
});
