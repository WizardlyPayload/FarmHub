-- FS25 FarmDashboard | FarmDashboardSettingsEvent.lua | v1.0.0
-- Multiplayer sync for in-game settings (Moisture System pattern).
-- Export mirror streams automatically to joined clients (no opt-in registry).

FarmDashboardSettingsEvent = {}
FarmDashboardSettingsEvent_mt = Class(FarmDashboardSettingsEvent, Event)

InitEventClass(FarmDashboardSettingsEvent, "FarmDashboardSettingsEvent")

function FarmDashboardSettingsEvent.emptyNew()
    return Event.new(FarmDashboardSettingsEvent_mt)
end

function FarmDashboardSettingsEvent.newFromConfig()
    local self = FarmDashboardSettingsEvent.emptyNew()
    local api = rawget(_G, "FarmDashboardSettingsApi")
    if not api then
        return self
    end
    self.boolValues, self.intValues = api:packConfigForNetwork()
    return self
end

function FarmDashboardSettingsEvent:writeStream(streamId, connection)
    local api = rawget(_G, "FarmDashboardSettingsApi")
    if not api then
        return
    end
    for _, key in ipairs(api.BOOL_KEYS) do
        streamWriteBool(streamId, Utils.getNoNil(self.boolValues[key], false))
    end
    for _, key in ipairs(api.INT_KEYS) do
        streamWriteInt32(streamId, self.intValues[key] or 0)
    end
end

function FarmDashboardSettingsEvent:readStream(streamId, connection)
    local api = rawget(_G, "FarmDashboardSettingsApi")
    if not api then
        return
    end
    self.boolValues = {}
    for _, key in ipairs(api.BOOL_KEYS) do
        self.boolValues[key] = streamReadBool(streamId)
    end
    self.intValues = {}
    for _, key in ipairs(api.INT_KEYS) do
        self.intValues[key] = streamReadInt32(streamId)
    end
    self:run(connection)
end

FarmDashboardSettingsEvent._rejectLogged = {}

local function rejectRequest(reason)
    local logged = FarmDashboardSettingsEvent._rejectLogged
    if logged[reason] then
        return
    end
    logged[reason] = true
    if type(FarmDashLog) == "table" and type(FarmDashLog.devWarn) == "function" then
        FarmDashLog.devWarn("settings sync rejected (reason=%s)", reason)
    end
end

--- Direction comes from the engine connection (Connection:getIsServer returns the isServer flag fixed in
--- Connection.new), never from whether this machine can broadcast. Anything but a boolean answer is unknown.
local function connectionDirection(connection)
    if type(connection) ~= "table" or type(connection.getIsServer) ~= "function" then
        return nil
    end
    local ok, isServer = pcall(connection.getIsServer, connection)
    if not ok or type(isServer) ~= "boolean" then
        return nil
    end
    return isServer and "server" or "client"
end

local function adminAnswer(fn)
    local ok, value = pcall(fn)
    if not ok then return "error" end
    if value == true then return true end
    if value == false or value == nil then return false end
    return "error"
end

--- Admin evidence: the connection's getIsServerAdmin and the engine's
--- userManager:getIsConnectionMasterUser (vanilla SaveEvent / CheatMoneyEvent pattern). Only a strict true
--- counts; any error, non-boolean answer, wrong-type method or disagreement between sources rejects.
local function isRemoteAdmin(connection)
    local answers = {}
    if connection.getIsServerAdmin ~= nil then
        if type(connection.getIsServerAdmin) ~= "function" then return false end
        answers[#answers + 1] = adminAnswer(function() return connection:getIsServerAdmin() end)
    end
    local mission = _G.g_currentMission
    local users = type(mission) == "table" and mission.userManager or nil
    if type(users) == "table" and users.getIsConnectionMasterUser ~= nil then
        if type(users.getIsConnectionMasterUser) ~= "function" then return false end
        answers[#answers + 1] = adminAnswer(function() return users:getIsConnectionMasterUser(connection) end)
    end
    local sawTrue = false
    for _, answer in ipairs(answers) do
        if answer ~= true then return false end
        sawTrue = true
    end
    return sawTrue
end

local function settingsBroadcaster()
    local srv = _G.g_server
    if type(srv) ~= "table" then
        return nil
    end
    local ok, broadcast = pcall(function() return srv.broadcastEvent end)
    if ok and type(broadcast) == "function" then
        return srv
    end
    return nil
end

--- Replication recovery. Server:broadcastEvent loops clientConnections calling Connection:sendEvent in turn
--- (network/Server.lua:484), so a throw part-way leaves earlier recipients holding the new values. The host
--- therefore keeps the accepted configuration as the single authority and repairs delivery by resending its
--- complete current snapshot a bounded number of times, never by claiming a rollback of recipients.
FarmDashboardSettingsEvent.RETRY_INTERVAL_MS = 1000
FarmDashboardSettingsEvent.MAX_RETRY_ATTEMPTS = 3
--- state: "idle" | "synced" | "pending" | "failed" | "dropped"
FarmDashboardSettingsEvent.replication = { state = "idle", attempts = 0 }
FarmDashboardSettingsEvent._pending = nil

local function noteReplication(state, reason, attempts)
    FarmDashboardSettingsEvent.replication = { state = state, reason = reason, attempts = attempts or 0 }
    if state == "failed" and type(Logging) == "table" and type(Logging.warning) == "function" then
        Logging.warning("[FarmDash] settings replication failed after %d attempts (reason=%s)", attempts or 0, tostring(reason))
    elseif state == "pending" and type(FarmDashLog) == "table" and type(FarmDashLog.devWarn) == "function" then
        FarmDashLog.devWarn("settings replication pending (reason=%s)", tostring(reason))
    end
end

local function broadcastSnapshot(srv)
    return pcall(function()
        srv:broadcastEvent(FarmDashboardSettingsEvent.newFromConfig())
    end)
end

--- Local identity of the transmitted payload: every BOOL_KEYS and INT_KEYS value, as packConfigForNetwork
--- sends them. Never put on the wire.
local function configSnapshot()
    local api = rawget(_G, "FarmDashboardSettingsApi")
    if not api then
        return nil
    end
    local ok, boolValues, intValues = pcall(function() return api:packConfigForNetwork() end)
    if not ok or type(boolValues) ~= "table" or type(intValues) ~= "table" then
        return nil
    end
    return { api = api, boolValues = boolValues, intValues = intValues }
end

local function sameSnapshot(a, b)
    if a == nil or b == nil then
        return false
    end
    for _, key in ipairs(a.api.BOOL_KEYS) do
        if a.boolValues[key] ~= b.boolValues[key] then return false end
    end
    for _, key in ipairs(a.api.INT_KEYS) do
        if a.intValues[key] ~= b.intValues[key] then return false end
    end
    return true
end

--- A fresh event carrying exactly the captured values, so a retry sends the payload it compared.
local function snapshotEvent(snapshot)
    local event = FarmDashboardSettingsEvent.emptyNew()
    event.boolValues = snapshot.boolValues
    event.intValues = snapshot.intValues
    return event
end

--- One complete-snapshot broadcast. Every publication replaces earlier delivery assumptions: success clears
--- pending work; failure leaves delivery unknown, so every current connection becomes a target again for the
--- snapshot just sent.
local function replicate(srv, reason)
    if broadcastSnapshot(srv) then
        FarmDashboardSettingsEvent._pending = nil
        noteReplication("synced", reason, 0)
        return true
    end
    FarmDashboardSettingsEvent._pending = {
        mission = _G.g_currentMission,
        server = srv,
        attempts = 0,
        elapsedMs = 0,
        targets = nil,
        snapshot = configSnapshot(),
    }
    noteReplication("pending", "broadcast-failed", 0)
    return false
end

--- The single authority publication path for accepted remote requests and local setters. Callers persist
--- first; this only sends. It never raises: a failed send becomes pending recovery.
function FarmDashboardSettingsEvent.publishAuthoritative(reason, srv)
    srv = srv or settingsBroadcaster()
    if srv == nil then
        return false
    end
    local ok, delivered = pcall(replicate, srv, reason)
    return ok and delivered == true
end

--- Resends the captured snapshot. With the engine's clientConnections table each connection is sent on its
--- own through broadcastEvent's connectionList argument, so one failing connection cannot block healthy
--- ones; connections that have left are not retried (they receive the snapshot on rejoin via
--- sendInitialClientState). Without that table the whole broadcast is retried.
--- Returns true when every target was sent, otherwise false plus the failed connections (nil = all).
local function resend(srv, targets, snapshot)
    local okList, connections = pcall(function() return srv.clientConnections end)
    if not okList or type(connections) ~= "table" then
        return pcall(function() srv:broadcastEvent(snapshotEvent(snapshot)) end), nil
    end
    local okLocal, localStreamId = pcall(function() return _G.NetworkNode.LOCAL_STREAM_ID end)
    local failed = nil
    for streamId, conn in pairs(connections) do
        local isLocal = okLocal and localStreamId ~= nil and streamId == localStreamId
        if not isLocal and (targets == nil or targets[conn]) then
            local ok = pcall(function()
                srv:broadcastEvent(snapshotEvent(snapshot), false, nil, nil, nil, { [streamId] = conn })
            end)
            if not ok then
                failed = failed or {}
                failed[conn] = true
            end
        end
    end
    return failed == nil, failed
end

--- Called once per frame from FarmDashboard:update. Work is bounded to MAX_RETRY_ATTEMPTS resends spaced
--- RETRY_INTERVAL_MS apart, and only for the mission, server and authority role that accepted the change.
function FarmDashboardSettingsEvent.tickReplication(dt)
    local pending = FarmDashboardSettingsEvent._pending
    if pending == nil then
        return
    end
    local api = rawget(_G, "FarmDashboardSettingsApi")
    if _G.g_currentMission ~= pending.mission or _G.g_server ~= pending.server
        or not api or api:authorityState() ~= true then
        FarmDashboardSettingsEvent._pending = nil
        noteReplication("dropped", "session-changed", pending.attempts)
        return
    end
    if type(dt) ~= "number" or dt <= 0 then
        return
    end
    pending.elapsedMs = pending.elapsedMs + dt
    if pending.elapsedMs < FarmDashboardSettingsEvent.RETRY_INTERVAL_MS then
        return
    end
    pending.elapsedMs = 0
    local current = configSnapshot()
    if current == nil then
        -- Nothing verified to send. A failed capture spends one attempt of the existing budget and keeps the
        -- last valid identity and targets; it is never a new configuration and never a reason to send.
        pending.attempts = pending.attempts + 1
        if pending.attempts >= FarmDashboardSettingsEvent.MAX_RETRY_ATTEMPTS then
            FarmDashboardSettingsEvent._pending = nil
            noteReplication("failed", "retries-exhausted", pending.attempts)
        else
            FarmDashboardSettingsEvent.replication = { state = "pending", reason = "capture-failed", attempts = pending.attempts }
        end
        return
    end
    -- Targets narrowed for one payload say nothing about another. The first valid capture gives the pending
    -- work its identity (once: a valid identity is never cleared), and a valid capture that differs from the
    -- previous valid one retargets every connection with its own attempt budget.
    if pending.snapshot == nil or not sameSnapshot(pending.snapshot, current) then
        pending.snapshot = current
        pending.targets = nil
        pending.attempts = 0
    end
    pending.attempts = pending.attempts + 1
    local delivered, failed = resend(pending.server, pending.targets, current)
    if delivered then
        FarmDashboardSettingsEvent._pending = nil
        noteReplication("synced", "recovered", pending.attempts)
    elseif pending.attempts >= FarmDashboardSettingsEvent.MAX_RETRY_ATTEMPTS then
        FarmDashboardSettingsEvent._pending = nil
        noteReplication("failed", "retries-exhausted", pending.attempts)
    else
        pending.targets = failed
        FarmDashboardSettingsEvent.replication = { state = "pending", reason = "retrying", attempts = pending.attempts }
    end
end

--- Unload and save switch: pending work never carries into another mission.
function FarmDashboardSettingsEvent.clearPendingReplication()
    local pending = FarmDashboardSettingsEvent._pending
    FarmDashboardSettingsEvent._pending = nil
    if pending ~= nil then
        noteReplication("dropped", "unload", pending.attempts)
    else
        FarmDashboardSettingsEvent.replication = { state = "idle", attempts = 0 }
    end
end

function FarmDashboardSettingsEvent:run(connection)
    local api = rawget(_G, "FarmDashboardSettingsApi")
    if not api or type(self.boolValues) ~= "table" or type(self.intValues) ~= "table" then
        return
    end

    local okDirection, direction = pcall(connectionDirection, connection)
    if not okDirection or direction == nil then
        rejectRequest("unknown-direction")
        return
    end
    local okAuthority, authority = pcall(function() return api:authorityState() end)
    if not okAuthority or type(authority) ~= "boolean" then
        rejectRequest("unknown-authority")
        return
    end

    if direction == "client" then
        -- A client request is honoured only by a confirmed authority, only for a strict admin, and only when
        -- a broadcaster exists. Without one the request is refused whole: no mutation, no save, no sync.
        if authority ~= true then
            rejectRequest("client-request-on-non-authority")
            return
        end
        local ok, admin = pcall(isRemoteAdmin, connection)
        if not (ok and admin == true) then
            rejectRequest("not-admin")
            return
        end
        local srv = settingsBroadcaster()
        if srv == nil then
            rejectRequest("broadcast-unavailable")
            return
        end

        -- Accepted: the host value becomes the single authoritative configuration. A failed broadcast leaves
        -- replication pending (tickReplication), not a rolled-back host.
        api:applySyncedSettings(self.boolValues, self.intValues, false)
        local dc = api:getCollector()
        if dc then
            pcall(function() dc:saveConfig() end)
        end
        FarmDashboardSettingsEvent.publishAuthoritative("client-request", srv)
        return
    end

    -- Server-to-client sync applies only on a confirmed non-authority.
    if authority ~= false then
        rejectRequest("server-sync-on-authority")
        return
    end

    api:applySyncedSettings(self.boolValues, self.intValues, false)

    if FarmDashboardSettingsMenu and FarmDashboardSettingsMenu.syncAllControls then
        FarmDashboardSettingsMenu.syncAllControls()
    end
    if FarmDashboardSettingsMenu and FarmDashboardSettingsMenu.syncControlPermissions then
        FarmDashboardSettingsMenu.syncControlPermissions()
    end
end
