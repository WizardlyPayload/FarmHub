-- FS25 FarmDashboard | RfCropStressDataCollector.lua | v1.1.1
-- Seasonal Crop Stress field aggregates
-- Soft-detect only; aggregates; authority-only; never write RF mod state.

RfCropStressDataCollector = {}

local MOD_NAME = "FS25_SeasonalCropStress"
local DEFAULT_FIELDS_PER_STEP = 8
local OUTLOOK_DAYS = 5

local function isAuthority()
    local dashboard = rawget(_G, "FarmDashboard")
    if dashboard == nil or type(dashboard.isAuthority) ~= "function" then return false end
    local ok, result = pcall(function() return dashboard:isAuthority() end)
    return ok and result == true
end

local function getGlobalFallback(name)
    local ok, env = pcall(function() return getfenv(0) end)
    if ok and type(env) == "table" then return env[name] end
    return rawget(_G, name)
end

-- Engine globals must be read as `_G.name`, never `rawget(_G, name)`. In the FS25
-- mod sandbox `_G` is this mod's own environment table and engine globals are
-- reached through its __index chain, so rawget silently returns nil.
local function getManager()
    local mission = _G.g_currentMission
    if mission and mission.cropStressManager ~= nil then return mission.cropStressManager end
    return getGlobalFallback("g_cropStressManager")
end

local function collectFieldIds()
    local ids, seen = {}, {}
    local manager = _G.g_fieldManager
    local fields = manager and manager.fields
    if type(fields) ~= "table" then return ids end
    for _, field in pairs(fields) do
        local id = field and field.farmland and tonumber(field.farmland.id)
        if id and id > 0 and not seen[id] then
            seen[id] = true
            ids[#ids + 1] = id
        end
    end
    table.sort(ids)
    return ids
end

local function safeCall(manager, methodName, ...)
    local method = manager and manager[methodName]
    if type(method) ~= "function" then return nil end
    local args = { ... }
    local ok, result = pcall(function() return method(manager, unpack(args)) end)
    if not ok then return nil end
    return result
end

local function criticalThresholdForField(manager, fieldId)
    local threshold = tonumber(manager and manager.settings and manager.settings.criticalThreshold) or 0.25
    local soilSystem = manager and manager.soilSystem
    if soilSystem and soilSystem.getCriticalMoisture ~= nil then
        local ok, value = pcall(function() return soilSystem:getCriticalMoisture() end)
        if ok and tonumber(value) then threshold = tonumber(value) end
    end
    local integration = manager and manager.soilFertilizerIntegration
    if integration and integration.getFieldStressMod ~= nil then
        local ok, value = pcall(function() return integration:getFieldStressMod(fieldId) end)
        if ok and tonumber(value) then threshold = threshold + tonumber(value) end
    end
    return math.max(0, math.min(1, threshold))
end

--- Approximate 5-day outlook from WeatherIntegration when present (documented as approximate).
local function readMoistureOutlook(manager, fieldId)
    local wi = manager and manager.weatherIntegration
    if wi == nil or wi.getMoistureForecast == nil then
        return {}
    end
    local ok, forecast = pcall(function() return wi:getMoistureForecast(fieldId, OUTLOOK_DAYS) end)
    if not ok or type(forecast) ~= "table" then return {} end
    local out = {}
    for day = 1, OUTLOOK_DAYS do
        local m = tonumber(forecast[day])
        if m ~= nil then
            out[#out + 1] = {
                dayOffset = day,
                moisturePercent = math.max(0, math.min(100, m * 100)),
            }
        end
    end
    return out
end

local function readField(manager, fieldId, difficulty, alertHint)
    local moisture = tonumber(safeCall(manager, "getMoisture", fieldId))
    if moisture == nil then return nil end
    local stress = tonumber(safeCall(manager, "getStress", fieldId))
    local irrigated = safeCall(manager, "isFieldIrrigated", fieldId)
    if irrigated == nil then
        local rate = tonumber(safeCall(manager, "getIrrigationRate", fieldId))
        irrigated = rate ~= nil and rate > 0 or nil
    end
    local moisturePercent = math.max(0, math.min(100, moisture * 100))
    local stressPercent = stress ~= nil and math.max(0, math.min(100, stress * 100)) or nil
    return {
        moisturePercent = moisturePercent,
        stressPercent = stressPercent,
        critical = moisture <= criticalThresholdForField(manager, fieldId),
        irrigationActive = irrigated,
        moistureOutlook = readMoistureOutlook(manager, fieldId),
        difficulty = difficulty,
        alertHint = alertHint,
    }
end

local function managerReady(manager)
    if manager == nil then return false end
    -- Prefer presence of methods over type() == "function" for Class prototypes.
    if manager.getMoisture == nil or manager.getStress == nil then return false end
    return true
end

local function snapshotPayload(st, partial)
    return {
        enabled = true,
        byField = st.byField,
        fieldCount = st.fieldCount,
        alertHint = st.alertHint,
        partial = partial == true or nil,
    }
end

function RfCropStressDataCollector.isModLoaded()
    if getManager() ~= nil then return true end
    local loaded = rawget(_G, "g_modIsLoaded")
    return type(loaded) == "table" and loaded[MOD_NAME] == true
end

function RfCropStressDataCollector:init()
    RfCropStressDataCollector._inc = nil
end

function RfCropStressDataCollector:collectBegin()
    local manager = getManager()
    local ready = self.isModLoaded() and managerReady(manager)
    local hint = ready and safeCall(manager, "getCriticalAlertHint") or nil
    if hint ~= nil then hint = tostring(hint) end
    local difficulty = manager and manager.settings and manager.settings.difficulty
    if difficulty ~= nil then difficulty = tostring(difficulty) end
    RfCropStressDataCollector._inc = {
        enabled = ready,
        manager = ready and manager or nil,
        fieldIds = ready and collectFieldIds() or {},
        index = 1,
        byField = {},
        fieldCount = 0,
        alertHint = hint,
        difficulty = difficulty,
    }
end

function RfCropStressDataCollector:collectStep(opts)
    local st = RfCropStressDataCollector._inc
    if not st or not isAuthority() then
        RfCropStressDataCollector._inc = nil
        return true, { enabled = false, byField = {}, fieldCount = 0 }
    end
    if not st.enabled then
        RfCropStressDataCollector._inc = nil
        return true, { enabled = false, byField = {}, fieldCount = 0 }
    end

    local perStep = math.max(1, tonumber(opts and opts.rfLandFieldsPerFrame) or DEFAULT_FIELDS_PER_STEP)
    local stopAt = math.min(#st.fieldIds, st.index + perStep - 1)
    while st.index <= stopAt do
        local fieldId = st.fieldIds[st.index]
        local row = readField(st.manager, fieldId, st.difficulty, st.alertHint)
        if row ~= nil then
            st.byField[tostring(fieldId)] = row
            st.fieldCount = st.fieldCount + 1
        end
        st.index = st.index + 1
    end

    if st.index <= #st.fieldIds then
        return false, snapshotPayload(st, true)
    end
    local payload = snapshotPayload(st, false)
    RfCropStressDataCollector._inc = nil
    return true, payload
end

function RfCropStressDataCollector:collect()
    self:collectBegin()
    local done, payload = false, nil
    while not done do
        done, payload = self:collectStep({ rfLandFieldsPerFrame = 9999 })
    end
    return payload or { enabled = false }
end
