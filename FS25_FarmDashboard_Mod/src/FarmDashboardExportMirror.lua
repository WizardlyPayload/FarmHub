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
local function _nowMs()
    local t = rawget(_G, "g_time")
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
    local srv = rawget(_G, "g_server")
    return srv ~= nil and type(srv.broadcastEvent) == "function"
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
    self._lastClientWriteMs = nil
    self._lastLiveWriteMs = nil
    self._firstWroteLogged = false
    --- Connections that completed sendInitialClientState (Settings-proven path).
    self._clients = {}
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

--- Deliver one chunk the same way Settings delivers join state: connection:sendEvent.
--- broadcastEvent(event, false) — GIANTS AnimalNameEvent pattern — is FALLBACK ONLY:
--- when direct sends worked, broadcasting too delivered every chunk twice to each
--- tracked client (double event decode + double receive work on the client).
--- Always builds a FRESH event per destination (events are consumed by writeStream).
function FarmDashboardExportMirror:_dispatchChunk(chunkIndex, totalChunks, chunkData)
    if not FarmDashboardExportEvent or not FarmDashboardExportEvent.new then
        return false, 0, false
    end

    local function makeEvent()
        return FarmDashboardExportEvent.new(chunkIndex, totalChunks, chunkData)
    end

    local live = {}
    local sentDirect = 0
    for conn, _ in pairs(self._clients or {}) do
        if conn ~= nil and type(conn.sendEvent) == "function" then
            local ok = pcall(function()
                conn:sendEvent(makeEvent())
            end)
            if ok then
                live[conn] = true
                sentDirect = sentDirect + 1
            end
        end
    end
    self._clients = live

    local broadcastOk = false
    if sentDirect < 1 then
        local srv = rawget(_G, "g_server")
        if srv ~= nil and type(srv.broadcastEvent) == "function" then
            -- Second arg false = do not run locally (AnimalNameEvent / official GIANTS pattern).
            local ok = pcall(function()
                srv:broadcastEvent(makeEvent(), false)
            end)
            broadcastOk = ok == true
        end
    end

    return true, sentDirect, broadcastOk
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

    -- Warm cache if collectors have not written yet (common right after map load).
    if type(self._lastJson) ~= "string" or self._lastJson == "" then
        local fd = rawget(_G, "FarmDashboard")
        if fd and type(fd.bootstrapDataJson) == "function" then
            pcall(function() fd:bootstrapDataJson() end)
        end
    end

    local cached = self._lastJson
    local bytes = type(cached) == "string" and #cached or 0
    if Logging and Logging.info then
        Logging.info(
            "[FarmDash] export mirror: client join — tracked=%d cachedBytes=%d willStream=%s (sendEvent path)",
            self:_trackedClientCount(),
            bytes,
            tostring(bytes > 0)
        )
    end
    if bytes < 1 then
        return
    end

    -- force=true: a fresh joiner should not wait out the stream-interval throttle.
    self:startJob(cached, self._lastSlot or _detectClientSaveSlot(nil), true)
end

--- Called by authority after a successful local data.json write.
function FarmDashboardExportMirror:onAuthorityDataWritten(jsonString, saveSlot)
    self:init()
    if not _isAuthorityProcess() then
        if Logging and Logging.info then
            Logging.info("[FarmDash] export mirror: onAuthorityDataWritten skipped (not authority)")
        end
        return
    end
    if type(jsonString) ~= "string" or jsonString == "" then
        if Logging and Logging.warning then
            Logging.warning("[FarmDash] export mirror: onAuthorityDataWritten empty payload")
        end
        return
    end

    self._lastJson = jsonString
    self._lastSlot = _sanitizeSlot(saveSlot)

    local tracked = self:_trackedClientCount()
    local canBroadcast = _hasServerObject()
    if tracked < 1 and not canBroadcast then
        if _fdVerbose() and Logging and Logging.info then
            Logging.info(
                "[FarmDash] export mirror: onAuthorityDataWritten cached %d bytes (no clients / no g_server yet)",
                #jsonString
            )
        end
        return
    end

    if _fdVerbose() and Logging and Logging.info then
        Logging.info(
            "[FarmDash] export mirror: onAuthorityDataWritten entry (%d bytes) trackedClients=%d canBroadcast=%s → start STREAM",
            #jsonString,
            tracked,
            tostring(canBroadcast)
        )
    end

    self:startJob(jsonString, self._lastSlot)
end

function FarmDashboardExportMirror:startJob(jsonString, saveSlot, force)
    self:init()
    if type(jsonString) ~= "string" or jsonString == "" then
        return
    end

    -- Never abort an in-flight stream: clients would mix old+new chunks into one
    -- corrupt JSON when totalChunks happens to match. Coalesce to the latest payload.
    if self._job ~= nil then
        self._pendingJob = {
            jsonString = jsonString,
            saveSlot = saveSlot or self.DEFAULT_SLOT or "savegame6",
        }
        if _fdVerbose() and Logging and Logging.info then
            Logging.info(
                "[FarmDash] export mirror: STREAM BUSY — queued newer payload (%d bytes)",
                #jsonString
            )
        end
        return
    end

    -- Throttle stream starts. Collectors complete a module slice every few seconds and
    -- each completion used to launch a full stream — clients never got an idle frame.
    -- Coalesce to pending; update() starts it once the interval has passed.
    if force ~= true then
        local nowMs = _nowMs()
        local minGap = self.MIN_STREAM_INTERVAL_MS or 15000
        if nowMs ~= nil and self._lastJobStartMs ~= nil and (nowMs - self._lastJobStartMs) < minGap then
            self._pendingJob = {
                jsonString = jsonString,
                saveSlot = saveSlot or self.DEFAULT_SLOT or "savegame6",
            }
            if _fdVerbose() and Logging and Logging.info then
                Logging.info(
                    "[FarmDash] export mirror: STREAM THROTTLED — queued payload (%d bytes)",
                    #jsonString
                )
            end
            return
        end
    end

    self._lastJobStartMs = _nowMs()

    local chunkBytes = math.max(256, self.CHUNK_BYTES or 1024)
    local totalLen = #jsonString
    local totalChunks = math.max(1, math.ceil(totalLen / chunkBytes))

    self._job = {
        jsonString = jsonString,
        saveSlot = saveSlot or self.DEFAULT_SLOT or "savegame6",
        chunkBytes = chunkBytes,
        totalChunks = totalChunks,
        nextChunk = 1, -- 1-based
        totalLen = totalLen,
    }

    if _fdVerbose() and Logging and Logging.info then
        Logging.info(
            "[FarmDash] export mirror: STREAM START bytes=%d chunks=%d chunkBytes=%d slot=%s trackedClients=%d",
            totalLen,
            totalChunks,
            chunkBytes,
            tostring(self._job.saveSlot),
            self:_trackedClientCount()
        )
    end
end

function FarmDashboardExportMirror:cancelJob()
    self._job = nil
    self._pendingJob = nil
end

function FarmDashboardExportMirror:_startPendingJobIfAny()
    local pending = self._pendingJob
    if not pending then
        return
    end
    self._pendingJob = nil
    self:startJob(pending.jsonString, pending.saveSlot)
end

--- Frame-budgeted sender (authority update loop).
function FarmDashboardExportMirror:update(_dt)
    self:init()
    if not _isAuthorityProcess() then
        return
    end

    local job = self._job
    if not job then
        -- Idle with a throttled payload queued: start it once the interval has passed.
        if self._pendingJob ~= nil then
            local nowMs = _nowMs()
            local minGap = self.MIN_STREAM_INTERVAL_MS or 15000
            if nowMs == nil or self._lastJobStartMs == nil or (nowMs - self._lastJobStartMs) >= minGap then
                self:_startPendingJobIfAny()
                job = self._job
            end
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

    for _ = 1, perFrame do
        if job.nextChunk > job.totalChunks then
            if _fdVerbose() and Logging and Logging.info then
                Logging.info("[FarmDash] export mirror: STREAM DONE chunks=%d", job.totalChunks)
            end
            self._job = nil
            self:_startPendingJobIfAny()
            return
        end

        local i = job.nextChunk
        local startIdx = ((i - 1) * job.chunkBytes) + 1
        local stopIdx = math.min(job.totalLen, startIdx + job.chunkBytes - 1)
        local chunkData = string.sub(job.jsonString, startIdx, stopIdx)

        local ok, sentDirect, broadcastOk = self:_dispatchChunk(i, job.totalChunks, chunkData)

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
        if (not ok or ((tonumber(sentDirect) or 0) < 1 and not broadcastOk))
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

--- Client: ingest one chunk; when last index arrives and all parts present, write files.
function FarmDashboardExportMirror:onChunkReceived(chunkIndex, totalChunks, payloadString)
    self:init()

    chunkIndex = tonumber(chunkIndex) or -1
    totalChunks = tonumber(totalChunks) or 0
    if chunkIndex < 1 or totalChunks < 1 or chunkIndex > totalChunks then
        if Logging and Logging.warning then
            Logging.warning(
                "[FarmDash] export mirror: bad chunk header idx=%s total=%s",
                tostring(chunkIndex),
                tostring(totalChunks)
            )
        end
        return
    end
    if type(payloadString) ~= "string" then
        return
    end

    local buf = self._clientBuf
    -- Chunk 1 always starts a new receive window. Without this, a newer stream with
    -- the same totalChunks keeps first-write-wins parts from the previous stream and
    -- splices two JSON exports into one corrupt file.
    if chunkIndex == 1 then
        buf = {
            totalChunks = totalChunks,
            parts = {},
            received = 0,
        }
        self._clientBuf = buf
        if _fdVerbose() and Logging and Logging.info then
            Logging.info(
                "[FarmDash] export mirror: RECEIVE START (%d chunks)",
                totalChunks
            )
        end
    elseif buf == nil or buf.totalChunks ~= totalChunks then
        buf = {
            totalChunks = totalChunks,
            parts = {},
            received = 0,
        }
        self._clientBuf = buf
        if _fdVerbose() and Logging and Logging.info then
            Logging.info(
                "[FarmDash] export mirror: RECEIVE START mid-stream (%d chunks, first=%d)",
                totalChunks,
                chunkIndex
            )
        end
    end

    if buf.parts[chunkIndex] == nil then
        buf.parts[chunkIndex] = payloadString
        buf.received = buf.received + 1
        if _fdVerbose() and Logging and Logging.info and (chunkIndex == 1 or chunkIndex == totalChunks or (buf.received % 25) == 0) then
            Logging.info(
                "[FarmDash] export mirror: RECEIVE progress %d/%d (got chunk %d)",
                buf.received,
                buf.totalChunks,
                chunkIndex
            )
        end
    end

    if chunkIndex ~= totalChunks and buf.received < buf.totalChunks then
        return
    end

    for i = 1, buf.totalChunks do
        if type(buf.parts[i]) ~= "string" then
            if chunkIndex == totalChunks and Logging and Logging.warning then
                Logging.warning(
                    "[FarmDash] export mirror: last chunk arrived but missing part %d/%d (have %d)",
                    i,
                    buf.totalChunks,
                    buf.received
                )
            end
            return
        end
    end

    local jsonString = table.concat(buf.parts)
    self._clientBuf = nil

    if not _looksLikeJsonObject(jsonString) then
        if Logging and Logging.warning then
            Logging.warning(
                "[FarmDash] export mirror: rejected reassembled payload (not JSON object, %d bytes)",
                #jsonString
            )
        end
        return
    end

    self:_writeMirroredDataJson(jsonString)
end

function FarmDashboardExportMirror:_writeMirroredDataJson(jsonString)
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
