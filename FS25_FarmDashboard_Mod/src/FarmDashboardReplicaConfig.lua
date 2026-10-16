-- Receiving-client replica source registry.
-- The desktop source id and the remote save slot are configured here.
-- They are not taken from a display name or from the remote slot alone.
-- Origin match uses a token frozen for this live join: the engine's
-- missionDynamicInfo.platformSessionId when usable, otherwise a client-local
-- token created on join. A connection is bound when that token equals one
-- configured serverKey, or on a later join when the
-- server proves the pairing key this PC registered (FarmDashboardReplicaPairing)
-- and the linked source row is still configured.

FarmDashboardReplicaConfig = {}
FarmDashboardReplicaConfig._hooked = false
FarmDashboardReplicaConfig._sources = {}
FarmDashboardReplicaConfig._bindings = {}

local function validId(value)
    if type(value) ~= "string" or value == "" or #value > 64 then return false end
    if string.find(value, "..", 1, true) or string.find(value, "/", 1, true) or string.find(value, "\\", 1, true) then
        return false
    end
    return string.match(value, "^[A-Za-z0-9_%-]+$") ~= nil
end

local function validKey(value)
    if type(value) ~= "string" or value == "" or #value > 128 then return false end
    if string.find(value, "..", 1, true) or string.find(value, "/", 1, true) or string.find(value, "\\", 1, true) then
        return false
    end
    return string.match(value, "^[A-Za-z0-9_%-]+$") ~= nil
end

function FarmDashboardReplicaConfig:isReceivingClient()
    local api = rawget(_G, "FarmDashboardSettingsApi")
    if api == nil or type(api.isAuthorityMachine) ~= "function" then
        return false
    end
    local ok, isAuth = pcall(function() return api:isAuthorityMachine() end)
    return ok and isAuth == false
end

function FarmDashboardReplicaConfig:configPath()
    local root = ""
    if type(getUserProfileAppPath) == "function" then
        root = getUserProfileAppPath() or ""
    end
    return root .. "modSettings/FS25_FarmDashboard/replicaSources.xml"
end

function FarmDashboardReplicaConfig:replicaRoot()
    local root = ""
    if type(getUserProfileAppPath) == "function" then
        root = getUserProfileAppPath() or ""
    end
    return root .. "modSettings/FS25_FarmDashboard/replicas/"
end

function FarmDashboardReplicaConfig:readCandidateSnapshot(handle)
    local candidates = {}
    local seenId = {}
    local seenKey = {}
    local index = 0
    while index <= 32 do
        local base = "farmDashboardReplicaSources.source(" .. tostring(index) .. ")"
        local sourceId = getXMLString(handle, base .. "#sourceId")
        if type(sourceId) ~= "string" or sourceId == "" then
            return candidates
        end
        if index >= 32 then
            return nil
        end
        local remoteSlot = getXMLString(handle, base .. "#remoteSlot")
        local serverKey = getXMLString(handle, base .. "#serverKey")
        if not (validId(sourceId) and validId(remoteSlot) and validKey(serverKey)) then
            return nil
        end
        if seenId[sourceId] or seenKey[serverKey] then
            return nil
        end
        seenId[sourceId] = true
        seenKey[serverKey] = true
        candidates[#candidates + 1] = {
            sourceId = sourceId,
            remoteSlot = remoteSlot,
            serverKey = serverKey,
        }
        index = index + 1
    end
    return nil
end

function FarmDashboardReplicaConfig:load()
    if type(loadXMLFile) ~= "function" or type(getXMLString) ~= "function" then
        return false
    end
    -- The desktop app writes this pairing file only when a replica source is configured. Absent means
    -- unpaired; loadXMLFile on a missing path makes the engine log an error even inside pcall.
    if type(fileExists) == "function" then
        local probed, present = pcall(fileExists, self:configPath())
        if probed and present == false then
            self._sources = {}
            return true
        end
    end
    local opened, handle = pcall(function()
        return loadXMLFile("FarmDashReplicaSources", self:configPath())
    end)
    if not opened then
        return false
    end
    if handle == nil or handle == 0 or handle == false then
        self._sources = {}
        return true
    end
    local readOk, snapshot = pcall(function()
        return self:readCandidateSnapshot(handle)
    end)
    local releaseOk = true
    if type(delete) ~= "function" then
        releaseOk = false
    else
        local released = pcall(delete, handle)
        if not released then
            releaseOk = false
        end
    end
    if not readOk or type(snapshot) ~= "table" then
        return false
    end
    if not releaseOk then
        if Logging ~= nil and type(Logging.warning) == "function" then
            Logging.warning("[FarmDashboard] replica config reader release failed")
        end
        return false
    end
    self._sources = snapshot
    return true
end

-- The engine token is not guaranteed to be usable on every join. Pairing freezes
-- one token for the live connection so the pending record and approval row agree.
-- A client-local fallback is not a durable server id or a substitute for renewal proof.
function FarmDashboardReplicaConfig:sessionKey()
    local pairing = rawget(_G, "FarmDashboardReplicaPairing")
    local joined = pairing and pairing._client
    if joined ~= nil and validKey(joined.sessionKey) then return joined.sessionKey end
    -- Engine global inherited through this mod's _G; read at call time so a save switch is never cached.
    local mission = _G.g_currentMission
    local info = type(mission) == "table" and mission.missionDynamicInfo or nil
    if type(info) ~= "table" then return nil end
    local key = info and info.platformSessionId
    if type(key) ~= "string" or not validKey(key) then
        return nil
    end
    return key
end

function FarmDashboardReplicaConfig:retireConnection(connection)
    if connection ~= nil and self._bindings then
        self._bindings[connection] = nil
    end
    local mirror = rawget(_G, "FarmDashboardExportMirror")
    if mirror and mirror._replicaSources and connection ~= nil then
        mirror._replicaSources[connection] = nil
    end
end

function FarmDashboardReplicaConfig:bindingForConnection(connection)
    if connection == nil then return nil end
    local existing = self._bindings and self._bindings[connection]
    if type(existing) ~= "table" or not validId(existing.sourceId) then
        return nil
    end
    for i = 1, #self._sources do
        local source = self._sources[i]
        if source.sourceId == existing.sourceId then
            if existing.renewed == true or (source.serverKey == existing.serverKey and source.remoteSlot == existing.remoteSlot) then
                return existing
            end
        end
    end
    return nil
end

--- The replicaSources.xml row whose serverKey equals this session's token. Absent, unreadable, ambiguous or
--- unmatched files give nil: nothing is stored until the user links the server in the desktop app.
function FarmDashboardReplicaConfig:explicitMatch()
    local loadedOk, loaded = pcall(function() return self:load() end)
    if not loadedOk or loaded ~= true then return nil end
    local sessionKey = self:sessionKey()
    if sessionKey == nil then return nil end
    local match = nil
    for i = 1, #self._sources do
        local source = self._sources[i]
        if source.serverKey == sessionKey then
            if match ~= nil then return nil end
            match = source
        end
    end
    return match
end

--- Bind the live server connection to a row the desktop app published. careerId pins the binding when known.
function FarmDashboardReplicaConfig:bindExplicit(connection, match, careerId)
    self._bindings[connection] = {
        sourceId = match.sourceId,
        remoteSlot = match.remoteSlot,
        serverKey = match.serverKey,
        replicaRoot = self:replicaRoot(),
    }
    local mirror = rawget(_G, "FarmDashboardExportMirror")
    if mirror and type(mirror.registerReplicaSource) == "function" then
        mirror:registerReplicaSource(connection, match.sourceId, careerId)
    end
    local pairing = rawget(_G, "FarmDashboardReplicaPairing")
    if pairing and type(pairing.onExplicitBound) == "function" then
        pcall(function() pairing:onExplicitBound(connection, match.sourceId, careerId) end)
    end
    return true
end

--- A linked server that proved it holds this PC's pairing key on a later join (new session token).
function FarmDashboardReplicaConfig:bindRenewed(connection, sourceId, careerId)
    if not validId(sourceId) or not validId(careerId) then return false end
    local loadedOk, loaded = pcall(function() return self:load() end)
    if not loadedOk or loaded ~= true then return false end
    local row = nil
    for i = 1, #self._sources do
        if self._sources[i].sourceId == sourceId then row = self._sources[i] end
    end
    if row == nil then return false end
    self._bindings[connection] = {
        sourceId = sourceId,
        remoteSlot = row.remoteSlot,
        careerId = careerId,
        renewed = true,
        replicaRoot = self:replicaRoot(),
    }
    local mirror = rawget(_G, "FarmDashboardExportMirror")
    if mirror == nil or type(mirror.registerReplicaSource) ~= "function" then return false end
    return mirror:registerReplicaSource(connection, sourceId, careerId) == true
end

--- Same-session activation after the user approved the link: the app has published replicaSources.xml with this
--- session's token. Returns true once bound.
function FarmDashboardReplicaConfig:activateApproved(connection, careerId)
    local match = self:explicitMatch()
    if match == nil then return false end
    return self:bindExplicit(connection, match, careerId)
end

function FarmDashboardReplicaConfig:onClientServerReady(connection)
    if not self:isReceivingClient() then return false end
    if connection == nil or type(connection.getIsServer) ~= "function" then return false end
    local ok, isServer = pcall(function() return connection:getIsServer() end)
    if not ok or isServer ~= true then return false end
    local pairing = rawget(_G, "FarmDashboardReplicaPairing")
    if pairing and type(pairing.onJoin) == "function" then
        pcall(function() pairing:onJoin(connection) end)
    end
    local match = self:explicitMatch()
    if match ~= nil and pairing and type(pairing.loadTrust) == "function" then
        -- Previously linked sources must prove the registered server key, even if the
        -- retained session token happens to match this join.
        for _, entry in ipairs(pairing:loadTrust()) do
            if entry.sourceId == match.sourceId then match = nil break end
        end
    end
    if match == nil then
        self:retireConnection(connection)
        if pairing and type(pairing.beginUnpaired) == "function" then
            pcall(function() pairing:beginUnpaired(connection) end)
        end
        return false
    end
    return self:bindExplicit(connection, match, nil)
end

function FarmDashboardReplicaConfig:onClientServerClosed(connection)
    if not self:isReceivingClient() then return end
    if connection ~= nil and self._bindings then
        self._bindings[connection] = nil
    end
    local mirror = rawget(_G, "FarmDashboardExportMirror")
    if mirror and mirror._replicaSources and connection ~= nil then
        mirror._replicaSources[connection] = nil
    end
    if mirror and type(mirror.noteDisconnect) == "function" then
        pcall(function() mirror:noteDisconnect(connection) end)
    end
    local pairing = rawget(_G, "FarmDashboardReplicaPairing")
    if pairing and type(pairing.onLeave) == "function" then
        pcall(function() pairing:onLeave(connection) end)
    end
end

function FarmDashboardReplicaConfig.registerClientHook()
    local self = FarmDashboardReplicaConfig
    if self._hooked then return end
    if type(FSBaseMission) ~= "table" or type(Utils) ~= "table" or type(Utils.appendedFunction) ~= "function" then
        return
    end
    if type(FSBaseMission.onFinishedReceivingDynamicData) ~= "function" then
        return
    end
    self._hooked = true
    FSBaseMission.onFinishedReceivingDynamicData = Utils.appendedFunction(
        FSBaseMission.onFinishedReceivingDynamicData,
        function(_mission, connection)
            local config = rawget(_G, "FarmDashboardReplicaConfig")
            if config and config.onClientServerReady then
                pcall(function() config:onClientServerReady(connection) end)
            end
        end)
    if type(FSBaseMission.onConnectionClosed) == "function" then
        FSBaseMission.onConnectionClosed = Utils.appendedFunction(
            FSBaseMission.onConnectionClosed,
            function(_mission, connection, _reason)
                local config = rawget(_G, "FarmDashboardReplicaConfig")
                if config and config.onClientServerClosed then
                    pcall(function() config:onClientServerClosed(connection) end)
                end
            end)
    end
end

FarmDashboardReplicaConfig.registerClientHook()
