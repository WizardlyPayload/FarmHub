-- FS25 FarmDashboard | RfTaxDataCollector.lua | v0.2.0
-- Tax Mod aggregates (soft-detect; SCHEMAS.md realisticFarming.tax)
-- Owner: Agent Economy — never write RF mod state.

RfTaxDataCollector = {}

local TAX_RATE_VALUES = { low = 0.01, medium = 0.02, high = 0.03 }

local function rfModLoaded(name)
    if _G.g_modIsLoaded and _G.g_modIsLoaded[name] then
        return true
    end
    if _G.g_modManager and _G.g_modManager.getActiveModByName then
        local ok, mod = pcall(function()
            return _G.g_modManager:getActiveModByName(name)
        end)
        if ok and mod ~= nil then
            return true
        end
    end
    return false
end

local function resolveTaxManager()
    local mission = _G.g_currentMission
    if mission and mission.taxManager ~= nil then
        return mission.taxManager
    end
    local ok, mgr = pcall(function()
        return getfenv(0)["g_TaxManager"]
    end)
    if ok and mgr ~= nil then
        return mgr
    end
    if rawget(_G, "FS25TaxMod") ~= nil then
        return _G.FS25TaxMod
    end
    return nil
end

function RfTaxDataCollector.isModLoaded()
    if rfModLoaded("FS25_TaxMod") then
        return true
    end
    return resolveTaxManager() ~= nil
end

local function collectFarmIds()
    local ids = {}
    local seen = {}
    local function add(fid)
        fid = tonumber(fid)
        if fid and fid > 0 and not seen[fid] then
            seen[fid] = true
            ids[#ids + 1] = fid
        end
    end
    if _G.g_farmManager and _G.g_farmManager.farms then
        for _, farm in pairs(_G.g_farmManager.farms) do
            if farm then
                add(farm.farmId or farm.id)
            end
        end
    end
    if #ids < 1 then
        add(1)
    end
    return ids
end

local function monthsUntil(target, current)
    local d = (tonumber(target) or 1) - (tonumber(current) or 1)
    if d <= 0 then
        d = d + 12
    end
    return d
end

local function buildFarmRow(mgr)
    local settings = mgr.settings or {}
    local stats = mgr.stats or {}
    local annualRate = tonumber(settings.annualTaxRate) or 0.05
    local accumulated = tonumber(stats.taxesAccumulatedAnnual) or 0
    local projected = math.floor(accumulated * annualRate)

    local dailyKey = settings.taxRate
    local dailyFrac = TAX_RATE_VALUES[dailyKey]
    local taxRatePct = annualRate * 100
    if dailyFrac == nil and type(dailyKey) == "number" then
        taxRatePct = tonumber(dailyKey) or taxRatePct
    end

    local env = _G.g_currentMission and _G.g_currentMission.environment
    local currentMonth = env and tonumber(env.currentMonth) or 1
    local advisoryMonth = tonumber(stats.taxAdvisoryMonth) or 12
    local returnMonth = tonumber(stats.taxReturnMonth) or 3
    local mToAdvisory = monthsUntil(advisoryMonth, currentMonth)
    local mToPayment = monthsUntil(returnMonth, currentMonth)

    local nextEventLabel
    local nextEventDay
    if mToPayment <= mToAdvisory then
        nextEventLabel = "Tax payment"
        nextEventDay = mToPayment
    else
        nextEventLabel = "Tax advisory"
        nextEventDay = mToAdvisory
    end

    return {
        accumulatedAnnual = accumulated,
        projectedBill = projected,
        taxRate = taxRatePct,
        nextEventLabel = nextEventLabel,
        nextEventDay = nextEventDay,
    }
end

function RfTaxDataCollector:init()
    RfTaxDataCollector._inc = nil
end

function RfTaxDataCollector:collectBegin()
    RfTaxDataCollector._inc = { done = false }
end

function RfTaxDataCollector:collectStep(_opts)
    RfTaxDataCollector._inc = nil

    local okAll, payload = pcall(function()
        local mgr = resolveTaxManager()
        if mgr == nil then
            return { enabled = false }
        end

        local row = buildFarmRow(mgr)
        local byFarm = {}
        for _, fid in ipairs(collectFarmIds()) do
            byFarm[tostring(fid)] = {
                accumulatedAnnual = row.accumulatedAnnual,
                projectedBill = row.projectedBill,
                taxRate = row.taxRate,
                nextEventLabel = row.nextEventLabel,
                nextEventDay = row.nextEventDay,
            }
        end

        return {
            enabled = true,
            byFarm = byFarm,
        }
    end)

    if not okAll or type(payload) ~= "table" then
        return true, { enabled = false }
    end
    return true, payload
end

function RfTaxDataCollector:collect()
    self:collectBegin()
    local done, payload = self:collectStep({})
    return payload or { enabled = false }
end
