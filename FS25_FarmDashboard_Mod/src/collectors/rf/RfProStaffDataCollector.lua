-- FS25 FarmDashboard | RfProStaffDataCollector.lua | v0.2.0
-- Pro Staff Co-Op aggregates (soft-detect; authority-only; never write RF state).
-- Owner: Agent Life
-- Handle: g_currentMission.proStaffManager (getfenv g_proStaffCoOp fallback)

RfProStaffDataCollector = {}

local MOD_NAME = "FS25_ProStaffCoOp"
local MAX_DISCOUNTS = 12
local MAX_FLAGS = 8
local MAX_FARMS = 32
local MAX_SCAN = 256
local MAX_INVESTMENT = 1000000000000

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
    local scanned = 0

    local function add(fid, record)
        if type(fid) == "number" and fid == math.floor(fid)
            and fid >= 1 and fid <= 255 and type(record) == "table" and not seen[fid] then
            seen[fid] = true
            farmIds[#farmIds + 1] = fid
        end
    end

    if mgr and type(mgr.farms) == "table" then
        for farmId, record in pairs(mgr.farms) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then return {}, true end
            add(farmId, record)
        end
    end
    table.sort(farmIds)
    return farmIds, false
end

local function callNum(mgr, method, farmId)
    if type(mgr[method]) ~= "function" then
        return nil
    end
    local ok, v = pcall(function() return mgr[method](mgr, farmId) end)
    if ok and type(v) == "number" and v == v and v ~= math.huge and v ~= -math.huge then
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
    local rec = mgr.farms and mgr.farms[farmId]
    if type(rec) ~= "table" then return nil end
    local level = rec.level
    local investmentTotal = rec.investmentTotal
    if type(level) ~= "number" or level ~= math.floor(level) or level < 0 or level > 20
        or type(investmentTotal) ~= "number" or investmentTotal ~= math.floor(investmentTotal)
        or investmentTotal < 0 or investmentTotal > MAX_INVESTMENT
        or (rec.membershipActive ~= nil and type(rec.membershipActive) ~= "boolean") then
        return nil
    end

    return {
        level = level,
        membershipActive = rec.membershipActive ~= false,
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

    local mission = _G.g_currentMission
    if mission == nil or type(mission.getIsServer) ~= "function" then
        return true, { enabled = true, byFarm = {} }
    end
    local serverOk, isServer = pcall(mission.getIsServer, mission)
    if not serverOk or isServer ~= true then
        return true, { enabled = true, byFarm = {} }
    end

    local mgr = resolveManager()
    if type(mgr) ~= "table" or type(mgr.farms) ~= "table" then
        return true, { enabled = true, byFarm = {} }
    end

    local ok, payload = pcall(function()
        local byFarm = {}
        local farmIds, truncated = collectFarmIds(mgr)
        if truncated or #farmIds > MAX_FARMS then
            return { enabled = true, byFarm = {}, coverage = "truncated" }
        end
        for _, farmId in ipairs(farmIds) do
            local row = farmRow(mgr, farmId)
            if row == nil then
                return { enabled = true, byFarm = {}, coverage = "partial" }
            end
            byFarm[tostring(farmId)] = row
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
