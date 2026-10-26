-- FS25 FarmDashboard | CompanionPages.lua | v1.0.0
-- Registry for dedicated companion-mod pages. Each src/companionPages/<ModKey>Collector.lua calls
-- CompanionPages.register{ key, modNames, substrings?, collect(ctx) }. CompanionPagesDataCollector runs
-- one detected page per frame (incremental collectStep) and exports `companionPages.pages[key]`.
-- Output is sanitized to plain data: no functions, userdata, metatabled engine objects or huge lists.

CompanionPages = CompanionPages or { entries = {}, order = {} }
CompanionPagesDataCollector = {}

local SCHEMA = 1
-- Page table = depth 0; tables at depth >= MAX_DEPTH are dropped. Matches companionPagesMerge.cjs MAX_DEPTH.
local MAX_DEPTH = 8
local MAX_ARRAY = 200
local MAX_STRING = 240
-- Every copied entry (array item or key) costs one node. Worst capped collector page is ~5.2k.
local MAX_NODES = 8000
local MAX_COUNT = 10000
local FAIL_LIMIT = 3
local BACKOFF_CYCLES = 10

local unpackArgs = table.unpack or unpack

local function logWarn(fmt, ...)
    local log = rawget(_G, "FarmDashLog")
    if type(log) == "table" and type(log.devWarn) == "function" then
        pcall(log.devWarn, fmt, ...)
    end
end

local function sharedHelpers()
    local cm = rawget(_G, "CompanionModsDataCollector")
    if type(cm) == "table" and type(cm.helpers) == "table" then
        return cm.helpers
    end
    return nil
end

local function clip(value, maxLen)
    if value == nil then
        return nil
    end
    local text = tostring(value)
    if #text > maxLen then
        return string.sub(text, 1, maxLen)
    end
    return text
end

local function finite(value)
    local n = tonumber(value)
    if n == nil or n ~= n or n == math.huge or n == -math.huge then
        return nil
    end
    return n
end

function CompanionPages.register(def)
    if type(def) ~= "table" or type(def.key) ~= "string" or def.key == "" or type(def.collect) ~= "function" then
        logWarn("CompanionPages.register ignored an invalid page definition")
        return false
    end
    local modNames, substrings = {}, {}
    for _, name in ipairs(type(def.modNames) == "table" and def.modNames or {}) do
        if type(name) == "string" and name ~= "" then
            modNames[#modNames + 1] = name
        end
    end
    for _, sub in ipairs(type(def.substrings) == "table" and def.substrings or {}) do
        if type(sub) == "string" and sub ~= "" then
            substrings[#substrings + 1] = string.lower(sub)
        end
    end
    if CompanionPages.entries[def.key] == nil then
        CompanionPages.order[#CompanionPages.order + 1] = def.key
    end
    CompanionPages.entries[def.key] = {
        key = def.key,
        modNames = modNames,
        substrings = substrings,
        collect = def.collect,
        failures = 0,
        skipUntil = 0,
    }
    return true
end

local function spend(budget)
    budget.nodes = budget.nodes + 1
    if budget.nodes > MAX_NODES then
        budget.exhausted = true
        return false
    end
    return true
end

--- Plain-data copy with hard bounds. Tables carrying a metatable are engine/class objects: dropped.
--- A table already on the current path (a cycle) is dropped; shared references are copied within the node budget.
local function sanitize(value, depth, budget)
    local kind = type(value)
    if kind == "number" then
        return finite(value)
    elseif kind == "string" then
        return clip(value, MAX_STRING)
    elseif kind == "boolean" then
        return value
    elseif kind ~= "table" then
        return nil
    end
    if depth >= MAX_DEPTH or getmetatable(value) ~= nil or budget.path[value] then
        return nil
    end
    budget.path[value] = true
    local out = {}
    local n = #value
    if n > 0 then
        for i = 1, math.min(n, MAX_ARRAY) do
            if not spend(budget) then
                break
            end
            local item = sanitize(rawget(value, i), depth + 1, budget)
            if item ~= nil then
                out[#out + 1] = item
            end
        end
    else
        for k, v in pairs(value) do
            if not spend(budget) then
                break
            end
            local keyKind = type(k)
            if keyKind == "string" or keyKind == "number" then
                local item = sanitize(v, depth + 1, budget)
                if item ~= nil then
                    out[clip(k, 80)] = item
                end
            end
        end
    end
    budget.path[value] = nil
    return out
end

local function sanitizePage(value)
    local budget = { nodes = 0, path = {}, exhausted = false }
    local page = sanitize(value, 0, budget)
    if type(page) == "table" and budget.exhausted then
        page.sanitizerTruncated = true
    end
    return page
end
CompanionPages.sanitize = sanitizePage

local function fallbackLoadedName(entry)
    local loaded = rawget(_G, "g_modIsLoaded")
    if type(loaded) ~= "table" then
        return nil
    end
    for _, name in ipairs(entry.modNames) do
        if loaded[name] then
            return name
        end
    end
    for key, on in pairs(loaded) do
        if on and type(key) == "string" then
            local lower = string.lower(key)
            for _, sub in ipairs(entry.substrings) do
                if string.find(lower, sub, 1, true) then
                    return key
                end
            end
        end
    end
    return nil
end

local function loadedName(entry)
    local h = sharedHelpers()
    if h and type(h.findLoadedName) == "function" then
        local ok, name = pcall(h.findLoadedName, { names = entry.modNames, substrings = entry.substrings })
        if ok and type(name) == "string" then
            return name
        end
    end
    return fallbackLoadedName(entry)
end
CompanionPages.loadedName = function(key)
    local entry = CompanionPages.entries[key]
    return entry and loadedName(entry) or nil
end

local function exportFarmId(mission)
    local h = sharedHelpers()
    if h and type(h.activeExportFarmId) == "function" then
        local ok, fid = pcall(h.activeExportFarmId)
        fid = ok and finite(fid) or nil
        if fid and fid > 0 then
            return fid
        end
    end
    return nil
end

-- One bounded walk of mission.vehicleSystem.vehicles per cycle, shared by every page that asks. Holds engine
-- vehicle objects: never exported, cleared at cycle start and end so nothing is kept between cycles.
local OWNED_SCAN = 400
local ownedCache = nil

local function vehicleOwner(vehicle)
    local owner = finite(vehicle.ownerFarmId)
    if owner == nil and type(vehicle.getOwnerFarmId) == "function" then
        local ok, value = pcall(vehicle.getOwnerFarmId, vehicle)
        owner = ok and finite(value) or nil
    end
    return owner
end

local function scanOwnedVehicles(mission, farmId)
    local system = type(mission) == "table" and mission.vehicleSystem or nil
    local vehicles = type(system) == "table" and system.vehicles or nil
    if type(vehicles) ~= "table" then
        return nil
    end
    local list, scanned, truncated = {}, 0, false
    local function consider(vehicle)
        scanned = scanned + 1
        if scanned > OWNED_SCAN then
            truncated = true
            return false
        end
        if type(vehicle) == "table" then
            local ok, owner = pcall(vehicleOwner, vehicle)
            if ok and owner == farmId then
                list[#list + 1] = vehicle
            end
        end
        return true
    end
    if #vehicles > 0 then
        for i = 1, #vehicles do
            if not consider(vehicles[i]) then
                break
            end
        end
    else
        for _, vehicle in pairs(vehicles) do
            if not consider(vehicle) then
                break
            end
        end
    end
    return { list = list, truncated = truncated }
end

local function ownedVehiclesFor(mission, farmId, cycle)
    if farmId == nil or farmId <= 0 then
        return nil
    end
    local scan
    if cycle ~= nil and ownedCache ~= nil and ownedCache.cycle == cycle and ownedCache.farmId == farmId then
        scan = ownedCache.scan
    else
        scan = scanOwnedVehicles(mission, farmId)
        if scan == nil then
            return nil
        end
        if cycle ~= nil then
            ownedCache = { cycle = cycle, farmId = farmId, scan = scan }
        end
    end
    -- Fresh copy per page: a vehicle sold or removed since the walk (pages run on later frames) is skipped.
    local out = {}
    for _, vehicle in ipairs(scan.list) do
        if vehicle.isDeleted ~= true and vehicle.isDeleting ~= true then
            out[#out + 1] = vehicle
        end
    end
    return out, scan.truncated
end

local function makeContext(entry, modName, cycle)
    local h = sharedHelpers()
    -- GIANTS supplies engine globals through the mod environment's __index.
    -- rawget misses an inherited mission even while the companion is active.
    local mission = _G.g_currentMission
    local names = { modName }
    for _, name in ipairs(entry.modNames) do
        if name ~= modName then
            names[#names + 1] = name
        end
    end
    local ctx = {
        key = entry.key,
        modName = modName,
        mission = mission,
    }

    local function try(fn, ...)
        if type(fn) ~= "function" then
            return nil
        end
        local result = { pcall(fn, ...) }
        if result[1] then
            return unpackArgs(result, 2)
        end
        return nil
    end
    ctx.try = try

    if h and type(h.modVersion) == "function" then
        ctx.version = try(h.modVersion, modName)
        if ctx.version ~= nil then
            ctx.version = clip(ctx.version, 40)
        end
    end
    ctx.farmId = exportFarmId(mission)
    local info = type(mission) == "table" and mission.missionDynamicInfo or nil
    ctx.isMultiplayer = type(info) == "table" and info.isMultiplayer == true

    function ctx.symbol(name)
        if h and type(h.companionSymbol) == "function" then
            local value = try(h.companionSymbol, names, name)
            if value ~= nil then
                return value
            end
        end
        for _, modFolder in ipairs(names) do
            local env = rawget(_G, modFolder)
            if type(env) == "table" and env ~= _G then
                local value = rawget(env, name)
                if value ~= nil then
                    return value
                end
            end
        end
        return nil
    end

    function ctx.global(name)
        if h and type(h.envGet) == "function" then
            local value = try(h.envGet, name)
            if value ~= nil then
                return value
            end
        end
        return rawget(_G, name)
    end

    function ctx.call(obj, method, ...)
        if type(obj) ~= "table" or type(method) ~= "string" then
            return nil
        end
        local fn = try(function() return obj[method] end)
        if type(fn) ~= "function" then
            return nil
        end
        return try(fn, obj, ...)
    end

    ctx.num = finite
    function ctx.round2(value)
        local n = finite(value)
        if n == nil then
            return nil
        end
        return math.floor(n * 100 + 0.5) / 100
    end
    ctx.clip = clip

    function ctx.list(tbl, max, mapFn)
        local out = {}
        if type(tbl) ~= "table" then
            return out
        end
        local cap = finite(max) or 50
        local function add(value, key)
            local item = value
            if type(mapFn) == "function" then
                local ok, mapped = pcall(mapFn, value, key)
                item = ok and mapped or nil
            end
            if item ~= nil then
                out[#out + 1] = item
            end
            return #out >= cap
        end
        if #tbl > 0 then
            for i = 1, #tbl do
                if add(tbl[i], i) then
                    break
                end
            end
        else
            for key, value in pairs(tbl) do
                if add(value, key) then
                    break
                end
            end
        end
        return out
    end

    function ctx.count(tbl)
        if type(tbl) ~= "table" then
            return 0
        end
        local n = 0
        for _ in pairs(tbl) do
            n = n + 1
            if n >= MAX_COUNT then
                break
            end
        end
        return n
    end

    function ctx.now()
        return finite(rawget(_G, "g_time"))
    end

    function ctx.envMonth()
        local env = type(mission) == "table" and mission.environment or nil
        local period = type(env) == "table" and finite(env.currentPeriod) or nil
        if period and period >= 1 and period <= 12 then
            return math.floor(period)
        end
        return nil
    end

    --- This farm's vehicles (engine objects, read only, never export). Nil when there is no farm or vehicle system.
    function ctx.ownedVehicles()
        local list, truncated = ownedVehiclesFor(mission, ctx.farmId, cycle)
        if list ~= nil and truncated then
            ctx.ownedScanTruncated = true
        end
        return list
    end

    return ctx
end

--- Collect one registered page. Returns nil when the mod is not loaded.
function CompanionPages.collectEntry(entry, cycle)
    local okName, modName = pcall(loadedName, entry)
    if not okName or type(modName) ~= "string" then
        return nil
    end
    local page
    if (cycle or 0) < (entry.skipUntil or 0) then
        page = { readState = "failed", backoff = true }
    else
        local ctx = makeContext(entry, modName, cycle)
        local ok, result = pcall(entry.collect, ctx)
        if not ok then
            entry.failures = (entry.failures or 0) + 1
            if entry.failures == 1 then
                logWarn("companion page %s failed: %s", tostring(entry.key), tostring(result))
            end
            if entry.failures >= FAIL_LIMIT then
                entry.failures = 0
                entry.skipUntil = (cycle or 0) + BACKOFF_CYCLES
            end
            page = { readState = "failed", error = clip(result, 160) }
        else
            entry.failures = 0
            if result == nil then
                page = { readState = "detection-only" }
            elseif type(result) ~= "table" then
                page = { readState = "failed", error = "collector returned " .. type(result) }
            else
                page = sanitizePage(result) or {}
                if type(page.readState) ~= "string" then
                    page.readState = "ok"
                end
                if ctx.ownedScanTruncated and page.coverage ~= "sampled" then
                    page.coverage = "truncated"
                end
            end
        end
        page.version = ctx.version
    end
    page.key = entry.key
    page.detected = true
    page.modName = clip(modName, 80)
    page.sampledAt = finite(rawget(_G, "g_time"))
    return page
end

function CompanionPagesDataCollector.isModLoaded()
    for _, key in ipairs(CompanionPages.order) do
        local entry = CompanionPages.entries[key]
        if entry then
            local ok, name = pcall(loadedName, entry)
            if ok and name then
                return true
            end
        end
    end
    return false
end

function CompanionPagesDataCollector:init()
    CompanionPagesDataCollector._inc = nil
    CompanionPagesDataCollector._cycle = 0
end

function CompanionPagesDataCollector:collectBegin()
    CompanionPagesDataCollector._cycle = (CompanionPagesDataCollector._cycle or 0) + 1
    CompanionPagesDataCollector._inc = { idx = 1, pages = {}, any = false }
    ownedCache = nil
end

local function finish(inc)
    ownedCache = nil
    return {
        enabled = inc.any == true,
        schema = SCHEMA,
        pages = inc.pages,
    }
end

--- One page collect per call; undetected entries are skipped cheaply in the same call.
function CompanionPagesDataCollector:collectStep(_opts)
    local inc = CompanionPagesDataCollector._inc
    if inc == nil then
        CompanionPagesDataCollector:collectBegin()
        inc = CompanionPagesDataCollector._inc
    end
    local order = CompanionPages.order
    while inc.idx <= #order do
        local key = order[inc.idx]
        inc.idx = inc.idx + 1
        local entry = CompanionPages.entries[key]
        if entry then
            local ok, page = pcall(CompanionPages.collectEntry, entry, CompanionPagesDataCollector._cycle)
            if ok and page ~= nil then
                inc.pages[key] = page
                inc.any = true
                break
            end
        end
    end
    if inc.idx > #order then
        CompanionPagesDataCollector._inc = nil
        return true, finish(inc)
    end
    return false, nil
end

function CompanionPagesDataCollector:collect()
    CompanionPagesDataCollector:collectBegin()
    for _ = 1, #CompanionPages.order + 1 do
        local done, payload = CompanionPagesDataCollector:collectStep({})
        if done then
            return payload
        end
    end
    return { enabled = false, schema = SCHEMA, pages = {} }
end
