-- FS25 FarmDashboard | FarmDashboard.lua | v3.0.0 (Plan v5)
-- Authors: JoshWalki, WizardlyPayload

FarmDashboard = {}
FarmDashboard.MOD_NAME = "FS25_FarmDashboard"
FarmDashboard.MOD_DIR = _G.g_currentModDirectory
FarmDashboard.VERSION = "3.3.21.0"
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

    -- Dedicated server / MP host: getIsServer() must win over missionDynamicInfo.isClient (both can be true on DS).
    if _G.g_server ~= nil and type(_G.g_server.getIsServer) == "function" then
        local ok, isSrv = pcall(function() return _G.g_server:getIsServer() end)
        if ok and isSrv then
            return true
        end
    end

    if rawget(_G, "g_dedicatedServer") ~= nil then
        return true
    end

    local md = _G.g_currentMission.missionDynamicInfo

    if md and md.isMultiplayer == true and md.isClient == true then
        return false
    end

    if _G.g_connectionManager ~= nil and type(_G.g_connectionManager.getIsClient) == "function" then
        local ok, isCl = pcall(function() return _G.g_connectionManager:getIsClient() end)
        if ok and isCl then return false end
    end

    return true
end

--- Headless dedicated server (not MP host playing on the same machine).
function FarmDashboard:isDedicatedServer()
    return rawget(_G, "g_dedicatedServer") ~= nil
end

--- MP host or dedicated server process (export authority without a local shop GUI).
function FarmDashboard:isServerExportHost()
    if not self:isAuthority() then return false end
    local md = _G.g_currentMission and _G.g_currentMission.missionDynamicInfo
    if md and md.isMultiplayer == true then return true end
    if rawget(_G, "g_dedicatedServer") ~= nil then return true end
    if _G.g_server ~= nil and type(_G.g_server.getIsServer) == "function" then
        local ok, isSrv = pcall(function() return _G.g_server:getIsServer() end)
        if ok and isSrv then return true end
    end
    return false
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

    if FarmDashboardSettingsGui and FarmDashboardSettingsGui.init then
        FarmDashboardSettingsGui.init()
    end

    if FarmDashboardSettingsMenu and FarmDashboardSettingsMenu.tryRegister then
        FarmDashboardSettingsMenu.tryRegister()
    end

    if self:isAuthority() then
        _G.g_currentMission:addUpdateable(FarmDashboard)
        FarmDashboard.isRegistered = true
        local currentTime = _G.g_time or 0
        FarmDashboard.readyAt = (type(currentTime) == "number") and currentTime or 0
        if FarmDashboardVehicleShopGuard and FarmDashboardVehicleShopGuard.install then
            FarmDashboardVehicleShopGuard.install()
        end
        if FarmDashboardCourseplayCompat and FarmDashboardCourseplayCompat.install then
            FarmDashboardCourseplayCompat.install()
        end
        self:bootstrapDataJson()
        local cfg = FarmDashboardDataCollector and FarmDashboardDataCollector.config
        local diagOn = cfg and cfg.diagnostics
        Logging.info("[FarmDash] Export authority on this machine (host/server). diagnostics=%s", tostring(diagOn))
        local md = _G.g_currentMission and _G.g_currentMission.missionDynamicInfo
        local isSrv = nil
        if _G.g_server ~= nil and type(_G.g_server.getIsServer) == "function" then
            local ok, v = pcall(function() return _G.g_server:getIsServer() end)
            if ok then isSrv = v end
        end
        Logging.info(
            "[FarmDash] spawn guard: mp=%s dedicated=%s isServer=%s serverExportHost=%s courseplay=%s",
            tostring(md and md.isMultiplayer),
            tostring(rawget(_G, "g_dedicatedServer") ~= nil),
            tostring(isSrv),
            tostring(self:isServerExportHost()),
            tostring(FarmDashboardDataCollector and FarmDashboardDataCollector.isCourseplayLoaded
                and FarmDashboardDataCollector:isCourseplayLoaded())
        )
        if not diagOn then
            Logging.info(
                "[FarmDash] For [trace] hitch logs, set diagnostics=true in modSettings/FS25_FarmDashboard/config.xml on THIS machine's profile (not the joining client's PC)."
            )
        end
    else
        Logging.info("[FarmDash] Multiplayer client — collectors and trace run on host/server only.")
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
    if FarmDashboardVehicleShopGuard and FarmDashboardVehicleShopGuard.onMissionLoaded then
        FarmDashboardVehicleShopGuard.onMissionLoaded()
    elseif FarmDashboardVehicleShopGuard and FarmDashboardVehicleShopGuard.install then
        FarmDashboardVehicleShopGuard.install()
    end
    if FarmDashboardCourseplayCompat and FarmDashboardCourseplayCompat.onMissionLoaded then
        FarmDashboardCourseplayCompat.onMissionLoaded()
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

    if FarmDashboardCourseplayCompat and FarmDashboardCourseplayCompat.shieldFleetIfNeeded then
        pcall(function() FarmDashboardCourseplayCompat.shieldFleetIfNeeded() end)
    end

    if not FarmDashboard.readyAt or not _G.g_time then return end
    if type(_G.g_time) ~= "number" or type(FarmDashboard.readyAt) ~= "number" then return end
    if _G.g_time < FarmDashboard.readyAt then return end

    local dc = FarmDashboardDataCollector
    if dc and dc._pollShopPendingLoads then
        pcall(function() dc:_pollShopPendingLoads() end)
    end

    if FarmDashboardCourseplayCompat and FarmDashboardCourseplayCompat.tick then
        pcall(function() FarmDashboardCourseplayCompat.tick() end)
    end

    if dc and dc.isExportPausedForVehicleSpawn and dc:isExportPausedForVehicleSpawn() then
        return
    end

    if FarmDashboardVehicleShopGuard and FarmDashboardVehicleShopGuard.tryInstall then
        FarmDashboardVehicleShopGuard.tryInstall()
    end

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
