-- Receiver-side admission, ownership, and cooperative base64/Adler32.
-- Encoded reservation is a number, not an allocation and not process memory.
-- While a transfer is unfinished, resident Lua data is the admitted chunk strings.
-- After assembly, job.assembled holds a second full encoded copy until the job
-- is released. Native XML documents are a further copy outside this ceiling.
-- A native save/load already inside the call cannot be undone. No later native
-- call starts for that job, and the job is not marked committed.

FarmDashboardExportFinalizer = FarmDashboardExportFinalizer or {}

local ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
local INT32_MAX = 2147483647
local MAX_DECODED = 8388608
local MAX_CHUNK = 1024
local MAX_CHUNKS = 10923
local MAX_DECLARED = 11184812

FarmDashboardExportFinalizer.MAX_UNFINISHED = 2
FarmDashboardExportFinalizer.MAX_PER_CONNECTION = 2
FarmDashboardExportFinalizer.MAX_ENCODED_RESERVE = 2 * MAX_DECLARED
FarmDashboardExportFinalizer.STEP_ENCODED = 4096
FarmDashboardExportFinalizer.STEP_DEADLINE_MS = 2
FarmDashboardExportFinalizer.TOMBSTONE_PER_LIFETIME = 128
FarmDashboardExportFinalizer.TOMBSTONE_GLOBAL = 256
FarmDashboardExportFinalizer.TOMBSTONE_MS = 60000
FarmDashboardExportFinalizer.RECEIVE_TIMEOUT_MS = 60000
FarmDashboardExportFinalizer.MAX_TRANSFER_MS = 600000
FarmDashboardExportFinalizer.MAX_TRANSFER_ID = 24

local function alphabetIndex(ch)
    local pos = string.find(ALPHABET, ch, 1, true)
    if pos == nil then return nil end
    return pos - 1
end

local function finiteInt(value, minimum, maximum)
    if type(value) ~= "number" then return nil end
    if value ~= value or value == math.huge or value == -math.huge then return nil end
    if value ~= math.floor(value) then return nil end
    if value < minimum or value > maximum then return nil end
    return value
end

local function canonicalDecimal(text, maxValue)
    if type(text) ~= "string" or string.match(text, "^[0-9]+$") == nil then return nil end
    if #text > 1 and string.sub(text, 1, 1) == "0" then return nil end
    if #text > 16 then return nil end
    local n = tonumber(text)
    if n == nil or n < 0 or n > maxValue then return nil end
    return text
end

local function validId(value)
    if type(value) ~= "string" or value == "" or #value > 64 then return false end
    if string.find(value, "..", 1, true) then return false end
    return string.match(value, "^[A-Za-z0-9_%-]+$") ~= nil
end

local function formatDigits(ticks)
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

local function clockMs(mirror)
    if type(mirror._clock) == "function" then return mirror._clock() end
    -- g_time is an engine global inherited through this mod's _G; rawget would never see it.
    local t = _G.g_time
    if type(t) == "number" then return t end
    return nil
end

function FarmDashboardExportFinalizer.ensure(mirror)
    mirror._receiveBufs = mirror._receiveBufs or {}
    mirror._lifetimes = mirror._lifetimes or {}
    mirror._bindings = mirror._bindings or {}
    mirror._tombstones = mirror._tombstones or {}
    mirror._queued = mirror._queued or {}
    mirror._reservedBytes = mirror._reservedBytes or 0
    mirror._peakReserved = mirror._peakReserved or 0
    mirror._nativeOps = mirror._nativeOps or 0
    mirror._mirrorGeneration = mirror._mirrorGeneration or 1
    mirror._fairCursor = mirror._fairCursor or 1
    mirror._finalizerMetrics = mirror._finalizerMetrics or {}
end

function FarmDashboardExportFinalizer.ownerIsCurrent(mirror, job)
    local owner = job and job.owner
    if type(owner) ~= "table" or job.released then return false end
    if owner.mirrorGeneration ~= mirror._mirrorGeneration then return false end
    if mirror._lifetimes[owner.connection] ~= owner.lifetime then return false end
    local binding = mirror._bindings[owner.connection]
    if type(binding) ~= "table" then return false end
    if binding.missionGeneration ~= mirror._mirrorGeneration then return false end
    if binding.generation ~= owner.registrationGeneration then return false end
    if binding.sourceId ~= owner.sourceId then return false end
    return true
end

local function unfinishedCount(mirror, connection)
    local total = 0
    local owned = 0
    for _, job in pairs(mirror._receiveBufs or {}) do
        total = total + 1
        if connection ~= nil and job.owner and job.owner.connection == connection then owned = owned + 1 end
    end
    for i = 1, #(mirror._queued or {}) do
        local job = mirror._queued[i]
        if job and not job.released then
            total = total + 1
            if connection ~= nil and job.owner and job.owner.connection == connection then owned = owned + 1 end
        end
    end
    local active = mirror._active
    if active and not active.released then
        total = total + 1
        if connection ~= nil and active.owner and active.owner.connection == connection then owned = owned + 1 end
    end
    return total, owned
end

local function rememberTombstone(mirror, key, lifetime, now)
    local rows = mirror._tombstones
    rows[#rows + 1] = { key = key, lifetime = lifetime, at = now or 0 }
    local per = 0
    for i = 1, #rows do
        if rows[i].lifetime == lifetime then per = per + 1 end
    end
    while per > FarmDashboardExportFinalizer.TOMBSTONE_PER_LIFETIME do
        for i = 1, #rows do
            if rows[i].lifetime == lifetime then
                table.remove(rows, i)
                per = per - 1
                break
            end
        end
    end
    while #rows > FarmDashboardExportFinalizer.TOMBSTONE_GLOBAL do
        table.remove(rows, 1)
    end
end

local function tombstoned(mirror, key, now)
    local rows = mirror._tombstones or {}
    local kept = {}
    local found = false
    for i = 1, #rows do
        local row = rows[i]
        local fresh = now == nil or type(row.at) ~= "number" or (now - row.at) < FarmDashboardExportFinalizer.TOMBSTONE_MS
        if fresh then
            kept[#kept + 1] = row
            if row.key == key then found = true end
        end
    end
    mirror._tombstones = kept
    return found
end

local function releaseReservation(mirror, job)
    if job == nil then return end
    if type(mirror._releasePublicationResources) == "function" then
        mirror:_releasePublicationResources(job)
    end
    if job.released then return end
    rememberTombstone(mirror, job.key, job.owner and job.owner.lifetime, clockMs(mirror))
    job.released = true
    job.phase = "retired"
    local reserved = job.reserved or 0
    mirror._reservedBytes = math.max(0, (mirror._reservedBytes or 0) - reserved)
    job.reserved = 0
    if mirror._active == job then mirror._active = nil end
end

local function dropQueued(mirror, connection)
    local kept = {}
    for i = 1, #(mirror._queued or {}) do
        local job = mirror._queued[i]
        if job and job.owner and (connection == nil or job.owner.connection == connection) then
            releaseReservation(mirror, job)
        else
            kept[#kept + 1] = job
        end
    end
    mirror._queued = kept
end

function FarmDashboardExportFinalizer.retireConnection(mirror, connection)
    FarmDashboardExportFinalizer.ensure(mirror)
    if connection == nil then return end
    local now = clockMs(mirror)
    for key, job in pairs(mirror._receiveBufs) do
        if job and job.owner and job.owner.connection == connection then
            rememberTombstone(mirror, key, job.owner.lifetime, now)
            releaseReservation(mirror, job)
            mirror._receiveBufs[key] = nil
        end
    end
    if mirror._active and mirror._active.owner and mirror._active.owner.connection == connection then
        rememberTombstone(mirror, mirror._active.key, mirror._active.owner.lifetime, now)
        releaseReservation(mirror, mirror._active)
    end
    dropQueued(mirror, connection)
    local kept = {}
    for i = 1, #mirror._tombstones do
        local row = mirror._tombstones[i]
        local jobLifetime = mirror._lifetimes[connection]
        if row.lifetime ~= jobLifetime then kept[#kept + 1] = row end
    end
    mirror._tombstones = kept
    mirror._lastCancelReason = "disconnect"
end

function FarmDashboardExportFinalizer.retireAll(mirror)
    FarmDashboardExportFinalizer.ensure(mirror)
    for key, job in pairs(mirror._receiveBufs) do
        releaseReservation(mirror, job)
        mirror._receiveBufs[key] = nil
    end
    if mirror._active then releaseReservation(mirror, mirror._active) end
    dropQueued(mirror, nil)
    mirror._tombstones = {}
    mirror._reservedBytes = 0
    mirror._lastCancelReason = "cancel"
end

function FarmDashboardExportFinalizer.validateHeader(meta, chunkIndex, totalChunks, payload)
    if type(meta) ~= "table" or meta.wireVersion ~= 2 then return false, "version" end
    if type(payload) ~= "string" or #payload < 1 or #payload > MAX_CHUNK then return false, "chunk" end
    local count = finiteInt(totalChunks, 1, MAX_CHUNKS)
    local index = finiteInt(chunkIndex, 1, count or 0)
    local declared = finiteInt(meta.declaredBytes, 1, MAX_DECLARED)
    local decoded = finiteInt(meta.decodedBytes, 1, MAX_DECODED)
    local epoch = finiteInt(meta.connectionEpoch, 1, INT32_MAX)
    local sequence = finiteInt(meta.publicationSequence, 1, INT32_MAX)
    local generation = finiteInt(meta.exportGeneration, 1, INT32_MAX)
    if index == nil or count == nil or declared == nil or decoded == nil or epoch == nil or sequence == nil or generation == nil then
        return false, "range"
    end
    if declared < count or declared > count * MAX_CHUNK then return false, "range" end
    if type(meta.transferId) ~= "string" or #meta.transferId < 3 or #meta.transferId > FarmDashboardExportFinalizer.MAX_TRANSFER_ID then
        return false, "identity"
    end
    if string.match(meta.transferId, "^[1-9][0-9]*%-[1-9][0-9]*$") == nil then return false, "identity" end
    if canonicalDecimal(meta.crc, 4294967295) == nil then return false, "crc" end
    if meta.schema ~= "2" or meta.encoding ~= "base64" then return false, "schema" end
    if not validId(meta.careerId) or not validId(meta.sessionId) or not validId(meta.sourceSlot) then return false, "identity" end
    local tick = meta.simulationTimeMs
    if tick ~= "unknown" and canonicalDecimal(tick, 999999999999999) == nil then return false, "tick" end
    return true, nil
end

local function headerSame(left, meta)
    local names = {
        "wireVersion", "connectionEpoch", "transferId", "declaredBytes", "decodedBytes", "crc",
        "careerId", "sessionId", "publicationSequence", "exportGeneration", "sourceSlot",
        "schema", "encoding", "simulationTimeMs",
    }
    for i = 1, #names do
        if left[names[i]] ~= meta[names[i]] then return false end
    end
    return true
end

local function copyHeader(meta, totalChunks)
    return {
        wireVersion = meta.wireVersion,
        connectionEpoch = meta.connectionEpoch,
        transferId = meta.transferId,
        declaredBytes = meta.declaredBytes,
        decodedBytes = meta.decodedBytes,
        crc = meta.crc,
        careerId = meta.careerId,
        sessionId = meta.sessionId,
        publicationSequence = meta.publicationSequence,
        exportGeneration = meta.exportGeneration,
        sourceSlot = meta.sourceSlot,
        schema = meta.schema,
        encoding = meta.encoding,
        simulationTimeMs = meta.simulationTimeMs,
        totalChunks = totalChunks,
    }
end

function FarmDashboardExportFinalizer.admit(mirror, chunkIndex, totalChunks, payload, meta, connection)
    FarmDashboardExportFinalizer.ensure(mirror)
    local ok, reason = FarmDashboardExportFinalizer.validateHeader(meta, chunkIndex, totalChunks, payload)
    if not ok then
        mirror._lastReplicaOutcome = reason
        return reason
    end
    local binding = mirror._bindings[connection]
    local lifetime = mirror._lifetimes[connection]
    local listed = mirror._replicaSources and mirror._replicaSources[connection]
    if connection == nil or type(binding) ~= "table" or lifetime == nil or listed == nil or listed ~= binding.sourceId then
        mirror._lastReplicaOutcome = "unbound-source"
        local pairing = rawget(_G, "FarmDashboardReplicaPairing")
        if connection ~= nil and pairing and type(pairing.noteUnboundHeader) == "function" then
            pcall(function() pairing:noteUnboundHeader(connection, meta) end)
        end
        return "unregistered"
    end
    if binding.careerId ~= nil and meta.careerId ~= binding.careerId then
        mirror._lastReplicaOutcome = "career-mismatch"
        return "career-mismatch"
    end
    if binding.missionGeneration ~= mirror._mirrorGeneration then
        mirror._lastReplicaOutcome = "unbound-source"
        return "unregistered"
    end
    local now = clockMs(mirror) or 0
    local key = tostring(lifetime) .. "|" .. meta.transferId
    local function findUnfinished()
        local receiving = mirror._receiveBufs[key]
        if receiving and not receiving.released then return receiving end
        local active = mirror._active
        if active and not active.released and active.key == key then return active end
        for i = 1, #(mirror._queued or {}) do
            local queued = mirror._queued[i]
            if queued and not queued.released and queued.key == key then return queued end
        end
        return nil
    end
    local function dropFromQueue(job)
        local kept = {}
        for i = 1, #(mirror._queued or {}) do
            if mirror._queued[i] ~= job then kept[#kept + 1] = mirror._queued[i] end
        end
        mirror._queued = kept
    end
    local function retireUnfinished(job, reason)
        mirror._receiveBufs[key] = nil
        dropFromQueue(job)
        releaseReservation(mirror, job)
        mirror._lastReplicaOutcome = reason
    end
    local function queueComplete(job)
        mirror._receiveBufs[key] = nil
        job.phase = "queued"
        job.carry = ""
        job.partIndex = 1
        job.partOffset = 0
        job.decodedCount = 0
        job.adlerA = 1
        job.adlerB = 0
        job.encodedSeen = 0
        mirror._queued[#mirror._queued + 1] = job
    end
    local job = findUnfinished()
    if job ~= nil then
        local previous = job.parts and job.parts[chunkIndex]
        local headerOk = job.totalChunks == totalChunks and headerSame(job.header, meta)
        if not headerOk or (type(previous) == "string" and previous ~= payload) then
            retireUnfinished(job, "conflict")
            return "conflict"
        end
        if previous ~= nil or job.phase ~= "receiving" then return "duplicate" end
        if job.bytes + #payload > meta.declaredBytes then
            retireUnfinished(job, "oversize")
            return "oversize"
        end
        job.parts[chunkIndex] = payload
        job.bytes = job.bytes + #payload
        job.received = job.received + 1
        job.lastProgress = now
        if job.received ~= job.totalChunks or job.bytes ~= meta.declaredBytes then return "receiving" end
        queueComplete(job)
        return "queued"
    end
    if tombstoned(mirror, key, now) then return "duplicate" end
    local total, owned = unfinishedCount(mirror, connection)
    if total >= FarmDashboardExportFinalizer.MAX_UNFINISHED or owned >= FarmDashboardExportFinalizer.MAX_PER_CONNECTION then
        mirror._lastReplicaOutcome = "capacity"
        return "capacity"
    end
    if mirror._reservedBytes + meta.declaredBytes > FarmDashboardExportFinalizer.MAX_ENCODED_RESERVE then
        mirror._lastReplicaOutcome = "capacity"
        return "capacity"
    end
    job = {
        key = key,
        parts = {},
        received = 0,
        bytes = 0,
        totalChunks = totalChunks,
        header = copyHeader(meta, totalChunks),
        reserved = meta.declaredBytes,
        firstSeen = now,
        lastProgress = now,
        phase = "receiving",
        owner = {
            mirrorGeneration = mirror._mirrorGeneration,
            connection = connection,
            lifetime = lifetime,
            registrationGeneration = binding.generation,
            sourceId = binding.sourceId,
            transferId = meta.transferId,
            careerId = binding.careerId,
        },
    }
    mirror._receiveBufs[key] = job
    mirror._reservedBytes = mirror._reservedBytes + meta.declaredBytes
    if mirror._reservedBytes > mirror._peakReserved then mirror._peakReserved = mirror._reservedBytes end
    if #payload > meta.declaredBytes then
        retireUnfinished(job, "oversize")
        return "oversize"
    end
    job.parts[chunkIndex] = payload
    job.bytes = #payload
    job.received = 1
    if job.received ~= job.totalChunks or job.bytes ~= meta.declaredBytes then return "receiving" end
    queueComplete(job)
    return "queued"
end

local function pullChars(job, need)
    local out = {}
    local got = 0
    while got < need and job.partIndex <= job.totalChunks do
        local part = job.parts[job.partIndex]
        if type(part) ~= "string" then return nil end
        local avail = #part - job.partOffset
        if avail <= 0 then
            job.partIndex = job.partIndex + 1
            job.partOffset = 0
        else
            local take = math.min(need - got, avail)
            out[#out + 1] = string.sub(part, job.partOffset + 1, job.partOffset + take)
            job.partOffset = job.partOffset + take
            got = got + take
        end
    end
    return table.concat(out), got
end

local function absorbByte(job, byte)
    job.adlerA = (job.adlerA + byte) % 65521
    job.adlerB = (job.adlerB + job.adlerA) % 65521
    job.decodedCount = job.decodedCount + 1
end

local function decodeQuartet(job, quartet, last)
    local c1 = string.sub(quartet, 1, 1)
    local c2 = string.sub(quartet, 2, 2)
    local c3 = string.sub(quartet, 3, 3)
    local c4 = string.sub(quartet, 4, 4)
    local eq = 0
    if c3 == "=" then eq = eq + 1 end
    if c4 == "=" then eq = eq + 1 end
    if not last and eq > 0 then return "pad" end
    if last and c3 == "=" and c4 ~= "=" then return "pad" end
    local v1 = alphabetIndex(c1)
    local v2 = alphabetIndex(c2)
    if v1 == nil or v2 == nil then return "alphabet" end
    local v3 = 0
    local v4 = 0
    if c3 ~= "=" then
        v3 = alphabetIndex(c3)
        if v3 == nil then return "alphabet" end
    end
    if c4 ~= "=" then
        v4 = alphabetIndex(c4)
        if v4 == nil then return "alphabet" end
    end
    if last and eq == 2 and (v2 % 16) ~= 0 then return "pad-bits" end
    if last and eq == 1 and (v3 % 4) ~= 0 then return "pad-bits" end
    local triple = v1 * 262144 + v2 * 4096 + v3 * 64 + v4
    absorbByte(job, math.floor(triple / 65536) % 256)
    if c3 ~= "=" then absorbByte(job, math.floor(triple / 256) % 256) end
    if c4 ~= "=" then absorbByte(job, triple % 256) end
    if job.decodedCount > job.header.decodedBytes or job.decodedCount > MAX_DECODED then return "overflow" end
    return true
end

local function finishDecode(job)
    if job.encodedSeen ~= job.header.declaredBytes or job.carry ~= "" then return "length" end
    if (job.encodedSeen % 4) ~= 0 then return "length" end
    if job.decodedCount ~= job.header.decodedBytes then return "length" end
    local crc = formatDigits(job.adlerB * 65536 + job.adlerA)
    if crc ~= job.header.crc then return "crc" end
    job.phase = "assemble"
    return true
end

local function stepDecode(job, budget, expired)
    if type(budget) ~= "number" or budget ~= budget or budget == math.huge or budget <= 0 then
        return "budget", 0, 0
    end
    local used = 0
    local quartets = 0
    while used < budget do
        if expired() then
            if used == 0 then return "deadline", 0, 0 end
            return "partial", used, quartets
        end
        local need = 4 - #job.carry
        if used + need > budget then
            if used == 0 then return "budget", 0, 0 end
            return "partial", used, quartets
        end
        local pulled, got = pullChars(job, need)
        if pulled == nil then return "malformed", used, quartets end
        if got < need then
            if got > 0 or job.carry ~= "" then return "truncated", used, quartets end
            local done = finishDecode(job)
            if done ~= true then return done, used, quartets end
            return "decoded", used, quartets
        end
        job.carry = job.carry .. pulled
        used = used + got
        job.encodedSeen = job.encodedSeen + got
        local last = job.encodedSeen == job.header.declaredBytes
        local decoded = decodeQuartet(job, job.carry, last)
        job.carry = ""
        if decoded ~= true then return decoded, used, quartets end
        quartets = quartets + 1
        if last then
            local done = finishDecode(job)
            if done ~= true then return done, used, quartets end
            return "decoded", used, quartets
        end
    end
    return "partial", used, quartets
end

local function collecting(mirror, phase)
    local rows = {}
    local function add(job)
        if job and not job.released and job.phase == phase and FarmDashboardExportFinalizer.ownerIsCurrent(mirror, job) then
            rows[#rows + 1] = job
        end
    end
    add(mirror._active)
    for i = 1, #mirror._queued do add(mirror._queued[i]) end
    return rows
end

local function takeQueued(mirror, job)
    local kept = {}
    for i = 1, #mirror._queued do
        if mirror._queued[i] ~= job then kept[#kept + 1] = mirror._queued[i] end
    end
    mirror._queued = kept
end

local function failJob(mirror, job, reason)
    mirror._lastReplicaOutcome = reason
    rememberTombstone(mirror, job.key, job.owner and job.owner.lifetime, clockMs(mirror))
    takeQueued(mirror, job)
    releaseReservation(mirror, job)
end

function FarmDashboardExportFinalizer.sweep(mirror)
    FarmDashboardExportFinalizer.ensure(mirror)
    local now = clockMs(mirror)
    if type(now) ~= "number" then return end
    local function timeoutReason(job)
        if type(job.firstSeen) ~= "number" then return nil end
        if now - job.firstSeen >= FarmDashboardExportFinalizer.MAX_TRANSFER_MS then return "max-age" end
        -- A complete transfer may wait behind another publication without being stalled.
        if job.phase == "queued" then return nil end
        local last = type(job.lastProgress) == "number" and job.lastProgress or job.firstSeen
        if now - last >= FarmDashboardExportFinalizer.RECEIVE_TIMEOUT_MS then return "inactive" end
        return nil
    end
    local function noteTimeout(job, reason)
        mirror._lastReplicaOutcome = "timeout"
        if Logging and Logging.warning then
            Logging.warning("[FarmDash] export mirror: transfer timed out phase=%s reason=%s", tostring(job.phase), reason)
        end
    end
    for key, job in pairs(mirror._receiveBufs) do
        local reason = timeoutReason(job)
        if reason ~= nil then
            noteTimeout(job, reason)
            rememberTombstone(mirror, key, job.owner and job.owner.lifetime, now)
            releaseReservation(mirror, job)
            mirror._receiveBufs[key] = nil
        end
    end
    local kept = {}
    for i = 1, #mirror._queued do
        local job = mirror._queued[i]
        local reason = job and timeoutReason(job) or nil
        if reason ~= nil then
            noteTimeout(job, reason)
            releaseReservation(mirror, job)
        elseif job and not job.released then
            kept[#kept + 1] = job
        end
    end
    mirror._queued = kept
    local activeReason = mirror._active and timeoutReason(mirror._active) or nil
    if activeReason ~= nil then
        noteTimeout(mirror._active, activeReason)
        releaseReservation(mirror, mirror._active)
    end
end

function FarmDashboardExportFinalizer.step(mirror, requested)
    FarmDashboardExportFinalizer.ensure(mirror)
    local metrics = {
        bytesThisStep = 0,
        quartetsThisStep = 0,
        bySource = {},
        active = 0,
        queued = #mirror._queued,
        reservedBytes = mirror._reservedBytes,
        peakReserved = mirror._peakReserved,
        cancellation = mirror._lastCancelReason,
        phase = mirror._active and mirror._active.phase or "idle",
        nativeOps = mirror._nativeOps,
        outcome = "idle",
    }
    local budget = requested
    if budget == nil then budget = FarmDashboardExportFinalizer.STEP_ENCODED end
    if type(mirror._finalizerBudget) == "number" then budget = mirror._finalizerBudget end
    local function badBudget(value)
        return type(value) ~= "number" or value ~= value or value == math.huge or value == -math.huge or value <= 0 or value < 4
    end
    if badBudget(budget) then
        local pending = mirror._active or mirror._queued[1]
        metrics.outcome = "budget"
        metrics.bytesThisStep = 0
        metrics.phase = pending and pending.phase or metrics.phase
        metrics.nativeOps = mirror._nativeOps or 0
        mirror._finalizerMetrics = metrics
        return "budget"
    end
    budget = math.min(budget, FarmDashboardExportFinalizer.STEP_ENCODED)
    local started = clockMs(mirror)
    local function expired()
        local now = clockMs(mirror)
        if now == nil or started == nil then return false end
        return (now - started) >= FarmDashboardExportFinalizer.STEP_DEADLINE_MS
    end
    local decoders = collecting(mirror, "queued")
    for i = 1, #decoders do
        if decoders[i].phase == "queued" then decoders[i].phase = "decode" end
    end
    local activeDecoders = collecting(mirror, "decode")
    if #activeDecoders > 0 then
        if type(budget) ~= "number" or budget ~= budget or budget == math.huge or budget <= 0 then
            metrics.outcome = "budget"
            mirror._finalizerMetrics = metrics
            return "budget"
        end
        local cursor = ((mirror._fairCursor or 1) - 1) % #activeDecoders + 1
        mirror._fairCursor = cursor + 1
        local share = math.floor(budget / #activeDecoders)
        if share < 4 then share = budget end
        local remaining = budget
        if remaining < 4 then
            metrics.outcome = "budget"
            metrics.active = mirror._active and 1 or 0
            metrics.queued = #mirror._queued
            metrics.reservedBytes = mirror._reservedBytes
            mirror._finalizerMetrics = metrics
            return "budget"
        end
        for n = 0, #activeDecoders - 1 do
            if remaining < 4 then break end
            local job = activeDecoders[((cursor - 1 + n) % #activeDecoders) + 1]
            if not FarmDashboardExportFinalizer.ownerIsCurrent(mirror, job) then
                failJob(mirror, job, "cancelled")
            else
                local allowance = math.min(share, remaining)
                local beforePhase = job.phase
                local outcome, used, quartets = stepDecode(job, allowance, expired)
                used = used or 0
                quartets = quartets or 0
                if used > 0 or job.phase ~= beforePhase then
                    job.lastProgress = clockMs(mirror) or job.lastProgress
                end
                metrics.bytesThisStep = metrics.bytesThisStep + used
                metrics.quartetsThisStep = metrics.quartetsThisStep + quartets
                local sourceId = job.owner and job.owner.sourceId or "?"
                metrics.bySource[sourceId] = (metrics.bySource[sourceId] or 0) + used
                remaining = remaining - used
                metrics.outcome = outcome
                if outcome ~= "partial" and outcome ~= "decoded" and outcome ~= "budget" and outcome ~= "deadline" then
                    failJob(mirror, job, outcome)
                end
                if outcome == "deadline" or outcome == "budget" then break end
            end
        end
        metrics.active = mirror._active and 1 or 0
        metrics.queued = #mirror._queued
        metrics.reservedBytes = mirror._reservedBytes
        metrics.phase = mirror._active and mirror._active.phase or metrics.phase
        mirror._finalizerMetrics = metrics
        return metrics.outcome
    end
    if metrics.bytesThisStep > 0 then
        mirror._finalizerMetrics = metrics
        return metrics.outcome
    end
    local function nativePhase(phase)
        return phase == "assemble" or phase == "candidate" or phase == "selection" or phase == "selected" or phase == "context"
    end
    local native = nil
    if mirror._active and not mirror._active.released and nativePhase(mirror._active.phase) then
        native = mirror._active
    end
    if native == nil then
        for i = 1, #mirror._queued do
            local job = mirror._queued[i]
            if job and not job.released and nativePhase(job.phase) then
                native = job
                takeQueued(mirror, job)
                mirror._active = job
                break
            end
        end
    end
    if native == nil or native.released then
        mirror._finalizerMetrics = metrics
        return "idle"
    end
    if not FarmDashboardExportFinalizer.ownerIsCurrent(mirror, native) then
        failJob(mirror, native, "cancelled")
        metrics.outcome = "cancelled"
        metrics.cancellation = "cancelled"
        mirror._finalizerMetrics = metrics
        return "cancelled"
    end
    local advanced = "continue"
    local guard = 0
    local work = {
        remaining = budget,
        used = 0,
        expired = expired,
        ownerOk = function()
            return FarmDashboardExportFinalizer.ownerIsCurrent(mirror, native)
        end,
    }
    while native and not native.released and guard < 8 do
        guard = guard + 1
        if expired() or not FarmDashboardExportFinalizer.ownerIsCurrent(mirror, native) then
            if not FarmDashboardExportFinalizer.ownerIsCurrent(mirror, native) then
                failJob(mirror, native, "cancelled")
                advanced = "retired"
            else
                advanced = "deadline"
            end
            break
        end
        if work.remaining < 1 then break end
        if type(mirror._advancePublication) ~= "function" then
            advanced = "failed"
            break
        end
        local beforePhase = native.phase
        local beforeUsed = work.used
        advanced = mirror:_advancePublication(native, work)
        if native.phase ~= beforePhase or work.used > beforeUsed then
            native.lastProgress = clockMs(mirror) or native.lastProgress
        end
        local large = (native.header and native.header.declaredBytes or 0) > FarmDashboardExportFinalizer.STEP_ENCODED
        if advanced ~= "continue" or large then break end
    end
    metrics.bytesThisStep = metrics.bytesThisStep + work.used
    if work.used > 0 then
        local sourceId = native.owner and native.owner.sourceId or "?"
        metrics.bySource[sourceId] = (metrics.bySource[sourceId] or 0) + work.used
    end
    metrics.nativeOps = mirror._nativeOps or 0
    metrics.phase = native.phase
    metrics.outcome = advanced
    if advanced == "published" or advanced == "failed" or advanced == "retired" then
        if advanced ~= "published" then mirror._lastReplicaOutcome = advanced == "retired" and "cancelled" or (mirror._lastReplicaOutcome or advanced) end
        takeQueued(mirror, native)
        releaseReservation(mirror, native)
    end
    metrics.reservedBytes = mirror._reservedBytes
    metrics.active = mirror._active and 1 or 0
    mirror._finalizerMetrics = metrics
    return advanced
end
