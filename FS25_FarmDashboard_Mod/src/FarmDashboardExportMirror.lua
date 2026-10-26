-- FS25 FarmDashboard | FarmDashboardExportMirror.lua
-- MP export mirror (3.4.0.17+):
--   Root cause of zero ARRIVED on GPortal join-as-client:
--     Settings sync uses connection:sendEvent on sendInitialClientState (works).
--     Export used only g_server:broadcastEvent. On some dedicated hosts the
--     internal client table broadcast iterates is empty → silent no-op → 0 ARRIVED.
--   Fix: track the joining connection and sendEvent each chunk (Settings path),
--        plus broadcastEvent(event, false) as a best-effort backup (GIANTS pattern).
--   3.4.0.20: do not abort an in-flight stream when a newer export arrives (coalesce
--     to pending). Clients reset the receive buffer on chunk 1 so overlapping
--     streams cannot splice two JSON payloads into one corrupt data.json.
--   3.4.0.22: client-stutter pass —
--     * streams throttled to MIN_STREAM_INTERVAL_MS (was: one per module slice, so the
--       pipe never idled and clients ate 2 events/frame continuously);
--     * broadcastEvent only as fallback when no tracked sendEvent connection worked
--       (dual-send delivered every chunk TWICE to tracked clients);
--     * dropped the O(n) char-by-char JSON brace scan on reassembly (~800k interpreter
--       steps in one frame for an ~815KB payload — the main periodic client hitch);
--     * client disk writes throttled; liveData.json on its own slower cadence;
--     * per-chunk / per-stream progress logs are diagnostics-only.

FarmDashboardExportMirror = {}

--- Stay well under typical event packet budgets; streamWriteString allows 64k but
--- whole Event packets are much smaller on the wire.
FarmDashboardExportMirror.CHUNK_BYTES = 1024
--- Spread a few chunks per update tick to avoid hitching on large exports.
FarmDashboardExportMirror.CHUNKS_PER_FRAME = 2
-- Keep the event queue below the sustained gameplay network budget. The prior
-- sender queued a full heavy-save export in about six seconds, while clients
-- continued to receive incomplete transfers even after the desktop app closed.
FarmDashboardExportMirror.SEND_BYTES_PER_SECOND = 24 * 1024
FarmDashboardExportMirror.SEND_BURST_BYTES = 2 * 1024
--- Folder prefix under modSettings/FS25_FarmDashboard/ for client-side mirror writes.
FarmDashboardExportMirror.CLIENT_FOLDER_PREFIX = "mirror_"
--- Fallback slot when missionInfo is unavailable (common dedicated client case).
FarmDashboardExportMirror.DEFAULT_SLOT = "savegame6"
--- Min gap between stream starts. Collectors finish a module slice every ~5-9s and each
--- slice used to start a full ~800-chunk stream, keeping clients busy every frame.
FarmDashboardExportMirror.MIN_STREAM_INTERVAL_MS = 15000
--- Client hitch guard: min gap between mirror data.json writes on a joined client.
FarmDashboardExportMirror.CLIENT_WRITE_MIN_INTERVAL_MS = 5000
--- liveData.json is a legacy/aux copy (desktop app reads mirror_<slot>/data.json);
--- keep it fresh-ish but never pay two full-file writes in the same frame each stream.
FarmDashboardExportMirror.LIVE_WRITE_MIN_INTERVAL_MS = 30000

local function _fdVerbose()
    local L = rawget(_G, "FarmDashLog")
    return L ~= nil and type(L.isVerbose) == "function" and L.isVerbose() == true
end

--- Mission-time ms (monotonic while playing); nil-safe for early boot.
--- g_time and g_server are engine globals inherited through this mod's _G (mods.lua), so they are read
--- by normal indexing at call time; rawget(_G, ...) only sees this mod's own keys.
local function _nowMs()
    local t = _G.g_time
    if type(t) == "number" then
        return t
    end
    return nil
end

local function _sanitizeSlot(slot)
    slot = tostring(slot or FarmDashboardExportMirror.DEFAULT_SLOT or "savegame6")
    slot = string.gsub(slot, "[^%w%._%-]", "_")
    if slot == "" then
        slot = FarmDashboardExportMirror.DEFAULT_SLOT or "savegame6"
    end
    return slot
end

--- Dedicated host slot → isolated local folder (never collide with SP savegameN).
local function _clientMirrorFolder(saveSlot)
    local slot = _sanitizeSlot(saveSlot)
    local prefix = FarmDashboardExportMirror.CLIENT_FOLDER_PREFIX or "mirror_"
    if string.sub(slot, 1, #prefix) == prefix then
        return slot
    end
    return prefix .. slot
end

--- Best-effort save slot on the joining client (for mirror_<slot>/data.json).
local function _detectClientSaveSlot(preferred)
    if preferred ~= nil and tostring(preferred) ~= "" then
        return _sanitizeSlot(preferred)
    end
    local mission = _G.g_currentMission
    local info = mission and mission.missionInfo
    if info then
        if info.savegameDirectoryName and info.savegameDirectoryName ~= "" then
            return _sanitizeSlot(info.savegameDirectoryName)
        end
        if info.savegameIndex ~= nil then
            return "savegame" .. tostring(info.savegameIndex)
        end
    end
    return FarmDashboardExportMirror.DEFAULT_SLOT or "savegame6"
end

--- Cheap sanity checks only (all C-level string ops). The old char-by-char brace
--- balance walked ~815k bytes in interpreted Lua in ONE frame (with a 1-char string
--- allocation per byte) — a guaranteed client hitch on every stream completion.
--- The chunk-1 buffer reset already prevents cross-stream splices; anything that still
--- slips through is rejected by the desktop app's JSON parser without harm.
local function _looksLikeJsonObject(s)
    if type(s) ~= "string" or #s < 2 then
        return false
    end
    local firstIdx = string.find(s, "%S")
    if firstIdx == nil or string.sub(s, firstIdx, firstIdx) ~= "{" then
        return false
    end
    local lastIdx = string.find(s, "%S%s*$")
    if lastIdx == nil or string.sub(s, lastIdx, lastIdx) ~= "}" then
        return false
    end
    -- Reject spliced payloads (overlapping streams) that leave brace-balanced junk
    -- like: "hour": 18, "        "hour": 18
    if string.find(s, '"%s+"%w', 1, false) then
        return false
    end
    return true
end

local function _hasServerObject()
    local srv = _G.g_server
    return type(srv) == "table" and type(srv.broadcastEvent) == "function"
end

local function _isAuthorityProcess()
    local api = rawget(_G, "FarmDashboardSettingsApi")
    if api and type(api.isAuthorityMachine) == "function" and not api:isAuthorityMachine() then
        return false
    end
    local fd = rawget(_G, "FarmDashboard")
    if fd and type(fd.isAuthority) == "function" then
        local ok, isAuth = pcall(function() return fd:isAuthority() end)
        if ok and not isAuth then
            return false
        end
    end
    return true
end

local function _writeTextFile(absPath, contents)
    local written = false
    local dc = rawget(_G, "FarmDashboardDataCollector")
    if dc and type(dc._writeFileAtomic) == "function" then
        local ok, result = pcall(function()
            return dc:_writeFileAtomic(absPath, contents)
        end)
        written = ok and result == true
    end

    -- Fallback: single direct write from memory. The old path wrote a tmp file, read the
    -- whole tmp back, and wrote the target — 3x the sync I/O for the same bytes, all in
    -- one frame on the game thread.
    if not written and type(io) == "table" and type(io.open) == "function" then
        local f = io.open(absPath, "w")
        if f then
            f:write(contents)
            f:close()
            written = true
        end
    end
    return written
end

function FarmDashboardExportMirror:init()
    if self._inited then
        return
    end
    self._inited = true
    self._job = nil
    self._pendingJob = nil
    self._clientBuf = nil
    self._lastJson = nil
    self._lastSlot = nil
    self._joinHooked = false
    self._lastJobStartMs = nil
    self._lastJobFinishMs = nil
    self._lastClientWriteMs = nil
    self._lastLiveWriteMs = nil
    self._firstWroteLogged = false
    --- Connections that completed sendInitialClientState (Settings-proven path).
    self._clients = {}
    self._deferredReadyReplay = {}
    self._sendEpoch = 1
    self._receiveBufs = {}
    self._replicaSources = {}
    self._mirrorGeneration = 1
end

--- Stubs kept so older call sites (settings sync) do not error.
function FarmDashboardExportMirror:setClientOptIn(_connection, _optedIn)
end

function FarmDashboardExportMirror:publishClientOptInIfNeeded()
end

function FarmDashboardExportMirror:hasRemoteClients()
    return self:_trackedClientCount() > 0 or _hasServerObject()
end

function FarmDashboardExportMirror:hasOptedInClients()
    return self:hasRemoteClients()
end

function FarmDashboardExportMirror:_trackedClientCount()
    local n = 0
    for _ in pairs(self._clients or {}) do
        n = n + 1
    end
    return n
end

function FarmDashboardExportMirror:_registerClient(connection)
    if connection == nil then
        return
    end
    self._clients = self._clients or {}
    self._clients[connection] = true
end

--- Replica metadata rides with the stream. The client records it and does not mint a local commit.
function FarmDashboardExportMirror:_replicaMeta()
    return {
        careerId = self._lastCareerId,
        sessionId = self._lastSessionId,
        publicationSequence = self._lastPublicationSequence,
        exportGeneration = self._lastExportGeneration,
        sourceSlot = self._lastSlot,
        replica = true,
        transferId = self._activeTransferId,
        checksum = self._activeChecksum,
    }
end

function FarmDashboardExportMirror:_payloadChecksum(text)
    local sum = 0
    if type(text) ~= "string" then return 0 end
    for i = 1, #text do
        sum = (sum + string.byte(text, i)) % 2147483647
    end
    return sum
end

function FarmDashboardExportMirror:_adler32(text)
    local a, b = 1, 0
    if type(text) ~= "string" then return 0 end
    for i = 1, #text do
        a = (a + string.byte(text, i)) % 65521
        b = (b + a) % 65521
    end
    return b * 65536 + a
end

--- Deliver one chunk the same way Settings delivers join state: connection:sendEvent.
--- broadcastEvent(event, false) — GIANTS AnimalNameEvent pattern — is FALLBACK ONLY:
--- when direct sends worked, broadcasting too delivered every chunk twice to each
--- tracked client (double event decode + double receive work on the client).
--- Always builds a FRESH event per destination (events are consumed by writeStream).
function FarmDashboardExportMirror:_dispatchChunk(chunkIndex, totalChunks, chunkData, meta)
    self._dispatchMeta = meta
    if not FarmDashboardExportEvent or not FarmDashboardExportEvent.new then
        return false, 0, false
    end

    local function makeEvent()
        return FarmDashboardExportEvent.new(chunkIndex, totalChunks, chunkData, self._dispatchMeta)
    end

    local live = {}
    local sentDirect = 0
    local deferred = 0
    for conn, _ in pairs(self._clients or {}) do
        if conn ~= nil and type(conn.sendEvent) == "function" and conn.isConnected ~= false then
            live[conn] = true
            local failedForJob = self._job ~= nil
                and self._job.failedConnections ~= nil
                and self._job.failedConnections[conn] == true
            if conn.isReadyForEvents == false or failedForJob then
                self._deferredReadyReplay = self._deferredReadyReplay or {}
                if conn.isReadyForEvents == false and self._deferredReadyReplay[conn] ~= true and Logging and Logging.warning then
                    Logging.warning("[FarmDash] export mirror: client event stream not ready; replay queued")
                end
                self._deferredReadyReplay[conn] = true
                deferred = deferred + 1
            else
                local ok, err = pcall(function()
                    conn:sendEvent(makeEvent())
                end)
                if ok then
                    sentDirect = sentDirect + 1
                else
                    if self._job ~= nil then
                        self._job.failedConnections = self._job.failedConnections or {}
                        self._job.failedConnections[conn] = true
                    end
                    self._deferredReadyReplay = self._deferredReadyReplay or {}
                    self._deferredReadyReplay[conn] = true
                    deferred = deferred + 1
                    if Logging and Logging.warning then
                        local detail = string.sub(string.gsub(tostring(err), "[\r\n]", " "), 1, 200)
                        Logging.warning(
                            "[FarmDash] export mirror: client event send failed; replay queued transferId=%s chunk=%d/%d reason=%s",
                            tostring(meta and meta.transferId), chunkIndex, totalChunks, detail
                        )
                    end
                end
            end
        elseif conn ~= nil and self._deferredReadyReplay then
            self._deferredReadyReplay[conn] = nil
        end
    end
    self._clients = live

    local broadcastOk = false
    if sentDirect < 1 and deferred < 1 then
        local srv = _G.g_server
        if type(srv) == "table" and type(srv.broadcastEvent) == "function" then
            -- Second arg false = do not run locally (AnimalNameEvent / official GIANTS pattern).
            local ok = pcall(function()
                srv:broadcastEvent(makeEvent(), false)
            end)
            broadcastOk = ok == true
        end
    end

    return true, sentDirect, broadcastOk, deferred > 0
end

--- A temporarily unready client missed chunks; replay the latest committed export once ready.
function FarmDashboardExportMirror:_replayWhenReady()
    for conn in pairs(self._deferredReadyReplay or {}) do
        if conn.isConnected == false then
            self._deferredReadyReplay[conn] = nil
            if self._clients then self._clients[conn] = nil end
        elseif conn.isReadyForEvents ~= false then
            self._deferredReadyReplay[conn] = nil
            self:onClientJoined(conn)
            if Logging and Logging.info then
                Logging.info("[FarmDash] export mirror: client event stream ready; latest export replay queued")
            end
        end
    end
end

--- Same join path SettingsApi uses — register the connection and push mirror via sendEvent.
function FarmDashboardExportMirror.registerClientStateHook()
    local self = FarmDashboardExportMirror
    self:init()
    if self._joinHooked then
        return
    end
    if type(FSBaseMission) ~= "table" or type(Utils) ~= "table" or type(Utils.appendedFunction) ~= "function" then
        return
    end
    if type(FSBaseMission.sendInitialClientState) ~= "function" then
        return
    end
    self._joinHooked = true
    local replicaConfig = rawget(_G, "FarmDashboardReplicaConfig")
    if replicaConfig and type(replicaConfig.registerClientHook) == "function" then
        pcall(function() replicaConfig.registerClientHook() end)
    end
    FSBaseMission.sendInitialClientState = Utils.appendedFunction(FSBaseMission.sendInitialClientState,
        function(_mission, connection, _user, _farm)
            local mirror = rawget(_G, "FarmDashboardExportMirror")
            if mirror and mirror.onClientJoined then
                pcall(function()
                    mirror:onClientJoined(connection)
                end)
            end
        end)
    if Logging and Logging.info then
        Logging.info("[FarmDash] export mirror: sendInitialClientState hook registered")
    end
end

--- Client finished initial state sync — same moment Settings does connection:sendEvent.
function FarmDashboardExportMirror:onClientJoined(connection)
    self:init()
    if not _isAuthorityProcess() then
        if Logging and Logging.info then
            Logging.info("[FarmDash] export mirror: onClientJoined skipped (not authority)")
        end
        return
    end
    if connection == nil then
        if Logging and Logging.warning then
            Logging.warning("[FarmDash] export mirror: onClientJoined nil connection")
        end
        return
    end

    self:_registerClient(connection)
    if type(self._latestCommitted) == "table" then
        local owned = {}
        for key, value in pairs(self._latestCommitted) do owned[key] = value end
        if self._job == nil then
            self._pendingJob = { owned = owned }
            self._forceNext = true
        else
            self._joinReplay = owned
        end
    end
end

--- Loose JSON is not a replica. The route hands a captured schema-2 record to onCommittedEnvelope.
function FarmDashboardExportMirror:onAuthorityDataWritten(_jsonString, _saveSlot, _meta)
    self:init()
    self._lastReplicaOutcome = "loose-json-ignored"
    return "ignored"
end

local function plainId(value)
    if type(value) ~= "string" or value == "" or #value > 64 or string.find(value, "..", 1, true) then return false end
    return string.match(value, "^[A-Za-z0-9_%-]+$") ~= nil
end

--- sourceId is the desktop-owned folder name from replicaSources.xml (or a verified renewal of it); it never comes
--- from the stream. careerId, when given, pins the binding: transfers that claim another career are refused.
function FarmDashboardExportMirror:registerReplicaSource(connection, sourceId, careerId)
    self:init()
    if connection == nil or not plainId(sourceId) then return false end
    if careerId ~= nil and not plainId(careerId) then return false end
    self._replicaSources = self._replicaSources or {}
    self._lifetimes = self._lifetimes or {}
    self._bindings = self._bindings or {}
    local finalizer = rawget(_G, "FarmDashboardExportFinalizer")
    if finalizer and finalizer.retireConnection then finalizer.retireConnection(self, connection) end
    self._lifetimeSerial = (self._lifetimeSerial or 0) + 1
    self._registrationSerial = (self._registrationSerial or 0) + 1
    self._lifetimes[connection] = self._lifetimeSerial
    self._bindings[connection] = {
        sourceId = sourceId,
        generation = self._registrationSerial,
        lifetime = self._lifetimeSerial,
        missionGeneration = self._mirrorGeneration,
        careerId = careerId,
    }
    self._replicaSources[connection] = sourceId
    return true
end

function FarmDashboardExportMirror:noteDisconnect(connection)
    self:init()
    local finalizer = rawget(_G, "FarmDashboardExportFinalizer")
    if finalizer and finalizer.retireConnection then finalizer.retireConnection(self, connection) end
    if self._replicaSources and connection ~= nil then self._replicaSources[connection] = nil end
    if self._bindings and connection ~= nil then self._bindings[connection] = nil end
    if self._lifetimes and connection ~= nil then self._lifetimes[connection] = nil end
    if self._clients and connection ~= nil then self._clients[connection] = nil end
    self._sendEpoch = (self._sendEpoch or 1) + 1
    self._transferSerial = 0
end

function FarmDashboardExportMirror:cancelMatching(sessionToken)
    self:init()
    if self._job and self._job.owned and self._job.owned.sessionToken == sessionToken then
        self._job = nil
    end
    if self._pendingJob and self._pendingJob.owned and self._pendingJob.owned.sessionToken == sessionToken then
        self._pendingJob = nil
    end
    if self._joinReplay and self._joinReplay.sessionToken == sessionToken then
        self._joinReplay = nil
    end
    if self._latestCommitted and self._latestCommitted.sessionToken == sessionToken then
        self._latestCommitted = nil
    end
end

local function copyOwned(record)
    local owned = {}
    for key, value in pairs(record) do owned[key] = value end
    return owned
end

function FarmDashboardExportMirror:_beginOwnedJob(owned, force)
    local nowMs = _nowMs()
    local minGap = self.MIN_STREAM_INTERVAL_MS or 15000
    if nowMs ~= nil and
        ((force ~= true and self._lastJobStartMs ~= nil and (nowMs - self._lastJobStartMs) < minGap) or
         (self._lastJobFinishMs ~= nil and (nowMs - self._lastJobFinishMs) < minGap)) then
        self._pendingJob = { owned = owned }
        return "throttled"
    end
    self._lastJobStartMs = nowMs
    local epoch = self._sendEpoch or 1
    self._transferSerial = (self._transferSerial or 0) + 1
    local transferId = tostring(epoch) .. "-" .. tostring(self._transferSerial)
    owned.connectionEpoch = epoch
    owned.transferId = transferId
    local payload = owned.payload
    local chunkBytes = math.max(256, math.min(1024, self.CHUNK_BYTES or 1024))
    local totalLen = #payload
    local totalChunks = math.max(1, math.ceil(totalLen / chunkBytes))
    local maxChunks = FarmDashboardExportEvent and FarmDashboardExportEvent.MAX_CHUNKS or 10923
    local maxDeclared = FarmDashboardExportEvent and FarmDashboardExportEvent.MAX_DECLARED_BYTES or 11184812
    if totalChunks > maxChunks or totalLen > maxDeclared or totalLen < 1 then
        self._lastReplicaOutcome = "oversize"
        return "refused"
    end
    self._job = {
        owned = owned,
        jsonString = payload,
        chunkBytes = chunkBytes,
        totalChunks = totalChunks,
        nextChunk = 1,
        totalLen = totalLen,
        transferId = transferId,
        meta = {
            wireVersion = 2,
            connectionEpoch = epoch,
            transferId = transferId,
            declaredBytes = totalLen,
            decodedBytes = tonumber(owned.bytes) or 0,
            crc = owned.crc,
            careerId = owned.careerId,
            sessionId = owned.sessionId,
            publicationSequence = tonumber(owned.publicationSequence) or 0,
            exportGeneration = tonumber(owned.exportGeneration) or 0,
            sourceSlot = owned.sourceSlot,
            schema = owned.schema,
            encoding = owned.encoding,
            simulationTimeMs = owned.simulationTimeMs,
            sessionToken = owned.sessionToken,
        },
    }
    if Logging and Logging.info then
        local clients = 0
        for _ in pairs(self._clients or {}) do clients = clients + 1 end
        Logging.info(
            "[FarmDash] export mirror: stream started transferId=%s generation=%s chunks=%d bytes=%d clients=%d",
            transferId, tostring(owned.exportGeneration), totalChunks, totalLen, clients
        )
    end
    return "started"
end

function FarmDashboardExportMirror:onCommittedEnvelope(record)
    self:init()
    if type(record) ~= "table" or type(record.payload) ~= "string" or record.payload == "" then
        self._lastReplicaOutcome = "capture-empty"
        return "refused"
    end
    if record.schema ~= "2" or record.encoding ~= "base64" then
        self._lastReplicaOutcome = "schema"
        return "refused"
    end
    if tostring(record.exportGeneration) == "0" or tostring(record.publicationSequence) == "0" then
        self._lastReplicaOutcome = "startup"
        return "refused"
    end
    local owned = copyOwned(record)
    self._latestCommitted = copyOwned(record)
    if self._job ~= nil then
        self._pendingJob = { owned = owned }
        return "held"
    end
    return self:_beginOwnedJob(owned, false)
end

function FarmDashboardExportMirror:startJob(jsonString, saveSlot, force)
    self:init()
    self._lastReplicaOutcome = "loose-json-ignored"
    return "ignored"
end

function FarmDashboardExportMirror:cancelJob()
    self:init()
    self._mirrorGeneration = (self._mirrorGeneration or 1) + 1
    self._job = nil
    self._pendingJob = nil
    self._joinReplay = nil
    self._latestCommitted = nil
    self._forceNext = nil
    self._lastJobFinishMs = nil
    local finalizer = rawget(_G, "FarmDashboardExportFinalizer")
    if finalizer and finalizer.retireAll then finalizer.retireAll(self) end
    self._receiveBufs = {}
    self._bindings = {}
    self._lifetimes = {}
    self._replicaSources = {}
    self._clients = {}
    self._deferredReadyReplay = {}
end

function FarmDashboardExportMirror:_startPendingJobIfAny()
    local pending = self._pendingJob
    if not pending or type(pending.owned) ~= "table" then
        self._pendingJob = nil
        return
    end
    self._pendingJob = nil
    self:_beginOwnedJob(pending.owned, true)
end

--- Frame-budgeted sender (authority update loop).
function FarmDashboardExportMirror:update(_dt)
    self:init()
    self:_sweepReceives()
    self:_runFinalizer()
    if not _isAuthorityProcess() then
        return
    end
    self:_replayWhenReady()

    local job = self._job
    if not job then
        -- The start helper applies both the normal gap and post-stream settling.
        if self._pendingJob ~= nil then
            local force = self._forceNext == true
            self._forceNext = nil
            local pending = self._pendingJob
            self._pendingJob = nil
            self:_beginOwnedJob(pending.owned, force)
            job = self._job
        end
        if not job then
            return
        end
    end

    if not FarmDashboardExportEvent then
        if Logging and Logging.warning then
            Logging.warning("[FarmDash] export mirror: FarmDashboardExportEvent missing — abort job")
        end
        self._job = nil
        return
    end

    local perFrame = math.max(1, self.CHUNKS_PER_FRAME or 2)
    local nowMs = _nowMs()
    if type(nowMs) == "number" then
        local burst = math.max(job.chunkBytes, self.SEND_BURST_BYTES or 2048)
        local rate = math.max(job.chunkBytes, self.SEND_BYTES_PER_SECOND or 24576)
        if job.lastSendBudgetMs == nil then
            job.sendBudget = burst
        else
            local elapsed = math.max(0, nowMs - job.lastSendBudgetMs)
            job.sendBudget = math.min(burst, (job.sendBudget or 0) + elapsed * rate / 1000)
        end
        job.lastSendBudgetMs = nowMs
    else
        -- Preserve the old frame budget if this engine clock is unavailable.
        job.sendBudget = nil
        job.lastSendBudgetMs = nil
    end

    for _ = 1, perFrame do
        if job.nextChunk > job.totalChunks then
            if _fdVerbose() and Logging and Logging.info then
                Logging.info("[FarmDash] export mirror: STREAM DONE chunks=%d", job.totalChunks)
            end
            self._job = nil
            self._lastJobFinishMs = _nowMs()
            if self._joinReplay ~= nil and self._pendingJob == nil then
                self._pendingJob = { owned = self._joinReplay }
                self._joinReplay = nil
                self._forceNext = true
            end
            self:_startPendingJobIfAny()
            return
        end

        local i = job.nextChunk
        local startIdx = ((i - 1) * job.chunkBytes) + 1
        local stopIdx = math.min(job.totalLen, startIdx + job.chunkBytes - 1)
        local chunkData = string.sub(job.jsonString, startIdx, stopIdx)
        if job.sendBudget ~= nil and job.sendBudget < #chunkData then
            return
        end

        local ok, sentDirect, broadcastOk, deferred = self:_dispatchChunk(i, job.totalChunks, chunkData, job.meta)
        if job.sendBudget ~= nil then
            job.sendBudget = math.max(0, job.sendBudget - #chunkData)
        end

        local mode = deferred and "deferred"
            or ((tonumber(sentDirect) or 0) > 0 and "direct")
            or (broadcastOk and "broadcast") or "none"
        if Logging and Logging.info and (i == 1 or i == job.totalChunks or mode ~= job.lastDeliveryMode) then
            Logging.info(
                "[FarmDash] export mirror: dispatch progress transferId=%s generation=%s chunk=%d/%d mode=%s direct=%d broadcast=%s",
                tostring(job.transferId), tostring(job.meta.exportGeneration), i, job.totalChunks,
                mode, tonumber(sentDirect) or 0, tostring(broadcastOk)
            )
        end
        job.lastDeliveryMode = mode

        if _fdVerbose() and Logging and Logging.info and (i == 1 or i == job.totalChunks or (i % 25) == 0) then
            Logging.info(
                "[FarmDash] export mirror: dispatch chunk %d/%d bytes=%d sendEventClients=%d broadcastOk=%s ok=%s",
                i,
                job.totalChunks,
                #chunkData,
                tonumber(sentDirect) or 0,
                tostring(broadcastOk),
                tostring(ok)
            )
        end

        -- Throttled: a fully broken pipe would otherwise warn once per chunk (~800 lines).
        if (not deferred and (not ok or ((tonumber(sentDirect) or 0) < 1 and not broadcastOk)))
            and (i == 1 or (i % 100) == 0)
            and Logging and Logging.warning then
            Logging.warning(
                "[FarmDash] export mirror: dispatch FAILED chunk %d/%d (sendEventClients=%s broadcastOk=%s)",
                i,
                job.totalChunks,
                tostring(sentDirect),
                tostring(broadcastOk)
            )
        end

        job.nextChunk = i + 1
    end
end

local function validReplicaId(value)
    if type(value) ~= "string" or value == "" or #value > 64 then return false end
    if string.find(value, "..", 1, true) then return false end
    return string.match(value, "^[A-Za-z0-9_%-]+$") ~= nil
end

local function stillOwns(mirror, job)
    if job == nil or job.released then return false end
    local finalizer = rawget(_G, "FarmDashboardExportFinalizer")
    if finalizer == nil or type(finalizer.ownerIsCurrent) ~= "function" then return false end
    return finalizer.ownerIsCurrent(mirror, job) == true
end

local function releaseHandle(handle)
    if handle == nil or handle == 0 or handle == false then return true end
    if type(delete) ~= "function" then return false end
    local ok = pcall(delete, handle)
    return ok == true
end

local function noteRelease(mirror, job, handle, phase)
    local ok = releaseHandle(handle)
    if not ok and mirror ~= nil then
        mirror._lastCleanupError = "cleanup-unconfirmed"
        local recorded = phase
        if type(recorded) ~= "string" and job ~= nil then recorded = job.phase end
        if type(recorded) == "string" then mirror._lastCleanupPhase = recorded end
    end
    return ok
end

local function releaseOrRetire(mirror, job, handle, phase)
    noteRelease(mirror, job, handle, phase)
    return false, "retired"
end

local function writeCheckedXml(path, rootName, fields, order, mirror, job)
    if type(createXMLFile) ~= "function" or type(setXMLString) ~= "function" or type(saveXMLFile) ~= "function" then
        return false
    end
    if type(loadXMLFile) ~= "function" or type(getXMLString) ~= "function" or type(delete) ~= "function" then
        return false
    end
    if job ~= nil and not stillOwns(mirror, job) then return false, "retired" end
    local cleanupPhase = job ~= nil and job.phase or nil
    local opened, handle = pcall(createXMLFile, "FarmDashReplica", path, rootName)
    if job ~= nil and not stillOwns(mirror, job) then
        return releaseOrRetire(mirror, job, handle, cleanupPhase)
    end
    if not opened or handle == nil or handle == 0 or handle == false then return false end
    for i = 1, #order do
        if job ~= nil and not stillOwns(mirror, job) then
            return releaseOrRetire(mirror, job, handle, cleanupPhase)
        end
        local name = order[i]
        pcall(setXMLString, handle, rootName .. "#" .. name, fields[name])
        if job ~= nil and not stillOwns(mirror, job) then
            return releaseOrRetire(mirror, job, handle, cleanupPhase)
        end
    end
    if job ~= nil and not stillOwns(mirror, job) then
        return releaseOrRetire(mirror, job, handle, cleanupPhase)
    end
    local count = 0
    local first = nil
    local savedOk = pcall(function()
        local function capture(...)
            count = select("#", ...)
            if count > 0 then first = select(1, ...) end
        end
        capture(saveXMLFile(handle))
    end)
    local releasedWriter = noteRelease(mirror, job, handle, cleanupPhase)
    local retired = job ~= nil and not stillOwns(mirror, job)
    if not releasedWriter then
        if retired then return false, "retired" end
        return false, "cleanup-unconfirmed"
    end
    if retired then return false, "retired" end
    if not savedOk or count < 1 or first ~= true then return false end
    if job ~= nil and not stillOwns(mirror, job) then return false, "retired" end
    local loaded, reader = pcall(loadXMLFile, "FarmDashReplica", path)
    if job ~= nil and not stillOwns(mirror, job) then
        return releaseOrRetire(mirror, job, reader, cleanupPhase)
    end
    if not loaded or reader == nil or reader == 0 or reader == false then return false end
    local matches = true
    for i = 1, #order do
        if job ~= nil and not stillOwns(mirror, job) then
            return releaseOrRetire(mirror, job, reader, cleanupPhase)
        end
        local name = order[i]
        local ok, got = pcall(getXMLString, reader, rootName .. "#" .. name)
        if not ok or got ~= fields[name] then matches = false end
    end
    local releasedReader = noteRelease(mirror, job, reader, cleanupPhase)
    if job ~= nil and not stillOwns(mirror, job) then return false, "retired" end
    if not releasedReader then return false, "cleanup-unconfirmed" end
    return matches
end

local SELECTION_FIELDS = {
    "selectionSchema", "replicaRevision", "sourceId", "sourceSlot", "connectionEpoch",
    "replica", "slot", "schema", "careerId", "sessionId", "publicationSequence",
    "exportGeneration", "simulationTimeMs", "encoding", "bytes", "crc",
}
local SLOT_FIELDS = {
    "schema", "careerId", "sessionId", "publicationSequence", "exportGeneration",
    "simulationTimeMs", "encoding", "bytes", "crc", "payload",
}

local function canonicalDecimal(value, minValue, maxValue)
    if type(value) ~= "string" then return nil end
    if value == "0" then
        if minValue > 0 then return nil end
        return 0
    end
    if string.match(value, "^[1-9][0-9]*$") == nil or #value > 15 then return nil end
    local number = tonumber(value)
    if number == nil or number < minValue or number > maxValue or number ~= math.floor(number) then return nil end
    return number
end

local function releaseStore(mirror, job)
    if mirror._storeTurns and job and job.dir and mirror._storeTurns[job.dir] == job then
        mirror._storeTurns[job.dir] = nil
    end
end

function FarmDashboardExportMirror:_releasePublicationResources(job)
    if type(job) ~= "table" then return end
    releaseStore(self, job)
    job.recoverPairs = nil
    job._pendingPair = nil
    job._payloadCheck = nil
    job._pairCompareAt = nil
    job._incomingAt = nil
    job._pairMismatch = nil
    job.assembled = nil
    job._compareMismatch = nil
end

FarmDashboardExportMirror._formatChecksum = function(ticks)
    if ticks < 0 then ticks = ticks + 4294967296 end
    if ticks == 0 then return "0" end
    local digits = {}
    local value = ticks
    while value >= 1 do
        digits[#digits + 1] = string.char(48 + math.floor(value % 10))
        value = math.floor(value / 10)
    end
    local out = {}
    for i = #digits, 1, -1 do out[#out + 1] = digits[i] end
    return table.concat(out)
end

FarmDashboardExportMirror._recoverySpend = function(work, count)
    local amount = count
    if type(work) == "table" then
        amount = math.min(count, work.remaining or 0)
        if amount < 0 then amount = 0 end
        work.remaining = (work.remaining or 0) - amount
        work.used = (work.used or 0) + amount
    end
    return amount
end

local function claimStore(mirror, job, dir)
    mirror._storeTurns = mirror._storeTurns or {}
    local held = mirror._storeTurns[dir]
    if held and held ~= job and not held.released then
        local finalizer = rawget(_G, "FarmDashboardExportFinalizer")
        if finalizer and finalizer.ownerIsCurrent(mirror, held) then return false end
    end
    mirror._storeTurns[dir] = job
    job.dir = dir
    return true
end

local function readStoredDocument(path, root, names, mirror, job)
    if not stillOwns(mirror, job) then return "retired" end
    if type(loadXMLFile) ~= "function" or type(getXMLString) ~= "function" then return "unknown" end
    -- A missing path makes loadXMLFile log an engine error even inside pcall; a first publish probes absent slots.
    if type(fileExists) == "function" then
        local probed, present = pcall(fileExists, path)
        if not stillOwns(mirror, job) then return "retired" end
        if probed and present == false then return "absent" end
    end
    local loaded, reader = pcall(loadXMLFile, "FarmDashReplicaRecover", path)
    if not stillOwns(mirror, job) then
        if type(reader) == "number" and reader ~= 0 then noteRelease(mirror, job, reader, "recover") end
        return "retired"
    end
    if not loaded or type(reader) ~= "number" or reader == 0 then
        local presence = "unknown"
        if type(fileExists) == "function" then
            local ok, present = pcall(fileExists, path)
            if not stillOwns(mirror, job) then return "retired" end
            if ok and present == true then presence = "present"
            elseif ok and present == false then presence = "absent"
            end
        end
        if presence == "absent" then return "absent" end
        if presence == "present" then return "unreadable" end
        return "unknown"
    end
    local fields = {}
    for i = 1, #names do
        if not stillOwns(mirror, job) then
            noteRelease(mirror, job, reader, "recover")
            return "retired"
        end
        local ok, got = pcall(getXMLString, reader, root .. "#" .. names[i])
        if not ok then
            noteRelease(mirror, job, reader, "recover")
            return "unreadable"
        end
        fields[names[i]] = got
    end
    local released = noteRelease(mirror, job, reader, "recover")
    if not stillOwns(mirror, job) then return "retired" end
    if not released then return "unreadable" end
    return fields
end

local function classifyStoredPair(dir, letter, sourceId, mirror, job)
    local slot = readStoredDocument(dir .. "slot-" .. letter .. ".xml", "farmDashboardExport", SLOT_FIELDS, mirror, job)
    if slot == "retired" then return "retired" end
    local selection = readStoredDocument(dir .. "selection-" .. letter .. ".xml", "farmDashboardReplicaSelection", SELECTION_FIELDS, mirror, job)
    if selection == "retired" or slot == "retired" then return "retired" end
    if slot == "absent" and selection == "absent" then return "absent" end
    if slot == "unknown" or selection == "unknown" then return "unknown" end
    if slot == "unreadable" or selection == "unreadable" then return "unreadable" end
    if type(slot) ~= "table" or type(selection) ~= "table" then return "invalid" end
    if selection.selectionSchema ~= "1" or selection.replica ~= "true" or selection.slot ~= letter then return "invalid" end
    if selection.sourceId ~= sourceId or selection.schema ~= "2" or selection.encoding ~= "base64" then return "invalid" end
    local revision = canonicalDecimal(selection.replicaRevision, 1, 2147483647)
    local sequence = canonicalDecimal(selection.publicationSequence, 1, 2147483647)
    if revision == nil or sequence == nil then return "invalid" end
    if slot.schema ~= "2" or slot.encoding ~= "base64" then return "invalid" end
    if not validReplicaId(slot.careerId) or not validReplicaId(slot.sessionId) then return "invalid" end
    if not validReplicaId(selection.careerId) or not validReplicaId(selection.sessionId) or not validReplicaId(selection.sourceSlot) then return "invalid" end
    if canonicalDecimal(selection.connectionEpoch, 0, 2147483647) == nil then return "invalid" end
    if canonicalDecimal(selection.exportGeneration, 1, 2147483647) == nil or canonicalDecimal(slot.exportGeneration, 1, 2147483647) == nil then return "invalid" end
    if selection.simulationTimeMs ~= "unknown" and canonicalDecimal(selection.simulationTimeMs, 0, 999999999999999) == nil then return "invalid" end
    if slot.simulationTimeMs ~= "unknown" and canonicalDecimal(slot.simulationTimeMs, 0, 999999999999999) == nil then return "invalid" end
    if canonicalDecimal(selection.bytes, 0, 8388608) == nil or canonicalDecimal(selection.crc, 0, 4294967295) == nil then return "invalid" end
    if slot.careerId ~= selection.careerId or slot.sessionId ~= selection.sessionId then return "invalid" end
    if slot.publicationSequence ~= selection.publicationSequence or slot.exportGeneration ~= selection.exportGeneration then return "invalid" end
    if slot.simulationTimeMs ~= selection.simulationTimeMs or slot.crc ~= selection.crc or slot.bytes ~= selection.bytes then return "invalid" end
    if type(slot.payload) ~= "string" or slot.payload == "" then return "invalid" end
    return { letter = letter, revision = revision, sequence = sequence, slot = slot, selection = selection }
end

FarmDashboardExportMirror._recoveryAlphabetValue = function(ch)
    local alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
    local pos = string.find(alphabet, ch, 1, true)
    if pos == nil then return nil end
    return pos - 1
end

FarmDashboardExportMirror._beginPayloadCheck = function(payload, declaredBytes, declaredCrc)
    if type(payload) ~= "string" or payload == "" or #payload > 11184812 or (#payload % 4) ~= 0 then return nil end
    local bytes = canonicalDecimal(declaredBytes, 0, 8388608)
    local crc = canonicalDecimal(declaredCrc, 0, 4294967295)
    if bytes == nil or crc == nil then return nil end
    return { at = 0, a = 1, b = 0, decoded = 0, bytes = bytes, crc = FarmDashboardExportMirror._formatChecksum(crc), payload = payload, jsonMode = "start", stack = "" }
end

FarmDashboardExportMirror._noteKeyChar = function(check, code)
    local at = check.keyAt or 0
    local mask = check.keyMask or 0
    local nextMask = 0
    if mask % 2 == 1 and at < 9 and code == string.byte("__proto__", at + 1) then nextMask = nextMask + 1 end
    if math.floor(mask / 2) % 2 == 1 and at < 11 and code == string.byte("constructor", at + 1) then nextMask = nextMask + 2 end
    if math.floor(mask / 4) % 2 == 1 and at < 9 and code == string.byte("prototype", at + 1) then nextMask = nextMask + 4 end
    check.keyMask = nextMask
    check.keyAt = at + 1
end

FarmDashboardExportMirror._keyForbidden = function(check)
    local at = check.keyAt or 0
    local mask = check.keyMask or 0
    if mask % 2 == 1 and at == 9 then return true end
    if math.floor(mask / 2) % 2 == 1 and at == 11 then return true end
    if math.floor(mask / 4) % 2 == 1 and at == 9 then return true end
    return false
end

FarmDashboardExportMirror._finishJsonValue = function(check)
    if (check.stack or "") == "" then
        check.jsonMode = "done"
        return "ok"
    end
    local top = string.sub(check.stack, -1)
    check.jsonMode = top == "o" and "obj-next" or "arr-next"
    return "ok"
end

FarmDashboardExportMirror._feedRecoveredByte = function(check, byte)
    local function invalid() return "invalid" end
    local function ws(value) return value == 32 or value == 9 or value == 10 or value == 13 end
    local need = check.utfNeed or 0
    if need > 0 then
        if byte < 128 or byte > 191 then return invalid() end
        local lead = check.utfLead or 0
        if lead == 1 and byte < 160 then return invalid() end
        if lead == 2 and byte > 159 then return invalid() end
        if lead == 3 and byte < 144 then return invalid() end
        if lead == 4 and byte > 143 then return invalid() end
        check.utfLead = 0
        check.utfCp = (check.utfCp or 0) * 64 + (byte - 128)
        check.utfNeed = need - 1
        if check.utfNeed == 0 and ((check.utfCp or 0) < (check.utfMin or 0) or (check.utfCp or 0) > 1114111) then return invalid() end
        if check.jsonMode ~= "string" and check.jsonMode ~= "keystring" then return invalid() end
        if check.utfNeed == 0 and check.jsonMode == "keystring" then
            FarmDashboardExportMirror._noteKeyChar(check, check.utfCp or 0)
        end
        return "ok"
    end
    if byte >= 128 then
        if check.jsonMode ~= "string" and check.jsonMode ~= "keystring" then return invalid() end
        if byte >= 194 and byte <= 223 then
            check.utfNeed = 1
            check.utfCp = byte - 192
            check.utfMin = 128
        elseif byte == 224 then
            check.utfNeed = 2
            check.utfCp = 0
            check.utfMin = 2048
            check.utfLead = 1
        elseif byte >= 225 and byte <= 236 or byte == 238 or byte == 239 then
            check.utfNeed = 2
            check.utfCp = byte - 224
            check.utfMin = 2048
        elseif byte == 237 then
            check.utfNeed = 2
            check.utfCp = 13
            check.utfMin = 2048
            check.utfLead = 2
        elseif byte == 240 then
            check.utfNeed = 3
            check.utfCp = 0
            check.utfMin = 65536
            check.utfLead = 3
        elseif byte >= 241 and byte <= 243 then
            check.utfNeed = 3
            check.utfCp = byte - 240
            check.utfMin = 65536
        elseif byte == 244 then
            check.utfNeed = 3
            check.utfCp = 4
            check.utfMin = 65536
            check.utfLead = 4
        else
            return invalid()
        end
        return "ok"
    end
    local mode = check.jsonMode or "start"
    if mode == "done" then
        if ws(byte) then return "ok" end
        return invalid()
    end
    if mode == "literal" then
        if byte ~= string.byte(check.lit, 1) then return invalid() end
        check.lit = string.sub(check.lit, 2)
        if check.lit == "" then return FarmDashboardExportMirror._finishJsonValue(check) end
        return "ok"
    end
    if mode == "number" then
        local phase = check.numPhase
        local digit = byte >= 48 and byte <= 57
        local function finishNumber()
            FarmDashboardExportMirror._finishJsonValue(check)
            return FarmDashboardExportMirror._feedRecoveredByte(check, byte)
        end
        if phase == "sign" then
            if not digit then return invalid() end
            check.numPhase = byte == 48 and "zero" or "int"
            return "ok"
        end
        if phase == "zero" then
            if byte == 46 then check.numPhase = "dot" return "ok" end
            if byte == 101 or byte == 69 then check.numPhase = "exp" return "ok" end
            return finishNumber()
        end
        if phase == "int" then
            if digit then return "ok" end
            if byte == 46 then check.numPhase = "dot" return "ok" end
            if byte == 101 or byte == 69 then check.numPhase = "exp" return "ok" end
            return finishNumber()
        end
        if phase == "dot" then
            if not digit then return invalid() end
            check.numPhase = "frac"
            return "ok"
        end
        if phase == "frac" then
            if digit then return "ok" end
            if byte == 101 or byte == 69 then check.numPhase = "exp" return "ok" end
            return finishNumber()
        end
        if phase == "exp" then
            if byte == 43 or byte == 45 then check.numPhase = "expsign" return "ok" end
            if digit then check.numPhase = "expdigit" return "ok" end
            return invalid()
        end
        if phase == "expsign" then
            if not digit then return invalid() end
            check.numPhase = "expdigit"
            return "ok"
        end
        if phase == "expdigit" then
            if digit then return "ok" end
            return finishNumber()
        end
        return invalid()
    end
    if mode == "escape" then
        local decoded = nil
        if byte == 117 then
            check.jsonMode = "uhex"
            check.hexLeft = 4
            check.hexValue = 0
            return "ok"
        elseif byte == 34 then decoded = 34
        elseif byte == 92 then decoded = 92
        elseif byte == 47 then decoded = 47
        elseif byte == 98 then decoded = 8
        elseif byte == 102 then decoded = 12
        elseif byte == 110 then decoded = 10
        elseif byte == 114 then decoded = 13
        elseif byte == 116 then decoded = 9
        else return invalid() end
        check.jsonMode = check.escapeFrom
        if check.escapeFrom == "keystring" then FarmDashboardExportMirror._noteKeyChar(check, decoded) end
        return "ok"
    end
    if mode == "uhex" then
        local nibble = nil
        if byte >= 48 and byte <= 57 then nibble = byte - 48
        elseif byte >= 65 and byte <= 70 then nibble = byte - 55
        elseif byte >= 97 and byte <= 102 then nibble = byte - 87
        end
        if nibble == nil then return invalid() end
        check.hexValue = (check.hexValue or 0) * 16 + nibble
        check.hexLeft = check.hexLeft - 1
        if check.hexLeft == 0 then
            check.jsonMode = check.escapeFrom
            if check.escapeFrom == "keystring" then FarmDashboardExportMirror._noteKeyChar(check, check.hexValue or 0) end
        end
        return "ok"
    end
    if mode == "keystring" or mode == "string" then
        if byte == 34 then
            if mode == "keystring" then
                if FarmDashboardExportMirror._keyForbidden(check) then return invalid() end
                check.jsonMode = "colon"
            else
                return FarmDashboardExportMirror._finishJsonValue(check)
            end
            return "ok"
        end
        if byte == 92 then
            check.escapeFrom = mode
            check.jsonMode = "escape"
            return "ok"
        end
        if byte < 32 then return invalid() end
        if mode == "keystring" then FarmDashboardExportMirror._noteKeyChar(check, byte) end
        return "ok"
    end
    if mode == "colon" then
        if ws(byte) then return "ok" end
        if byte == 58 then check.jsonMode = "value" return "ok" end
        return invalid()
    end
    if mode == "obj-next" or mode == "arr-next" then
        if ws(byte) then return "ok" end
        if byte == 44 then
            check.jsonMode = mode == "obj-next" and "obj-key" or "value"
            return "ok"
        end
        if mode == "obj-next" and byte == 125 then
            check.stack = string.sub(check.stack, 1, -2)
            return FarmDashboardExportMirror._finishJsonValue(check)
        end
        if mode == "arr-next" and byte == 93 then
            check.stack = string.sub(check.stack, 1, -2)
            return FarmDashboardExportMirror._finishJsonValue(check)
        end
        return invalid()
    end
    if mode == "start" or mode == "obj-empty" or mode == "obj-key" or mode == "value" or mode == "arr-empty" then
        if ws(byte) then return "ok" end
        if mode == "arr-empty" and not ws(byte) and byte ~= 93 then
            check.jsonMode = "value"
            return FarmDashboardExportMirror._feedRecoveredByte(check, byte)
        end
        if byte == 34 then
            if mode == "start" then return invalid() end
            if mode == "obj-empty" or mode == "obj-key" then
                check.keyMask = 7
                check.keyAt = 0
                check.jsonMode = "keystring"
            else
                check.jsonMode = "string"
            end
            return "ok"
        end
        if byte == 123 then
            if mode ~= "start" and mode ~= "value" then return invalid() end
            check.stack = (check.stack or "") .. "o"
            check.jsonMode = "obj-empty"
            return "ok"
        end
        if byte == 125 and mode == "obj-empty" then
            check.stack = string.sub(check.stack, 1, -2)
            return FarmDashboardExportMirror._finishJsonValue(check)
        end
        if byte == 91 and mode == "value" then
            check.stack = (check.stack or "") .. "a"
            check.jsonMode = "arr-empty"
            return "ok"
        end
        if byte == 93 and mode == "arr-empty" then
            check.stack = string.sub(check.stack, 1, -2)
            return FarmDashboardExportMirror._finishJsonValue(check)
        end
        if mode == "value" and (byte == 116 or byte == 102 or byte == 110) then
            check.jsonMode = "literal"
            check.lit = byte == 116 and "rue" or (byte == 102 and "alse" or "ull")
            return "ok"
        end
        if mode == "value" and byte == 45 then
            check.jsonMode = "number"
            check.numPhase = "sign"
            return "ok"
        end
        if mode == "value" and byte >= 48 and byte <= 57 then
            check.jsonMode = "number"
            check.numPhase = byte == 48 and "zero" or "int"
            return "ok"
        end
        return invalid()
    end
    return invalid()
end

FarmDashboardExportMirror._absorbDecoded = function(check, byteValue)
    check.a = (check.a + byteValue) % 65521
    check.b = (check.b + check.a) % 65521
    check.decoded = check.decoded + 1
end

FarmDashboardExportMirror._stepPayloadCheck = function(check, work)
    local payload = check.payload
    local room = type(work) == "table" and (work.remaining or 0) or (#payload - check.at)
    if room < 1 then return "continue" end
    local function expired()
        return type(work) == "table" and type(work.expired) == "function" and work.expired()
    end
    local index = check.at + 1
    local produced = 0
    while index + 3 <= #payload and produced + 4 <= room do
        if type(work) == "table" and type(work.ownerOk) == "function" and not work.ownerOk() then
            return "continue"
        end
        if expired() and (produced > 0 or check.at > 0) then
            return "continue"
        end
        local c1 = string.sub(payload, index, index)
        local c2 = string.sub(payload, index + 1, index + 1)
        local c3 = string.sub(payload, index + 2, index + 2)
        local c4 = string.sub(payload, index + 3, index + 3)
        local last = index + 3 == #payload
        FarmDashboardExportMirror._recoverySpend(work, 4)
        index = index + 4
        produced = produced + 4
        check.at = index - 1
        local v1 = FarmDashboardExportMirror._recoveryAlphabetValue(c1)
        local v2 = FarmDashboardExportMirror._recoveryAlphabetValue(c2)
        if v1 == nil or v2 == nil then return "invalid" end
        local v3 = 0
        local v4 = 0
        if c3 == "=" then
            if not last or c4 ~= "=" then return "invalid" end
        else
            v3 = FarmDashboardExportMirror._recoveryAlphabetValue(c3)
            if v3 == nil then return "invalid" end
        end
        if c4 == "=" then
            if not last then return "invalid" end
        else
            v4 = FarmDashboardExportMirror._recoveryAlphabetValue(c4)
            if v4 == nil then return "invalid" end
        end
        local padding = 0
        if c3 == "=" then
            padding = 2
        elseif c4 == "=" then
            padding = 1
        end
        if last and padding == 2 and (v2 % 16) ~= 0 then return "invalid" end
        if last and padding == 1 and (v3 % 4) ~= 0 then return "invalid" end
        local triple = v1 * 262144 + v2 * 4096 + v3 * 64 + v4
        local function take(value)
            FarmDashboardExportMirror._absorbDecoded(check, value)
            if FarmDashboardExportMirror._feedRecoveredByte(check, value) ~= "ok" then return false end
            return true
        end
        if not take(math.floor(triple / 65536) % 256) then return "invalid" end
        if c3 ~= "=" and not take(math.floor(triple / 256) % 256) then return "invalid" end
        if c4 ~= "=" and not take(triple % 256) then return "invalid" end
        if check.decoded > check.bytes then return "invalid" end
    end
    if check.at < #payload then
        if index + 3 > #payload then return "invalid" end
        return "continue"
    end
    if check.decoded ~= check.bytes then return "invalid" end
    if FarmDashboardExportMirror._formatChecksum(check.b * 65536 + check.a) ~= check.crc then return "invalid" end
    if (check.utfNeed or 0) ~= 0 then return "invalid" end
    if check.jsonMode ~= "done" then return "invalid" end
    if expired() then return "continue" end
    return "valid"
end

FarmDashboardExportMirror._commitTuple = function(item)
    local slot = item.slot
    return table.concat({
        slot.schema, slot.careerId, slot.sessionId, slot.publicationSequence,
        slot.exportGeneration, slot.simulationTimeMs, slot.encoding, slot.bytes, slot.crc,
    }, "|")
end

function FarmDashboardExportMirror:_recoverPublication(job, dir, fields, sourceId, work)
    local finalizer = rawget(_G, "FarmDashboardExportFinalizer")
    if not claimStore(self, job, dir) then return "continue" end
    if job.recoverLetter == nil then job.recoverLetter = "a" end
    if job.recoverPairs == nil then job.recoverPairs = {} end
    if job.recoverLetter == "a" or job.recoverLetter == "b" then
        local letter = job.recoverLetter
        if job._payloadCheck == nil and job.recoverPairs[letter] == nil then
            local classified = classifyStoredPair(dir, letter, sourceId, self, job)
            if classified == "retired" then
                releaseStore(self, job)
                self._lastProbeResult = "retired"
                self._lastReplicaOutcome = "cancelled"
                return "retired"
            end
            if type(classified) ~= "table" then
                job.recoverPairs[letter] = classified
                job.recoverLetter = letter == "a" and "b" or "decide"
                return "continue"
            end
            local check = FarmDashboardExportMirror._beginPayloadCheck(classified.slot.payload, classified.slot.bytes, classified.slot.crc)
            if check == nil then
                classified.slot.payload = nil
                job.recoverPairs[letter] = "invalid"
                job.recoverLetter = letter == "a" and "b" or "decide"
                return "continue"
            end
            job._pendingPair = classified
            job._payloadCheck = check
        end
        if job._payloadCheck ~= nil then
            local stepped = FarmDashboardExportMirror._stepPayloadCheck(job._payloadCheck, work)
            job._compareAt = job._payloadCheck.at
            if stepped == "continue" then return "continue" end
            local pending = job._pendingPair
            job._payloadCheck.payload = nil
            job._payloadCheck = nil
            job._pendingPair = nil
            if stepped ~= "valid" then
                if type(pending) == "table" and type(pending.slot) == "table" then pending.slot.payload = nil end
                job.recoverPairs[letter] = "invalid"
            else
                job.recoverPairs[letter] = pending
            end
            job.recoverLetter = letter == "a" and "b" or "decide"
            job._compareAt = nil
            return "continue"
        end
    end
    local a = job.recoverPairs.a
    local b = job.recoverPairs.b
    if a == "unknown" or b == "unknown" then
        releaseStore(self, job)
        self._lastProbeResult = "failed"
        self._lastReplicaOutcome = "probe-unknown"
        self._lastProbeError = "probe-unknown"
        return "failed"
    end
    if a == "unreadable" or b == "unreadable" then
        releaseStore(self, job)
        self._lastProbeResult = "failed"
        self._lastReplicaOutcome = "probe-unreadable"
        self._lastProbeError = "probe-unreadable"
        return "failed"
    end
    local function usable(item)
        return type(item) == "table"
    end
    local latest = nil
    if usable(a) and usable(b) then
        local sameLine = a.slot.careerId == b.slot.careerId and a.slot.sessionId == b.slot.sessionId
        local ambiguous = a.revision == b.revision or (sameLine and a.sequence == b.sequence)
        if ambiguous and FarmDashboardExportMirror._commitTuple(a) ~= FarmDashboardExportMirror._commitTuple(b) then
            releaseStore(self, job)
            self._lastReplicaOutcome = "conflict"
            return "failed"
        end
        if ambiguous and FarmDashboardExportMirror._commitTuple(a) == FarmDashboardExportMirror._commitTuple(b) then
            local left = a.slot.payload or ""
            local right = b.slot.payload or ""
            if job._pairCompareAt == nil then job._pairCompareAt = 0 end
            if type(work) == "table" and type(work.expired) == "function" and work.expired() then return "continue" end
            local span = math.max(#left, #right)
            local room = type(work) == "table" and (work.remaining or 0) or span
            local quantum = math.min(self._recoverySlice or 4096, room, math.max(0, span - job._pairCompareAt))
            if quantum > 0 then
                local nextAt = job._pairCompareAt + quantum
                FarmDashboardExportMirror._recoverySpend(work, quantum)
                if string.sub(left, job._pairCompareAt + 1, nextAt) ~= string.sub(right, job._pairCompareAt + 1, nextAt) then
                    job._pairMismatch = true
                end
                job._pairCompareAt = nextAt
            end
            if job._pairCompareAt < span then return "continue" end
            if job._pairMismatch or #left ~= #right then
                releaseStore(self, job)
                self._lastReplicaOutcome = "conflict"
                return "failed"
            end
        end
        if sameLine then
            latest = a.sequence > b.sequence and a or (b.sequence > a.sequence and b or (a.revision >= b.revision and a or b))
        else
            latest = a.revision >= b.revision and a or b
        end
    elseif usable(a) then
        latest = a
    elseif usable(b) then
        latest = b
    elseif a == "invalid" and b == "invalid" then
        releaseStore(self, job)
        self._lastReplicaOutcome = "recover-unproven"
        return "failed"
    end
    if latest == nil then
        if a == "invalid" or b == "invalid" then
            releaseStore(self, job)
            self._lastProbeResult = "failed"
            self._lastReplicaOutcome = "recover-unproven"
            return "failed"
        end
        job.slotLetter = "a"
        job.replicaRevision = 1
        job.recoverState = "ready"
        return "ready"
    end
    if job.owner and job.owner.careerId ~= nil and latest.slot.careerId ~= fields.careerId then
        releaseStore(self, job)
        self._lastReplicaOutcome = "career-mismatch"
        return "failed"
    end
    if job._incomingAt == nil then
        job._incomingAt = 0
        job._compareMismatch = nil
    end
    if type(work) == "table" and type(work.expired) == "function" and work.expired() then return "continue" end
    local payload = latest.slot.payload or ""
    local incoming = fields.payload or ""
    local limit = math.max(#payload, #incoming)
    local room = type(work) == "table" and (work.remaining or 0) or limit
    local quantum = math.min(self._recoverySlice or 4096, room, math.max(0, limit - job._incomingAt))
    if quantum < 1 and job._incomingAt < limit then return "continue" end
    local nextAt = job._incomingAt + quantum
    local storedSlice = string.sub(payload, job._incomingAt + 1, math.min(nextAt, #payload))
    local incomingSlice = string.sub(incoming, job._incomingAt + 1, math.min(nextAt, #incoming))
    if quantum > 0 then FarmDashboardExportMirror._recoverySpend(work, quantum) end
    job._incomingAt = nextAt
    job._compareAt = job._incomingAt
    if storedSlice ~= incomingSlice or #payload ~= #incoming then job._compareMismatch = true end
    if job._incomingAt < limit then return "continue" end
    local sameIdentity = latest.slot.careerId == fields.careerId
        and latest.slot.sessionId == fields.sessionId
        and latest.slot.publicationSequence == fields.publicationSequence
        and latest.slot.exportGeneration == fields.exportGeneration
        and latest.slot.simulationTimeMs == fields.simulationTimeMs
        and latest.slot.bytes == fields.bytes
        and latest.slot.crc == fields.crc
        and latest.slot.schema == fields.schema
    local sameLineage = latest.slot.careerId == fields.careerId and latest.slot.sessionId == fields.sessionId
    local incomingSequence = canonicalDecimal(fields.publicationSequence, 1, 2147483647)
    if sameLineage and incomingSequence ~= nil and latest.sequence == incomingSequence then
        if sameIdentity and not job._compareMismatch and #payload == #incoming then
            releaseStore(self, job)
            self._lastReplicaOutcome = "duplicate"
            job.phase = "completed"
            return "published"
        end
        releaseStore(self, job)
        self._lastReplicaOutcome = "conflict"
        return "failed"
    end
    if sameLineage and incomingSequence ~= nil and latest.sequence > incomingSequence then
        releaseStore(self, job)
        self._lastReplicaOutcome = "sequence-rollback"
        return "failed"
    end
    local maxRevision = latest.revision
    if usable(a) and a.revision > maxRevision then maxRevision = a.revision end
    if usable(b) and b.revision > maxRevision then maxRevision = b.revision end
    if maxRevision >= 2147483647 then
        releaseStore(self, job)
        self._lastReplicaOutcome = "revision-exhausted"
        return "failed"
    end
    local target = latest.letter == "a" and "b" or "a"
    local other = target == "a" and a or b
    if other == "unknown" or other == "unreadable" then
        releaseStore(self, job)
        self._lastReplicaOutcome = other == "unknown" and "probe-unknown" or "probe-unreadable"
        return "failed"
    end
    job.slotLetter = target
    job.replicaRevision = maxRevision + 1
    job.recoverState = "ready"
    return "ready"
end

function FarmDashboardExportMirror:_advancePublication(job, work)
    local finalizer = rawget(_G, "FarmDashboardExportFinalizer")
    if finalizer == nil or not finalizer.ownerIsCurrent(self, job) then
        self._lastReplicaOutcome = "cancelled"
        return "retired"
    end
    local meta = job.header or {}
    local sourceId = job.owner and job.owner.sourceId
    if job.phase == "assemble" then
        local parts = {}
        for i = 1, job.totalChunks do
            if type(job.parts[i]) ~= "string" then
                self._lastReplicaOutcome = "length"
                return "failed"
            end
            parts[i] = job.parts[i]
        end
        job.assembled = table.concat(parts)
        if #job.assembled ~= meta.declaredBytes then
            self._lastReplicaOutcome = "length"
            return "failed"
        end
        job.phase = "candidate"
        return "continue"
    end
    if not validReplicaId(sourceId) or not validReplicaId(meta.sourceSlot) or not validReplicaId(meta.careerId) or not validReplicaId(meta.sessionId) then
        self._lastReplicaOutcome = "unbound-source"
        return "failed"
    end
    if meta.schema ~= "2" or meta.encoding ~= "base64" then
        self._lastReplicaOutcome = "schema"
        return "failed"
    end
    if job.decodedCount ~= meta.decodedBytes then
        self._lastReplicaOutcome = "length"
        return "failed"
    end
    local root = self._replicaRoot
    if type(root) ~= "string" or root == "" then
        if type(getUserProfileAppPath) ~= "function" then
            self._lastReplicaOutcome = "store-unavailable"
            return "failed"
        end
        root = getUserProfileAppPath() .. "modSettings/FS25_FarmDashboard/replicas/"
    end
    if type(createFolder) == "function" then
        local parent = root
        if string.sub(parent, -1) == "/" then parent = string.sub(parent, 1, -2) end
        pcall(createFolder, parent)
        pcall(createFolder, parent .. "/" .. sourceId)
    end
    if not finalizer.ownerIsCurrent(self, job) then
        self._lastReplicaOutcome = "cancelled"
        return "retired"
    end
    local dir = root .. sourceId .. "/"
    if string.sub(root, -1) ~= "/" then dir = root .. "/" .. sourceId .. "/" end
    job.dir = dir
    local order = {
        "schema", "careerId", "sessionId", "publicationSequence", "exportGeneration",
        "simulationTimeMs", "encoding", "bytes", "crc", "payload",
    }
    local fields = {
        schema = "2",
        careerId = meta.careerId,
        sessionId = meta.sessionId,
        publicationSequence = tostring(meta.publicationSequence),
        exportGeneration = tostring(meta.exportGeneration),
        simulationTimeMs = tostring(meta.simulationTimeMs or "unknown"),
        encoding = "base64",
        bytes = tostring(job.decodedCount),
        crc = tostring(meta.crc),
        payload = job.assembled,
    }
    self._nativeOps = (self._nativeOps or 0) + 1
    local function rejectWrite(wrote, detail, genericOutcome)
        if detail == "retired" or not finalizer.ownerIsCurrent(self, job) then
            releaseStore(self, job)
            self._lastReplicaOutcome = "cancelled"
            return "retired"
        end
        if not wrote then
            releaseStore(self, job)
            self._lastReplicaOutcome = detail == "cleanup-unconfirmed" and "cleanup-unconfirmed" or genericOutcome
            return "failed"
        end
        return nil
    end
    if job.phase == "candidate" then
        if job.recoverState ~= "ready" then
            if type(work) == "table" and (work.remaining or 0) < 1 then return "continue" end
            local stepped = self:_recoverPublication(job, dir, fields, sourceId, work)
            if stepped ~= "ready" then return stepped end
            if type(work) == "table" and type(work.expired) == "function" and work.expired() then return "continue" end
        end
        local slotLetter = job.slotLetter or "a"
        job.slotLetter = slotLetter
        local wrote, detail = writeCheckedXml(dir .. "slot-" .. slotLetter .. ".xml", "farmDashboardExport", fields, order, self, job)
        local rejected = rejectWrite(wrote, detail, "candidate-failed")
        if rejected then return rejected end
        job.phase = "selection"
        return "continue"
    end
    if job.phase == "selection" then
        local slotLetter = job.slotLetter
        local selection = {
            selectionSchema = "1",
            replicaRevision = tostring(job.replicaRevision or 1),
            sourceId = sourceId,
            sourceSlot = meta.sourceSlot,
            connectionEpoch = tostring(meta.connectionEpoch),
            replica = "true",
            slot = slotLetter,
            schema = "2",
            careerId = meta.careerId,
            sessionId = meta.sessionId,
            publicationSequence = tostring(meta.publicationSequence),
            exportGeneration = tostring(meta.exportGeneration),
            simulationTimeMs = tostring(meta.simulationTimeMs or "unknown"),
            encoding = "base64",
            bytes = tostring(job.decodedCount),
            crc = tostring(meta.crc),
        }
        local wrote, detail = writeCheckedXml(dir .. "selection-" .. slotLetter .. ".xml", "farmDashboardReplicaSelection", selection, SELECTION_FIELDS, self, job)
        local rejected = rejectWrite(wrote, detail, "context-failed")
        if rejected then return rejected end
        self._publishedSlots = self._publishedSlots or {}
        self._publishedSlots[sourceId] = slotLetter
        job.phase = "selected"
        return "continue"
    end
    local function alreadyStored(path)
        local function lost()
            return not finalizer.ownerIsCurrent(self, job)
        end
        if lost() then return "retired" end
        if type(loadXMLFile) ~= "function" then
            self._lastProbeError = "probe-failed"
            self._lastCleanupPhase = "selected"
            return "failed"
        end
        if type(fileExists) == "function" then
            local probed, present = pcall(fileExists, path)
            if lost() then return "retired" end
            if probed and present == false then return "missing" end
        end
        local loaded, reader = pcall(loadXMLFile, "FarmDashReplicaProbe", path)
        if not loaded or type(reader) ~= "number" or reader == 0 then
            if loaded and (reader == nil or reader == 0 or reader == false) then
                local presence = "unknown"
                if type(fileExists) == "function" then
                    local ok, present = pcall(fileExists, path)
                    if ok and present == true then presence = "present"
                    elseif ok and present == false then presence = "absent"
                    end
                end
                if lost() then return "retired" end
                if presence == "absent" then return "missing" end
                self._lastProbeError = presence == "present" and "probe-unreadable" or "probe-unknown"
                self._lastCleanupPhase = "selected"
                return "failed"
            end
            self._lastProbeError = "probe-failed"
            self._lastCleanupPhase = "selected"
            if lost() then return "retired" end
            return "failed"
        end
        local released = noteRelease(self, job, reader, "selected")
        if not released then self._lastProbeError = "cleanup-unconfirmed" end
        if lost() then return "retired" end
        if not released then return "failed" end
        return "existing"
    end
    if job.phase == "selected" then
        local probe = alreadyStored(dir .. "selected.xml")
        self._lastProbeResult = probe
        if probe == "retired" or not finalizer.ownerIsCurrent(self, job) then
            self._lastReplicaOutcome = "cancelled"
            return "retired"
        end
        if probe == "existing" then
            self._lastReplicaOutcome = "published"
            self._lastSelectedXml = dir .. "slot-" .. tostring(job.slotLetter) .. ".xml"
            job.phase = "completed"
            return "published"
        end
        if probe ~= "missing" then
            self._lastReplicaOutcome = self._lastProbeError or "probe-failed"
            return "failed"
        end
        local wrote, writeDetail = writeCheckedXml(dir .. "selected.xml", "farmDashboardExport", fields, order, self, job)
        local rejected = rejectWrite(wrote, writeDetail, "selected-failed")
        if rejected then return rejected end
        job.phase = "context"
        return "continue"
    end
    if job.phase == "context" then
        local context = {
            sourceId = sourceId,
            sourceSlot = meta.sourceSlot,
            connectionEpoch = tostring(meta.connectionEpoch),
            replica = "true",
        }
        local wrote, detail = writeCheckedXml(dir .. "replicaContext.xml", "farmDashboardReplicaContext", context, { "sourceId", "sourceSlot", "connectionEpoch", "replica" }, self, job)
        local rejected = rejectWrite(wrote, detail, "context-failed")
        if rejected then return rejected end
        self._lastReplicaOutcome = "published"
        self._lastSelectedXml = dir .. "slot-" .. tostring(job.slotLetter) .. ".xml"
        job.phase = "completed"
        return "published"
    end
    self._lastReplicaOutcome = "phase"
    return "failed"
end

function FarmDashboardExportMirror:_publishReplica(buf, connection)
    local meta = buf.meta or {}
    local sources = self._replicaSources or {}
    local sourceId = sources[connection]
    if not validReplicaId(sourceId) or not validReplicaId(meta.sourceSlot) or not validReplicaId(meta.careerId) or not validReplicaId(meta.sessionId) then
        self._lastReplicaOutcome = "unbound-source"
        return false
    end
    if connection ~= nil and type(connection.epoch) == "number" and connection.epoch ~= meta.connectionEpoch then
        self._lastReplicaOutcome = "epoch"
        return false
    end
    if meta.schema ~= "2" or meta.encoding ~= "base64" then
        self._lastReplicaOutcome = "schema"
        return false
    end
    if (tonumber(meta.exportGeneration) or 0) < 1 or (tonumber(meta.publicationSequence) or 0) < 1 then
        self._lastReplicaOutcome = "startup"
        return false
    end
    local payload = table.concat(buf.parts)
    if #payload ~= meta.declaredBytes then
        self._lastReplicaOutcome = "length"
        return false
    end
    local publisher = rawget(_G, "ExportEnvelopePublisher")
    if publisher == nil or type(publisher.decodeBase64) ~= "function" or type(publisher.checksum) ~= "function" or type(publisher.toXml) ~= "function" then
        self._lastReplicaOutcome = "codec-missing"
        return false
    end
    local decoded = publisher.decodeBase64(payload)
    if type(decoded) ~= "string" then
        self._lastReplicaOutcome = "decode"
        return false
    end
    if publisher.checksum(decoded) ~= tostring(meta.crc) then
        self._lastReplicaOutcome = "crc"
        return false
    end
    local fields = {
        schema = "2",
        careerId = meta.careerId,
        sessionId = meta.sessionId,
        publicationSequence = tostring(meta.publicationSequence),
        exportGeneration = tostring(meta.exportGeneration),
        simulationTimeMs = tostring(meta.simulationTimeMs or "unknown"),
        encoding = "base64",
        bytes = tostring(#decoded),
        crc = tostring(meta.crc),
        payload = payload,
    }
    local root = self._replicaRoot
    if type(root) ~= "string" or root == "" then
        if type(getUserProfileAppPath) ~= "function" then
            self._lastReplicaOutcome = "store-unavailable"
            return false
        end
        root = getUserProfileAppPath() .. "modSettings/FS25_FarmDashboard/replicas/"
    end
    if type(createFolder) == "function" then
        local parent = root
        if string.sub(parent, -1) == "/" then parent = string.sub(parent, 1, -2) end
        pcall(createFolder, parent)
        pcall(createFolder, parent .. "/" .. sourceId)
    end
    local dir = root .. sourceId .. "/"
    if string.sub(root, -1) ~= "/" then dir = root .. "/" .. sourceId .. "/" end
    local order = {
        "schema", "careerId", "sessionId", "publicationSequence", "exportGeneration",
        "simulationTimeMs", "encoding", "bytes", "crc", "payload",
    }
    self._publishedSlots = self._publishedSlots or {}
    local slotLetter = self._publishedSlots[sourceId] == "a" and "b" or "a"
    local slotPath = dir .. "slot-" .. slotLetter .. ".xml"
    if not writeCheckedXml(slotPath, "farmDashboardExport", fields, order) then
        self._lastReplicaOutcome = "candidate-failed"
        return false
    end
    local selection = {
        sourceId = sourceId,
        sourceSlot = meta.sourceSlot,
        connectionEpoch = tostring(meta.connectionEpoch),
        replica = "true",
        slot = slotLetter,
        publicationSequence = tostring(meta.publicationSequence),
        crc = tostring(meta.crc),
    }
    if not writeCheckedXml(dir .. "selection-" .. slotLetter .. ".xml", "farmDashboardReplicaSelection", selection, { "sourceId", "sourceSlot", "connectionEpoch", "replica", "slot", "publicationSequence", "crc" }) then
        self._lastReplicaOutcome = "context-failed"
        return false
    end
    self._publishedSlots[sourceId] = slotLetter
    local function alreadyStored(path)
        if type(loadXMLFile) ~= "function" then return false end
        if type(fileExists) == "function" then
            local probed, present = pcall(fileExists, path)
            if probed and present == false then return false end
        end
        local loaded, reader = pcall(loadXMLFile, "FarmDashReplicaProbe", path)
        if not loaded or reader == nil or reader == 0 or reader == false then return false end
        local released = pcall(delete, reader)
        return released
    end
    if not alreadyStored(dir .. "selected.xml") then
        if not writeCheckedXml(dir .. "selected.xml", "farmDashboardExport", fields, order) then
            self._lastReplicaOutcome = "selected-failed"
            return false
        end
        local context = {
            sourceId = sourceId,
            sourceSlot = meta.sourceSlot,
            connectionEpoch = tostring(meta.connectionEpoch),
            replica = "true",
        }
        if not writeCheckedXml(dir .. "replicaContext.xml", "farmDashboardReplicaContext", context, { "sourceId", "sourceSlot", "connectionEpoch", "replica" }) then
            self._lastReplicaOutcome = "context-failed"
            return false
        end
    end
    self._lastReplicaOutcome = "published"
    self._lastSelectedXml = dir .. "slot-" .. slotLetter .. ".xml"
    return true
end

local HEADER_KEYS = {
    "wireVersion", "connectionEpoch", "transferId", "declaredBytes", "decodedBytes",
    "crc", "careerId", "sessionId", "publicationSequence", "exportGeneration",
    "sourceSlot", "schema", "encoding", "simulationTimeMs",
}

local function headerCopy(meta)
    local copy = {}
    for i = 1, #HEADER_KEYS do
        local name = HEADER_KEYS[i]
        copy[name] = meta[name]
    end
    return copy
end

local function headerSame(left, right)
    for i = 1, #HEADER_KEYS do
        local name = HEADER_KEYS[i]
        if left[name] ~= right[name] then return false end
    end
    return true
end

function FarmDashboardExportMirror:onChunkReceived(chunkIndex, totalChunks, payloadString, meta, connection)
    self:init()
    local finalizer = rawget(_G, "FarmDashboardExportFinalizer")
    if finalizer == nil or type(finalizer.admit) ~= "function" then return end
    return finalizer.admit(self, chunkIndex, totalChunks, payloadString, meta, connection)
end

--- Client side: received transfers still need sweep/finalize steps to reach the replica store.
function FarmDashboardExportMirror:hasReceiveWork()
    if self._active ~= nil then return true end
    if type(self._queued) == "table" and #self._queued > 0 then return true end
    return type(self._receiveBufs) == "table" and next(self._receiveBufs) ~= nil
end

function FarmDashboardExportMirror:_sweepReceives()
    local finalizer = rawget(_G, "FarmDashboardExportFinalizer")
    if finalizer and finalizer.sweep then finalizer.sweep(self) end
end

function FarmDashboardExportMirror:_runFinalizer()
    local finalizer = rawget(_G, "FarmDashboardExportFinalizer")
    if finalizer and finalizer.step then finalizer.step(self) end
end

function FarmDashboardExportMirror:_writeMirroredDataJson(jsonString, meta)
    local nowMs = _nowMs()

    -- Hitch guard: never write full payloads to disk more often than the interval.
    -- The next stream (seconds away) carries fresher data anyway.
    if nowMs ~= nil and self._lastClientWriteMs ~= nil
        and (nowMs - self._lastClientWriteMs) < (self.CLIENT_WRITE_MIN_INTERVAL_MS or 5000) then
        if _fdVerbose() and Logging and Logging.info then
            Logging.info("[FarmDash] export mirror: client write throttled (%d bytes)", #jsonString)
        end
        return
    end
    self._lastClientWriteMs = nowMs

    local base = getUserProfileAppPath() .. "modSettings/FS25_FarmDashboard/"
    createFolder(base)

    local slot = _detectClientSaveSlot(self._lastSlot)
    local mirrorFolder = _clientMirrorFolder(slot)
    local mirrorDir = base .. mirrorFolder .. "/"
    createFolder(mirrorDir)
    local mirrorPath = string.gsub(mirrorDir .. "data.json", "\\", "/")
    local mirrorOk = _writeTextFile(mirrorPath, jsonString)
    if type(meta) == "table" then
        local function clean(value)
            local text = tostring(value or "")
            text = string.gsub(text, "[^A-Za-z0-9_%-]", "")
            return text
        end
        local metaBody = string.format(
            "{\"replica\":true,\"careerId\":\"%s\",\"sessionId\":\"%s\",\"publicationSequence\":%d,\"exportGeneration\":%d,\"sourceSlot\":\"%s\",\"checksum\":%d,\"crc\":%d}",
            clean(meta.careerId),
            clean(meta.sessionId),
            tonumber(meta.publicationSequence) or 0,
            tonumber(meta.exportGeneration) or 0,
            clean(meta.sourceSlot),
            tonumber(meta.checksum) or 0,
            self:_adler32(jsonString)
        )
        _writeTextFile(string.gsub(mirrorDir .. "export-meta.json", "\\", "/"), metaBody)
    end

    -- liveData.json is auxiliary (the desktop app reads mirror_<slot>/data.json).
    -- Keep it on a slower cadence so a completion never pays two full writes per frame.
    local liveOk = false
    local liveDue = nowMs == nil or self._lastLiveWriteMs == nil
        or (nowMs - self._lastLiveWriteMs) >= (self.LIVE_WRITE_MIN_INTERVAL_MS or 30000)
    if liveDue then
        self._lastLiveWriteMs = nowMs
        local livePath = string.gsub(base .. "liveData.json", "\\", "/")
        liveOk = _writeTextFile(livePath, jsonString)
    end

    if liveOk or mirrorOk then
        -- One info line on first success so joined clients can confirm the mirror works;
        -- afterwards diagnostics-only (this fires every ~15s for the whole session).
        if (not self._firstWroteLogged or _fdVerbose()) and Logging and Logging.info then
            self._firstWroteLogged = true
            Logging.info(
                "[FarmDash] export mirror: WROTE liveData.json=%s mirror=%s (%d bytes) → %s",
                tostring(liveOk),
                tostring(mirrorOk),
                #jsonString,
                mirrorFolder
            )
        end
    elseif Logging and Logging.warning then
        Logging.warning(
            "[FarmDash] export mirror: FAILED to write liveData.json and mirror data.json"
        )
    end
end

FarmDashboardExportMirror:init()
FarmDashboardExportMirror.registerClientStateHook()
