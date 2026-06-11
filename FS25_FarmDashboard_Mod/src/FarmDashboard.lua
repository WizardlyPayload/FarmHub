-- FS25 FarmDashboard | FarmDashboard.lua | v3.0.0 (Plan v5)
-- Authors: JoshWalki, WizardlyPayload

FarmDashboard = {}
FarmDashboard.MOD_NAME = "FS25_FarmDashboard"
FarmDashboard.MOD_DIR = _G.g_currentModDirectory
FarmDashboard.VERSION = "3.0.0.0"
FarmDashboard.UPDATE_INTERVAL = 10000
FarmDashboard.PORT = 8766
FarmDashboard.readyAt = nil

local hasLoaded = false

--- Collectors and data.json: SP + MP host / dedicated — not MP clients.
--- Multiplayer must follow g_server:getIsServer() whenever it exists (dedicated / host). Earlier refactor gated that on
--- missionDynamicInfo.isMultiplayer, which can be nil on servers and skipped the real server check — breaking exports.
--- Single-player workaround: if getIsServer() is false but the save is not multiplayer, still allow local writes.
function FarmDashboard:isAuthority()
    if not _G.g_currentMission then return false end

    local md = _G.g_currentMission.missionDynamicInfo

    if md and md.isMultiplayer == true and md.isClient == true then
        return false
    end

    if _G.g_server ~= nil and type(_G.g_server.getIsServer) == "function" then
        local ok, isSrv = pcall(function() return _G.g_server:getIsServer() end)
        if ok then
            if not isSrv and (not md or md.isMultiplayer ~= true) then
                return true
            end
            return isSrv
        end
    end

    if _G.g_connectionManager ~= nil and type(_G.g_connectionManager.getIsClient) == "function" then
        local ok, isCl = pcall(function() return _G.g_connectionManager:getIsClient() end)
        if ok and isCl then return false end
    end

    return true
end

--- One-shot write so data.json appears even if the mission update tick is delayed.
function FarmDashboard:bootstrapDataJson()
    if not self:isAuthority() then return end
    if not FarmDashboardDataCollector or not FarmDashboardDataCollector.assembleDataFromModuleCache then return end
    local ok, err = pcall(function()
        local assembled = FarmDashboardDataCollector:assembleDataFromModuleCache()
        if assembled then
            FarmDashboardDataCollector:writeDataToFile(assembled)
        end
    end)
    if not ok then
        if FarmDashLog and FarmDashLog.devWarn then
            FarmDashLog.devWarn("bootstrapDataJson failed: %s", tostring(err))
        end
    end
end

function FarmDashboard:loadMap()
    if hasLoaded then return end
    hasLoaded = true

    -- Scripts are loaded via modDesc extraSourceFiles; init once when the map loads.
    FarmDashboardDataCollector:init()

    if self:isAuthority() then
        _G.g_currentMission:addUpdateable(FarmDashboard)
        FarmDashboard.isRegistered = true
        local currentTime = _G.g_time or 0
        FarmDashboard.readyAt = (type(currentTime) == "number") and currentTime or 0
        self:bootstrapDataJson()
    end

    FarmDashboard:startDashboard()
end

function FarmDashboard:onStartMission()
    if self:isAuthority() and not self.isRegistered then
        if _G.g_currentMission then
            _G.g_currentMission:addUpdateable(FarmDashboard)
            self.isRegistered = true
            local currentTime = _G.g_time or 0
            FarmDashboard.readyAt = (type(currentTime) == "number") and currentTime or 0
        end
    end
    if FarmDashboardDataCollector and FarmDashboardDataCollector.resetStaggerState then
        FarmDashboardDataCollector:resetStaggerState()
    end
    -- Plan v5 B6+B8+B11: notify the data collector that a save just loaded so it can reset
    -- animalMode samples, clear stale ledger / dirty set, and arm the post-load silence window.
    if FarmDashboardDataCollector and FarmDashboardDataCollector.onMissionLoaded then
        FarmDashboardDataCollector:onMissionLoaded()
    end
    self:bootstrapDataJson()
end

function FarmDashboard:deleteMap()
    if _G.g_currentMission and self.isRegistered then
        _G.g_currentMission:removeUpdateable(FarmDashboard)
        self.isRegistered = false
    end
    if FarmDashboardDataCollector then
        FarmDashboardDataCollector:shutdown()
    end
end

function FarmDashboard:update(dt)
    if not _G.g_currentMission then return end
    if not self:isAuthority() then
        return
    end
    if not FarmDashboard.readyAt or not _G.g_time then return end
    if type(_G.g_time) ~= "number" or type(FarmDashboard.readyAt) ~= "number" then return end
    if _G.g_time < FarmDashboard.readyAt then return end

    local success, err = pcall(function()
        if FarmDashboardDataCollector and type(dt) == "number" then
            FarmDashboardDataCollector:update(dt)
        end
    end)

    if not success and err then
        if FarmDashLog and FarmDashLog.devWarn then
            FarmDashLog.devWarn("Update error: %s", tostring(err))
        end
    end
end

function FarmDashboard:startDashboard()
end

addModEventListener(FarmDashboard)
