-- Career identity for the dashboard export.
-- The desktop app proposes a namespace. This process adopts it and owns every sequence.
-- A clock, a process counter, and Utils.getUniqueId are not identities.
-- Missing proposal waits. Unreadable adopted state does not reset to sequence 1.

FarmDashboardCareerIdentity = {}

local state = {
    careerId = nil,
    persisted = false,
    loadedFromSave = false,
    sessionId = nil,
    sessionToken = nil,
    allocationFailed = false,
    captured = false,
    mission = nil,
    waitingForIdentity = false,
    recoveryNeeded = false,
    savePending = false,
    captureEpoch = 0,
    identityGate = nil,
    deps = nil,
    reason = nil,
    stage = nil,
    capability = nil,
}

-- Ordinary script mods run with _G = their own environment; engine functions are inherited
-- through its __index (mods.lua), so rawget(_G, name) never sees them.
local function engineFn(name)
    local value = _G[name]
    if type(value) == "function" then return value end
    return nil
end

-- First cause wins within one capture. Tags only: never paths, namespaces or IDs.
local function note(reason, stage, capability)
    if state.reason ~= nil then return end
    state.reason = reason
    state.stage = stage
    state.capability = capability
end

local function missingOf(deps, names)
    local missing = {}
    for i = 1, #names do
        local name = names[i]
        local injected = type(deps) == "table" and type(deps[name]) == "function"
        if not injected and engineFn(name) == nil then missing[#missing + 1] = name end
    end
    if #missing == 0 then return nil end
    return table.concat(missing, ",")
end

local function acceptable(value)
    if type(value) ~= "string" or value == "" or #value > 64 then return false end
    if string.find(value, "..", 1, true) then return false end
    return string.match(value, "^[A-Za-z0-9_%-]+$") ~= nil
end

local function namespaceOk(value)
    return type(value) == "string" and string.match(value, "^[a-f0-9]+$") ~= nil and #value == 16
end

local function canonicalCount(text)
    if type(text) ~= "string" or string.match(text, "^[0-9]+$") == nil then return nil end
    if #text > 1 and string.sub(text, 1, 1) == "0" then return nil end
    local n = tonumber(text)
    if type(n) ~= "number" or n ~= n or n < 0 or n > 2147483647 or n ~= math.floor(n) then return nil end
    return n
end

local function xmlFn(deps, name)
    if type(deps) == "table" and type(deps[name]) == "function" then return deps[name] end
    return engineFn(name)
end

local function provisionRoot(deps)
    if type(deps) == "table" and type(deps.provisionRoot) == "string" and deps.provisionRoot ~= "" then
        local root = deps.provisionRoot
        if string.find(root, "..", 1, true) then return nil end
        local last = string.sub(root, -1)
        if last ~= "/" and last ~= "\\" then root = root .. "/" end
        return root
    end
    local baseFn = engineFn("getUserProfileAppPath")
    if type(baseFn) ~= "function" then return nil end
    local ok, base = pcall(baseFn)
    if not ok or type(base) ~= "string" then return nil end
    if string.find(base, "..", 1, true) then return nil end
    if base ~= "" then
        local last = string.sub(base, -1)
        if last ~= "/" and last ~= "\\" then base = base .. "/" end
    end
    return base .. "modSettings/FS25_FarmDashboard/"
end

local function releaseHandle(deps, handle)
    if handle == nil or handle == 0 or handle == false then return true end
    local deleteFn = xmlFn(deps, "delete")
    if type(deleteFn) ~= "function" then return false end
    return pcall(deleteFn, handle) == true
end

local function presenceOf(deps, path)
    local exists = xmlFn(deps, "fileExists")
    if type(exists) ~= "function" then return "unknown" end
    local ok, value = pcall(exists, path)
    if not ok then return "unknown" end
    if value == true then return "present" end
    if value == false then return "absent" end
    return "unknown"
end

local function readFields(deps, path, root, names)
    local load = xmlFn(deps, "loadXMLFile")
    local getter = xmlFn(deps, "getXMLString")
    if type(load) ~= "function" or type(getter) ~= "function" then return nil, "unread" end
    -- loadXMLFile on a missing path logs "Failed to open xml file"; fileExists is silent.
    if presenceOf(deps, path) == "absent" then return nil, "absent" end
    local opened, handle = pcall(load, "FarmDashIdentity", path)
    if not opened or handle == nil or handle == 0 or handle == false then
        local presence = presenceOf(deps, path)
        if presence == "absent" then return nil, "absent" end
        return nil, "unreadable"
    end
    local out = {}
    local problem = "ok"
    for i = 1, #names do
        local ok, value = pcall(getter, handle, root .. "#" .. names[i])
        if not ok then
            problem = "damaged"
            break
        end
        out[names[i]] = value
    end
    if not releaseHandle(deps, handle) then return nil, "unreleased" end
    if problem ~= "ok" then return nil, problem end
    return out, "ok"
end

local function writeFields(deps, path, root, fields)
    local create = xmlFn(deps, "createXMLFile")
    local setter = xmlFn(deps, "setXMLString")
    local save = xmlFn(deps, "saveXMLFile")
    if type(create) ~= "function" or type(setter) ~= "function" or type(save) ~= "function" then return false end
    local opened, handle = pcall(create, "FarmDashIdentity", path, root)
    if not opened or handle == nil or handle == 0 or handle == false then return false end
    local wrote = pcall(function()
        for name, value in pairs(fields) do
            setter(handle, root .. "#" .. name, value)
        end
    end)
    local count = 0
    local first = nil
    local savedOk = wrote and pcall(function()
        local function capture(...)
            count = select("#", ...)
            if count > 0 then first = select(1, ...) end
        end
        capture(save(handle))
    end)
    if not releaseHandle(deps, handle) then return false end
    if not savedOk or count < 1 or first ~= true then return false end
    local back, problem = readFields(deps, path, root, (function()
        local names = {}
        for name in pairs(fields) do names[#names + 1] = name end
        return names
    end)())
    if problem ~= "ok" or type(back) ~= "table" then return false end
    for name, value in pairs(fields) do
        if back[name] ~= value then return false end
    end
    return true
end

local function readAllocator(deps, path)
    local fields, problem = readFields(deps, path, "allocator", { "namespace", "highWater", "revision" })
    if problem == "absent" then return { problem = "absent" } end
    if problem == "unreadable" or problem == "unread" then return { problem = "unreadable" } end
    if problem ~= "ok" or type(fields) ~= "table" then return { problem = "damaged" } end
    local high = canonicalCount(fields.highWater)
    local revision = canonicalCount(fields.revision)
    if not namespaceOk(fields.namespace) or high == nil or revision == nil then return { problem = "damaged" } end
    return { problem = "ok", namespace = fields.namespace, highWater = high, revision = revision }
end

local function adoptedNamespace(deps, root)
    local ready, readyProblem = readFields(deps, root .. "identity-ready.xml", "identityReady", { "namespace", "revision" })
    local slotA = readAllocator(deps, root .. "allocator-a.xml")
    local slotB = readAllocator(deps, root .. "allocator-b.xml")
    local readApi = missingOf(deps, { "loadXMLFile", "getXMLString" })
    if readApi ~= nil then
        note("api-missing", "adopted-read", readApi)
        return nil, "recovery"
    end
    if readyProblem == "unread" or readyProblem == "unreadable" then
        note("state-unreadable", "identity-ready")
        return nil, "recovery"
    end
    if readyProblem == "damaged" or readyProblem == "unreleased" then
        note("adopted-state-corrupt", "identity-ready")
        return nil, "recovery"
    end
    if slotA.problem == "unreadable" or slotB.problem == "unreadable" then
        note("state-unreadable", slotA.problem == "unreadable" and "allocator-a" or "allocator-b")
        return nil, "recovery"
    end
    if slotA.problem == "damaged" or slotB.problem == "damaged" then
        note("adopted-state-corrupt", slotA.problem == "damaged" and "allocator-a" or "allocator-b")
        return nil, "recovery"
    end
    local readyNamespace = nil
    if readyProblem == "ok" and type(ready) == "table" and namespaceOk(ready.namespace) then
        readyNamespace = ready.namespace
    elseif readyProblem == "ok" then
        note("adopted-state-corrupt", "identity-ready")
        return nil, "recovery"
    end
    local allocNamespace = nil
    local high = nil
    if slotA.problem == "ok" then
        allocNamespace = slotA.namespace
        high = slotA.highWater
    end
    if slotB.problem == "ok" then
        if allocNamespace ~= nil and allocNamespace ~= slotB.namespace then
            note("adopted-state-corrupt", "allocator-namespace")
            return nil, "recovery"
        end
        allocNamespace = slotB.namespace
        if high == nil or slotB.highWater > high then high = slotB.highWater end
    end
    if readyNamespace ~= nil and allocNamespace ~= nil and readyNamespace ~= allocNamespace then
        note("adopted-state-corrupt", "ready-namespace")
        return nil, "recovery"
    end
    if readyNamespace ~= nil and slotA.problem == "absent" and slotB.problem == "absent" then
        note("adopted-state-corrupt", "ready-without-allocator")
        return nil, "recovery"
    end
    if readyProblem == "ok" and type(ready) == "table" then
        local readyRevision = canonicalCount(ready.revision)
        if readyRevision == nil then
            note("adopted-state-corrupt", "ready-revision")
            return nil, "recovery"
        end
        local allocRevision = 0
        if slotA.problem == "ok" then allocRevision = slotA.revision end
        if slotB.problem == "ok" and slotB.revision > allocRevision then allocRevision = slotB.revision end
        if allocNamespace ~= nil and readyRevision > allocRevision then
            note("adopted-state-corrupt", "ready-revision-ahead")
            return nil, "recovery"
        end
    end
    if allocNamespace ~= nil then return allocNamespace, "adopted", high or 0 end
    if readyNamespace ~= nil then
        note("adopted-state-corrupt", "ready-without-allocator")
        return nil, "recovery"
    end
    local proposal, proposalProblem = readFields(deps, root .. "identity-provision.xml", "identityProvision", { "version", "namespace" })
    if proposalProblem == "absent" then
        note("waiting-proposal", "identity-provision")
        return nil, "waiting"
    end
    if proposalProblem == "unread" or proposalProblem == "unreadable" then
        note("state-unreadable", "identity-provision")
        return nil, "recovery"
    end
    if proposalProblem ~= "ok" or type(proposal) ~= "table" or proposal.version ~= "1" or not namespaceOk(proposal.namespace) then
        note("proposal-invalid", "identity-provision")
        return nil, "recovery"
    end
    return proposal.namespace, "proposal", 0
end

local function reserveFromProvision(deps, prefix)
    if state.identityGate == "waiting" then
        state.waitingForIdentity = true
        return "waiting"
    end
    if state.identityGate == "recovery" then
        state.recoveryNeeded = true
        return nil
    end
    local root = provisionRoot(deps)
    if root == nil then
        local injectedRoot = type(deps) == "table" and deps.provisionRoot ~= nil
        note("waiting-profile-path", "profile-root", (not injectedRoot and engineFn("getUserProfileAppPath") == nil) and "getUserProfileAppPath" or nil)
        state.identityGate = "waiting"
        state.waitingForIdentity = true
        return "waiting"
    end
    local namespace, mode, high = adoptedNamespace(deps, root)
    if mode == "waiting" then
        state.identityGate = "waiting"
        state.waitingForIdentity = true
        return "waiting"
    end
    if mode ~= "adopted" and mode ~= "proposal" then
        state.identityGate = "recovery"
        state.recoveryNeeded = true
        return nil
    end
    local slotA = readAllocator(deps, root .. "allocator-a.xml")
    local slotB = readAllocator(deps, root .. "allocator-b.xml")
    local currentHigh = high or 0
    if currentHigh >= 2147483647 then
        note("allocator-exhausted", "high-water")
        state.identityGate = "recovery"
        state.recoveryNeeded = true
        return nil
    end
    local nextHigh = currentHigh + 1
    local target = "allocator-a.xml"
    local revision = 1
    if slotA.problem == "ok" or slotB.problem == "ok" then
        local revA = slotA.problem == "ok" and slotA.revision or 0
        local revB = slotB.problem == "ok" and slotB.revision or 0
        local maxRev = revA
        if revB > maxRev then maxRev = revB end
        if maxRev >= 2147483647 then
            note("allocator-exhausted", "revision")
            state.identityGate = "recovery"
            state.recoveryNeeded = true
            return nil
        end
        revision = maxRev + 1
        if slotA.problem == "absent" or (slotA.problem == "ok" and revA <= revB) then
            target = "allocator-a.xml"
        else
            target = "allocator-b.xml"
        end
    end
    if canonicalCount(tostring(nextHigh)) ~= nextHigh or canonicalCount(tostring(revision)) ~= revision then
        note("allocator-exhausted", "counter")
        state.identityGate = "recovery"
        state.recoveryNeeded = true
        return nil
    end
    local writeApi = missingOf(deps, { "createXMLFile", "setXMLString", "saveXMLFile", "delete" })
    local wrote = writeFields(deps, root .. target, "allocator", {
        namespace = namespace,
        highWater = tostring(nextHigh),
        revision = tostring(revision),
    })
    if not wrote then
        if writeApi ~= nil then
            note("api-missing", "allocator-write", writeApi)
        else
            note("allocator-write-failed", target == "allocator-a.xml" and "allocator-a" or "allocator-b")
        end
        state.identityGate = "recovery"
        state.recoveryNeeded = true
        return nil
    end
    local ready = writeFields(deps, root .. "identity-ready.xml", "identityReady", {
        namespace = namespace,
        revision = tostring(revision),
    })
    if not ready then
        note("allocator-write-failed", "identity-ready")
        state.identityGate = "recovery"
        state.recoveryNeeded = true
        return nil
    end
    state.identityGate = "ready"
    local id = string.format("%s-%s-%d", prefix, namespace, nextHigh)
    if not acceptable(id) then
        note("allocation-failed", "identifier")
        return nil
    end
    return id
end

local function allocate(deps, prefix)
    if type(deps) == "table" and type(deps.reserve) == "function" then
        local ok, id = pcall(deps.reserve, prefix)
        if not ok or not acceptable(id) then
            note("allocation-failed", "reserve")
            return nil
        end
        if type(deps.seen) == "function" then
            local seenOk, seen = pcall(deps.seen, id)
            if seenOk and seen == true then
                local againOk, again = pcall(deps.reserve, prefix)
                if not againOk or not acceptable(again) or again == id then return nil end
                return again
            end
        end
        return id
    end
    local id = reserveFromProvision(deps or {}, prefix)
    if id == "waiting" or id == nil then return id end
    if type(deps) == "table" and type(deps.seen) == "function" then
        local seenOk, seen = pcall(deps.seen, id)
        if seenOk and seen == true then
            local again = reserveFromProvision(deps, prefix)
            if again == nil or again == "waiting" or again == id or not acceptable(again) then return nil end
            return again
        end
    end
    return id
end

local function readHandle(handle, xmlKey, getter)
    if type(getter) ~= "function" or handle == nil or handle == 0 or handle == false then return nil, "unread" end
    local key = (xmlKey or "careerSavegame") .. ".farmDashboard#careerId"
    local ok, value = pcall(getter, handle, key)
    if not ok then return nil, "stale" end
    if value == nil or value == "" then return nil, "missing" end
    if not acceptable(value) or value == "waiting" then return nil, "damaged" end
    return value, "ok"
end

local function careerFilePath(info)
    if type(info) ~= "table" then return nil end
    if type(info.careerXmlPath) == "string" and info.careerXmlPath ~= "" then return info.careerXmlPath end
    if type(info.savegameDirectory) ~= "string" or info.savegameDirectory == "" then return nil end
    local dir = info.savegameDirectory
    local last = string.sub(dir, -1)
    if last == "/" or last == "\\" then dir = string.sub(dir, 1, -2) end
    if dir == "" or string.find(dir, "..", 1, true) then return nil end
    return dir .. "/careerSavegame.xml"
end

local function loadSavedId(info, deps, getter)
    local path = careerFilePath(info)
    local load = xmlFn(deps, "loadXMLFile")
    if path == nil or type(load) ~= "function" then return nil, "unread" end
    if presenceOf(deps, path) == "absent" then return nil, "unread" end
    local opened, handle = pcall(load, "FarmDashCareerId", path)
    if not opened or handle == nil or handle == 0 or handle == false then return nil, "unread" end
    local found, problem = readHandle(handle, info.xmlKey, getter)
    if not releaseHandle(deps, handle) then return nil, "unreleased" end
    return found, problem
end

-- Lua 5.1 has no bit operations; h stays below 2^32, so h * mul + byte is exact in a double.
local function mix32(h, text, mul)
    for i = 1, #text do
        h = (h * mul + string.byte(text, i)) % 4294967296
    end
    return h
end

local function hex32(value)
    return string.format("%04x%04x", math.floor(value / 65536), value % 65536)
end

-- Entropy: wall clock (getDate), engine time (getTime), g_time, a caller hint (savegame directory),
-- a fresh table address and four draws from math.random, which main.lua seeds from getTime().
-- math.randomseed is never called, so the game's RNG sequence is not reset.
local function generateNamespace(hint)
    local parts = {}
    local function add(fn)
        local ok, value = pcall(fn)
        if ok and value ~= nil then parts[#parts + 1] = tostring(value) end
    end
    add(function()
        local f = engineFn("getDate")
        if f then return f("%Y%m%d%H%M%S") end
        return nil
    end)
    add(function()
        local f = engineFn("getTime")
        if f then return f() end
        return nil
    end)
    add(function() return _G.g_time end)
    add(function() return hint end)
    add(function() return tostring({}) end)
    for _ = 1, 4 do
        add(function() return math.random(0, 2147483646) end)
    end
    local text = table.concat(parts, "|")
    return hex32(mix32(2166136261, text, 31)) .. hex32(mix32(5381, text, 131))
end

-- Dedicated server identity source (passed to capture as deps.reserve). The career ID lives in
-- careerSavegame.xml through the save hook; nothing reads or writes the desktop proposal or
-- allocator files. Sessions and tokens use one namespace per server process plus a counter.
function FarmDashboardCareerIdentity.serverReserve(hint)
    local sessionNamespace = generateNamespace(hint)
    local counters = {}
    return function(prefix)
        if prefix == "fd" then
            local careerNamespace = generateNamespace(hint)
            if not namespaceOk(careerNamespace) then return nil end
            return "fd-" .. careerNamespace .. "-1"
        end
        if not namespaceOk(sessionNamespace) or not acceptable(prefix) then return nil end
        counters[prefix] = (counters[prefix] or 0) + 1
        return string.format("%s-%s-%d", prefix, sessionNamespace, counters[prefix])
    end
end

function FarmDashboardCareerIdentity.status()
    return {
        careerId = state.careerId,
        persisted = state.persisted == true,
        loadedFromSave = state.loadedFromSave == true,
        sessionId = state.sessionId,
        sessionToken = state.sessionToken,
        allocationFailed = state.allocationFailed == true,
        captured = state.captured == true,
        provisional = state.captured == true and state.persisted ~= true,
        waitingForIdentity = state.waitingForIdentity == true,
        recoveryNeeded = state.recoveryNeeded == true,
        savePending = state.savePending == true,
        reason = state.reason,
        stage = state.stage,
        capability = state.capability,
    }
end

function FarmDashboardCareerIdentity.capture(info, deps)
    deps = deps or {}
    state.deps = deps
    state.captureEpoch = (state.captureEpoch or 0) + 1
    state.identityGate = nil
    state.waitingForIdentity = false
    state.recoveryNeeded = false
    state.savePending = false
    state.reason = nil
    state.stage = nil
    state.capability = nil
    local loaded = false
    if type(info) == "table" and type(info.getIsLoadedFromSavegame) == "function" then
        local ok, value = pcall(function() return info:getIsLoadedFromSavegame() end)
        loaded = ok and value == true
    end
    state.loadedFromSave = loaded
    state.persisted = false
    state.allocationFailed = false
    state.captured = true
    state.mission = info
    local getter = xmlFn(deps, "getXMLString")
    local found = nil
    local problem = nil
    if loaded and type(info) == "table" then
        local handleProblem
        found, handleProblem = readHandle(info.xmlFile, info.xmlKey, getter)
        problem = handleProblem
        if handleProblem == "damaged" then
            note("saved-career-damaged", "career-handle")
        elseif found == nil then
            local loadedId, loadedProblem = loadSavedId(info, deps, getter)
            if loadedProblem == "damaged" then
                problem = "damaged"
                note("saved-career-damaged", "career-file")
            elseif loadedProblem == "unreleased" or loadedProblem == "stale" then
                problem = "damaged"
                note("saved-career-unreadable", loadedProblem == "stale" and "career-file" or "career-release")
            elseif loadedId ~= nil then
                found = loadedId
                problem = "ok"
            elseif loadedProblem == "missing" then
                problem = "missing"
            elseif loadedProblem == "unread" and careerFilePath(info) ~= nil then
                problem = "damaged"
                local api = missingOf(deps, { "loadXMLFile", "getXMLString" })
                if api ~= nil then
                    note("api-missing", "career-read", api)
                else
                    note("saved-career-unreadable", "career-file")
                end
            elseif handleProblem == "stale" then
                problem = "damaged"
                note("saved-career-unreadable", "career-handle")
            end
        end
    end
    if problem == "damaged" then
        state.careerId = nil
        state.sessionId = nil
        state.sessionToken = nil
        state.persisted = false
        state.allocationFailed = true
        return FarmDashboardCareerIdentity.status()
    end
    local discarded = nil
    if not loaded and type(info) == "table" then
        local leftover = readHandle(info.xmlFile, info.xmlKey, getter)
        if acceptable(leftover) then discarded = leftover end
    end
    local careerDeps = deps
    if discarded ~= nil then
        careerDeps = {}
        for key, value in pairs(deps) do careerDeps[key] = value end
        careerDeps.seen = function(id)
            if id == discarded then return true end
            if type(deps.seen) == "function" then
                local seenOk, seen = pcall(deps.seen, id)
                return seenOk and seen == true
            end
            return false
        end
    end
    state.sessionId = allocate(deps, "ses")
    state.sessionToken = allocate(deps, "tok")
    if loaded and found ~= nil then
        state.careerId = found
        state.persisted = true
    else
        state.careerId = allocate(careerDeps, "fd")
        state.persisted = false
    end
    if state.waitingForIdentity then
        if not (loaded and acceptable(found)) then
            state.careerId = "waiting"
            state.persisted = false
        end
        state.sessionId = "waiting"
        state.sessionToken = "waiting"
        state.allocationFailed = false
        note("waiting-proposal", "identity-provision")
        return FarmDashboardCareerIdentity.status()
    end
    if state.recoveryNeeded or not acceptable(state.careerId) or state.careerId == "waiting" or not acceptable(state.sessionId) or not acceptable(state.sessionToken) then
        state.allocationFailed = true
        state.careerId = nil
        state.sessionId = nil
        state.sessionToken = nil
        note("allocation-failed", "identifier")
        return FarmDashboardCareerIdentity.status()
    end
    state.reason = "ready"
    state.stage = state.persisted and "saved" or "new"
    state.capability = nil
    return FarmDashboardCareerIdentity.status()
end

function FarmDashboardCareerIdentity.rotateSession(deps)
    deps = deps or state.deps or {}
    state.deps = deps
    state.identityGate = nil
    state.reason = nil
    state.stage = nil
    state.capability = nil
    if state.waitingForIdentity then
        local sessionId = allocate(deps, "ses")
        local sessionToken = allocate(deps, "tok")
        if sessionId == "waiting" or sessionToken == "waiting" or state.waitingForIdentity then
            state.sessionId = "waiting"
            state.sessionToken = "waiting"
            state.allocationFailed = false
            return FarmDashboardCareerIdentity.status()
        end
        state.sessionId = sessionId
        state.sessionToken = sessionToken
    else
        state.sessionId = allocate(deps, "ses")
        state.sessionToken = allocate(deps, "tok")
    end
    if not acceptable(state.sessionId) or not acceptable(state.sessionToken) or state.sessionId == "waiting" then
        if state.waitingForIdentity then
            state.sessionId = "waiting"
            state.sessionToken = "waiting"
            state.allocationFailed = false
        else
            state.allocationFailed = true
        end
    end
    if state.allocationFailed then
        note("allocation-failed", "rotate")
    elseif state.waitingForIdentity then
        note("waiting-proposal", "identity-provision")
    else
        state.reason = "ready"
        state.stage = state.persisted and "saved" or "new"
        state.capability = nil
    end
    return FarmDashboardCareerIdentity.status()
end

function FarmDashboardCareerIdentity.onCareerSaved(info)
    if info ~= state.mission then return false end
    if state.allocationFailed or state.waitingForIdentity or state.careerId == "waiting" or not acceptable(state.careerId) then return false end
    if type(info) ~= "table" or info.xmlFile == nil or info.xmlFile == 0 or info.xmlFile == false then
        return false
    end
    local setter = xmlFn(state.deps, "setXMLString")
    if type(setter) ~= "function" then return false end
    local key = (info.xmlKey or "careerSavegame") .. ".farmDashboard#careerId"
    local ok = pcall(setter, info.xmlFile, key, state.careerId)
    if not ok then return false end
    state.savePending = true
    state.pendingMission = info
    state.pendingEpoch = state.captureEpoch
    state.pendingCareerId = state.careerId
    return true
end

function FarmDashboardCareerIdentity.noteSaveComplete(errorCode, finalDirectory)
    local savegame = _G.Savegame
    if type(savegame) ~= "table" or errorCode ~= savegame.ERROR_OK then return false end
    if state.savePending ~= true or not acceptable(state.careerId) or state.careerId == "waiting" then return false end
    if type(finalDirectory) ~= "string" or finalDirectory == "" or string.find(finalDirectory, "..", 1, true) then return false end
    local dir = finalDirectory
    local last = string.sub(dir, -1)
    if last == "/" or last == "\\" then dir = string.sub(dir, 1, -2) end
    local found, problem = loadSavedId({ savegameDirectory = dir, xmlKey = "careerSavegame" }, state.deps or {}, xmlFn(state.deps, "getXMLString"))
    if problem == "ok" and found == state.careerId then
        state.persisted = true
        state.savePending = false
        return true
    end
    return false
end

local function pack(...)
    return { n = select("#", ...), ... }
end

local function unpackResults(results)
    local n = results.n or 0
    if n <= 0 then return end
    if type(table.unpack) == "function" then return table.unpack(results, 1, n) end
    return unpack(results, 1, n)
end

function FarmDashboardCareerIdentity.install(classObj)
    if type(classObj) ~= "table" or classObj._farmDashCareerHooked == true then return false end
    local old = classObj.saveToXMLFile
    classObj.saveToXMLFile = function(self, ...)
        local results = { n = 0 }
        if type(old) == "function" then
            results = pack(old(self, ...))
        end
        if self == state.mission then
            FarmDashboardCareerIdentity.onCareerSaved(self)
        end
        return unpackResults(results)
    end
    classObj._farmDashCareerHooked = true
    return true
end

function FarmDashboardCareerIdentity.installSaveComplete(classObj)
    if type(classObj) ~= "table" or classObj._farmDashSaveCompleteHooked == true then return false end
    local old = classObj.onSaveComplete
    classObj.onSaveComplete = function(self, errorCode, finalSavegameDirectory)
        local seen = type(self) == "table" and self.currentSavegame or nil
        local epoch = state.pendingEpoch
        local mission = state.mission
        local careerId = state.pendingCareerId
        local results = { n = 0 }
        if type(old) == "function" then
            results = pack(old(self, errorCode, finalSavegameDirectory))
        end
        local still = type(self) == "table" and self.currentSavegame or nil
        if state.savePending == true and seen == mission and still == mission and state.captureEpoch == epoch and state.careerId == careerId then
            FarmDashboardCareerIdentity.noteSaveComplete(errorCode, finalSavegameDirectory)
        end
        return unpackResults(results)
    end
    classObj._farmDashSaveCompleteHooked = true
    return true
end

-- Unload drops the in-memory session. The epoch keeps advancing so a late save callback
-- from the unloaded mission cannot acknowledge anything. Files on disk are untouched.
function FarmDashboardCareerIdentity.release()
    local epoch = (state.captureEpoch or 0) + 1
    FarmDashboardCareerIdentity.resetForTest()
    state.captureEpoch = epoch
    return FarmDashboardCareerIdentity.status()
end

function FarmDashboardCareerIdentity.resetForTest()
    state = {
        careerId = nil,
        persisted = false,
        loadedFromSave = false,
        sessionId = nil,
        sessionToken = nil,
        allocationFailed = false,
        captured = false,
        mission = nil,
        waitingForIdentity = false,
        recoveryNeeded = false,
        savePending = false,
        captureEpoch = 0,
        identityGate = nil,
        deps = nil,
    }
end
