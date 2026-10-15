-- FS25 FarmDashboard | FarmDashboardPairingEvent.lua
-- Small confirm-once pairing messages (see FarmDashboardReplicaPairing.lua).
-- Kind 1 CHALLENGE client -> server (nonce, key IDs), kind 2 REGISTER client -> server (nonce, key ID, key),
-- kind 3 PROOF server -> client (proof kind, key ID, career ID, HMAC). Fields are bounded per kind; anything else
-- is dropped.

FarmDashboardPairingEvent = {}
FarmDashboardPairingEvent_mt = Class(FarmDashboardPairingEvent, Event)

InitEventClass(FarmDashboardPairingEvent, "FarmDashboardPairingEvent")

FarmDashboardPairingEvent.WIRE_TAG = "FDP1"
FarmDashboardPairingEvent.MAX_FIELD = 200
-- 16 retained links (FarmDashboardReplicaPairing.MAX_TRUST) x 16 hex chars, comma separated.
FarmDashboardPairingEvent.MAX_ID_LIST = 16 * 17 - 1
-- Per-kind byte limits for fields a, b, c, d. Unknown kinds are dropped.
FarmDashboardPairingEvent.FIELD_LIMITS = {
    [1] = { 32, FarmDashboardPairingEvent.MAX_ID_LIST, 0, 0 },
    [2] = { 32, 16, 64, 0 },
    [3] = { 8, 16, FarmDashboardPairingEvent.MAX_FIELD, 64 },
}

function FarmDashboardPairingEvent.emptyNew()
    return Event.new(FarmDashboardPairingEvent_mt)
end

function FarmDashboardPairingEvent.new(kind, a, b, c, d)
    local self = FarmDashboardPairingEvent.emptyNew()
    self.kind = kind or 0
    self.a, self.b, self.c, self.d = a or "", b or "", c or "", d or ""
    return self
end

function FarmDashboardPairingEvent:writeStream(streamId, connection)
    streamWriteString(streamId, FarmDashboardPairingEvent.WIRE_TAG)
    streamWriteInt32(streamId, tonumber(self.kind) or 0)
    streamWriteString(streamId, tostring(self.a or ""))
    streamWriteString(streamId, tostring(self.b or ""))
    streamWriteString(streamId, tostring(self.c or ""))
    streamWriteString(streamId, tostring(self.d or ""))
end

function FarmDashboardPairingEvent:readStream(streamId, connection)
    local tag = streamReadString(streamId)
    self.kind = streamReadInt32(streamId)
    self.a = streamReadString(streamId)
    self.b = streamReadString(streamId)
    self.c = streamReadString(streamId)
    self.d = streamReadString(streamId)
    self.rejected = tag ~= FarmDashboardPairingEvent.WIRE_TAG or not FarmDashboardPairingEvent.fieldsWithinLimits(self)
    self:run(connection)
end

function FarmDashboardPairingEvent.fieldsWithinLimits(event)
    local limits = FarmDashboardPairingEvent.FIELD_LIMITS[event.kind]
    if limits == nil then return false end
    local fields = { event.a, event.b, event.c, event.d }
    for i = 1, 4 do
        if type(fields[i]) ~= "string" or #fields[i] > limits[i] then return false end
    end
    return true
end

local function fromServer(connection)
    if connection == nil or type(connection.getIsServer) ~= "function" then return false end
    local ok, isServer = pcall(function() return connection:getIsServer() end)
    return ok and isServer == true
end

function FarmDashboardPairingEvent:run(connection)
    if self.rejected or not FarmDashboardPairingEvent.fieldsWithinLimits(self) then return end
    local pairing = rawget(_G, "FarmDashboardReplicaPairing")
    if pairing == nil or connection == nil then return end
    local api = rawget(_G, "FarmDashboardSettingsApi")
    local authority = api ~= nil and type(api.isAuthorityMachine) == "function" and api:isAuthorityMachine() == true
    local ok, err = pcall(function()
        if fromServer(connection) then
            if not authority and self.kind == 3 then
                pairing:onProof(connection, self.a, self.b, self.c, self.d)
            end
        elseif authority then
            if self.kind == 1 then
                pairing:onServerChallenge(connection, self.a, self.b)
            elseif self.kind == 2 then
                pairing:onServerRegister(connection, self.a, self.b, self.c)
            end
        end
    end)
    if not ok and Logging and Logging.warning then
        Logging.warning("[FarmDash] export mirror: pairing message failed: %s", tostring(err))
    end
end
