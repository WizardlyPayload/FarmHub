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
    local workerSys = mgr.workerSystem
    local snap = nil
    if type(mgr.getRosterSnapshot) == "function" then
        local ok, s = pcall(function()
            return mgr:getRosterSnapshot()
        end)
        if ok and type(s) == "table" then
            snap = s
        end
    end

    local activeWorkers = 0
    if workerSys and type(workerSys.getActiveWorkers) == "function" then
        local ok, workers = pcall(function()
            return workerSys:getActiveWorkers()
        end)
        if ok and type(workers) == "table" then
            activeWorkers = #workers
        end
    elseif snap and tonumber(snap.count) then
        activeWorkers = tonumber(snap.count) or 0
    end

    local wageMode = nil
    local wageRate = nil
    local periodSpend = nil
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
        periodSpend = tonumber(fin.monthAccrued)
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

    if periodSpend == nil and workerSys and workerSys.monthlyCosts then
        local total = 0
        for _, amt in pairs(workerSys.monthlyCosts) do
            total = total + (tonumber(amt) or 0)
        end
        periodSpend = total
    end

    return {
        activeWorkers = activeWorkers,
        wageMode = wageMode,
        wageRate = wageRate,
        nextPaymentLabel = nextPaymentLabel,
        periodSpend = periodSpend,
    }
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
            -- WorkerCosts keeps a single shared roster (getWorkersForFarm returns all).
            byFarm[tostring(fid)] = {
                activeWorkers = row.activeWorkers,
                wageMode = row.wageMode,
                wageRate = row.wageRate,
                nextPaymentLabel = row.nextPaymentLabel,
                periodSpend = row.periodSpend,
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
