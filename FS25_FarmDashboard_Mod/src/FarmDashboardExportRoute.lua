-- Routes a verified schema-2 snapshot to one slot descriptor.
-- The descriptor is a hint. It is not gameplay data and it is not a two-file transaction.

FarmDashboardExportRoute = {}

local job = nil
local releaseHandle
local bindingOk

local function blank()
    return {
        publisher = nil,
        phase = "idle",
        active = nil,
        committed = nil,
        held = nil,
        lastGood = nil,
        callbackSent = false,
        resources = {},
    }
end

local function identityOf(record)
    local ident = rawget(_G, "FarmDashboardCareerIdentity")
    local status = ident and ident.status and ident.status() or {}
    local careerId = record.careerId or status.careerId
    local sessionId = record.sessionId or status.sessionId
    local sessionToken = record.sessionToken or status.sessionToken
    return careerId, sessionId, sessionToken, status.persisted == true
end

local function contextFor(self, record)
    local ident = rawget(_G, "FarmDashboardCareerIdentity")
    local live = ident and ident.status and ident.status() or {}
    if live.waitingForIdentity or live.recoveryNeeded then return nil end
    local careerId, sessionId, sessionToken, persisted = identityOf(record)
    if careerId == "waiting" or sessionId == "waiting" or sessionToken == "waiting" then return nil end
    if type(careerId) ~= "string" or careerId == "" then return nil end
    local root = record.root or "modSettings/FS25_FarmDashboard/savegame1/"
    if string.sub(root, -1) ~= "/" then root = root .. "/" end
    local careerDir = root .. careerId .. "/"
    return {
        targetDir = careerDir,
        levels = { root, careerDir },
        careerId = careerId,
        sessionId = sessionId,
        sessionToken = sessionToken,
        exportGeneration = tonumber(record.generation) or 0,
        simulationTime = tonumber(record.simulationTime) or 0,
        authority = record.authority ~= false,
        multiplayerClient = record.multiplayerClient == true,
        persistence = persisted and "saved" or "provisional",
        sourceSlot = record.sourceSlot or "savegame1",
        root = root,
    }
end

function FarmDashboardExportRoute:reset(deps)
    job = blank()
    deps = deps or {}
    if type(deps.currentContext) ~= "function" or type(deps.isAuthority) ~= "function" then
        job.publisher = nil
        job.deps = deps
        job.phase = "idle"
        return "refused"
    end
    job.publisher = ExportEnvelopePublisher.new(deps)
    job.deps = deps
    job.resourceVersion = {}
    job.resourceTokens = {}
    return "reset"
end

function FarmDashboardExportRoute:status()
    local pub = job and job.publisher and job.publisher:getStatus() or nil
    return {
        phase = job and job.phase or "idle",
        publisherPhase = pub and pub.phase or nil,
        publicationSequence = job and job.committed and job.committed.sequence or nil,
        callbackSent = job and job.callbackSent == true or false,
        lastGood = job and job.lastGood or nil,
    }
end

--- True while a snapshot, a coalesced record or a descriptor is still owed a terminal outcome.
function FarmDashboardExportRoute:hasPendingSnapshot()
    if job == nil or job.publisher == nil then return false end
    if job.active ~= nil or job.held ~= nil or job.committed ~= nil then return true end
    return job.phase ~= "idle"
end

function FarmDashboardExportRoute:submit(record)
    if job == nil or job.publisher == nil then return "refused" end
    if type(record) ~= "table" or type(record.json) ~= "string" or record.json == "" then return "refused" end
    if job.phase == "descriptor" or job.phase == "hold" then
        job.held = record
        return "coalesced"
    end
    local ctx = contextFor(self, record)
    if ctx == nil then return "refused" end
    record._ctx = ctx
    local begun = job.publisher:begin(record.json, ctx)
    if begun ~= "begun" and begun ~= "coalesced" then return "refused" end
    if begun == "begun" then
        job.active = record
        job.callbackSent = false
        job.phase = "snapshot"
    else
        job.held = record
    end
    return begun == "coalesced" and "coalesced" or "queued"
end

function FarmDashboardExportRoute:submitResource(kind, jsonText, record)
    if job == nil then return "refused" end
    if kind ~= "dirtyPens" and kind ~= "penDetail" then return "refused" end
    if type(jsonText) ~= "string" or jsonText == "" then return "refused" end
    record = record or {}
    local ctx = contextFor(self, record)
    if ctx == nil then return "refused" end
    local resourcesDir = ctx.targetDir .. "resources/"
    local kindDir = resourcesDir .. kind .. "/"
    local resourceDir = kindDir
    if kind == "penDetail" then
        if type(record.resourceId) ~= "string" or string.match(record.resourceId, "^[A-Za-z0-9_%-]+$") == nil then
            return "refused"
        end
        resourceDir = kindDir .. record.resourceId .. "/"
    end
    local resourceCtx = {}
    for k, v in pairs(ctx) do resourceCtx[k] = v end
    resourceCtx.targetDir = resourceDir
    resourceCtx.levels = { ctx.root, ctx.targetDir, resourcesDir, kindDir }
    if kind == "penDetail" then resourceCtx.levels[#resourceCtx.levels + 1] = resourceDir end
    resourceCtx.exportGeneration = 0
    local slotKey = kind .. ":" .. (record.resourceId or "index")
    job.resourceOrder = job.resourceOrder or {}
    job.resourceMember = job.resourceMember or {}
    if not job.resourceMember[slotKey] then
        job.resourceMember[slotKey] = true
        job.resourceOrder[#job.resourceOrder + 1] = slotKey
    end
    job.resourceVersion = job.resourceVersion or {}
    job.resourceTokens = job.resourceTokens or {}
    job.resourceActive = job.resourceActive or {}
    job.resourceHeld = job.resourceHeld or {}
    job.resourceSerial = (job.resourceSerial or 0) + 1
    local serial = job.resourceSerial
    job.resourceSettled = job.resourceSettled or {}
    job.resourceTokens[slotKey] = ctx.sessionToken
    local pub = job.resources[slotKey]
    local running = false
    if pub ~= nil and type(pub.getStatus) == "function" then
        local status = pub:getStatus()
        local phase = status and status.phase
        local settled = job.resourceSettled and job.resourceSettled[slotKey]
        local liveVersion = job.resourceVersion and job.resourceVersion[slotKey]
        local terminal = phase == "committed" or phase == "startup" or phase == "failed" or phase == "cancelled" or phase == "idle" or phase == "redundant"
        local awaitingAck = (phase == "startup" or phase == "committed") and liveVersion ~= nil and settled ~= liveVersion
        running = phase ~= nil and (awaitingAck or not terminal)
    end
    local collector = rawget(_G, "FarmDashboardDataCollector")
    record.admissionVersion = serial
    if running then
        local previous = job.resourceHeld[slotKey]
        if previous ~= nil and collector and type(collector.onResourceSettled) == "function" then
            collector:onResourceSettled(kind, record.resourceId, previous.serial, "superseded")
        end
        job.resourceHeld[slotKey] = { serial = serial, payload = jsonText, ctx = resourceCtx }
        if collector and type(collector.noteResourceAdmission) == "function" then
            collector:noteResourceAdmission(kind, record.resourceId, serial, record)
        end
        return "held"
    end
    job.resourceActive[slotKey] = { serial = serial, payload = jsonText }
    job.resourceVersion[slotKey] = serial
    job.resourceSettled[slotKey] = nil
    if pub == nil then
        local deps = {}
        for key, value in pairs(job.deps) do deps[key] = value end
        deps.currentContext = function()
            local live = contextFor(self, record)
            if live == nil then return nil end
            local dir = live.targetDir .. "resources/" .. kind .. "/"
            if kind == "penDetail" then dir = dir .. record.resourceId .. "/" end
            return {
                careerId = live.careerId,
                sessionId = live.sessionId,
                sessionToken = live.sessionToken,
                targetDir = dir,
            }
        end
        pub = ExportEnvelopePublisher.new(deps)
        job.resources[slotKey] = pub
    end
    local begun = pub:begin(jsonText, resourceCtx)
    if begun ~= "begun" and begun ~= "coalesced" then
        job.resourceVersion[slotKey] = nil
        job.resourceActive[slotKey] = nil
        return "refused"
    end
    if collector and type(collector.noteResourceAdmission) == "function" then
        collector:noteResourceAdmission(kind, record.resourceId, serial, record)
    end
    return "queued"
end

local CAPTURE_ATTRS = {
    "schema", "careerId", "sessionId", "publicationSequence", "exportGeneration",
    "simulationTimeMs", "encoding", "bytes", "crc", "payload",
}

local function sameScalar(xmlValue, committedValue)
    if xmlValue == tostring(committedValue) then return true end
    if type(committedValue) ~= "number" then return false end
    return tonumber(xmlValue) == committedValue
end

local function captureCommittedEnvelope(committed)
    local deps = job and job.deps or {}
    if type(committed) ~= "table" then return nil, "missing" end
    if committed.slot ~= "a" and committed.slot ~= "b" then return nil, "slot" end
    if type(deps.loadXMLFile) ~= "function" or type(deps.getXMLString) ~= "function" then
        return nil, "reader-missing"
    end
    local slotName = committed.slot == "b" and "slot-b.xml" or "slot-a.xml"
    local path = tostring(committed.targetDir or "") .. slotName
    local loaded, reader = pcall(deps.loadXMLFile, "FarmDashEnvelopeCapture", path)
    if not loaded or reader == nil or reader == 0 or reader == false then
        return nil, "unread"
    end
    local fields = {}
    for i = 1, #CAPTURE_ATTRS do
        local name = CAPTURE_ATTRS[i]
        local ok, got = pcall(deps.getXMLString, reader, "farmDashboardExport#" .. name)
        if not ok or type(got) ~= "string" then
            releaseHandle(deps, reader)
            return nil, "attributes"
        end
        fields[name] = got
    end
    if not releaseHandle(deps, reader) then return nil, "release" end
    if not bindingOk(committed) then return nil, "binding" end
    if fields.schema ~= "2" or fields.encoding ~= "base64" then return nil, "schema" end
    if fields.careerId ~= committed.careerId or fields.sessionId ~= committed.sessionId then
        return nil, "identity"
    end
    if not sameScalar(fields.publicationSequence, committed.sequence) then return nil, "sequence" end
    if not sameScalar(fields.exportGeneration, committed.generation) then return nil, "generation" end
    local owned = {}
    for i = 1, #CAPTURE_ATTRS do
        owned[CAPTURE_ATTRS[i]] = fields[CAPTURE_ATTRS[i]]
    end
    owned.sourceSlot = committed.sourceSlot
    owned.persistence = committed.persistence
    owned.sessionToken = committed.sessionToken
    owned.targetDir = committed.targetDir
    owned.slot = committed.slot
    return owned, "captured"
end

local function finishGameplay(committed)
    local collector = rawget(_G, "FarmDashboardDataCollector")
    if collector and type(collector.onExportTransactionCommitted) == "function" then
        collector:onExportTransactionCommitted(committed)
    end
    local captured, reason = captureCommittedEnvelope(committed)
    if job ~= nil then
        job.mirrorCapture = reason
        job.mirrorRecord = captured
    end
    if captured == nil then return end
    local mirror = rawget(_G, "FarmDashboardExportMirror")
    if mirror and type(mirror.onCommittedEnvelope) == "function" then
        pcall(function()
            mirror:onCommittedEnvelope(captured)
        end)
    end
end

function FarmDashboardExportRoute:recaptureCommitted()
    if job == nil or job.lastGood == nil then return nil, "missing" end
    local captured, reason = captureCommittedEnvelope(job.lastGood)
    job.mirrorCapture = reason
    if captured == nil then job.mirrorRecord = nil end
    return captured, reason
end

function FarmDashboardExportRoute:mirrorCaptureStatus()
    if job == nil then return "missing" end
    return tostring(job.mirrorCapture or "none") .. "|" .. tostring(job.mirrorRecord ~= nil) .. "|" .. tostring(job.lastGood ~= nil)
end

local function authorityOk()
    local deps = job and job.deps or {}
    if type(deps.isAuthority) ~= "function" then return false end
    local ok, value = pcall(deps.isAuthority)
    return ok and value == true
end

releaseHandle = function(deps, handle)
    if handle == nil or handle == 0 or handle == false then return true end
    if type(deps.delete) ~= "function" then return false end
    return pcall(deps.delete, handle) == true
end

local function notifyTerminal(committed)
    local collector = rawget(_G, "FarmDashboardDataCollector")
    if collector and type(collector.onExportTransactionFailed) == "function" and type(committed) == "table" then
        collector:onExportTransactionFailed(committed)
    end
end

bindingOk = function(committed)
    local deps = job and job.deps or {}
    if type(deps.currentContext) ~= "function" or type(deps.isAuthority) ~= "function" then return false end
    if not authorityOk() then return false end
    local ok, ctx = pcall(deps.currentContext)
    if not ok or type(ctx) ~= "table" then return false end
    if type(ctx.careerId) ~= "string" or type(ctx.sessionId) ~= "string" or type(ctx.sessionToken) ~= "string" or type(ctx.targetDir) ~= "string" then
        return false
    end
    if ctx.careerId ~= committed.careerId or ctx.sessionId ~= committed.sessionId or ctx.sessionToken ~= committed.sessionToken or ctx.targetDir ~= committed.targetDir then
        return false
    end
    return true
end

local function dropCommit(reason)
    local committed = job.committed
    job.phase = reason == "cancelled" and "idle" or "hold"
    job.committed = nil
    job.callbackSent = false
    if reason == "cancelled" then
        job.held = nil
        job.descriptorAttempts = 0
        notifyTerminal(committed)
    end
    return reason == "cancelled" and "cancelled" or "route-failed"
end

function FarmDashboardExportRoute:writeDescriptor()
    if job == nil or job.committed == nil then return "idle" end
    local deps = job.deps or {}
    local committed = job.committed
    if not bindingOk(committed) then return dropCommit("cancelled") end
    job.descriptorAttempts = (job.descriptorAttempts or 0) + 1
    if job.descriptorAttempts > 8 then
        if Logging and Logging.warning then
            Logging.warning("[FarmDash] export route descriptor failed after bounded retries")
        end
        return dropCommit("cancelled")
    end
    local path = committed.root .. "active.xml"
    if type(deps.createXMLFile) ~= "function" or type(deps.setXMLString) ~= "function" or type(deps.saveXMLFile) ~= "function" then
        job.phase = "hold"
        return "route-failed"
    end
    local opened, handle = pcall(deps.createXMLFile, "FarmDashRoute", path, "farmDashboardRoute")
    if not opened or handle == nil or handle == 0 or handle == false then
        job.phase = "hold"
        return "route-failed"
    end
    local fields = {
        schema = "1",
        careerId = committed.careerId,
        sessionId = committed.sessionId,
        publicationSequence = tostring(committed.sequence),
        slot = committed.slot,
        persistence = committed.persistence,
        sourceSlot = committed.sourceSlot,
    }
    local wrote = pcall(function()
        for name, value in pairs(fields) do
            deps.setXMLString(handle, "farmDashboardRoute#" .. name, value)
        end
    end)
    local count = 0
    local first = nil
    local savedOk = wrote and pcall(function()
        local function capture(...)
            count = select("#", ...)
            if count > 0 then first = select(1, ...) end
        end
        capture(deps.saveXMLFile(handle))
    end)
    local saved = savedOk and count > 0 and first == true
    if not releaseHandle(deps, handle) then
        job.phase = "hold"
        return "route-failed"
    end
    if not authorityOk() then return dropCommit("cancelled") end
    if not saved then
        job.phase = "hold"
        return "route-failed"
    end
    if type(deps.loadXMLFile) ~= "function" or type(deps.getXMLString) ~= "function" then
        job.phase = "hold"
        return "route-failed"
    end
    local loaded, reader = pcall(deps.loadXMLFile, "FarmDashRoute", path)
    if not loaded or reader == nil or reader == 0 or reader == false then
        job.phase = "hold"
        return "route-failed"
    end
    local matches = true
    for name, value in pairs(fields) do
        local ok, got = pcall(deps.getXMLString, reader, "farmDashboardRoute#" .. name)
        if not ok or got ~= value then matches = false end
    end
    if not releaseHandle(deps, reader) then
        job.phase = "hold"
        return "route-failed"
    end
    if not bindingOk(committed) then return dropCommit("cancelled") end
    if not matches then
        job.phase = "hold"
        return "route-failed"
    end
    job.lastGood = committed
    job.descriptorAttempts = 0
    job.phase = "idle"
    if not job.callbackSent and (tonumber(committed.generation) or 0) > 0 then
        job.callbackSent = true
        finishGameplay(committed)
    end
    local held = job.held
    job.held = nil
    job.committed = nil
    if held ~= nil then
        return self:submit(held)
    end
    return "routed"
end

local function exportBudget()
    local frame = job and job.frameBudget
    local bytes = 4096
    if type(frame) == "table" and type(frame.bytes) == "number" then
        bytes = math.max(0, math.min(4096, math.floor(frame.bytes)))
    end
    if bytes < 3 then return nil end
    return { bytes = bytes, timeMs = 4 }
end

local function reserveBudget()
    local budget = exportBudget()
    if budget == nil then return nil end
    local frame = job and job.frameBudget
    if type(frame) == "table" and type(frame.bytes) == "number" then
        frame.bytes = math.max(0, frame.bytes - budget.bytes)
        frame.charged = (frame.charged or 0) + budget.bytes
    end
    return budget
end

function FarmDashboardExportRoute:step(budget)
    if job == nil or job.publisher == nil then return "idle" end
    if type(budget) == "table" then job.frameBudget = budget end
    local result = self:_stepOnce()
    if job and job.phase == "idle" then
        local collector = rawget(_G, "FarmDashboardDataCollector")
        if collector and type(collector.pumpHeldExport) == "function" then
            collector:pumpHeldExport()
        end
    end
    return result
end

function FarmDashboardExportRoute:_stepOnce()
    if job == nil or job.publisher == nil then return "idle" end
    local function resourceWaiting()
        if type(job.resources) ~= "table" then return false end
        for _, pub in pairs(job.resources) do
            if pub and pub.getStatus then
                local status = pub:getStatus()
                local phase = status and status.phase
                if phase ~= nil and phase ~= "idle" and phase ~= "redundant" then return true end
            end
        end
        return false
    end
    if job.phase == "descriptor" or job.phase == "hold" then
        return self:writeDescriptor()
    end
    local skipSnapshot = false
    if job.phase == "snapshot" and resourceWaiting() then
        job._fair = (job._fair == "resource") and "snapshot" or "resource"
        if job._fair == "resource" then skipSnapshot = true end
    end
    if job.phase == "snapshot" and not skipSnapshot then
        local budget = reserveBudget()
        if budget == nil then return "deferred" end
        job.publisher:step(budget)
        local status = job.publisher:getStatus()
        if status.phase == "failed" or status.phase == "cancelled" then
            local active = job.active
            job.phase = "idle"
            job.active = nil
            notifyTerminal({
                generation = active and active.generation,
                collectorSession = active and active.collectorSession,
            })
            -- A record coalesced behind the failed snapshot has no other way back into the publisher.
            local held = job.held
            job.held = nil
            if held ~= nil then self:submit(held) end
            return status.phase
        end
        if status.phase == "committed" or status.phase == "startup" then
            local active = job.active or {}
            local ctx = active._ctx or {}
            local slot = status.slot or ""
            if slot == "slot-a" then slot = "a" elseif slot == "slot-b" then slot = "b" end
            job.committed = {
                careerId = ctx.careerId,
                sessionId = ctx.sessionId,
                sessionToken = ctx.sessionToken,
                sequence = status.publicationSequence,
                generation = ctx.exportGeneration,
                slot = slot,
                persistence = ctx.persistence,
                sourceSlot = ctx.sourceSlot,
                root = ctx.root,
                targetDir = ctx.targetDir,
                json = active.json,
                collectorSession = active.collectorSession,
            }
            job.active = nil
            if status.phase == "startup" or (tonumber(ctx.exportGeneration) or 0) == 0 then
                job.phase = "idle"
                job.committed = nil
                -- Generation 0 writes no descriptor, so writeDescriptor never drains job.held here.
                -- A gameplay record coalesced behind the bootstrap must be resubmitted or it is lost
                -- while the collector waits for its commit callback.
                local held = job.held
                job.held = nil
                if held ~= nil then
                    self:submit(held)
                end
                return "startup"
            end
            job.phase = "descriptor"
            return self:writeDescriptor()
        end
        return status.phase
    end
    if job.phase == "descriptor" or job.phase == "hold" then
        return self:writeDescriptor()
    end
    -- timeMs is the publisher's required ceiling. No CPU clock is installed, so this
    -- number is not a measured elapsed time. The byte cap is the bound that applies.
    local budget = exportBudget() or { bytes = 0, timeMs = 4 }
    job.resourceSettled = job.resourceSettled or {}
    job.resourceReady = job.resourceReady or {}
    local key = nil
    local pub = nil
    local order = job.resourceOrder or {}
    local nOrder = #order
    if nOrder > 0 then
        local startAt = job.resourceCursor or 1
        if startAt < 1 or startAt > nOrder then startAt = 1 end
        for attempt = 0, nOrder - 1 do
            local idx = ((startAt - 1 + attempt) % nOrder) + 1
            local candidate = order[idx]
            local candidatePub = job.resources[candidate]
            if candidatePub and candidatePub.getStatus then
                local look = candidatePub:getStatus()
                local phase = look and look.phase
                local version = job.resourceVersion and job.resourceVersion[candidate]
                local settled = job.resourceSettled[candidate]
                local service = false
                if phase ~= nil and phase ~= "idle" and phase ~= "redundant" then
                    if phase == "startup" or phase == "committed" or phase == "failed" or phase == "cancelled" then
                        service = version ~= nil and settled ~= version
                        if (not service) and job.resourceHeld and job.resourceHeld[candidate] ~= nil then service = true end
                    else
                        service = true
                    end
                end
                if service then
                    key = candidate
                    pub = candidatePub
                    job.resourceCursor = (idx % nOrder) + 1
                    break
                end
            end
        end
    end
    if key ~= nil and pub ~= nil then
        local status = pub:getStatus()
        local version = job.resourceVersion and job.resourceVersion[key] or nil
        if version ~= nil and job.resourceReady[key] ~= false and job.resourceSettled[key] ~= version and (status.phase == "committed" or status.phase == "startup") then
            job.resourceSettled[key] = version
            local kind, id = string.match(key, "^([^:]+):(.*)$")
            local collector = rawget(_G, "FarmDashboardDataCollector")
            if collector and type(collector.onResourceDurable) == "function" then
                collector:onResourceDurable(kind, id, version)
            end
            local held = job.resourceHeld and job.resourceHeld[key]
            if held ~= nil then
                local begun = pub:begin(held.payload, held.ctx)
                if begun == "begun" then
                    job.resourceHeld[key] = nil
                    job.resourceActive[key] = held
                    job.resourceVersion[key] = held.serial
                    job.resourceSettled[key] = nil
                    job.resourceReady[key] = false
                end
            end
        elseif status.phase == "failed" or status.phase == "cancelled" then
            local kind, id = string.match(key, "^([^:]+):(.*)$")
            local collector = rawget(_G, "FarmDashboardDataCollector")
            local outcome = status.phase == "cancelled" and "cancelled" or "failed"
            if version ~= nil and job.resourceSettled[key] ~= version and collector and type(collector.onResourceSettled) == "function" then
                collector:onResourceSettled(kind, id, version, outcome)
                job.resourceSettled[key] = version
            end
            local held = job.resourceHeld and job.resourceHeld[key]
            if held ~= nil then
                local begun = pub:begin(held.payload, held.ctx)
                if begun == "begun" then
                    job.resourceHeld[key] = nil
                    job.resourceActive[key] = held
                    job.resourceVersion[key] = held.serial
                    job.resourceSettled[key] = nil
                    job.resourceReady[key] = false
                elseif collector and type(collector.onResourceSettled) == "function" then
                    collector:onResourceSettled(kind, id, held.serial, "failed")
                    job.resourceHeld[key] = nil
                end
            end
        elseif status.phase ~= "committed" and status.phase ~= "startup" and status.phase ~= "failed" and status.phase ~= "idle" and status.phase ~= "cancelled" then
            local budget = reserveBudget()
            if budget == nil then return "deferred" end
            pub:step(budget)
            job.resourceReady[key] = true
        end
    end
    return job.phase
end

function FarmDashboardExportRoute:cancelCurrent()
    if job == nil or job.publisher == nil then return "idle" end
    local token = nil
    if job.active and job.active._ctx then token = job.active._ctx.sessionToken end
    if token == nil then
        local ident = rawget(_G, "FarmDashboardCareerIdentity")
        local status = ident and ident.status and ident.status() or nil
        token = status and status.sessionToken or nil
    end
    if job.resources then
        local collector = rawget(_G, "FarmDashboardDataCollector")
        for key, pub in pairs(job.resources) do
            local resourceToken = job.resourceTokens and job.resourceTokens[key] or token
            if resourceToken ~= nil and pub.cancel then pcall(function() pub:cancel(resourceToken) end) end
            local kind, id = string.match(key, "^([^:]+):(.*)$")
            if collector and type(collector.onResourceSettled) == "function" then
                local version = job.resourceVersion and job.resourceVersion[key]
                if version ~= nil then collector:onResourceSettled(kind, id, version, "cancelled") end
                local held = job.resourceHeld and job.resourceHeld[key]
                if held ~= nil then collector:onResourceSettled(kind, id, held.serial, "cancelled") end
            end
        end
    end
    job.resources = {}
    job.resourceOrder = {}
    job.resourceMember = {}
    job.resourceCursor = 1
    job.resourceSettled = {}
    job.resourceHeld = {}
    job.resourceActive = {}
    job.resourceVersion = {}
    job.resourceReady = {}
    job.held = nil
    job.committed = nil
    job.active = nil
    job.phase = "idle"
    job.callbackSent = false
    local mirror = rawget(_G, "FarmDashboardExportMirror")
    if mirror and type(mirror.cancelMatching) == "function" and token ~= nil then
        pcall(function() mirror:cancelMatching(token) end)
    end
    if token ~= nil then return job.publisher:cancel(token) end
    return "cancelled"
end
