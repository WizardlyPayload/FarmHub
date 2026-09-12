-- FS25 FarmDashboard | RfProStaffDataCollector.lua | v0.2.0
-- Pro Staff Co-Op aggregates (soft-detect; authority-only; never write RF state).
-- Owner: Agent Life
-- Handle: g_currentMission.proStaffManager (getfenv g_proStaffCoOp fallback)

RfProStaffDataCollector = {}

local MOD_NAME = "FS25_ProStaffCoOp"
local MAX_DISCOUNTS = 12
local MAX_FLAGS = 8

-- Discount getters that return multipliers (1.0 = neutral / no discount).
local DISCOUNT_GETTERS = {
    { id = "fertilizer", label = "Fertilizer", method = "getFertilizerDiscount" },
    { id = "fungicide", label = "Fungicide", method = "getFungicideDiscount" },
    { id = "sprayCost", label = "Spray cost", method = "getSprayCostModifier" },
    { id = "wage", label = "Wage", method = "getWageModifier" },
    { id = "vetSupply", label = "Vet supply", method = "getVetSupplyDiscount" },
    { id = "bulkTransport", label = "Bulk transport", method = "getBulkTransportDiscount" },
}

local FLAG_GETTERS = {
    { id = "hasMarketIntel", method = "hasMarketIntel" },
    { id = "hasForecastAccess", method = "hasForecastAccess" },
    { id = "hasPredictiveControl", method = "hasPredictiveControl" },
    { id = "hasEarlyWarning", method = "hasEarlyWarning" },
}

local function envGet(name)
    local ok, env = pcall(getfenv, 0)
    if ok and type(env) == "table" then
        return env[name]
    end
    return rawget(_G, name)
end

local function modLoaded()
    if _G.g_modIsLoaded and _G.g_modIsLoaded[MOD_NAME] then
        return true
    end
    if _G.g_modManager and _G.g_modManager.getActiveModByName then
        local ok, mod = pcall(function()
            return _G.g_modManager:getActiveModByName(MOD_NAME)
        end)
        if ok and mod ~= nil then
            return true
        end
    end
    local mission = _G.g_currentMission
    if mission and mission.proStaffManager ~= nil then
        return true
    end
    if envGet("g_proStaffCoOp") ~= nil then
        return true
    end
    return false
end

local function resolveManager()
    local mission = _G.g_currentMission
    if mission and mission.proStaffManager ~= nil then
        return mission.proStaffManager
    end
    return envGet("g_proStaffCoOp")
end

local function collectFarmIds(mgr)
    local seen = {}
    local farmIds = {}

    local function add(fid)
        fid = tonumber(fid)
        if fid and fid > 0 and not seen[fid] then
            seen[fid] = true
            farmIds[#farmIds + 1] = fid
        end
    end

    if mgr and type(mgr.farms) == "table" then
        for farmId, _ in pairs(mgr.farms) do
            add(farmId)
        end
    end

    if _G.g_farmManager and _G.g_farmManager.farms then
        for _, farm in pairs(_G.g_farmManager.farms) do
            local fid = farm and tonumber(farm.farmId)
            if fid and fid > 0 then
                local hasPlayers = false
                if farm.players then
                    for _ in pairs(farm.players) do
                        hasPlayers = true
                        break
                    end
                end
                local name = farm.name and tostring(farm.name):match("^%s*(.-)%s*$") or ""
                if hasPlayers or name ~= "" then
                    add(fid)
                end
            end
        end
    end

    if #farmIds < 1 then
        local mission = _G.g_currentMission
        if mission and mission.getFarmId then
            local ok, fid = pcall(function() return mission:getFarmId() end)
            if ok then
                add(fid)
            end
        end
    end
    if #farmIds < 1 then
        add(1)
    end
    return farmIds
end

local function callNum(mgr, method, farmId)
    if type(mgr[method]) ~= "function" then
        return nil
    end
    local ok, v = pcall(function() return mgr[method](mgr, farmId) end)
    if ok and type(v) == "number" then
        return v
    end
    return nil
end

local function callBool(mgr, method, farmId)
    if type(mgr[method]) ~= "function" then
        return false
    end
    local ok, v = pcall(function() return mgr[method](mgr, farmId) end)
    return ok and v == true
end

local function buildDiscounts(mgr, farmId)
    local out = {}
    for _, spec in ipairs(DISCOUNT_GETTERS) do
        if #out >= MAX_DISCOUNTS then
            break
        end
        local v = callNum(mgr, spec.method, farmId)
        if v ~= nil and math.abs(v - 1.0) > 0.0005 then
            out[#out + 1] = {
                id = spec.id,
                label = spec.label,
                value = v,
            }
        end
    end
    return out
end

local function buildFlags(mgr, farmId)
    local out = {}
    for _, spec in ipairs(FLAG_GETTERS) do
        if #out >= MAX_FLAGS then
            break
        end
        if callBool(mgr, spec.method, farmId) then
            out[#out + 1] = spec.id
        end
    end
    return out
end

local function farmRow(mgr, farmId)
    local level = 0
    if type(mgr.getLevel) == "function" then
        local ok, v = pcall(function() return mgr:getLevel(farmId) end)
        if ok and type(v) == "number" then
            level = v
        end
    end

    local rec = mgr.farms and mgr.farms[farmId]
    local membershipActive = true
    local investmentTotal = nil
    if type(rec) == "table" then
        membershipActive = rec.membershipActive ~= false
        investmentTotal = tonumber(rec.investmentTotal)
        if level == 0 and tonumber(rec.level) then
            level = tonumber(rec.level)
        end
    end

    return {
        level = level,
        membershipActive = membershipActive,
        investmentTotal = investmentTotal,
        discounts = buildDiscounts(mgr, farmId),
        flags = buildFlags(mgr, farmId),
    }
end

function RfProStaffDataCollector.isModLoaded()
    return modLoaded()
end

function RfProStaffDataCollector:init()
    RfProStaffDataCollector._inc = nil
end

function RfProStaffDataCollector:collectBegin()
    RfProStaffDataCollector._inc = { done = false }
end

function RfProStaffDataCollector:collectStep(_opts)
    RfProStaffDataCollector._inc = nil
    if not modLoaded() then
        return true, { enabled = false }
    end

    local mgr = resolveManager()
    if mgr == nil then
        return true, { enabled = true, byFarm = {} }
    end

    local ok, payload = pcall(function()
        local byFarm = {}
        for _, farmId in ipairs(collectFarmIds(mgr)) do
            byFarm[tostring(farmId)] = farmRow(mgr, farmId)
        end
        return { enabled = true, byFarm = byFarm }
    end)

    if ok and type(payload) == "table" then
        return true, payload
    end
    return true, { enabled = true, byFarm = {} }
end

function RfProStaffDataCollector:collect()
    self:collectBegin()
    local done, payload = self:collectStep({})
    return payload or { enabled = false }
end
