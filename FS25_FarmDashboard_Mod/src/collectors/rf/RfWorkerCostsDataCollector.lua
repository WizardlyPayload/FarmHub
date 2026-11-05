-- FS25 FarmDashboard | RfWorkerCostsDataCollector.lua | v0.2.0
-- Worker Costs aggregates (soft-detect; SCHEMAS.md realisticFarming.workerCosts)
-- Owner: Agent Economy — never write RF mod state.

RfWorkerCostsDataCollector = {}

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

local function resolveWorkerManager()
    local mission = _G.g_currentMission
    if mission and mission.workerCostsManager ~= nil then
        return mission.workerCostsManager
    end
    local ok, mgr = pcall(function()
        return getfenv(0)["g_WorkerManager"]
    end)
    if ok and mgr ~= nil then
        return mgr
    end
    return nil
end

function RfWorkerCostsDataCollector.isModLoaded()
    if rfModLoaded("FS25_WorkerCosts") then
        return true
    end
    return resolveWorkerManager() ~= nil
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

local function buildSharedRow(mgr)
    local settings = mgr.settings
    local snap = nil
    if type(mgr.getRosterSnapshot) == "function" then
        local ok, s = pcall(function()
            return mgr:getRosterSnapshot()
        end)
        if ok and type(s) == "table" then
            snap = s
        end
    end

    local wageMode = nil
    local wageRate = nil
    local nextPaymentLabel = nil

    local fin = snap and snap.finance
    if type(fin) == "table" then
        wageMode = fin.costModeName or fin.wageLevelName
        if fin.isHourly == true then
            wageMode = fin.costModeName or "Hourly"
            nextPaymentLabel = "Hourly accrual"
        elseif fin.isHourly == false then
            wageMode = fin.costModeName or "Monthly"
            nextPaymentLabel = "Month-end salary"
        end
        if fin.wageLevelName and wageMode and fin.costModeName then
            wageMode = tostring(fin.costModeName) .. " / " .. tostring(fin.wageLevelName)
        end
        wageRate = tonumber(fin.baseRate)
    end

    if settings then
        if wageMode == nil and type(settings.getCostModeName) == "function" then
            local ok, name = pcall(function()
                return settings:getCostModeName()
            end)
            if ok then
                wageMode = name
            end
        end
        if wageRate == nil and type(settings.getWageRate) == "function" then
            local ok, rate = pcall(function()
                return settings:getWageRate()
            end)
            if ok then
                wageRate = tonumber(rate)
            end
        end
        if nextPaymentLabel == nil then
            local modeName = nil
            if type(settings.getCostModeName) == "function" then
                local ok, n = pcall(function()
                    return settings:getCostModeName()
                end)
                if ok then
                    modeName = n
                end
            end
            if modeName and string.find(string.lower(tostring(modeName)), "hour") then
                nextPaymentLabel = "Hourly accrual"
            else
                nextPaymentLabel = "Month-end salary"
            end
        end
    end

    return {
        wageMode = wageMode,
        wageRate = wageRate,
        nextPaymentLabel = nextPaymentLabel,
    }
end

local function farmPeriodSpend(workerSys, farmId)
    -- Worker Costs v2.3.0.1 uses one shared roster, but accruals and frozen
    -- unpaid salary parts carry an explicit farm ID. Its roster snapshot's
    -- monthAccrued is a sum across farms and cannot be copied to byFarm.
    if type(workerSys) ~= "table"
        or type(workerSys.monthlyCosts) ~= "table"
        or type(workerSys.salaryBills) ~= "table" then
        return nil
    end
    local total = 0
    local farmBook = workerSys.monthlyCosts[farmId] or workerSys.monthlyCosts[tostring(farmId)]
    if type(farmBook) == "table" then
        for _, entry in pairs(farmBook) do
            if type(entry) == "table" then
                total = total + (tonumber(entry.amount) or 0)
            end
        end
    end
    for _, bill in pairs(workerSys.salaryBills) do
        if type(bill) == "table" and type(bill.parts) == "table" then
            for _, part in ipairs(bill.parts) do
                if type(part) == "table"
                    and tonumber(part.farmId) == farmId
                    and part.status == "UNPAID"
                    and (tonumber(part.remaining) or 0) > 0 then
                    total = total + (tonumber(part.base) or 0)
                end
            end
        end
    end
    return total
end

function RfWorkerCostsDataCollector:init()
    RfWorkerCostsDataCollector._inc = nil
end

function RfWorkerCostsDataCollector:collectBegin()
    RfWorkerCostsDataCollector._inc = { done = false }
end

function RfWorkerCostsDataCollector:collectStep(_opts)
    RfWorkerCostsDataCollector._inc = nil

    local okAll, payload = pcall(function()
        local mgr = resolveWorkerManager()
        if mgr == nil then
            return { enabled = false }
        end

        local row = buildSharedRow(mgr)
        local byFarm = {}
        for _, fid in ipairs(collectFarmIds()) do
            -- Global wage settings apply to every farm; spend does not.
            byFarm[tostring(fid)] = {
                wageMode = row.wageMode,
                wageRate = row.wageRate,
                nextPaymentLabel = row.nextPaymentLabel,
                periodSpend = farmPeriodSpend(mgr.workerSystem, fid),
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

function RfWorkerCostsDataCollector:collect()
    self:collectBegin()
    local done, payload = self:collectStep({})
    return payload or { enabled = false }
end
