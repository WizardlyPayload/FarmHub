-- FS25 FarmDashboard | RfTaxDataCollector.lua | v0.2.0
-- Tax Mod aggregates (soft-detect; SCHEMAS.md realisticFarming.tax)
-- Owner: Agent Economy — never write RF mod state.

RfTaxDataCollector = {}

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
    local farmManagerClass = _G.FarmManager
    local spectator = farmManagerClass and farmManagerClass.SPECTATOR_FARM_ID or 0
    local tour = farmManagerClass and farmManagerClass.GUIDED_TOUR_FARM_ID or 14
    local invalid = farmManagerClass and farmManagerClass.INVALID_FARM_ID or 15
    local function add(fid)
        fid = tonumber(fid)
        if fid and fid > 0 and fid ~= spectator and fid ~= tour and fid ~= invalid
            and not seen[fid] then
            seen[fid] = true
            ids[#ids + 1] = fid
        end
    end
    local manager = _G.g_farmManager
    if manager ~= nil then
        local farms = manager.farms
        if type(manager.getFarms) == "function" then
            local ok, reported = pcall(manager.getFarms, manager)
            if ok and type(reported) == "table" then farms = reported end
        end
        for _, farm in pairs(type(farms) == "table" and farms or {}) do
            if farm then
                add(farm.farmId or farm.id)
            end
        end
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

local function effectiveAnnualRate(mgr)
    local settings = mgr.settings or {}
    local base = tonumber(settings.annualTaxRate) or 0.05
    local resolver = _G.OptionScalingResolver
    if resolver == nil then
        return base
    end
    if type(resolver.readProfile) ~= "function" or type(resolver.resolve) ~= "function"
        or type(mgr.SPINE_ANNUAL_TAX) ~= "table" then
        return nil
    end
    local mission = _G.g_currentMission
    local hub = (mission and mission.settingsHub) or _G.g_settingsHub
    local ok, scale = pcall(function()
        local profile = resolver.readProfile(hub)
        if profile == nil then return 1 end
        return resolver.resolve(mgr.SPINE_ANNUAL_TAX, profile)
    end)
    if not ok or type(scale) ~= "number" or scale < 0 or scale == math.huge then
        return nil
    end
    return base * scale
end

local function currentTaxMonth(mgr)
    local env = _G.g_currentMission and _G.g_currentMission.environment
    if env == nil then return nil end
    -- FS25 publishes currentPeriod. Tax Mod maps that period to a named month.
    if type(mgr._periodMonth) ~= "function" then return nil end
    local ok, month = pcall(mgr._periodMonth, tonumber(env.currentPeriod))
    month = ok and tonumber(month) or nil
    if month == nil or month < 1 or month > 12 then return nil end
    return month
end

local function buildFarmRow(mgr, farmId)
    local stats = mgr.stats or {}
    -- The global annual total is a local HUD mirror in Tax Mod, not a
    -- per-farm amount. Withhold the row unless this farm has its own bucket.
    local farmTax = type(stats.farmTax) == "table"
        and (stats.farmTax[farmId] or stats.farmTax[tostring(farmId)]) or nil
    if type(farmTax) ~= "table" then
        return nil
    end
    local annualRate = effectiveAnnualRate(mgr)
    local accumulated = tonumber(farmTax.taxesAccumulatedAnnual)
    if accumulated == nil or accumulated < 0 then
        return nil
    end
    local env = _G.g_currentMission and _G.g_currentMission.environment
    local currentMonth = currentTaxMonth(mgr)
    local currentYear = env and tonumber(env.currentYear)
    local advisoryMonth = tonumber(stats.taxAdvisoryMonth) or 12
    local returnMonth = tonumber(stats.taxReturnMonth) or 3
    local nextEventLabel
    local nextEventDay
    local projected
    if currentMonth ~= nil and (mgr.settings or {}).enabled ~= false then
        local mToAdvisory = monthsUntil(advisoryMonth, currentMonth)
        local mToPayment = monthsUntil(returnMonth, currentMonth)
        if mToPayment <= mToAdvisory then
            nextEventLabel = "Tax payment"
            nextEventDay = mToPayment
        else
            nextEventLabel = "Tax advisory"
            nextEventDay = mToAdvisory
        end
        if currentYear ~= nil and annualRate ~= nil then
            local dueYear = currentYear + (currentMonth >= returnMonth and 1 or 0)
            projected = 0
            if (tonumber(farmTax.lastTaxYear) or 0) < dueYear then
                projected = projected + math.floor(accumulated * annualRate)
            end
            for _, bucket in ipairs(farmTax.imported or {}) do
                local amount = tonumber(bucket.acc)
                if amount ~= nil and amount > 0
                    and (tonumber(bucket.paidYear) or 0) < dueYear then
                    projected = projected + math.floor(amount * annualRate)
                end
            end
        end
    end

    return {
        accumulatedAnnual = accumulated,
        projectedBill = projected,
        taxRate = annualRate and annualRate * 100 or nil,
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

        local byFarm = {}
        for _, fid in ipairs(collectFarmIds()) do
            local row = buildFarmRow(mgr, fid)
            if row ~= nil then
                byFarm[tostring(fid)] = row
            end
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
