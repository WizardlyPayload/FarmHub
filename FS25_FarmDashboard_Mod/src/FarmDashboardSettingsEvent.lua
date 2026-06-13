-- FS25 FarmDashboard | FarmDashboardSettingsEvent.lua | v1.0.0
-- Multiplayer sync for in-game settings (Moisture System pattern).

FarmDashboardSettingsEvent = {}
FarmDashboardSettingsEvent_mt = Class(FarmDashboardSettingsEvent, Event)

InitEventClass(FarmDashboardSettingsEvent, "FarmDashboardSettingsEvent")

function FarmDashboardSettingsEvent.emptyNew()
    return Event.new(FarmDashboardSettingsEvent_mt)
end

function FarmDashboardSettingsEvent.newFromConfig()
    local self = FarmDashboardSettingsEvent.emptyNew()
    local api = rawget(_G, "FarmDashboardSettingsApi")
    if not api then
        return self
    end
    self.boolValues, self.intValues = api:packConfigForNetwork()
    return self
end

function FarmDashboardSettingsEvent:writeStream(streamId, connection)
    local api = rawget(_G, "FarmDashboardSettingsApi")
    if not api then
        return
    end
    for _, key in ipairs(api.BOOL_KEYS) do
        streamWriteBool(streamId, Utils.getNoNil(self.boolValues[key], false))
    end
    for _, key in ipairs(api.INT_KEYS) do
        streamWriteInt32(streamId, self.intValues[key] or 0)
    end
end

function FarmDashboardSettingsEvent:readStream(streamId, connection)
    local api = rawget(_G, "FarmDashboardSettingsApi")
    if not api then
        return
    end
    self.boolValues = {}
    for _, key in ipairs(api.BOOL_KEYS) do
        self.boolValues[key] = streamReadBool(streamId)
    end
    self.intValues = {}
    for _, key in ipairs(api.INT_KEYS) do
        self.intValues[key] = streamReadInt32(streamId)
    end
    self:run(connection)
end

function FarmDashboardSettingsEvent:run(connection)
    local api = rawget(_G, "FarmDashboardSettingsApi")
    if not api or not self.boolValues then
        return
    end

    api:applySyncedSettings(self.boolValues, self.intValues, false)

    if api:canBroadcastSettings() and connection ~= nil and not api:connectionIsServer(connection) then
        local dc = api:getCollector()
        if dc then
            pcall(function() dc:saveConfig() end)
        end
        g_server:broadcastEvent(FarmDashboardSettingsEvent.newFromConfig())
    end

    if api:connectionIsServer(connection) then
        if FarmDashboardSettingsMenu and FarmDashboardSettingsMenu.syncAllControls then
            FarmDashboardSettingsMenu.syncAllControls()
        end
        if FarmDashboardSettingsMenu and FarmDashboardSettingsMenu.syncControlPermissions then
            FarmDashboardSettingsMenu.syncControlPermissions()
        end
    end
end
