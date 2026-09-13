-- FS25 FarmDashboard | RfPresenceDataCollector.lua | v0.2.0
-- RF suite presence chip list (soft-detect; authority-only; never write).
-- Owner: Agent Cores
-- NetworkSync local pin is 2.0.0.0 (not 1.0.0.0) — version from modDesc when available.

RfPresenceDataCollector = {}

-- Catalog of RF companions + cores + Farm Tablet (presence-only rows).
local PRESENCE_CATALOG = {
    { id = "FS25_SoilFertilizer", title = "Soil Fertilizer", handle = "soilFertilityManager", env = "g_SoilFertilityManager" },
    { id = "FS25_SeasonalCropStress", title = "Seasonal Crop Stress", handle = "cropStressManager", env = "g_cropStressManager" },
    { id = "FS25_FertilizerDepot", title = "Fertilizer Depot", handle = "depotManager", env = "g_DepotManager" },
    { id = "FS25_TaxMod", title = "Tax Mod", handle = "taxManager" },
    { id = "FS25_MarketDynamics", title = "Market Dynamics", handle = "MarketDynamics", env = "g_MarketDynamics" },
    { id = "FS25_FuelCosts", title = "Fuel Costs", handle = "fuelCostsManager", env = "g_FuelCostsManager" },
    { id = "FS25_WorkerCosts", title = "Worker Costs", handle = "workerCostsManager" },
    { id = "FS25_IncomeMod", title = "Income Mod", handle = "incomeManager" },
    { id = "FS25_WorkplaceTriggers", title = "Workplace Triggers", handle = "workplaceTriggers", env = "g_WorkplaceSystem" },
    { id = "FS25_DairyCore", title = "Dairy Core", handle = "dairyCoreManager", env = "g_dairyCoreManager" },
    { id = "FS25_NPCFavor", title = "NPC Favor", handle = "npcFavorSystem", env = "g_NPCSystem" },
    { id = "FS25_RandomWorldEvents", title = "Random World Events", handle = "randomWorldEvents", env = "g_RandomWorldEvents" },
    { id = "FS25_ProStaffCoOp", title = "Pro Staff Co-Op", handle = "proStaffManager", env = "g_proStaffCoOp" },
    { id = "FS25_WeatherGuard", title = "Weather Guard", handle = "weatherGuard", env = "g_weatherGuard" },
    { id = "FS25_TimeGuard", title = "Time Guard", handle = "timeGuard", env = "g_timeGuard" },
    { id = "FS25_StateLedger", title = "State Ledger", handle = "stateLedger", env = "g_stateLedger" },
    { id = "FS25_NetworkSync", title = "Network Sync", handle = "networkSync", env = "g_networkSync" },
    { id = "FS25_SettingsHub", title = "Settings Hub", handle = "settingsHub" },
    { id = "FS25_MasterHUD", title = "Master HUD", handle = "masterHUD" },
    { id = "FS25_FarmTablet", title = "Farm Tablet", handle = nil },
    { id = "FS25_RFSoilScanner", title = "Soil Scanner", handle = nil },
}

local function envGet(name)
    local ok, env = pcall(getfenv, 0)
    if ok and type(env) == "table" then
        return env[name]
    end
    return rawget(_G, name)
end

local function modEntry(modName)
    if _G.g_modManager and _G.g_modManager.getActiveModByName then
        local ok, mod = pcall(function()
            return _G.g_modManager:getActiveModByName(modName)
        end)
        if ok and mod ~= nil then
            return mod
        end
    end
    return nil
end

local function modVersion(modName)
    local mod = modEntry(modName)
    if not mod then
        return nil
    end
    local v = mod.version or (mod.modDesc and mod.modDesc.version)
    if v ~= nil then
        return tostring(v)
    end
    return nil
end

local function modListed(modName)
    if _G.g_modIsLoaded and _G.g_modIsLoaded[modName] then
        return true
    end
    return modEntry(modName) ~= nil
end

local function handlePresent(entry)
    local mission = _G.g_currentMission
    if entry.handle and mission and mission[entry.handle] ~= nil then
        return true
    end
    if entry.env and envGet(entry.env) ~= nil then
        return true
    end
    -- Fertilizer Depot: local clone may only publish g_DepotManager (no mission bridge).
    if entry.id == "FS25_FertilizerDepot" and envGet("g_DepotManager") ~= nil then
        return true
    end
    return false
end

function RfPresenceDataCollector.isModLoaded()
    -- Presence collector itself is always "available"; enabled reflects any RF detect.
    for _, entry in ipairs(PRESENCE_CATALOG) do
        if modListed(entry.id) or handlePresent(entry) then
            return true
        end
    end
    return false
end

function RfPresenceDataCollector:init()
    RfPresenceDataCollector._inc = nil
end

function RfPresenceDataCollector:collectBegin()
    RfPresenceDataCollector._inc = { done = false }
end

function RfPresenceDataCollector:collectStep(_opts)
    RfPresenceDataCollector._inc = nil

    local ok, payload = pcall(function()
        local mods = {}
        local any = false
        for _, entry in ipairs(PRESENCE_CATALOG) do
            local listed = modListed(entry.id)
            local live = handlePresent(entry)
            local detected = listed or live
            if detected then
                any = true
            end
            mods[#mods + 1] = {
                id = entry.id,
                title = entry.title,
                version = modVersion(entry.id),
                handle = entry.handle,
                detected = detected,
            }
        end
        return {
            enabled = any,
            mods = mods,
        }
    end)

    if ok and type(payload) == "table" then
        return true, payload
    end
    return true, { enabled = false, mods = {} }
end

function RfPresenceDataCollector:collect()
    self:collectBegin()
    local done, payload = self:collectStep({})
    return payload or { enabled = false }
end
