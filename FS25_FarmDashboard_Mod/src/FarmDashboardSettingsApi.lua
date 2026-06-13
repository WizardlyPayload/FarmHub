-- FS25 FarmDashboard | FarmDashboardSettingsApi.lua | v1.1.0
-- Bridges in-game settings UI to FarmDashboardDataCollector.config (+ MP sync).

FarmDashboardSettingsApi = {}

FarmDashboardSettingsApi.BOOL_KEYS = {
    "enableAnimals",
    "enableVehicles",
    "enableFields",
    "enableFinance",
    "enableWeather",
    "enableEconomy",
    "enableProduction",
    "enableStock",
    "enableBaleInventory",
    "enableRedTape",
    "diagnostics",
    "debugBaleScan",
}

FarmDashboardSettingsApi.INT_KEYS = {
    "collectionCycleMs",
    "sliceBudgetMs",
    "postLoadCollectionGraceSec",
    "fieldsPerFrame",
    "vehiclesPerFrame",
    "baleEntitiesBudget",
    "stockPlaceablesPerFrame",
    "baleWorldEntitiesPerFrame",
    "financeVehiclesPerFrame",
    "jsonTopLevelKeysPerFrame",
    "animalRowsPerSlice",
    "economyYieldStride",
}

local BOOL_DEFAULTS = {
    enableAnimals = true,
    enableVehicles = true,
    enableFields = true,
    enableFinance = true,
    enableWeather = true,
    enableEconomy = true,
    enableProduction = true,
    enableStock = true,
    enableBaleInventory = true,
    enableRedTape = true,
    diagnostics = false,
    debugBaleScan = false,
}

local INT_DEFAULTS = {
    collectionCycleMs = 60000,
    sliceBudgetMs = 4,
    postLoadCollectionGraceSec = 45,
    fieldsPerFrame = 1,
    vehiclesPerFrame = 2,
    baleEntitiesBudget = 8,
    stockPlaceablesPerFrame = 3,
    baleWorldEntitiesPerFrame = 8,
    financeVehiclesPerFrame = 4,
    jsonTopLevelKeysPerFrame = 1,
    animalRowsPerSlice = 256,
    economyYieldStride = 20,
}

local INT_CLAMP = {
    collectionCycleMs = { 60000, 1800000 },
    sliceBudgetMs = { 1, 64 },
    postLoadCollectionGraceSec = { 0, 120 },
    fieldsPerFrame = { 1, 12 },
    vehiclesPerFrame = { 1, 16 },
    baleEntitiesBudget = { 4, 128 },
    stockPlaceablesPerFrame = { 1, 16 },
    baleWorldEntitiesPerFrame = { 4, 64 },
    financeVehiclesPerFrame = { 1, 16 },
    jsonTopLevelKeysPerFrame = { 1, 20 },
    animalRowsPerSlice = { 32, 8192 },
    economyYieldStride = { 8, 120 },
}

function FarmDashboardSettingsApi:getCollector()
    local dc = rawget(_G, "FarmDashboardDataCollector")
    if dc and type(dc.config) == "table" then
        return dc
    end
    return nil
end

--- Dedicated servers may expose g_server without getIsServer(); use FarmDashboard:isAuthority().
function FarmDashboardSettingsApi:isAuthorityMachine()
    local fd = rawget(_G, "FarmDashboard")
    if fd and type(fd.isAuthority) == "function" then
        local ok, isAuth = pcall(function() return fd:isAuthority() end)
        if ok and isAuth then
            return true
        end
    end
    return false
end

function FarmDashboardSettingsApi:connectionIsServer(connection)
    if connection == nil or type(connection.getIsServer) ~= "function" then
        return false
    end
    local ok, isSrv = pcall(function() return connection:getIsServer() end)
    return ok and isSrv
end

function FarmDashboardSettingsApi:canBroadcastSettings()
    local srv = rawget(_G, "g_server")
    return srv ~= nil and type(srv.broadcastEvent) == "function" and self:isAuthorityMachine()
end

function FarmDashboardSettingsApi:canChangeSettings()
    if self:isAuthorityMachine() then
        return true
    end
    if not g_currentMission then
        return true
    end
    return Utils.getNoNil(g_currentMission.isMasterUser, false)
end

function FarmDashboardSettingsApi:clampInt(key, value)
    local spec = INT_CLAMP[key]
    if not spec or type(value) ~= "number" then
        return value
    end
    return math.max(spec[1], math.min(spec[2], value))
end

function FarmDashboardSettingsApi:packConfigForNetwork()
    local boolValues = {}
    for _, key in ipairs(self.BOOL_KEYS) do
        boolValues[key] = self:getBool(key)
    end
    local intValues = {}
    for _, key in ipairs(self.INT_KEYS) do
        intValues[key] = self:getInt(key)
    end
    return boolValues, intValues
end

function FarmDashboardSettingsApi:applySyncedSettings(boolValues, intValues, persist)
    local dc = self:getCollector()
    if not dc then
        return
    end

    for _, key in ipairs(self.BOOL_KEYS) do
        if boolValues[key] ~= nil then
            dc.config[key] = boolValues[key]
        end
    end
    for _, key in ipairs(self.INT_KEYS) do
        if intValues[key] ~= nil then
            dc.config[key] = self:clampInt(key, intValues[key])
        end
    end

    if persist and FarmDashboard and FarmDashboard.isAuthority and FarmDashboard:isAuthority() then
        pcall(function() dc:saveConfig() end)
    else
        pcall(function() dc:applyDiagnosticsFromConfig() end)
        if dc.config.collectionCycleMs then
            FarmDashboard.UPDATE_INTERVAL = dc.config.collectionCycleMs
        end
    end
end

function FarmDashboardSettingsApi:publishSettings()
    if self:canBroadcastSettings() then
        local dc = self:getCollector()
        if dc then
            pcall(function() dc:saveConfig() end)
        end
        if FarmDashboardSettingsEvent then
            g_server:broadcastEvent(FarmDashboardSettingsEvent.newFromConfig())
        end
        return
    end

    if g_client ~= nil and type(g_client.getServerConnection) == "function" then
        local conn = g_client:getServerConnection()
        if conn ~= nil and FarmDashboardSettingsEvent then
            conn:sendEvent(FarmDashboardSettingsEvent.newFromConfig())
        end
        return
    end

    local dc = self:getCollector()
    if dc then
        pcall(function() dc:saveConfig() end)
    end
end

function FarmDashboardSettingsApi:getBool(key, default)
    local dc = self:getCollector()
    if dc then
        return Utils.getNoNil(dc.config[key], default or BOOL_DEFAULTS[key])
    end
    return default or BOOL_DEFAULTS[key]
end

function FarmDashboardSettingsApi:setBool(key, value)
    local dc = self:getCollector()
    if not dc then
        return
    end
    dc.config[key] = Utils.getNoNil(value, false)
    self:publishSettings()
end

function FarmDashboardSettingsApi:getInt(key, default)
    local dc = self:getCollector()
    if dc then
        return Utils.getNoNil(dc.config[key], default or INT_DEFAULTS[key])
    end
    return default or INT_DEFAULTS[key]
end

function FarmDashboardSettingsApi:setInt(key, value)
    local dc = self:getCollector()
    if not dc or type(value) ~= "number" then
        return
    end
    dc.config[key] = self:clampInt(key, value)
    self:publishSettings()
end

function FarmDashboardSettingsApi.registerClientStateHook()
    if FarmDashboardSettingsApi._clientStateHooked then
        return
    end
    FarmDashboardSettingsApi._clientStateHooked = true

    FSBaseMission.sendInitialClientState = Utils.appendedFunction(FSBaseMission.sendInitialClientState,
        function(self, connection, user, farm)
            if connection == nil or not FarmDashboardSettingsApi:isAuthorityMachine() then
                return
            end
            if FarmDashboardSettingsEvent then
                connection:sendEvent(FarmDashboardSettingsEvent.newFromConfig())
            end
        end)
end

FarmDashboardSettingsApi.registerClientStateHook()
