-- Schema 2 envelope publisher. Not sourced by modDesc. Not called from the collector.
-- One publisher object is one output target. Begin does not encode.
-- os.rename, readFile, and io.open are not used.

ExportEnvelopePublisher = ExportEnvelopePublisher or {}

ExportEnvelopePublisher.SCHEMA = 2
ExportEnvelopePublisher.MAX_DECODED = 8 * 1024 * 1024
ExportEnvelopePublisher.MAX_STEP_BYTES = 4096
ExportEnvelopePublisher.MAX_CLOCKED_STEP_BYTES = 16384
ExportEnvelopePublisher.XML_INT_MAX = 2147483647
ExportEnvelopePublisher.MAX_ID = 64

local ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
local ATTRS = {
    "schema", "careerId", "sessionId", "publicationSequence", "exportGeneration",
    "simulationTimeMs", "encoding", "bytes", "crc", "payload",
}

local function alphabetIndex(ch)
    local pos = string.find(ALPHABET, ch, 1, true)
    if pos == nil then return nil end
    return pos - 1
end

local function boundedInt(value, minimum, maximum)
    if type(value) ~= "number" then return false end
    if value ~= math.floor(value) then return false end
    if value < minimum or value > maximum then return false end
    return true
end

local formatDigits

local function validId(value)
    if type(value) ~= "string" or value == "" or #value > ExportEnvelopePublisher.MAX_ID then return false end
    if string.find(value, "..", 1, true) then return false end
    return string.match(value, "^[A-Za-z0-9_%-]+$") ~= nil
end

function ExportEnvelopePublisher.checksum(data)
    if type(data) ~= "string" then return nil end
    local a = 1
    local b = 0
    for i = 1, #data do
        a = (a + string.byte(data, i)) % 65521
        b = (b + a) % 65521
    end
    return formatDigits(b * 65536 + a)
end

function ExportEnvelopePublisher.encodeBase64(data)
    if type(data) ~= "string" or #data > ExportEnvelopePublisher.MAX_DECODED then return nil end
    local out = {}
    local i = 1
    while i <= #data do
        local a = string.byte(data, i)
        local b = (i + 1 <= #data) and string.byte(data, i + 1) or 0
        local c = (i + 2 <= #data) and string.byte(data, i + 2) or 0
        local triple = a * 65536 + b * 256 + c
        out[#out + 1] = string.sub(ALPHABET, math.floor(triple / 262144) % 64 + 1, math.floor(triple / 262144) % 64 + 1)
        out[#out + 1] = string.sub(ALPHABET, math.floor(triple / 4096) % 64 + 1, math.floor(triple / 4096) % 64 + 1)
        out[#out + 1] = (i + 1 <= #data) and string.sub(ALPHABET, math.floor(triple / 64) % 64 + 1, math.floor(triple / 64) % 64 + 1) or "="
        out[#out + 1] = (i + 2 <= #data) and string.sub(ALPHABET, triple % 64 + 1, triple % 64 + 1) or "="
        i = i + 3
    end
    return table.concat(out)
end

function ExportEnvelopePublisher.decodeBase64(data)
    if type(data) ~= "string" then return nil end
    if data == "" then return "" end
    if #data > 11184812 or (#data % 4) ~= 0 then return nil end
    local eq = 0
    for i = 1, #data do
        local ch = string.sub(data, i, i)
        if ch == "=" then
            if i < #data - 1 then return nil end
            eq = eq + 1
        else
            if eq > 0 or alphabetIndex(ch) == nil then return nil end
        end
    end
    if eq > 2 then return nil end
    local outLen = (#data / 4) * 3 - eq
    if outLen > ExportEnvelopePublisher.MAX_DECODED then return nil end
    local out = {}
    local quartets = #data / 4
    for q = 1, quartets do
        local i = (q - 1) * 4 + 1
        local c1 = string.sub(data, i, i)
        local c2 = string.sub(data, i + 1, i + 1)
        local c3 = string.sub(data, i + 2, i + 2)
        local c4 = string.sub(data, i + 3, i + 3)
        local v1 = alphabetIndex(c1)
        local v2 = alphabetIndex(c2)
        if v1 == nil or v2 == nil then return nil end
        local v3 = 0
        local v4 = 0
        local last = q == quartets
        if c3 ~= "=" then
            v3 = alphabetIndex(c3)
            if v3 == nil then return nil end
        elseif not last or c4 ~= "=" then
            return nil
        end
        if c4 ~= "=" then
            v4 = alphabetIndex(c4)
            if v4 == nil then return nil end
        elseif not last then
            return nil
        end
        if last and eq == 2 and (v2 % 16) ~= 0 then return nil end
        if last and eq == 1 and (v3 % 4) ~= 0 then return nil end
        local triple = v1 * 262144 + v2 * 4096 + v3 * 64 + v4
        out[#out + 1] = string.char(math.floor(triple / 65536) % 256)
        if c3 ~= "=" then out[#out + 1] = string.char(math.floor(triple / 256) % 256) end
        if c4 ~= "=" then out[#out + 1] = string.char(triple % 256) end
    end
    return table.concat(out)
end

function formatDigits(ticks)
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

local function canonicalTick(value)
    if value == nil then return "unknown" end
    if type(value) ~= "number" then return nil end
    if value ~= value or value == math.huge or value == -math.huge or value < 0 then return nil end
    local ticks = math.floor(value)
    if ticks > 999999999999999 then return nil end
    return formatDigits(ticks)
end

local function xmlEscape(value)
    local text = tostring(value)
    text = string.gsub(text, "&", "&amp;")
    text = string.gsub(text, "<", "&lt;")
    text = string.gsub(text, ">", "&gt;")
    text = string.gsub(text, '"', "&quot;")
    return text
end

function ExportEnvelopePublisher.toXml(fields)
    local parts = { '<farmDashboardExport' }
    for i = 1, #ATTRS do
        local name = ATTRS[i]
        if fields[name] == nil then return nil end
        parts[#parts + 1] = " " .. name .. '="' .. xmlEscape(fields[name]) .. '"'
    end
    parts[#parts + 1] = "/>"
    return table.concat(parts)
end

local function unescape(value)
    local text = string.gsub(value, "&quot;", '"')
    text = string.gsub(text, "&gt;", ">")
    text = string.gsub(text, "&lt;", "<")
    text = string.gsub(text, "&amp;", "&")
    return text
end

function ExportEnvelopePublisher.parseXml(xml)
    if type(xml) ~= "string" or xml == "" then return nil, "malformed" end
    if #xml > (12 * 1024 * 1024) then return nil, "wire-limit" end
    if string.find(xml, "<!", 1, true) then return nil, "dtd" end
    if string.find(xml, "&", 1, true) then return nil, "entity" end
    local i = 1
    local n = #xml
    local function skipWs()
        while i <= n do
            local ch = string.sub(xml, i, i)
            if ch ~= " " and ch ~= "\n" and ch ~= "\r" and ch ~= "\t" then break end
            i = i + 1
        end
    end
    skipWs()
    if string.sub(xml, i, i + 4) == "<?xml" then
        local closeAt = string.find(xml, "?>", i, true)
        if closeAt == nil then return nil, "malformed" end
        i = closeAt + 2
        skipWs()
    end
    if string.sub(xml, i, i + 19) ~= "<farmDashboardExport" then return nil, "malformed" end
    i = i + 20
    local function boundary(at)
        local mark = string.sub(xml, at, at)
        return mark == " " or mark == "\n" or mark == "\r" or mark == "\t" or mark == "/" or mark == ">"
    end
    if not boundary(i) then return nil, "malformed" end
    local fields = {}
    local seen = {}
    while true do
        while i <= n and string.match(string.sub(xml, i, i), "%s") do i = i + 1 end
        local ch = string.sub(xml, i, i)
        if ch == "/" or ch == ">" then break end
        local name = string.match(string.sub(xml, i), "^([A-Za-z][A-Za-z0-9_%-]*)")
        if name == nil then return nil, "malformed" end
        i = i + #name
        while i <= n and string.match(string.sub(xml, i, i), "%s") do i = i + 1 end
        if string.sub(xml, i, i) ~= "=" then return nil, "malformed" end
        i = i + 1
        while i <= n and string.match(string.sub(xml, i, i), "%s") do i = i + 1 end
        local quote = string.sub(xml, i, i)
        if quote ~= '"' and quote ~= "'" then return nil, "malformed" end
        i = i + 1
        local stop = string.find(xml, quote, i, true)
        if stop == nil then return nil, "malformed" end
        if seen[name] then return nil, "duplicate-attribute" end
        seen[name] = true
        fields[name] = unescape(string.sub(xml, i, stop - 1))
        i = stop + 1
        if not boundary(i) then return nil, "malformed" end
    end
    while i <= n and string.match(string.sub(xml, i, i), "%s") do i = i + 1 end
    if string.sub(xml, i, i + 1) == "/>" then
        i = i + 2
    elseif string.sub(xml, i, i) == ">" then
        i = i + 1
        while i <= n and string.match(string.sub(xml, i, i), "%s") do i = i + 1 end
        if string.sub(xml, i, i + 21) ~= "</farmDashboardExport>" then return nil, "malformed" end
        i = i + 22
    else
        return nil, "malformed"
    end
    skipWs()
    if i <= n then return nil, "multiple-roots" end
    return fields, nil
end

local function fieldInt(value, minimum, maximum)
    if type(value) ~= "string" or not string.match(value, "^%d+$") then return nil end
    if #value > 1 and string.sub(value, 1, 1) == "0" then return nil end
    local number = tonumber(value)
    if not boundedInt(number, minimum, maximum) then return nil end
    return number
end

local function headerProblem(fields)
    if type(fields) ~= "table" then return "malformed" end
    if fields.schema ~= "2" or fields.encoding ~= "base64" then return "unsupported" end
    if not validId(fields.careerId) or not validId(fields.sessionId) then return "identity" end
    if fieldInt(fields.publicationSequence, 1, ExportEnvelopePublisher.XML_INT_MAX) == nil then return "bad-counter" end
    if fieldInt(fields.exportGeneration, 0, ExportEnvelopePublisher.XML_INT_MAX) == nil then return "bad-counter" end
    if fieldInt(fields.bytes, 0, ExportEnvelopePublisher.MAX_DECODED) == nil then return "bad-counter" end
    if fields.simulationTimeMs ~= "unknown" and fieldInt(fields.simulationTimeMs, 0, 999999999999999) == nil then return "bad-clock" end
    if type(fields.crc) ~= "string" or not string.match(fields.crc, "^%d+$") then return "checksum" end
    if type(fields.payload) ~= "string" or #fields.payload > 11184812 or (#fields.payload % 4) ~= 0 then return "payload" end
    return nil
end

function ExportEnvelopePublisher.decodeFields(fields)
    local problem = headerProblem(fields)
    if problem ~= nil then return nil, problem end
    local sequence = fieldInt(fields.publicationSequence, 1, ExportEnvelopePublisher.XML_INT_MAX)
    local generation = fieldInt(fields.exportGeneration, 0, ExportEnvelopePublisher.XML_INT_MAX)
    local bytes = fieldInt(fields.bytes, 0, ExportEnvelopePublisher.MAX_DECODED)
    local decoded = ExportEnvelopePublisher.decodeBase64(fields.payload or "")
    if decoded == nil or #decoded ~= bytes then return nil, "payload" end
    if ExportEnvelopePublisher.encodeBase64(decoded) ~= fields.payload then return nil, "payload" end
    if ExportEnvelopePublisher.checksum(decoded) ~= fields.crc then return nil, "checksum" end
    return {
        schema = 2,
        careerId = fields.careerId,
        sessionId = fields.sessionId,
        publicationSequence = sequence,
        exportGeneration = generation,
        simulationTimeMs = fields.simulationTimeMs,
        encoding = "base64",
        bytes = bytes,
        crc = fields.crc,
        encoded = fields.payload,
        payload = decoded,
    }, "ok"
end

function ExportEnvelopePublisher.new(deps)
    return setmetatable({ deps = deps or {}, job = nil }, { __index = ExportEnvelopePublisher })
end

local function clockSample(self)
    if type(self.deps.now) ~= "function" then return nil end
    local ok, value = pcall(self.deps.now)
    if not ok or type(value) ~= "number" or value ~= value or value == math.huge or value == -math.huge then return nil end
    return value
end

local function addClock(job, field, start, finish)
    if job == nil or job.metrics == nil then return end
    if type(start) ~= "number" or type(finish) ~= "number" or start ~= start or finish ~= finish or finish < start or start == math.huge or finish == math.huge then
        job.metrics.timingUnavailable = true
        return
    end
    job.metrics[field] = (job.metrics[field] or 0) + (finish - start)
end

local function timeAllows(self, job, startClock, used, timeMs)
    local now = clockSample(self)
    if startClock == nil or now == nil or now < startClock then
        if job.metrics then job.metrics.timingUnavailable = true end
        return true
    end
    if used > 0 and (now - startClock) >= timeMs then return false end
    return true
end

local function takeQuartet(slice, offset, total)
    if offset + 3 < total and string.find(slice, "=", 1, true) ~= nil then return nil end
    return ExportEnvelopePublisher.decodeBase64(slice)
end

local function authorityOk(self)
    if type(self.deps.isAuthority) ~= "function" then return false end
    local ok, value = pcall(self.deps.isAuthority)
    return ok and value == true
end

local function contextOk(self, job)
    if type(self.deps.currentContext) ~= "function" then return false end
    local ok, current = pcall(self.deps.currentContext)
    if not ok or type(current) ~= "table" then return false end
    if type(current.careerId) ~= "string" or current.careerId == "" then return false end
    if type(current.sessionId) ~= "string" or current.sessionId == "" then return false end
    if type(current.targetDir) ~= "string" or current.targetDir == "" then return false end
    if type(current.sessionToken) ~= "string" or current.sessionToken == "" then return false end
    return current.careerId == job.context.careerId
        and current.sessionId == job.context.sessionId
        and current.targetDir == job.context.targetDir
        and current.sessionToken == job.context.sessionToken
end

local function releaseHandle(self, job, which)
    local handle = job[which]
    if handle == nil or handle == 0 or handle == false then
        job[which] = nil
        return true, "none"
    end
    job[which] = nil
    if type(self.deps.delete) ~= "function" then return false, "api-missing" end
    local ok = pcall(self.deps.delete, handle)
    if not ok then return false, "release-failed" end
    return true, "released"
end

local function fail(job, reason)
    job.phase = "failed"
    job.error = reason
end

local function invokeCreateFolder(deps, path)
    if type(deps.createFolder) ~= "function" then return "missing", true end
    local count = 0
    local first = nil
    local ok = pcall(function()
        local function capture(...)
            count = select("#", ...)
            if count > 0 then first = select(1, ...) end
        end
        capture(deps.createFolder(path))
    end)
    if not ok then return "throw", true end
    return (count == 0) and "void" or "returned", count > 0 and first == false
end

local function presenceOf(deps, path)
    if type(deps.fileExists) ~= "function" then return "unknown" end
    local ok, present = pcall(deps.fileExists, path)
    if not ok or (present ~= true and present ~= false) then return "unknown" end
    if present == true then return "present" end
    return "absent"
end

local function readFields(deps, handle)
    local fields = {}
    for i = 1, #ATTRS do
        local name = ATTRS[i]
        local ok, value = pcall(deps.getXMLString, handle, "farmDashboardExport#" .. name)
        if not ok then return nil end
        fields[name] = value
    end
    return fields
end

local function readSlot(self, path)
    local presence = presenceOf(self.deps, path)
    if presence ~= "present" then
        return { path = path, presence = presence, record = nil }
    end
    if type(self.deps.loadXMLFile) ~= "function" or type(self.deps.getXMLString) ~= "function" then
        return { path = path, presence = "unreadable", record = nil }
    end
    local opened, handle = pcall(self.deps.loadXMLFile, "FarmDashXmlEnvelope", path)
    if not opened or handle == nil or handle == 0 or handle == false then
        return { path = path, presence = "unreadable", record = nil }
    end
    local fields = readFields(self.deps, handle)
    local released = releaseHandle(self, { readerHandle = handle }, "readerHandle")
    if not released then
        return { path = path, presence = "unreadable", record = nil }
    end
    if type(fields) ~= "table" then
        return { path = path, presence = "unreadable", record = nil }
    end
    local record, status = ExportEnvelopePublisher.decodeFields(fields)
    if status ~= "ok" then
        return { path = path, presence = "loaded-invalid", record = nil }
    end
    record.path = path
    return { path = path, presence = "loaded-valid", record = record, payload = record.payload }
end

local function fingerprint(state)
    if state == nil then return "nil" end
    if state.presence ~= "loaded-valid" or type(state.record) ~= "table" then return state.presence or "nil" end
    local rec = state.record
    return table.concat({
        "valid", rec.careerId, rec.sessionId, tostring(rec.publicationSequence),
        tostring(rec.exportGeneration), rec.simulationTimeMs, rec.crc, rec.encoded,
    }, "|")
end

local function copyContext(context)
    local levels = {}
    for i = 1, #context.levels do levels[i] = context.levels[i] end
    return {
        targetDir = context.targetDir,
        levels = levels,
        careerId = context.careerId,
        sessionId = context.sessionId,
        sessionToken = context.sessionToken,
        exportGeneration = context.exportGeneration,
        simulationTime = context.simulationTime,
        authority = context.authority == true,
        multiplayerClient = context.multiplayerClient == true,
    }
end

local function safeDir(dir)
    if type(dir) ~= "string" or dir == "" then return false end
    if string.find(dir, "..", 1, true) then return false end
    if string.find(dir, "data.json", 1, true) or string.find(dir, ".bak", 1, true) then return false end
    if string.find(dir, "careerSavegame", 1, true) or string.find(dir, "config.xml", 1, true) then return false end
    return true
end

function ExportEnvelopePublisher:begin(payload, context)
    if type(payload) ~= "string" or #payload > ExportEnvelopePublisher.MAX_DECODED then return "bad-payload" end
    if #payload == 0 and type(context) == "table" and context.exportGeneration ~= 0 then return "empty-payload" end
    if type(context) ~= "table" then return "bad-context" end
    if context.multiplayerClient == true then return "client-refused" end
    if context.authority ~= true then return "authority-lost" end
    if not validId(context.careerId) or not validId(context.sessionId) then return "identity-unconfirmed" end
    if type(context.sessionToken) ~= "string" or context.sessionToken == "" then return "bad-context" end
    if not boundedInt(context.exportGeneration, 0, ExportEnvelopePublisher.XML_INT_MAX) then return "bad-counter" end
    if not safeDir(context.targetDir) or type(context.levels) ~= "table" or #context.levels < 1 then return "unsafe-path" end
    for i = 1, #context.levels do
        if not safeDir(context.levels[i]) then return "unsafe-path" end
    end
    local tick = canonicalTick(context.simulationTime)
    if tick == nil then return "bad-clock" end
    local snapshot = {
        payload = payload,
        context = copyContext(context),
        tick = tick,
    }
    local job = self.job
    if job ~= nil and job.phase ~= "committed" and job.phase ~= "startup" and job.phase ~= "failed" and job.phase ~= "cancelled" and job.phase ~= "redundant" then
        local same = job.context.careerId == snapshot.context.careerId
            and job.context.sessionId == snapshot.context.sessionId
            and job.context.targetDir == snapshot.context.targetDir
            and job.context.sessionToken == snapshot.context.sessionToken
        if not same then
            releaseHandle(self, job, "writerHandle")
            releaseHandle(self, job, "readerHandle")
            job.waiting = nil
            self.cache = {}
            job.phase = "cancelled"
            job.callbackSent = false
            return "context-change"
        end
        job.waiting = snapshot
        return "coalesced"
    end
    self.job = {
        payload = payload,
        context = snapshot.context,
        tick = tick,
        phase = "directories",
        levelIndex = 0,
        callbackSent = false,
        lastStepWork = 0,
        metrics = { rawLoads = 0, luaBytes = 0, concats = 0, nativeWrites = 0, peakBlocks = 0, timingUnavailable = false },
    }
    return "begun"
end

function ExportEnvelopePublisher:cancel(sessionToken)
    local job = self.job
    if job == nil then return "idle" end
    if sessionToken ~= job.context.sessionToken then return "token-mismatch" end
    releaseHandle(self, job, "writerHandle")
    releaseHandle(self, job, "readerHandle")
    job.waiting = nil
    self.cache = {}
    job.phase = "cancelled"
    job.callbackSent = false
    return "cancelled"
end

function ExportEnvelopePublisher:getStatus()
    local job = self.job
    if job == nil then
        return { phase = "idle", stepWork = 0, callbackSent = false, waiting = false, error = nil }
    end
    return {
        phase = job.phase,
        candidateSequence = job.sequence,
        committedSequence = (job.phase == "committed") and job.sequence or nil,
        publicationSequence = (job.phase == "committed") and job.sequence or nil,
        exportGeneration = job.context and job.context.exportGeneration or nil,
        metrics = job.metrics,
        error = job.error,
        stepWork = job.lastStepWork or 0,
        callbackSent = job.callbackSent == true,
        waiting = job.waiting ~= nil,
        slot = job.slotName,
    }
end

local function chooseTarget(job)
    local stateA = job.stateA
    local stateB = job.stateB
    local careerId = job.context.careerId
    local function foreign(state)
        return state.presence == "loaded-valid" and state.record.careerId ~= careerId
    end
    local function blocked(state)
        return state.presence == "unreadable" or state.presence == "unknown"
    end
    if foreign(stateA) and foreign(stateB) then return nil, "foreign-slots" end
    local selected = nil
    local function consider(state)
        if state.presence ~= "loaded-valid" or state.record.careerId ~= careerId then return nil end
        if selected == nil then
            selected = state
            return nil
        end
        if state.record.publicationSequence == selected.record.publicationSequence then
            local a = state.record
            local b = selected.record
            if a.sessionId == b.sessionId and a.exportGeneration == b.exportGeneration
                and a.simulationTimeMs == b.simulationTimeMs and a.crc == b.crc
                and a.encoded == b.encoded and a.payload == b.payload then
                return "duplicate"
            end
            return "conflict"
        end
        if state.record.publicationSequence > selected.record.publicationSequence then
            selected = state
        end
        return nil
    end
    local first = consider(stateA)
    if first == "conflict" then return nil, "conflict" end
    local second = consider(stateB)
    if second == "conflict" then return nil, "conflict" end
    local duplicate = first == "duplicate" or second == "duplicate"
    if selected ~= nil and selected.record.publicationSequence >= ExportEnvelopePublisher.XML_INT_MAX then
        return nil, "overflow"
    end
    local function older(state)
        return selected ~= nil and state.presence == "loaded-valid" and state.record.careerId == careerId
            and state.record.publicationSequence < selected.record.publicationSequence
    end
    if selected ~= nil then
        local inactive = (selected.path == stateA.path) and stateB or stateA
        local slotName = (inactive == stateB) and "slot-b" or "slot-a"
        if blocked(inactive) then return nil, "unreadable" end
        if foreign(inactive) then return nil, "no-inactive-slot" end
        if duplicate or inactive.presence == "absent" or inactive.presence == "loaded-invalid" or older(inactive) then
            return inactive, slotName, selected.record.publicationSequence + 1
        end
        return nil, "no-inactive-slot"
    end
    if stateA.presence == "unknown" or stateB.presence == "unknown" then return nil, "unknown-presence" end
    if blocked(stateA) and blocked(stateB) then return nil, "unreadable" end
    if stateA.presence == "absent" then return stateA, "slot-a", 1 end
    if stateB.presence == "absent" then return stateB, "slot-b", 1 end
    if stateA.presence == "loaded-invalid" then return stateA, "slot-a", 1 end
    return nil, "no-inactive-slot"
end

local function encodeQuantum(job, piece)
    local data = job.payload
    local i = job.offset
    if i > #data then return false end
    local a = string.byte(data, i)
    local b = (i + 1 <= #data) and string.byte(data, i + 1) or 0
    local c = (i + 2 <= #data) and string.byte(data, i + 2) or 0
    local take = 1
    if i + 1 <= #data then take = 2 end
    if i + 2 <= #data then take = 3 end
    for n = 0, take - 1 do
        local byte = string.byte(data, i + n)
        job.crcA = (job.crcA + byte) % 65521
        job.crcB = (job.crcB + job.crcA) % 65521
    end
    local triple = a * 65536 + b * 256 + c
    local c1 = string.sub(ALPHABET, math.floor(triple / 262144) % 64 + 1, math.floor(triple / 262144) % 64 + 1)
    local c2 = string.sub(ALPHABET, math.floor(triple / 4096) % 64 + 1, math.floor(triple / 4096) % 64 + 1)
    local c3 = (take >= 2) and string.sub(ALPHABET, math.floor(triple / 64) % 64 + 1, math.floor(triple / 64) % 64 + 1) or "="
    local c4 = (take >= 3) and string.sub(ALPHABET, triple % 64 + 1, triple % 64 + 1) or "="
    piece[#piece + 1] = c1 .. c2 .. c3 .. c4
    job.offset = i + take
    return take
end

local function codecBudget(budget)
    if type(budget) ~= "table" then return nil end
    local bytes = budget.bytes
    local timeMs = budget.timeMs
    if type(bytes) ~= "number" or bytes ~= bytes or bytes < 3 or bytes == math.huge then return nil end
    if type(timeMs) ~= "number" or timeMs ~= timeMs or timeMs <= 0 or timeMs == math.huge then return nil end
    local cap = budget.clocked == true and ExportEnvelopePublisher.MAX_CLOCKED_STEP_BYTES
        or ExportEnvelopePublisher.MAX_STEP_BYTES
    return math.min(bytes, cap), timeMs
end

local function noteBlocks(job, count)
    if job.metrics and count > job.metrics.peakBlocks then job.metrics.peakBlocks = count end
end

local function stepEncode(self, job, budget)
    local maxBytes, timeMs = codecBudget(budget)
    if maxBytes == nil then
        job.lastStepWork = 0
        return "insufficient-budget"
    end
    if job.parts == nil then
        job.parts = {}
        job.crcA = 1
        job.crcB = 0
        job.offset = 1
    end
    local startClock = clockSample(self)
    local used = 0
    local piece = {}
    while job.offset <= #job.payload do
        if used > 0 and (used + 3) > maxBytes then break end
        if used > 0 and not timeAllows(self, job, startClock, used, timeMs) then break end
        local take = encodeQuantum(job, piece)
        if not take then break end
        used = used + take
    end
    addClock(job, "luaClock", startClock, clockSample(self))
    if #piece > 0 then
        job.parts[#job.parts + 1] = table.concat(piece)
    end
    job.lastStepWork = used
    if job.metrics then job.metrics.luaBytes = job.metrics.luaBytes + used end
    noteBlocks(job, job.parts and #job.parts or 0)
    if job.offset > #job.payload then
        local concatStart = clockSample(self)
        job.encoded = table.concat(job.parts)
        addClock(job, "concatClock", concatStart, clockSample(self))
        if job.metrics then job.metrics.concats = job.metrics.concats + 1 end
        job.crc = formatDigits(job.crcB * 65536 + job.crcA)
        job.parts = nil
        job.phase = "revalidate-a"
    end
end

local function stepDecode(self, job, budget)
    local maxBytes, timeMs = codecBudget(budget)
    if maxBytes == nil then
        job.lastStepWork = 0
        return "insufficient-budget"
    end
    if job.decodeParts == nil then
        job.decodeParts = {}
        job.decodeOffset = 1
        job.decodeCrcA = 1
        job.decodeCrcB = 0
    end
    local encoded = job.readerEncoded or ""
    if job.decodeChecked ~= true then
        if #encoded > 11184812 or (#encoded % 4) ~= 0 then
            fail(job, "payload")
            return
        end
        job.decodeChecked = true
    end
    local startClock = clockSample(self)
    local used = 0
    local piece = {}
    while job.decodeOffset <= #encoded do
        if used > 0 and (used + 3) > maxBytes then break end
        if used > 0 and not timeAllows(self, job, startClock, used, timeMs) then break end
        local slice = string.sub(encoded, job.decodeOffset, job.decodeOffset + 3)
        if #slice < 4 then
            addClock(job, "luaClock", startClock, clockSample(self))
            fail(job, "payload")
            return
        end
        local decoded = takeQuartet(slice, job.decodeOffset, #encoded)
        if decoded == nil then
            addClock(job, "luaClock", startClock, clockSample(self))
            fail(job, "payload")
            return
        end
        piece[#piece + 1] = decoded
        for n = 1, #decoded do
            local byte = string.byte(decoded, n)
            job.decodeCrcA = (job.decodeCrcA + byte) % 65521
            job.decodeCrcB = (job.decodeCrcB + job.decodeCrcA) % 65521
        end
        job.decodeOffset = job.decodeOffset + 4
        used = used + #decoded
    end
    addClock(job, "luaClock", startClock, clockSample(self))
    if #piece > 0 then
        job.decodeParts[#job.decodeParts + 1] = table.concat(piece)
        noteBlocks(job, #job.decodeParts)
    end
    job.lastStepWork = used
    if job.metrics then job.metrics.luaBytes = job.metrics.luaBytes + used end
    if job.decodeOffset > #encoded then
        local concatStart = clockSample(self)
        job.decoded = table.concat(job.decodeParts)
        addClock(job, "concatClock", concatStart, clockSample(self))
        if job.metrics then job.metrics.concats = job.metrics.concats + 1 end
        job.phase = "match"
    end
end

local function fieldsKey(fields)
    local parts = {}
    for i = 1, #ATTRS do parts[i] = fields[ATTRS[i]] or "" end
    return table.concat(parts, "\0")
end

local function observationsMatch(left, right)
    if left == nil or right == nil or left.presence ~= right.presence then return false end
    if left.presence ~= "readable" then return true end
    if type(left.fields) ~= "table" or type(right.fields) ~= "table" then return false end
    for i = 1, #ATTRS do
        if left.fields[ATTRS[i]] ~= right.fields[ATTRS[i]] then return false end
    end
    return true
end

local function toObservation(raw)
    if raw.presence == "present" and type(raw.fields) == "table" then
        return { presence = "readable", fields = raw.fields, path = raw.path }
    end
    if raw.presence == "present" then
        return { presence = "unreadable", fields = nil, path = raw.path }
    end
    return { presence = raw.presence, fields = nil, path = raw.path }
end

local function loadRaw(self, path)
    if self.job and self.job.metrics then self.job.metrics.rawLoads = self.job.metrics.rawLoads + 1 end
    local started = clockSample(self)
    local function finish(value)
        addClock(self.job, "rawLoadClock", started, clockSample(self))
        return value
    end
    local presence = presenceOf(self.deps, path)
    if presence ~= "present" then return finish({ path = path, presence = presence, fields = nil }) end
    if type(self.deps.loadXMLFile) ~= "function" or type(self.deps.getXMLString) ~= "function" then
        return finish({ path = path, presence = "unreadable", fields = nil })
    end
    local opened, handle = pcall(self.deps.loadXMLFile, "FarmDashXmlEnvelope", path)
    if not opened or handle == nil or handle == 0 or handle == false then
        return finish({ path = path, presence = "unreadable", fields = nil })
    end
    local fields = readFields(self.deps, handle)
    local released = releaseHandle(self, { readerHandle = handle }, "readerHandle")
    if not released or type(fields) ~= "table" then
        return finish({ path = path, presence = "unreadable", fields = nil })
    end
    if type(fields.payload) == "string" and #fields.payload > 11184812 then
        return finish({ path = path, presence = "loaded-invalid", fields = fields })
    end
    return finish({ path = path, presence = "present", fields = fields })
end

local function slotStateFromRecord(path, record)
    return { path = path, presence = "loaded-valid", record = record, payload = record.payload }
end

local function rememberSlot(job, key, path, observation, record)
    job["obs" .. key] = observation
    if record == nil then
        job["state" .. key] = { path = path, presence = observation.presence == "readable" and "loaded-invalid" or observation.presence, record = nil }
    else
        job["state" .. key] = slotStateFromRecord(path, record)
    end
end

local function stepBoundSlot(self, job, which, budget, revalidate)
    local key = (which == "a") and "A" or "B"
    local path = job.context.targetDir .. "slot-" .. which .. ".xml"
    local cursor = job["cursor" .. key]
    if cursor == nil and revalidate ~= true then
        local admitted = codecBudget(budget)
        if admitted == nil then
            job.lastStepWork = 0
            return "insufficient-budget"
        end
    end
    if cursor == nil then
        local raw = loadRaw(self, path)
        local observation = toObservation(raw)
        if revalidate then
            if not observationsMatch(observation, job["obs" .. key]) then
                fail(job, "stale-slots")
                return false
            end
            job.phase = (which == "a") and "revalidate-b" or "write"
            return true
        end
        if observation.presence ~= "readable" then
            rememberSlot(job, key, path, observation, nil)
            job.phase = (which == "a") and "inspect-b" or "select"
            return true
        end
        local problem = headerProblem(raw.fields)
        if problem ~= nil then
            rememberSlot(job, key, path, observation, nil)
            job.phase = (which == "a") and "inspect-b" or "select"
            return true
        end
        self.cache = self.cache or {}
        local cached = self.cache[path]
        local keyText = fieldsKey(raw.fields)
        if cached ~= nil and cached.presence == "readable" and cached.key == keyText and cached.record ~= nil then
            rememberSlot(job, key, path, observation, cached.record)
            job.phase = (which == "a") and "inspect-b" or "select"
            return true
        end
        cursor = { raw = raw, observation = observation, offset = 1, parts = {}, crcA = 1, crcB = 0 }
        job["cursor" .. key] = cursor
    end
    local maxBytes, timeMs = codecBudget(budget)
    if maxBytes == nil then
        job.lastStepWork = 0
        return "insufficient-budget"
    end
    local encoded = cursor.raw.fields.payload or ""
    local startClock = clockSample(self)
    local used = 0
    local piece = {}
    while cursor.offset <= #encoded do
        if used > 0 and (used + 3) > maxBytes then break end
        if used > 0 and not timeAllows(self, job, startClock, used, timeMs) then break end
        local slice = string.sub(encoded, cursor.offset, cursor.offset + 3)
        if #slice < 4 then
            addClock(job, "luaClock", startClock, clockSample(self))
            rememberSlot(job, key, path, cursor.observation, nil)
            job["cursor" .. key] = nil
            job.phase = (which == "a") and "inspect-b" or "select"
            return true
        end
        local decoded = takeQuartet(slice, cursor.offset, #encoded)
        if decoded == nil then
            addClock(job, "luaClock", startClock, clockSample(self))
            rememberSlot(job, key, path, cursor.observation, nil)
            job["cursor" .. key] = nil
            job.phase = (which == "a") and "inspect-b" or "select"
            return true
        end
        piece[#piece + 1] = decoded
        for n = 1, #decoded do
            local byte = string.byte(decoded, n)
            cursor.crcA = (cursor.crcA + byte) % 65521
            cursor.crcB = (cursor.crcB + cursor.crcA) % 65521
        end
        cursor.offset = cursor.offset + 4
        used = used + #decoded
    end
    if #piece > 0 then
        cursor.parts[#cursor.parts + 1] = table.concat(piece)
        noteBlocks(job, #cursor.parts)
    end
    addClock(job, "luaClock", startClock, clockSample(self))
    job.lastStepWork = used
    if job.metrics then job.metrics.luaBytes = job.metrics.luaBytes + used end
    if cursor.offset <= #encoded then return true end
    local concatStart = clockSample(self)
    local decoded = table.concat(cursor.parts)
    addClock(job, "concatClock", concatStart, clockSample(self))
    if job.metrics then job.metrics.concats = job.metrics.concats + 1 end
    local crc = formatDigits(cursor.crcB * 65536 + cursor.crcA)
    local fields = cursor.raw.fields
    local bytes = fieldInt(fields.bytes, 0, ExportEnvelopePublisher.MAX_DECODED)
    local sequence = fieldInt(fields.publicationSequence, 1, ExportEnvelopePublisher.XML_INT_MAX)
    local generation = fieldInt(fields.exportGeneration, 0, ExportEnvelopePublisher.XML_INT_MAX)
    local record = nil
    if bytes ~= nil and sequence ~= nil and generation ~= nil and #decoded == bytes and crc == fields.crc then
        record = {
            schema = 2, careerId = fields.careerId, sessionId = fields.sessionId,
            publicationSequence = sequence, exportGeneration = generation,
            simulationTimeMs = fields.simulationTimeMs, encoding = "base64",
            bytes = bytes, crc = fields.crc, encoded = fields.payload, payload = decoded, path = path,
        }
        self.cache = self.cache or {}
        self.cache[path] = { presence = "readable", key = fieldsKey(fields), record = record }
    end
    rememberSlot(job, key, path, cursor.observation, record)
    job["cursor" .. key] = nil
    job.phase = (which == "a") and "inspect-b" or "select"
    return true
end

local function guardCurrentSlots(self, job)
    local obsA = toObservation(loadRaw(self, job.context.targetDir .. "slot-a.xml"))
    local obsB = toObservation(loadRaw(self, job.context.targetDir .. "slot-b.xml"))
    if not observationsMatch(obsA, job.obsA) or not observationsMatch(obsB, job.obsB) then
        fail(job, "stale-slots")
        return false
    end
    local target = (job.slotName == "slot-b") and obsB or obsA
    if target.presence ~= "absent" and target.presence ~= "readable" then
        fail(job, "stale-slots")
        return false
    end
    return true
end

local function stepWrite(self, job)
    local started = clockSample(self)
    local function finish()
        addClock(job, "nativeWriteClock", started, clockSample(self))
        if job.metrics then job.metrics.nativeWrites = (job.metrics.nativeWrites or 0) + 1 end
    end
    if not authorityOk(self) or not contextOk(self, job) then
        fail(job, "authority-lost")
        finish()
        return
    end
    if not guardCurrentSlots(self, job) then
        finish()
        return
    end
    local deps = self.deps
    if type(deps.createXMLFile) ~= "function" or type(deps.setXMLString) ~= "function" or type(deps.saveXMLFile) ~= "function" then
        fail(job, "api-missing")
        finish()
        return
    end
    local fields = {
        schema = "2",
        careerId = job.context.careerId,
        sessionId = job.context.sessionId,
        publicationSequence = tostring(job.sequence),
        exportGeneration = tostring(job.context.exportGeneration),
        simulationTimeMs = job.tick,
        encoding = "base64",
        bytes = tostring(#job.payload),
        crc = job.crc,
        payload = job.encoded,
    }
    job.fields = fields
    local opened, handle = pcall(deps.createXMLFile, "FarmDashXmlEnvelope", job.target.path, "farmDashboardExport")
    if not opened or handle == nil or handle == 0 or handle == false then
        fail(job, "open-denied")
        finish()
        return
    end
    job.writerHandle = handle
    local wrote = pcall(function()
        for i = 1, #ATTRS do
            deps.setXMLString(handle, "farmDashboardExport#" .. ATTRS[i], fields[ATTRS[i]])
        end
    end)
    if not wrote then
        local released, releaseStatus = releaseHandle(self, job, "writerHandle")
        fail(job, released and "setter-failed" or ("setter-failed|" .. releaseStatus))
        finish()
        return
    end
    local count = 0
    local first = nil
    local saved = pcall(function()
        local function capture(...)
            count = select("#", ...)
            if count > 0 then first = select(1, ...) end
        end
        capture(deps.saveXMLFile(handle))
    end)
    local truthy = saved and count > 0 and first ~= nil and first ~= false and first ~= 0
    if not truthy then
        local released, releaseStatus = releaseHandle(self, job, "writerHandle")
        local reason = saved and "save-denied" or "save-failed"
        fail(job, released and reason or (reason .. "|" .. releaseStatus))
        finish()
        return
    end
    finish()
    job.phase = "release-writer"
end

function ExportEnvelopePublisher:step(budget)
    if self._inStep then return "busy" end
    self._inStep = true
    local started = clockSample(self)
    local ok, value = pcall(function()
        return ExportEnvelopePublisher._stepUnlocked(self, budget)
    end)
    local finishSample = clockSample(self)
    self._inStep = false
    local timed = self.job
    if timed ~= nil and timed.metrics ~= nil then
        if type(started) == "number" and type(finishSample) == "number" and finishSample >= started then
            local delta = finishSample - started
            timed.metrics.lastStepClock = delta
            if timed.metrics.maxStepClock == nil or delta > timed.metrics.maxStepClock then
                timed.metrics.maxStepClock = delta
            end
        else
            timed.metrics.timingUnavailable = true
        end
    end
    if not ok then
        if self.job ~= nil then
            releaseHandle(self, self.job, "writerHandle")
            releaseHandle(self, self.job, "readerHandle")
            fail(self.job, "step-error")
        end
        return "failed"
    end
    return value
end

function ExportEnvelopePublisher:_stepUnlocked(budget)
    budget = budget or {}
    local job = self.job
    if job == nil then return "idle" end
    if job.phase == "committed" or job.phase == "startup" or job.phase == "failed" or job.phase == "redundant" then
        if job.waiting ~= nil then
            local waiting = job.waiting
            self.job = {
                payload = waiting.payload,
                context = waiting.context,
                tick = waiting.tick,
                phase = "directories",
                levelIndex = 0,
                callbackSent = false,
                lastStepWork = 0,
                metrics = { rawLoads = 0, luaBytes = 0, concats = 0, nativeWrites = 0, peakBlocks = 0, timingUnavailable = false },
            }
            return self:step(budget)
        end
        return job.phase
    end
    if job.phase == "cancelled" then return job.phase end
    local allowed = authorityOk(self)
    if not allowed or not contextOk(self, job) then
        releaseHandle(self, job, "writerHandle")
        releaseHandle(self, job, "readerHandle")
        fail(job, allowed and "context-change" or "authority-lost")
        return job.phase
    end
    job.lastStepWork = 0
    if job.phase == "directories" then
        job.levelIndex = job.levelIndex + 1
        local path = job.context.levels[job.levelIndex]
        local status, explicitFalse = invokeCreateFolder(self.deps, path)
        if status == "missing" or status == "throw" or (explicitFalse and job.levelIndex == #job.context.levels) then
            fail(job, "setup-failed")
            return job.phase
        end
        if job.levelIndex == #job.context.levels then job.phase = "inspect-a" end
        return job.phase
    end
    if job.phase == "inspect-a" or job.phase == "revalidate-a" then
        local outcome = stepBoundSlot(self, job, "a", budget, job.phase == "revalidate-a")
        if outcome == "insufficient-budget" then return outcome end
        return job.phase
    end
    if job.phase == "inspect-b" or job.phase == "revalidate-b" then
        local outcome = stepBoundSlot(self, job, "b", budget, job.phase == "revalidate-b")
        if outcome == "insufficient-budget" then return outcome end
        return job.phase
    end
    if job.phase == "select" then
        local target, slotName, sequence = chooseTarget(job)
        if target == nil then
            if slotName == "redundant" then
                job.phase = "redundant"
            else
                fail(job, slotName or "no-inactive-slot")
            end
            return job.phase
        end
        job.target = target
        job.slotName = slotName
        job.sequence = sequence
        job.phase = "encode"
        return job.phase
    end
    if job.phase == "encode" then
        local outcome = stepEncode(self, job, budget)
        if outcome == "insufficient-budget" then return outcome end
        return job.phase
    end
    if job.phase == "write" then
        stepWrite(self, job)
        return job.phase
    end
    if job.phase == "release-writer" then
        local started = clockSample(self)
        local released, releaseStatus = releaseHandle(self, job, "writerHandle")
        addClock(job, "nativeWriteClock", started, clockSample(self))
        if not released then
            fail(job, releaseStatus)
            return job.phase
        end
        job.phase = "open-reader"
        return job.phase
    end
    if job.phase == "open-reader" then
        if job.writerHandle ~= nil then
            fail(job, "writer-open")
            return job.phase
        end
        local started = clockSample(self)
        local opened, handle = pcall(self.deps.loadXMLFile, "FarmDashXmlEnvelope", job.target.path)
        addClock(job, "rawLoadClock", started, clockSample(self))
        if not opened or handle == nil or handle == 0 or handle == false then
            fail(job, opened and "load-failed" or "read-failed")
            return job.phase
        end
        job.readerHandle = handle
        job.phase = "read-meta"
        return job.phase
    end
    if job.phase == "read-meta" then
        local started = clockSample(self)
        local fields = readFields(self.deps, job.readerHandle)
        addClock(job, "rawLoadClock", started, clockSample(self))
        if type(fields) ~= "table" then
            releaseHandle(self, job, "readerHandle")
            fail(job, "read-failed")
            return job.phase
        end
        for i = 1, #ATTRS do
            if fields[ATTRS[i]] ~= job.fields[ATTRS[i]] then
                releaseHandle(self, job, "readerHandle")
                fail(job, "metadata-mismatch")
                return job.phase
            end
        end
        job.readerEncoded = fields.payload
        job.phase = "decode"
        return job.phase
    end
    if job.phase == "decode" then
        local outcome = stepDecode(self, job, budget)
        if outcome == "insufficient-budget" then return outcome end
        return job.phase
    end
    if job.phase == "match" then
        local crc = formatDigits(job.decodeCrcB * 65536 + job.decodeCrcA)
        if job.decoded ~= job.payload or crc ~= job.crc then
            releaseHandle(self, job, "readerHandle")
            fail(job, "mismatch")
            return job.phase
        end
        job.phase = "release-reader"
        return job.phase
    end
    if job.phase == "release-reader" then
        local released, releaseStatus = releaseHandle(self, job, "readerHandle")
        if not released then
            fail(job, releaseStatus == "api-missing" and "api-missing" or "release-failed")
            return job.phase
        end
        if not authorityOk(self) then
            fail(job, "authority-lost")
            return job.phase
        end
        job.phase = "commit"
        return job.phase
    end
    if job.phase == "commit" then
        if not authorityOk(self) or not contextOk(self, job) then
            fail(job, "authority-lost")
            return job.phase
        end
        if job.context.exportGeneration == 0 or #job.payload == 0 then
            job.phase = "startup"
            return job.phase
        end
        if type(self.deps.onGameplayCommitted) == "function" and not job.callbackSent then
            job.callbackSent = true
            pcall(self.deps.onGameplayCommitted, {
                careerId = job.context.careerId,
                sessionId = job.context.sessionId,
                publicationSequence = job.sequence,
                exportGeneration = job.context.exportGeneration,
                slot = job.slotName,
            })
        end
        job.phase = "committed"
        return job.phase
    end
    return job.phase
end
