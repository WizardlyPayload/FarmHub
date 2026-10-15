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
function FarmDashboardExportEvent.new(chunkIndex, totalChunks, payloadString, meta)
    local self = FarmDashboardExportEvent.emptyNew()
    self.chunkIndex = chunkIndex or 0
    self.totalChunks = totalChunks or 0
    self.payloadString = payloadString or ""
    self.meta = meta
    return self
end

FarmDashboardExportEvent.WIRE_TAG = "FDX2"
FarmDashboardExportEvent.WIRE_VERSION = 2
FarmDashboardExportEvent.MAX_CHUNK_BYTES = 1024
FarmDashboardExportEvent.MAX_ENCODED = 11184812
FarmDashboardExportEvent.MAX_CHUNKS = 10923
FarmDashboardExportEvent.MAX_DECLARED_BYTES = 11184812

local function boundedCount(value, maximum)
    if type(value) ~= "number" or value ~= math.floor(value) then return nil end
    if value < 1 or value > maximum then return nil end
    return value
end

function FarmDashboardExportEvent:writeStream(streamId, connection)
    local meta = type(self.meta) == "table" and self.meta or {}
    local version = tonumber(meta.wireVersion) or 0
    streamWriteString(streamId, FarmDashboardExportEvent.WIRE_TAG)
    streamWriteInt32(streamId, version)
    if version ~= FarmDashboardExportEvent.WIRE_VERSION then return end
    streamWriteInt32(streamId, tonumber(meta.connectionEpoch) or 0)
    streamWriteString(streamId, tostring(meta.transferId or ""))
    streamWriteInt32(streamId, self.chunkIndex or 0)
    streamWriteInt32(streamId, self.totalChunks or 0)
    streamWriteInt32(streamId, tonumber(meta.declaredBytes) or 0)
    streamWriteInt32(streamId, tonumber(meta.decodedBytes) or 0)
    streamWriteString(streamId, tostring(meta.crc or ""))
    streamWriteString(streamId, tostring(meta.careerId or ""))
    streamWriteString(streamId, tostring(meta.sessionId or ""))
    streamWriteInt32(streamId, tonumber(meta.publicationSequence) or 0)
    streamWriteInt32(streamId, tonumber(meta.exportGeneration) or 0)
    streamWriteString(streamId, tostring(meta.sourceSlot or ""))
    streamWriteString(streamId, tostring(meta.schema or ""))
    streamWriteString(streamId, tostring(meta.encoding or ""))
    streamWriteString(streamId, tostring(meta.simulationTimeMs or ""))
    streamWriteString(streamId, tostring(self.payloadString or ""))
end

function FarmDashboardExportEvent:readStream(streamId, connection)
    self.connection = connection
    self.meta = nil
    self.payloadString = ""
    local tag = streamReadString(streamId)
    local version = streamReadInt32(streamId)
    if tag ~= FarmDashboardExportEvent.WIRE_TAG or version ~= FarmDashboardExportEvent.WIRE_VERSION then
        self.rejected = "version"
        self:run(connection)
        return
    end
    local epoch = streamReadInt32(streamId)
    local transferId = streamReadString(streamId)
    self.chunkIndex = streamReadInt32(streamId)
    self.totalChunks = streamReadInt32(streamId)
    local declared = streamReadInt32(streamId)
    local decodedBytes = streamReadInt32(streamId)
    local crc = streamReadString(streamId)
    local careerId = streamReadString(streamId)
    local sessionId = streamReadString(streamId)
    local sequence = streamReadInt32(streamId)
    local generation = streamReadInt32(streamId)
    local sourceSlot = streamReadString(streamId)
    local schema = streamReadString(streamId)
    local encoding = streamReadString(streamId)
    local simulationTimeMs = streamReadString(streamId)
    self.payloadString = streamReadString(streamId)
    local chunkCount = boundedCount(self.totalChunks, FarmDashboardExportEvent.MAX_CHUNKS)
    local index = boundedCount(self.chunkIndex, chunkCount or 0)
    local declaredBytes = boundedCount(declared, FarmDashboardExportEvent.MAX_DECLARED_BYTES)
    local decodedCount = boundedCount(decodedBytes, 8388608)
    if index == nil or chunkCount == nil or declaredBytes == nil or decodedCount == nil then
        self.rejected = "range"
        self:run(connection)
        return
    end
    if type(self.payloadString) ~= "string" or #self.payloadString < 1 or #self.payloadString > FarmDashboardExportEvent.MAX_CHUNK_BYTES then
        self.rejected = "chunk"
        self:run(connection)
        return
    end
    if type(transferId) ~= "string" or transferId == "" or type(crc) ~= "string" or crc == "" then
        self.rejected = "identity"
        self:run(connection)
        return
    end
    self.chunkIndex = index
    self.totalChunks = chunkCount
    self.meta = {
        wireVersion = version,
        connectionEpoch = epoch,
        transferId = transferId,
        declaredBytes = declaredBytes,
        decodedBytes = decodedCount,
        crc = crc,
        careerId = careerId,
        sessionId = sessionId,
        publicationSequence = sequence,
        exportGeneration = generation,
        sourceSlot = sourceSlot,
        schema = schema,
        encoding = encoding,
        simulationTimeMs = simulationTimeMs,
    }
    local finalizer = rawget(_G, "FarmDashboardExportFinalizer")
    if finalizer and type(finalizer.validateHeader) == "function" then
        local headerOk, headerReason = finalizer.validateHeader(self.meta, self.chunkIndex, self.totalChunks, self.payloadString)
        if not headerOk then
            self.rejected = headerReason or "header"
            self:run(connection)
            return
        end
    end
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
    if self.rejected ~= nil then return end
    if mirror and mirror.onChunkReceived then
        local ok, err = pcall(function()
            mirror:onChunkReceived(idx, total, self.payloadString, self.meta, connection)
        end)
        if not ok and Logging and Logging.warning then
            Logging.warning("[FarmDash] export mirror: onChunkReceived failed: %s", tostring(err))
        end
    elseif Logging and Logging.warning then
        Logging.warning("[FarmDash] export mirror: ExportEvent arrived but ExportMirror missing")
    end
end
