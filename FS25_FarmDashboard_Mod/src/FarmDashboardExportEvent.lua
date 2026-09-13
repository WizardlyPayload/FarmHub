-- FS25 FarmDashboard | FarmDashboardExportEvent.lua
-- Chunked MP export mirror. Authority → clients; same Event shape as SettingsEvent.
-- 3.4.0.22: per-chunk ARRIVED logging is diagnostics-only. Logging.info is synchronous
-- file I/O on the game thread; with ~800+ chunks per stream it caused visible client
-- stutter. Enable diagnostics in config.xml to restore the per-chunk trace.

FarmDashboardExportEvent = {}

local function _fdVerbose()
    local L = rawget(_G, "FarmDashLog")
    return L ~= nil and type(L.isVerbose) == "function" and L.isVerbose() == true
end
FarmDashboardExportEvent_mt = Class(FarmDashboardExportEvent, Event)

InitEventClass(FarmDashboardExportEvent, "FarmDashboardExportEvent")

if Logging and Logging.info then
    Logging.info("[FarmDash] export mirror: FarmDashboardExportEvent InitEventClass OK")
end

function FarmDashboardExportEvent.emptyNew()
    return Event.new(FarmDashboardExportEvent_mt)
end

--- @param chunkIndex number 1-based
--- @param totalChunks number
--- @param payloadString string
function FarmDashboardExportEvent.new(chunkIndex, totalChunks, payloadString)
    local self = FarmDashboardExportEvent.emptyNew()
    self.chunkIndex = chunkIndex or 0
    self.totalChunks = totalChunks or 0
    self.payloadString = payloadString or ""
    return self
end

function FarmDashboardExportEvent:writeStream(streamId, connection)
    streamWriteInt32(streamId, self.chunkIndex or 0)
    streamWriteInt32(streamId, self.totalChunks or 0)
    streamWriteString(streamId, tostring(self.payloadString or ""))
end

function FarmDashboardExportEvent:readStream(streamId, connection)
    -- FIRST LINE after decode — proves the Event id mapped and the packet was delivered.
    self.chunkIndex = streamReadInt32(streamId)
    self.totalChunks = streamReadInt32(streamId)
    self.payloadString = streamReadString(streamId)
    self:run(connection)
end

function FarmDashboardExportEvent:run(connection)
    local idx = tonumber(self.chunkIndex) or -1
    local total = tonumber(self.totalChunks) or -1
    local bytes = type(self.payloadString) == "string" and #self.payloadString or 0

    -- Diagnostics-only: one log line per chunk hitches the client (sync log I/O per frame).
    if _fdVerbose() and Logging and Logging.info then
        Logging.info(
            "[FarmDash] export mirror: ExportEvent ARRIVED chunk=%d/%d bytes=%d",
            idx,
            total,
            bytes
        )
    end

    -- Authority already wrote data.json locally; never reassemble onto the host.
    local api = rawget(_G, "FarmDashboardSettingsApi")
    if api and api:isAuthorityMachine() then
        if _fdVerbose() and Logging and Logging.info then
            Logging.info("[FarmDash] export mirror: ExportEvent ignored on authority (expected)")
        end
        return
    end

    -- Same connection check SettingsEvent uses (not a bespoke getIsServer path).
    local fromServer = false
    if api and type(api.connectionIsServer) == "function" then
        fromServer = api:connectionIsServer(connection) == true
    elseif connection ~= nil and type(connection.getIsServer) == "function" then
        local ok, isSrv = pcall(function() return connection:getIsServer() end)
        fromServer = ok and isSrv == true
    end

    if not fromServer then
        if Logging and Logging.warning then
            Logging.warning(
                "[FarmDash] export mirror: ExportEvent DROPPED (not from server) chunk=%d/%d",
                idx,
                total
            )
        end
        return
    end

    local mirror = rawget(_G, "FarmDashboardExportMirror")
    if mirror and mirror.onChunkReceived then
        local ok, err = pcall(function()
            mirror:onChunkReceived(idx, total, self.payloadString)
        end)
        if not ok and Logging and Logging.warning then
            Logging.warning("[FarmDash] export mirror: onChunkReceived failed: %s", tostring(err))
        end
    elseif Logging and Logging.warning then
        Logging.warning("[FarmDash] export mirror: ExportEvent arrived but ExportMirror missing")
    end
end
