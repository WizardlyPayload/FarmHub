-- FS25 FarmDashboard | RfDairyDataCollector.lua | v0.2.0
-- Dairy Core aggregates → realisticFarming.dairy (SCHEMAS.md)
-- Owner: Agent Dairy
-- Soft-detect only; aggregates; authority-only; never write RF mod state.
-- Handles: g_currentMission.dairyCoreManager, fallback getfenv(0)["g_dairyCoreManager"]
-- Prefer DairyCoreManager:getBarnRows() (FarmTablet read model); enrich farmId / lastCollection / contracts from barn records.

RfDairyDataCollector = {}

local MAX_BARNS_PER_FARM = 24
local MOD_NAMES = { "FS25_DairyCore", "FS25_DairyCore_dairy" }

local function modLoaded()
    if _G.g_modIsLoaded then
        for _, name in ipairs(MOD_NAMES) do
            if _G.g_modIsLoaded[name] then
                return true
            end
        end
    end
    if _G.g_modManager and _G.g_modManager.getActiveModByName then
        for _, name in ipairs(MOD_NAMES) do
            local ok, mod = pcall(function()
                return _G.g_modManager:getActiveModByName(name)
            end)
            if ok and mod ~= nil then
                return true
            end
        end
    end
    local mgr = RfDairyDataCollector.resolveManager()
    return mgr ~= nil
end

function RfDairyDataCollector.resolveManager()
    local mission = _G.g_currentMission
    if mission ~= nil and mission.dairyCoreManager ~= nil then
        return mission.dairyCoreManager
    end
    local ok, mgr = pcall(function()
        return getfenv(0)["g_dairyCoreManager"]
    end)
    if ok and mgr ~= nil then
        return mgr
    end
    if rawget(_G, "g_dairyCoreManager") ~= nil then
        return _G.g_dairyCoreManager
    end
    return nil
end

function RfDairyDataCollector.isModLoaded()
    return modLoaded()
end

local function dairyModActive(name)
    local reg = rawget(_G, "FarmDashboardMissionRegistry")
    if type(reg) == "table" and type(reg.isActive) == "function" then
        local active = reg.isActive(name)
        return active == true
    end
    local loaded = _G.g_modIsLoaded
    return type(loaded) == "table" and loaded[name] == true
end

-- DairyConstants is sourced into the DairyCore mod environment (_G[modName]), not the engine table.
-- A same-named table on this dashboard's environment is a shadow and is ignored.
local function dairyConstants()
    local mt = getmetatable(_G)
    local parent = type(mt) == "table" and mt.__index or nil
    for _, name in ipairs(MOD_NAMES) do
        if dairyModActive(name) then
            local env = type(parent) == "table" and parent[name] or nil
            if type(env) ~= "table" then
                env = rawget(_G, name)
            end
            if type(env) == "table" and env ~= _G then
                local constants = rawget(env, "DairyConstants")
                if type(constants) == "table" then
                    return constants
                end
            end
        end
    end
    return nil
end

function RfDairyDataCollector:init()
    RfDairyDataCollector._inc = nil
end

function RfDairyDataCollector:collectBegin()
    RfDairyDataCollector._inc = { done = false }
end

local function contractSummary(mgr, barn)
    if barn == nil or barn.activeContractId == nil then
        return nil
    end
    local c = nil
    pcall(function()
        if mgr.contracts ~= nil then
            c = mgr.contracts[barn.activeContractId]
        end
    end)
    if type(c) ~= "table" then
        return "Contract #" .. tostring(barn.activeContractId)
    end
    local typeKey = tostring(c.type or "contract")
    local name = typeKey
    pcall(function()
        local constants = dairyConstants()
        if constants and constants.CONTRACTS and constants.CONTRACTS.TYPES then
            local ct = constants.CONTRACTS.TYPES[typeKey]
            if ct and ct.name then
                name = tostring(ct.name)
            end
        end
    end)
    local delivered = tonumber(c.delivered) or 0
    local target = tonumber(c.volumeTarget) or 0
    local days = tonumber(c.daysRemaining)
    local parts = { name }
    if days ~= nil then
        parts[#parts + 1] = string.format("%dd left", math.floor(days))
    end
    if target > 0 then
        parts[#parts + 1] = string.format("%.0f/%.0f L", delivered, target)
    end
    return table.concat(parts, " · ")
end

local function displayQuality(tier)
    if type(tier) ~= "string" then return nil end
    local k = string.lower(tier)
    if k == "premium" then return "Premium" end
    if k == "standard" then return "Standard" end
    if k == "reduced" then return "Reduced" end
    if k == "poor" then return "Poor" end
    return tier
end

local function displaySpoilage(status)
    if type(status) ~= "string" then return nil end
    local k = string.lower(status)
    if k == "fresh" then return "Fresh" end
    if k == "ageing" or k == "aging" then return "Ageing" end
    if k == "atrisk" or k == "at_risk" or k == "at risk" then return "At Risk" end
    if k == "condemned" then return "Condemned" end
    return status
end

--- Placeable:getName() — same path AnimalDataCollector uses. barnId is uniqueId.
local function barnPlaceableName(barn)
    if type(barn) ~= "table" then return nil end
    local placeable = barn._placeable
    if type(placeable) ~= "table" then return nil end
    local name = nil
    pcall(function()
        if type(placeable.getName) == "function" then
            name = placeable:getName()
        end
    end)
    if (name == nil or name == "") and type(placeable.name) == "string" then
        name = placeable.name
    end
    if type(name) == "string" then
        name = name:match("^%s*(.-)%s*$")
        if name ~= "" then return name end
    end
    return nil
end

local function barnRowFromRecord(mgr, barnId, barn)
    local health = tonumber(barn.herdHealthScore)
    local tier = barn.milkQualityTier
    pcall(function()
        if type(mgr.getEffectiveQualityTier) == "function" then
            local eff = mgr:getEffectiveQualityTier(barn)
            if type(eff) == "table" and eff.name then
                tier = tostring(eff.name)
            elseif type(eff) == "table" and eff.key then
                tier = tostring(eff.key)
            end
        end
    end)
    local lastDay = tonumber(barn.lastCollectionDay)
    return {
        barnId = tostring(barnId),
        name = barnPlaceableName(barn),
        herdHealthScore = health and math.floor(health) or nil,
        milkQualityTier = displayQuality(tier),
        spoilageStatus = displaySpoilage(barn.spoilageStatus ~= nil and tostring(barn.spoilageStatus) or nil),
        lastCollectionDay = lastDay,
        feedDiseaseFlag = barn.feedDiseaseFlag == true,
        contractSummary = contractSummary(mgr, barn),
    }
end

--- DairyCore 1.0.5+ read contract (getBarnRows). Maps keys onto the frozen FarmHub schema.
local function finiteNonnegative(value)
    local n = tonumber(value)
    if n == nil or n ~= n or n < 0 or n > 1000000000000 then return nil end
    return n
end

local function boundedLabel(value)
    if type(value) ~= "string" then return nil end
    local label = value:gsub("[%c]", ""):sub(1, 64)
    if label == "" then return nil end
    return label
end

local function boundedBreedRows(values, maxRows)
    local rows = {}
    if type(values) ~= "table" then return rows end
    local scanned = 0
    for name, value in pairs(values) do
        scanned = scanned + 1
        if scanned > 64 then break end
        local label, amount = boundedLabel(name), finiteNonnegative(value)
        if label ~= nil and amount ~= nil then
            rows[#rows + 1] = { name = label, value = amount }
        end
    end
    table.sort(rows, function(a, b) return a.name < b.name end)
    while #rows > maxRows do rows[#rows] = nil end
    return rows
end

local function breedSurface(crow)
    if tonumber(crow.breedSurfaceVersion) ~= 1
        or tonumber(crow.breedSurfaceFarmId) == nil
        or tonumber(crow.breedSurfaceFarmId) ~= tonumber(crow.farmId) then
        return nil
    end
    local out = {}
    local herd = crow.herdBreedComposition
    if type(herd) == "table" then
        out.herd = { available = herd.available == true }
        if herd.available == true then
            out.herd.totalMilkingHeadcount = finiteNonnegative(herd.totalMilkingHeadcount)
            out.herd.breeds = boundedBreedRows(herd.counts, 12)
        end
    end
    out.milk = {}
    if type(crow.milkBreedProvenance) == "table" then
        local names = {}
        local scanned = 0
        for name in pairs(crow.milkBreedProvenance) do
            scanned = scanned + 1
            if scanned > 32 then break end
            if boundedLabel(name) ~= nil then names[#names + 1] = name end
        end
        table.sort(names)
        for i = 1, math.min(#names, 4) do
            local record = crow.milkBreedProvenance[names[i]]
            if type(record) == "table" then
                local row = { fillType = boundedLabel(names[i]), available = record.available == true }
                if row.available then
                    row.litres = finiteNonnegative(record.litres)
                    row.unknownLitres = finiteNonnegative(record.unknownLitres)
                    row.breeds = boundedBreedRows(record.knownLitres, 12)
                end
                out.milk[#out.milk + 1] = row
            end
        end
    end
    if out.herd == nil and #out.milk == 0 then return nil end
    return out
end

local function barnRowFromContract(mgr, crow)
    if type(crow) ~= "table" or crow.barnId == nil then return nil end
    local barnId = crow.barnId
    local barn = nil
    pcall(function()
        if type(mgr.barns) == "table" then
            barn = mgr.barns[barnId]
        end
    end)
    local health = tonumber(crow.herdHealth)
    if health == nil and type(barn) == "table" then
        health = tonumber(barn.herdHealthScore)
    end
    local tier = crow.qualityTier
    if (tier == nil or tier == "") and type(barn) == "table" then
        local fromRecord = barnRowFromRecord(mgr, barnId, barn)
        tier = fromRecord.milkQualityTier
    else
        tier = displayQuality(tier)
        pcall(function()
            if type(mgr.getEffectiveQualityTier) == "function" and type(barn) == "table" then
                local eff = mgr:getEffectiveQualityTier(barn)
                if type(eff) == "table" and eff.name then
                    tier = tostring(eff.name)
                end
            end
        end)
    end
    local spoilage = displaySpoilage(crow.spoilage)
    if spoilage == nil and type(barn) == "table" then
        spoilage = displaySpoilage(barn.spoilageStatus ~= nil and tostring(barn.spoilageStatus) or nil)
    end
    local lastDay = nil
    if type(barn) == "table" then
        lastDay = tonumber(barn.lastCollectionDay)
    end
    local feedFlag = crow.feedDiseaseFlag == true
    if not feedFlag and type(barn) == "table" then
        feedFlag = barn.feedDiseaseFlag == true
    end
    local summary = nil
    if type(barn) == "table" then
        summary = contractSummary(mgr, barn)
    end
    return {
        barnId = tostring(barnId),
        name = barnPlaceableName(barn),
        herdHealthScore = health and math.floor(health) or nil,
        milkQualityTier = tier,
        spoilageStatus = spoilage,
        lastCollectionDay = lastDay,
        feedDiseaseFlag = feedFlag,
        contractSummary = summary,
        breedSurface = breedSurface(crow),
    }
end

local function collectPayload()
    local mgr = RfDairyDataCollector.resolveManager()
    if mgr == nil then
        return { enabled = false }
    end

    -- PF mutual exclusion: DairyCore stands down when Precision Farming is present.
    local disabled = false
    pcall(function()
        disabled = mgr.disabled == true
    end)
    if disabled then
        return { enabled = false }
    end

    local settingsOff = false
    pcall(function()
        if type(mgr.settings) == "table" and mgr.settings.enabled == false then
            settingsOff = true
        end
    end)
    if settingsOff then
        return { enabled = false }
    end

    -- Ensure barns exist (discover is cheap / idempotent when already tracked).
    pcall(function()
        if type(mgr.discoverBarns) == "function" then
            mgr:discoverBarns()
        end
    end)

    local byFarm = {}

    local function addRow(farmId, row)
        if type(row) ~= "table" or row.barnId == nil then return end
        local owner = tonumber(farmId)
        if owner == nil or owner <= 0 or owner ~= math.floor(owner) then return end
        local fid = tostring(owner)
        local bucket = byFarm[fid]
        if bucket == nil then
            bucket = { barns = {} }
            byFarm[fid] = bucket
        end
        if #bucket.barns >= MAX_BARNS_PER_FARM then return end
        bucket.barns[#bucket.barns + 1] = row
    end

    -- Prefer getBarnRows (skips probe-dead ghosts; carries farmId). Fallback walks barns.
    local contractRows = nil
    pcall(function()
        if type(mgr.getBarnRows) == "function" then
            contractRows = mgr:getBarnRows()
        end
    end)
    if type(contractRows) == "table" and #contractRows > 0 then
        for _, crow in ipairs(contractRows) do
            if type(crow) == "table" then
                local ok, row = pcall(function()
                    return barnRowFromContract(mgr, crow)
                end)
                if ok and type(row) == "table" then
                    local owner = crow.farmId
                    if owner == nil and type(mgr.barns) == "table" then
                        local barn = mgr.barns[crow.barnId]
                        if type(barn) == "table" then owner = barn.farmId end
                    end
                    addRow(owner, row)
                end
            end
        end
    else
        local barns = nil
        pcall(function()
            barns = mgr.barns
        end)
        if type(barns) == "table" then
            for barnId, barn in pairs(barns) do
                if type(barn) == "table" and barn._probeDead ~= true then
                    local ok, row = pcall(function()
                        return barnRowFromRecord(mgr, barnId, barn)
                    end)
                    if ok and type(row) == "table" then
                        addRow(barn.farmId, row)
                    end
                end
            end
        end
    end

    for _, farm in pairs(byFarm) do
        table.sort(farm.barns, function(a, b)
            return tostring(a.barnId) < tostring(b.barnId)
        end)
    end

    return { enabled = true, byFarm = byFarm }
end

function RfDairyDataCollector:collectStep(_opts)
    RfDairyDataCollector._inc = nil
    local ok, payload = pcall(collectPayload)
    if not ok or type(payload) ~= "table" then
        return true, { enabled = false }
    end
    return true, payload
end

function RfDairyDataCollector:collect()
    self:collectBegin()
    local done, payload = self:collectStep({})
    return payload or { enabled = false }
end
