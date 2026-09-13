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
        if _G.DairyConstants and DairyConstants.CONTRACTS and DairyConstants.CONTRACTS.TYPES then
            local ct = DairyConstants.CONTRACTS.TYPES[typeKey]
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
        herdHealthScore = health and math.floor(health) or nil,
        milkQualityTier = displayQuality(tier),
        spoilageStatus = displaySpoilage(barn.spoilageStatus ~= nil and tostring(barn.spoilageStatus) or nil),
        lastCollectionDay = lastDay,
        feedDiseaseFlag = barn.feedDiseaseFlag == true,
        contractSummary = contractSummary(mgr, barn),
    }
end

--- DairyCore 1.0.5+ read contract (getBarnRows). Maps keys onto the frozen FarmHub schema.
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
        herdHealthScore = health and math.floor(health) or nil,
        milkQualityTier = tier,
        spoilageStatus = spoilage,
        lastCollectionDay = lastDay,
        feedDiseaseFlag = feedFlag,
        contractSummary = summary,
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
        local fid = tostring(farmId or 1)
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
                    addRow(crow.farmId or 1, row)
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
                        addRow(barn.farmId or 1, row)
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
