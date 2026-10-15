"use strict";

const { runDedicated, DEDICATED_PRELUDE } = require("./helpers/dedicatedHarness");

const configXml = `<farmDashboard>
    <settings enabled="true" updateInterval="10000" collectionCycleMs="60000" diagnostics="false" postLoadCollectionGraceSec="45" sliceBudgetMs="4" jsonTopLevelKeysPerFrame="1"/>
    <modules vehicles="true" fields="true" weather="true" economy="true" animals="true" production="true" finance="true"/>
</farmDashboard>`;

jest.setTimeout(180000);

test("first join can be approved without a usable engine token and reconnect still requires proof", () => {
    const result = JSON.parse(runDedicated({ configXml, vehicles: 4, script: DEDICATED_PRELUDE + `
bootLikeServerLog()
runUntil(function() return commitsLogged() >= 1 end, 200, 100)

local function pending(c)
    local path = c.E.PROFILE .. "modSettings/FS25_FarmDashboard/replicaPending.xml"
    runUntil(function() return FILES[path] ~= nil end, 200, 100)
    local file = FILES[path]
    if file == nil then return nil end
    local fields = {}
    for k, v in pairs(file) do fields[string.match(k, "#(.+)$")] = v end
    return fields
end

local function join(name, token)
    local c = bootMachine({ server = false, profile = "/" .. name .. "/", platformSessionId = token })
    c.E.g_time = ENGINE.g_time
    c.M.FarmDashboard:loadMap()
    connect(c, SERVER, 1)
    return c, pending(c)
end

local c, first = join("missing-token", nil)
local firstKeyValid = first ~= nil and type(first.serverKey) == "string"
    and string.match(first.serverKey, "^[0-9a-f]+$") ~= nil and #first.serverKey == 64
local stable = first ~= nil and c.M.FarmDashboardReplicaConfig:sessionKey() == first.serverKey
local noReplicaBeforeApproval = replicaOf(c, "mp-000000000001") == nil

if first ~= nil then
    FILES[c.E.PROFILE .. "modSettings/FS25_FarmDashboard/replicaSources.xml"] = {
        ["farmDashboardReplicaSources.source(0)#sourceId"] = "mp-000000000001",
        ["farmDashboardReplicaSources.source(0)#remoteSlot"] = first.sourceSlot,
        ["farmDashboardReplicaSources.source(0)#serverKey"] = first.serverKey,
    }
end
local linked = runUntil(function() return replicaOf(c, "mp-000000000001") ~= nil end, 300, 100) ~= nil
local trustStored = FILES[c.E.PROFILE .. "modSettings/FS25_FarmDashboard/replicaTrust.xml"] ~= nil
local serverKeyStored = FILES[SERVER.E.PROFILE .. "modSettings/FS25_FarmDashboard/replicaClients.xml"] ~= nil
leaveClient(c)
reconnectClient(c)
local rebound = runUntil(function() return c.M.FarmDashboardReplicaPairing:clientState() == "bound" end, 200, 100) ~= nil
local noSecondPrompt = FILES[c.E.PROFILE .. "modSettings/FS25_FarmDashboard/replicaPending.xml"] == nil
leaveClient(c)

local other, invalid = join("invalid-token", "opaque/token")
local invalidKeyValid = invalid ~= nil and type(invalid.serverKey) == "string"
    and string.match(invalid.serverKey, "^[0-9a-f]+$") ~= nil and #invalid.serverKey == 64
local distinct = first ~= nil and invalid ~= nil and first.serverKey ~= invalid.serverKey
leaveClient(other)

local leaked = false
if first ~= nil then
    for _, lines in ipairs({ ENGINE.LOG, c.E.LOG, other.E.LOG }) do
        for _, line in ipairs(lines) do
            if string.find(line, first.serverKey, 1, true) then leaked = true end
        end
    end
end
return string.format("{\\"firstKeyValid\\":%s,\\"stable\\":%s,\\"noReplicaBeforeApproval\\":%s,\\"linked\\":%s,\\"trustStored\\":%s,\\"serverKeyStored\\":%s,\\"rebound\\":%s,\\"noSecondPrompt\\":%s,\\"invalidKeyValid\\":%s,\\"distinct\\":%s,\\"leaked\\":%s,\\"clientErrors\\":%d,\\"otherErrors\\":%d,\\"engineErrors\\":%d}",
    tostring(firstKeyValid), tostring(stable), tostring(noReplicaBeforeApproval), tostring(linked),
    tostring(trustStored), tostring(serverKeyStored), tostring(rebound), tostring(noSecondPrompt),
    tostring(invalidKeyValid), tostring(distinct), tostring(leaked), #c.E.LOAD_ERRORS,
    #other.E.LOAD_ERRORS, #ENGINE_ERRORS)
` }));

    expect(result).toEqual({
        firstKeyValid: true,
        stable: true,
        noReplicaBeforeApproval: true,
        linked: true,
        trustStored: true,
        serverKeyStored: true,
        rebound: true,
        noSecondPrompt: true,
        invalidKeyValid: true,
        distinct: true,
        leaked: false,
        clientErrors: 0,
        otherErrors: 0,
        engineErrors: 0,
    });
});
