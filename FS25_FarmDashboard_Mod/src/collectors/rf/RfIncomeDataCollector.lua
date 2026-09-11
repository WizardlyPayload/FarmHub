-- FS25 FarmDashboard | RfIncomeDataCollector.lua | v0.2.0
-- Income Mod aggregates (soft-detect; SCHEMAS.md realisticFarming.income)
-- Owner: Agent Economy — never write RF mod state.

RfIncomeDataCollector = {}

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

local function resolveIncomeManager()
    local mission = _G.g_currentMission
    if mission and mission.incomeManager ~= nil then
        return mission.incomeManager
    end
    local ok, mgr = pcall(function()
        return getfenv(0)["g_IncomeManager"]
    end)
    if ok and mgr ~= nil then
        return mgr
    end
    return nil
end

function RfIncomeDataCollector.isModLoaded()
    if rfModLoaded("FS25_IncomeMod") then
        return true
    end
    return resolveIncomeManager() ~= nil
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
    local mode = nil
    local amount = nil
    local settingsEnabled = nil
    local nextPayoutLabel = nil

    if settings then
        settingsEnabled = settings.enabled == true
        if type(settings.getPayModeName) == "function" then
            local ok, name = pcall(function()
                return settings:getPayModeName()
            end)
            if ok then
                mode = name
            end
        end
        if type(settings.getPaymentAmount) == "function" then
            local ok, amt = pcall(function()
                return settings:getPaymentAmount()
            end)
            if ok then
                amount = tonumber(amt)
            end
        end
    end

    local sys = mgr.incomeSystem or mgr.system or mgr
    if type(sys.getNextPaymentInfo) == "function" then
        local ok, info = pcall(function()
            return sys:getNextPaymentInfo()
        end)
        if ok and info ~= nil then
            nextPayoutLabel = tostring(info)
        end
    elseif type(mgr.getNextPaymentInfo) == "function" then
        local ok, info = pcall(function()
            return mgr:getNextPaymentInfo()
        end)
        if ok and info ~= nil then
            nextPayoutLabel = tostring(info)
        end
    end

    return {
        mode = mode,
        amount = amount,
        nextPayoutLabel = nextPayoutLabel,
        settingsEnabled = settingsEnabled,
    }
end

function RfIncomeDataCollector:init()
    RfIncomeDataCollector._inc = nil
end

function RfIncomeDataCollector:collectBegin()
    RfIncomeDataCollector._inc = { done = false }
end

function RfIncomeDataCollector:collectStep(_opts)
    RfIncomeDataCollector._inc = nil

    local okAll, payload = pcall(function()
        local mgr = resolveIncomeManager()
        if mgr == nil then
            return { enabled = false }
        end

        local row = buildSharedRow(mgr)
        local byFarm = {}
        for _, fid in ipairs(collectFarmIds()) do
            byFarm[tostring(fid)] = {
                mode = row.mode,
                amount = row.amount,
                nextPayoutLabel = row.nextPayoutLabel,
                settingsEnabled = row.settingsEnabled,
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

function RfIncomeDataCollector:collect()
    self:collectBegin()
    local done, payload = self:collectStep({})
    return payload or { enabled = false }
end
