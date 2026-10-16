"use strict";

const crypto = require("crypto");
const { runDedicated } = require("./helpers/dedicatedHarness");

test("loaded mod answers a fresh recovery request only for its verified, renewed binding", () => {
    const result = JSON.parse(runDedicated({ vehicles: 0, script: `
local c = bootMachine({ server = false, profile = "/recovery-client/", platformSessionId = "fresh-current-session" })
local P = c.M.FarmDashboardReplicaPairing
local knownAnswer = P.hmacSha256Hex(string.rep("0b", 20), "Hi There")
local C = c.M.FarmDashboardReplicaConfig
local conn = { getIsServer = function() return true end }
local sourceId, careerId, slot = "mp-6a677ec7f2bd", "career-1", "savegame1"
local keyId, key = "0123456789abcdef", string.rep("a", 64)
local nonce = string.rep("b", 32)
local root = c.E.PROFILE .. "modSettings/FS25_FarmDashboard/"
FILES[root .. "replicaTrust.xml"] = {
    ["farmDashboardReplicaTrust.link(0)#sourceId"] = sourceId,
    ["farmDashboardReplicaTrust.link(0)#careerId"] = careerId,
    ["farmDashboardReplicaTrust.link(0)#keyId"] = keyId,
    ["farmDashboardReplicaTrust.link(0)#key"] = key,
}
FILES[root .. "replicaRecoveryRequest.xml"] = {
    ["farmDashboardRecoveryRequest#schema"] = "1",
    ["farmDashboardRecoveryRequest#nonce"] = nonce,
    ["farmDashboardRecoveryRequest#sourceId"] = sourceId,
    ["farmDashboardRecoveryRequest#careerId"] = careerId,
    ["farmDashboardRecoveryRequest#remoteSlot"] = slot,
    ["farmDashboardRecoveryRequest#keyId"] = keyId,
}
C._sources = { { sourceId = sourceId, remoteSlot = slot, serverKey = "old-token" } }
C._bindings[conn] = { sourceId = sourceId, remoteSlot = slot, careerId = careerId, renewed = true }
P._client = { connection = conn, state = "bound", sourceId = sourceId, sessionKey = "fresh-current-session" }
local unverified = P:answerRecoveryRequest(P._client)
P._client.verifiedKeyId, P._client.verifiedCareerId = keyId, careerId
C._bindings[conn].renewed = false
local explicitOnly = P:answerRecoveryRequest(P._client)
C._bindings[conn].renewed = true
local answered = P:answerRecoveryRequest(P._client)
local response = FILES[root .. "replicaRecoveryProof.xml"] or {}
local proof = response["farmDashboardRecoveryProof#proof"] or ""
local replay = P:answerRecoveryRequest(P._client)
FILES[root .. "replicaRecoveryRequest.xml"]["farmDashboardRecoveryRequest#nonce"] = string.rep("c", 32)
FILES[root .. "replicaRecoveryRequest.xml"]["farmDashboardRecoveryRequest#sourceId"] = "mp-111111111111"
local wrongSource = P:answerRecoveryRequest(P._client)
FILES[root .. "replicaRecoveryRequest.xml"]["farmDashboardRecoveryRequest#sourceId"] = sourceId
FILES[root .. "replicaRecoveryRequest.xml"]["farmDashboardRecoveryRequest#careerId"] = "wrong-career"
local wrongCareer = P:answerRecoveryRequest(P._client)
FILES[root .. "replicaRecoveryRequest.xml"]["farmDashboardRecoveryRequest#careerId"] = careerId
FILES[root .. "replicaRecoveryRequest.xml"]["farmDashboardRecoveryRequest#remoteSlot"] = "savegame2"
local wrongSlot = P:answerRecoveryRequest(P._client)
FILES[root .. "replicaRecoveryRequest.xml"]["farmDashboardRecoveryRequest#remoteSlot"] = slot
FILES[root .. "replicaRecoveryRequest.xml"]["farmDashboardRecoveryRequest#keyId"] = "1111111111111111"
local wrongKey = P:answerRecoveryRequest(P._client)
P:onLeave(conn)
local afterLeave = P:answerRecoveryRequest(P._client)
return string.format('{"unverified":%s,"explicitOnly":%s,"answered":%s,"replay":%s,"wrongSource":%s,"wrongCareer":%s,"wrongSlot":%s,"wrongKey":%s,"afterLeave":%s,"proof":"%s","sessionKey":"%s","knownAnswer":"%s"}',
    tostring(unverified), tostring(explicitOnly), tostring(answered), tostring(replay),
    tostring(wrongSource), tostring(wrongCareer), tostring(wrongSlot), tostring(wrongKey),
    tostring(afterLeave), proof, response["farmDashboardRecoveryProof#sessionKey"] or "", knownAnswer)
` }));
    expect(result).toMatchObject({
        unverified: false, explicitOnly: false, answered: true,
        replay: false, wrongSource: false, wrongCareer: false, wrongSlot: false,
        wrongKey: false, afterLeave: false,
        sessionKey: "fresh-current-session",
    });
    const knownAnswer = "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7";
    expect(result.knownAnswer).toBe(knownAnswer);
    expect(crypto.createHmac("sha256", Buffer.alloc(20, 0x0b)).update("Hi There").digest("hex"))
        .toBe(knownAnswer);
    const message = ["FDPAIR1", "recover", "b".repeat(32), "mp-6a677ec7f2bd",
        "career-1", "savegame1", "fresh-current-session", "0123456789abcdef"].join("|");
    expect(result.proof).toBe(crypto.createHmac("sha256", Buffer.from("a".repeat(64), "hex"))
        .update(message).digest("hex"));
});
