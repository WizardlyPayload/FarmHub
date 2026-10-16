"use strict";

/**
 * FARMHUB-20261006-PAIRING-REVIEW-132 (game side): every retained link (up to MAX_TRUST = 16) is offered in the
 * renewal challenge, so the 9th and 16th linked servers reconnect after a rotated platformSessionId without a
 * second prompt. Same-career twins stay separate; hostile challenge lists are dropped without a proof.
 */
const fs = require("fs");
const path = require("path");
const { runDedicated, DEDICATED_PRELUDE } = require("./helpers/dedicatedHarness");

const repoRoot = path.resolve(__dirname, "../..");
const observedConfig = path.join(repoRoot, "Pipeline/runs/FARMHUB-20261006-DEDICATED-CODEX/server-config.xml");
const FALLBACK_CONFIG = `<farmDashboard>
    <settings enabled="true" updateInterval="10000" collectionCycleMs="60000" diagnostics="false" useStateMachine_economy="false" useStateMachine_fields="false" useStateMachine_production="false" postLoadCollectionGraceSec="45" sliceBudgetMs="4" jsonTopLevelKeysPerFrame="1"/>
    <modules vehicles="true" fields="true" weather="true" economy="true" animals="true" production="true" finance="true"/>
</farmDashboard>`;
const configXml = fs.existsSync(observedConfig) ? fs.readFileSync(observedConfig, "utf8") : FALLBACK_CONFIG;

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
local function rows(p, root, row, fields)
    local f = FILES[p] or {}
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
local function sources(c) return rows(c.E.PROFILE .. DASH .. "replicaSources.xml", "farmDashboardReplicaSources", "source", { "sourceId", "remoteSlot", "serverKey" }) end
local function approve(c, sourceId, p)
    local path = c.E.PROFILE .. DASH .. "replicaSources.xml"
    local f = FILES[path] or {}
    local base = string.format("farmDashboardReplicaSources.source(%d)#", #sources(c))
    f[base .. "sourceId"] = sourceId
    f[base .. "remoteSlot"] = p.sourceSlot
    f[base .. "serverKey"] = p.serverKey
    FILES[path] = f
end
local function settle(c) runUntil(function() return not c.M.FarmDashboardExportMirror:hasReceiveWork() end, 300, 16) end
local function idsOf(i) return string.format("mp-%012x", i) end
local function lastChallengeIds()
    local last = nil
    for _, e in ipairs(PAIRING_SENT) do if e.kind == 1 then last = e.b end end
    local n = 0
    if last then for _ in string.gmatch(last, "[^,]+") do n = n + 1 end end
    return n, last and #last or 0
end
local function sameCareer(S, careerId)
    local original = S.M.FarmDashboardCareerIdentity.status
    S.M.FarmDashboardCareerIdentity.status = function(...)
        local s = original(...)
        local copy = {}
        for k, v in pairs(s) do copy[k] = v end
        copy.careerId = careerId
        return copy
    end
end
-- Link the client to server S as a first-time join: prompt, approve, bind, wait for the stored renewal key.
local function link(c, S, sourceId, expectTrust)
    reconnectClient(c, nil, S)
    runUntil(function() return pending(c) ~= nil end, 200, 100)
    local p = pending(c)
    if p == nil then return false end
    approve(c, sourceId, p)
    runUntil(function() return replicaOf(c, sourceId) ~= nil and #trust(c) >= expectTrust end, 300, 100)
    settle(c)
    leaveClient(c)
    return replicaOf(c, sourceId) ~= nil and #trust(c) >= expectTrust
end
-- Rejoin S with a rotated token; returns what happened without approving anything.
local function rejoin(c, S, sourceId, watchOther)
    local promptsBefore = #grep(c.E.LOG, "not linked on this PC")
    local before = gen(replicaOf(c, sourceId))
    local otherBefore = watchOther and gen(replicaOf(c, watchOther)) or nil
    PAIRING_SENT = {}
    reconnectClient(c, nil, S)
    local challengeIds, challengeBytes = lastChallengeIds()
    local state = c.M.FarmDashboardReplicaPairing:clientState()
    local advanced = runUntil(function() return gen(replicaOf(c, sourceId)) > before end, 400, 100)
    settle(c)
    local out = {
        state = state,
        challengeIds = challengeIds,
        challengeBytes = challengeBytes,
        advanced = advanced ~= nil,
        prompts = #grep(c.E.LOG, "not linked on this PC") - promptsBefore,
        pending = pending(c) ~= nil,
        boundSource = c.M.FarmDashboardReplicaPairing._client and c.M.FarmDashboardReplicaPairing._client.sourceId,
        otherUnchanged = watchOther == nil or gen(replicaOf(c, watchOther)) == otherBefore,
    }
    leaveClient(c)
    return out
end
`;

function run(body) {
    return JSON.parse(runDedicated({ configXml, vehicles: 4, script: DEDICATED_PRELUDE + HELPERS + body }));
}

jest.setTimeout(900000);

describe("retained links 9-16 auto-renew (132)", () => {
    // The full 16-real-server run (each link a real prompt + approval + registration) is kept as evidence in
    // Pipeline/work/FARMHUB-20261006-PAIRING-REVIEW-132 (about 19 minutes). Here two real servers (one a
    // same-career twin) are linked for real; the other retained links are other servers' published rows and keys.
    test("the 9th and then the 16th linked server reconnect after a rotated token without a second prompt", () => {
        const r = run(`
bootLikeServerLog()
runUntil(function() return commitsLogged() >= 1 end, 200, 100)
local S1 = SERVER
local S2 = addServer("twin")
-- Server 2 claims server 1's career: a same-career twin approved separately.
sameCareer(S2, FarmDashboardCareerIdentity.status().careerId)
runUntil(function() return #grep(S2.E.LOG, "export committed generation=") >= 1 end, 400, 100)

local c = joinClient("clientN", nil)
leaveClient(c)
local linked = { link(c, S1, idsOf(1), 1), link(c, S2, idsOf(2), 2) }
-- Other linked servers: a published row and a newer trust entry each, as a real approval leaves them.
local seeded = 2
local function seedLinks(n)
    local P = c.M.FarmDashboardReplicaPairing
    for _ = 1, n do
        seeded = seeded + 1
        local sourceId = idsOf(seeded)
        approve(c, sourceId, { sourceSlot = "savegame1", serverKey = "other-" .. seeded })
        P:saveTrustEntry({ sourceId = sourceId, careerId = string.format("fd-%016x-1", seeded),
            keyId = P._randomHex(8), key = P._randomHex(32) })
    end
end
seedLinks(7)
local trustAfter9 = trust(c)
local pos1 = nil
for i, t in ipairs(trustAfter9) do if t.sourceId == idsOf(1) then pos1 = i end end
local ninth = rejoin(c, S1, idsOf(1), idsOf(2))

seedLinks(7)
local trustAfter16 = trust(c)
local pos2 = nil
for i, t in ipairs(trustAfter16) do if t.sourceId == idsOf(2) then pos2 = i end end
local sixteenth = rejoin(c, S2, idsOf(2), idsOf(1))
local trustAfterRenew = trust(c)
local stillHeld = {}
for _, t in ipairs(trustAfterRenew) do stillHeld[t.sourceId] = true end

-- An unregistered server (no key for this PC) still prompts and writes nothing.
local stranger = addServer("stranger")
runUntil(function() return #grep(stranger.E.LOG, "export committed generation=") >= 1 end, 400, 100)
local dirsBefore = 0
for p in pairs(FILES) do if string.find(p, "/clientN/" .. DASH .. "replicas/", 1, true) then dirsBefore = dirsBefore + 1 end end
PAIRING_SENT = {}
reconnectClient(c, nil, stranger)
local strangerIds = lastChallengeIds()
runUntil(function() return pending(c) ~= nil end, 300, 100)
for i = 1, 40 do frame(100) end
local dirsAfter = 0
for p in pairs(FILES) do if string.find(p, "/clientN/" .. DASH .. "replicas/", 1, true) then dirsAfter = dirsAfter + 1 end end
local strangerState = c.M.FarmDashboardReplicaPairing:clientState()
local strangerPending = pending(c) ~= nil
leaveClient(c)

-- Removing a linked server in the app (its row leaves replicaSources.xml) revokes renewal: rejoin prompts.
local kept = {}
for _, s in ipairs(sources(c)) do if s.sourceId ~= idsOf(1) then kept[#kept + 1] = s end end
local republished = {}
for i, s in ipairs(kept) do
    local base = string.format("farmDashboardReplicaSources.source(%d)#", i - 1)
    republished[base .. "sourceId"], republished[base .. "remoteSlot"], republished[base .. "serverKey"] = s.sourceId, s.remoteSlot, s.serverKey
end
FILES[c.E.PROFILE .. DASH .. "replicaSources.xml"] = republished
local revokedGen = gen(replicaOf(c, idsOf(1)))
reconnectClient(c, nil, S1)
runUntil(function() return pending(c) ~= nil end, 300, 100)
for i = 1, 40 do frame(100) end
local revoked = {
    state = c.M.FarmDashboardReplicaPairing:clientState(),
    pending = pending(c) ~= nil,
    genUnchanged = gen(replicaOf(c, idsOf(1))) == revokedGen,
}

local keyLogged = false
for _, t in ipairs(trust(c)) do
    for _, log in ipairs({ ENGINE.LOG, c.E.LOG }) do
        for _, line in ipairs(log) do if string.find(line, t.key, 1, true) then keyLogged = true end end
    end
end
return enc({
    linked = linked,
    trustAfter9 = #trustAfter9,
    pos1 = pos1,
    ninth = ninth,
    trustAfter16 = #trustAfter16,
    pos2 = pos2,
    sixteenth = sixteenth,
    trustAfterRenew = #trustAfterRenew,
    newestAfterRenew = trustAfterRenew[1] and trustAfterRenew[1].sourceId,
    allHeld = (function() for i = 1, 16 do if not stillHeld[idsOf(i)] then return false end end return true end)(),
    strangerIds = strangerIds,
    strangerState = strangerState,
    strangerPending = strangerPending,
    revoked = revoked,
    strangerWrote = dirsAfter - dirsBefore,
    keyLogged = keyLogged,
    clientErrors = c.E.LOAD_ERRORS,
    engineErrors = ENGINE_ERRORS,
})
`);
        expect(r.clientErrors).toEqual([]);
        expect(r.engineErrors).toEqual([]);
        expect(r.linked).toEqual([true, true]);

        expect(r.trustAfter9).toBe(9);
        expect(r.pos1).toBe(9);
        expect(r.ninth).toMatchObject({
            state: "bound", challengeIds: 9, advanced: true, prompts: 0, pending: false,
            boundSource: "mp-000000000001", otherUnchanged: true,
        });

        expect(r.trustAfter16).toBe(16);
        expect(r.pos2).toBe(16);
        expect(r.sixteenth).toMatchObject({
            state: "bound", challengeIds: 16, challengeBytes: 271, advanced: true, prompts: 0, pending: false,
            boundSource: "mp-000000000002", otherUnchanged: true,
        });
        // Renewal moves the link to the front; no retained link is evicted to make room.
        expect(r.trustAfterRenew).toBe(16);
        expect(r.newestAfterRenew).toBe("mp-000000000002");
        expect(r.allHeld).toBe(true);

        expect(r.strangerIds).toBe(16);
        expect(r.strangerState).toBe("pending");
        expect(r.strangerPending).toBe(true);
        expect(r.strangerWrote).toBe(0);
        expect(r.revoked).toEqual({ state: "pending", pending: true, genUnchanged: true });
        expect(r.keyLogged).toBe(false);
    });

    test("challenge lists: oversized, duplicate, malformed and over-count lists are dropped without a proof", () => {
        const r = run(`
bootLikeServerLog()
runUntil(function() return commitsLogged() >= 1 end, 200, 100)
local S = SERVER.M
local P = S.FarmDashboardReplicaPairing
local E = S.FarmDashboardPairingEvent
local id = function(i) return string.format("%016x", i) end
local function list(n, f)
    local out = {}
    for i = 1, n do out[i] = (f and f(i)) or id(i) end
    return table.concat(out, ",")
end
local parsed = {
    one = P.parseChallengeIds(id(1)) ~= nil,
    sixteen = P.parseChallengeIds(list(16)) ~= nil,
    seventeen = P.parseChallengeIds(list(17)) ~= nil,
    duplicate = P.parseChallengeIds(id(1) .. "," .. id(1)) ~= nil,
    upper = P.parseChallengeIds(string.upper(id(10))) ~= nil,
    trailingComma = P.parseChallengeIds(id(1) .. ",") ~= nil,
    leadingComma = P.parseChallengeIds("," .. id(1)) ~= nil,
    badSeparator = P.parseChallengeIds(id(1) .. ";" .. id(2)) ~= nil,
    short = P.parseChallengeIds("abc") ~= nil,
    empty = P.parseChallengeIds("") ~= nil,
    notString = P.parseChallengeIds(nil) ~= nil,
}
local limits = {
    idListBytes = P.MAX_ID_LIST_BYTES,
    eventIdList = E.MAX_ID_LIST,
    challengeIds = P.MAX_CHALLENGE_IDS,
    trust = P.MAX_TRUST,
}
-- Wire: a 16-ID list fits kind 1; 272 bytes does not; the list width is not granted to other kinds.
local function roundTrip(kind, a, b, c, d)
    local e = E.new(kind, a, b, c, d)
    e.run = function() end
    e:writeStream("rt", nil)
    local incoming = E.emptyNew()
    incoming.run = function() end
    incoming:readStream("rt", nil)
    STREAMS["rt"] = nil
    return incoming.rejected == true
end
local wire = {
    sixteen = roundTrip(1, string.rep("a", 32), list(16)),
    over = roundTrip(1, string.rep("a", 32), list(16) .. "0"),
    registerWide = roundTrip(2, string.rep("a", 32), string.rep("0", 17), string.rep("b", 64)),
    proofWideKey = roundTrip(3, "renew", string.rep("0", 17), "fd-1", string.rep("0", 64)),
    unknownKind = roundTrip(9, "", "", "", ""),
}
local sent = {}
local cconn = { getIsServer = function() return false end, sendEvent = function(_, e) sent[#sent + 1] = e end }
local answered = {}
for name, idList in pairs({
    seventeen = list(17), duplicate = id(1) .. "," .. id(1), upper = string.upper(id(10)), junk = "zz",
}) do
    ENGINE.g_time = ENGINE.g_time + 3500
    local before = #sent
    E.new(1, string.rep("c", 32), idList):run(cconn)
    answered[name] = #sent - before
end
ENGINE.g_time = ENGINE.g_time + 3500
local before = #sent
E.new(1, string.rep("c", 32), list(16)):run(cconn)
local valid = #sent - before
local reply = sent[#sent]
return enc({
    parsed = parsed,
    limits = limits,
    wire = wire,
    answered = answered,
    valid = valid,
    validReplyEmpty = reply ~= nil and reply.kind == 3 and reply.d == "",
})
`);
        expect(r.parsed).toEqual({
            one: true, sixteen: true, seventeen: false, duplicate: false, upper: false, trailingComma: false,
            leadingComma: false, badSeparator: false, short: false, empty: false, notString: false,
        });
        expect(r.limits).toEqual({ idListBytes: 271, eventIdList: 271, challengeIds: 16, trust: 16 });
        expect(r.wire).toEqual({ sixteen: false, over: true, registerWide: true, proofWideKey: true, unknownKind: true });
        expect(r.answered).toEqual({ seventeen: 0, duplicate: 0, upper: 0, junk: 0 });
        expect(r.valid).toBe(1);
        expect(r.validReplyEmpty).toBe(true);
    });
});
