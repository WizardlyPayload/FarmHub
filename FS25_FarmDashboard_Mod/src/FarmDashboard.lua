-- FS25 FarmDashboard | FarmDashboard.lua | v3.0.0 (Plan v5)
-- Authors: JoshWalki, WizardlyPayload

FarmDashboard = {}
FarmDashboard.MOD_NAME = "FS25_FarmDashboard"
FarmDashboard.MOD_DIR = _G.g_currentModDirectory
FarmDashboard.VERSION = "5.1.0.0"
FarmDashboard.UPDATE_INTERVAL = 10000
FarmDashboard.PORT = 8766
FarmDashboard.readyAt = nil

local hasLoaded = false
local IDENTITY_DIAG_LIMIT = 12
local IDENTITY_RETRY_MIN_MS = 5000
local IDENTITY_RETRY_MAX_MS = 60000
-- Exception text can carry profile paths, user names or tokens; the log only ever gets this category.
local IDENTITY_ERROR_CATEGORY = "capture-exception"

-- Ordinary script mods run with _G = their own environment; engine functions are inherited
-- through its __index (mods.lua), so rawget(_G, name) never sees them.
local function engineFn(name)
    local value = _G[name]
    if type(value) == "function" then return value end
    return nil
end

--- Collectors and data.json: SP + MP host / dedicated â€” not MP clients.
--- Multiplayer must follow g_server:getIsServer() whenever it exists (dedicated / host). Earlier refactor gated that on
--- missionDynamicInfo.isMultiplayer, which can be nil on servers and skipped the real server check â€” breaking exports.
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

    if _G.g_dedicatedServer ~= nil then
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
    return _G.g_dedicatedServer ~= nil
end

--- MP host or dedicated server process (export authority without a local shop GUI).
function FarmDashboard:isServerExportHost()
    if not self:isAuthority() then return false end
    local md = _G.g_currentMission and _G.g_currentMission.missionDynamicInfo
    if md and md.isMultiplayer == true then return true end
    if _G.g_dedicatedServer ~= nil then return true end
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

    -- extraSourceFiles can fail (leftover unpacked mods/FS25_FarmDashboard folder, or a
    -- zip Giants cannot resolve). Never throw from loadMap — this runs inside i3d
    -- streaming (loadSharedI3DFileFinished) and a nil :init() aborts the callback.
    local dc = rawget(_G, "FarmDashboardDataCollector")
    if FarmDashboardCareerIdentity and FarmDashboardCareerIdentity.install and FSCareerMissionInfo then
        pcall(function() FarmDashboardCareerIdentity.install(FSCareerMissionInfo) end)
    end
    if FarmDashboardExportRoute and FarmDashboardExportRoute.reset then
        pcall(function()
            FarmDashboardExportRoute:reset({
                createFolder = engineFn("createFolder"),
                createXMLFile = engineFn("createXMLFile"),
                setXMLString = engineFn("setXMLString"),
                saveXMLFile = engineFn("saveXMLFile"),
                loadXMLFile = engineFn("loadXMLFile"),
                getXMLString = engineFn("getXMLString"),
                delete = engineFn("delete"),
                fileExists = engineFn("fileExists"),
                isAuthority = function() return FarmDashboard:isAuthority() end,
                currentContext = function()
                    local ident = FarmDashboardCareerIdentity and FarmDashboardCareerIdentity.status and FarmDashboardCareerIdentity.status() or {}
                    local root = ""
                    if FarmDashboardDataCollector and FarmDashboardDataCollector.getDataOutputDir then
                        root = FarmDashboardDataCollector:getDataOutputDir() or ""
                    end
                    if root ~= "" and string.sub(root, -1) ~= "/" then root = root .. "/" end
                    local careerDir = root
                    if type(ident.careerId) == "string" and ident.careerId ~= "" then
                        careerDir = root .. ident.careerId .. "/"
                    end
                    return {
                        careerId = ident.careerId,
                        sessionId = ident.sessionId,
                        targetDir = careerDir,
                        sessionToken = ident.sessionToken,
                    }
                end,
            })
        end)
    end
    if dc and type(dc.init) == "function" then
        local ok, err = pcall(function()
            dc:init()
        end)
        if not ok then
            Logging.warning("[FarmDash] DataCollector init failed: %s", tostring(err))
        end
    else
        Logging.warning(
            "[FarmDash] FarmDashboardDataCollector did not load. If both FS25_FarmDashboard.zip and an unpacked FS25_FarmDashboard folder exist, Giants uses the folder — keep that folder complete or delete it."
        )
    end

    if FarmDashboardSettingsGui and FarmDashboardSettingsGui.init then
        FarmDashboardSettingsGui.init()
    end

    if FarmDashboardSettingsMenu and FarmDashboardSettingsMenu.tryRegister then
        FarmDashboardSettingsMenu.tryRegister()
    end

    if self:isAuthority() then
        -- BaseMission:update already calls mod-listener update(). Do not also addUpdateable.
        FarmDashboard.isRegistered = true
        FarmDashboard.readyAt = 0
        FarmDashboard._loggedFirstUpdate = false
        FarmDashboard._missionLoadNotified = false
        FarmDashboard._armedMission = nil
        if FarmDashboardMissionRegistry and FarmDashboardMissionRegistry.clear then
            FarmDashboardMissionRegistry.clear()
        end
        if FieldDataCollector and FieldDataCollector.clearSoilSampleHold then
            FieldDataCollector.clearSoilSampleHold()
        end
        if _G.g_messageCenter and _G.MessageType and _G.MessageType.CURRENT_MISSION_START then
            pcall(function()
                _G.g_messageCenter:subscribeOneshot(
                    _G.MessageType.CURRENT_MISSION_START,
                    FarmDashboard.onEngineMissionStart,
                    FarmDashboard
                )
            end)
            Logging.info("[FarmDash] subscribed CURRENT_MISSION_START")
        else
            Logging.warning("[FarmDash] CURRENT_MISSION_START unavailable — update fallback will arm collectors")
        end
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
            tostring(_G.g_dedicatedServer ~= nil),
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
        Logging.info("[FarmDash] Multiplayer client — collectors run on host/server only. Export mirror streams while joined; the first time you join a server Farm Dashboard asks Link this server? and nothing is stored until you approve; linked servers reconnect after they prove the link.")
    end

    FarmDashboard:startDashboard()
end

--- Engine publishes MessageType.CURRENT_MISSION_START from Mission00:onStartMission.
--- The method name onStartMission is not dispatched to mod listeners by itself.
function FarmDashboard:onEngineMissionStart(_isNewSave)
    Logging.info("[FarmDash] CURRENT_MISSION_START received")
    self:onStartMission()
end

--- Logs each distinct identity state once per session (reset in deleteMap). Tags only: detail separates
--- distinct states for deduplication and is never written to the log.
function FarmDashboard:noteIdentityState(level, reason, stage, capability, detail)
    local key = table.concat({ tostring(level), tostring(reason), tostring(stage), tostring(capability), tostring(detail) }, "|")
    FarmDashboard._identityDiagSeen = FarmDashboard._identityDiagSeen or {}
    if FarmDashboard._identityDiagSeen[key] then return false end
    FarmDashboard._identityDiagCount = (FarmDashboard._identityDiagCount or 0) + 1
    if FarmDashboard._identityDiagCount > IDENTITY_DIAG_LIMIT then
        if not FarmDashboard._identityDiagCapped and Logging and Logging.warning then
            FarmDashboard._identityDiagCapped = true
            Logging.warning("[FarmDash] further dashboard identity states suppressed this session")
        end
        return false
    end
    FarmDashboard._identityDiagSeen[key] = true
    if not Logging then return true end
    if level == "ready" then
        local previous = FarmDashboard._identityLastProblem
        if Logging.info then
            Logging.info("[FarmDash] dashboard identity ready (source=%s recoveredFrom=%s)", tostring(stage), tostring(previous or "none"))
        end
        FarmDashboard._identityLastProblem = nil
        return true
    end
    FarmDashboard._identityLastProblem = tostring(reason)
    if level == "info" then
        if Logging.info then
            Logging.info("[FarmDash] waiting for dashboard identity (reason=%s stage=%s capability=%s)", tostring(reason), tostring(stage), tostring(capability))
        end
    elseif Logging.warning then
        local errorCategory = "nil"
        if detail ~= nil then errorCategory = IDENTITY_ERROR_CATEGORY end
        Logging.warning("[FarmDash] dashboard identity unavailable; export stays off (reason=%s stage=%s capability=%s error=%s)", tostring(reason), tostring(stage), tostring(capability), errorCategory)
    end
    return true
end

function FarmDashboard:armMission()
    local function missionIdentityReady(status)
        if type(status) ~= "table" then return false end
        if status.captured ~= true or status.allocationFailed == true or status.recoveryNeeded == true or status.waitingForIdentity == true then
            return false
        end
        if type(status.careerId) ~= "string" or status.careerId == "" or status.careerId == "waiting" then return false end
        if type(status.sessionId) ~= "string" or status.sessionId == "" or status.sessionId == "waiting" then return false end
        if type(status.sessionToken) ~= "string" or status.sessionToken == "" or status.sessionToken == "waiting" then return false end
        return true
    end
    if FarmDashboard._missionLoadNotified then return true end
    local mission = _G.g_currentMission
    local ident = FarmDashboardCareerIdentity
    if not mission or not mission.missionInfo then
        self:noteIdentityState("info", "mission-unavailable", mission and "mission-info" or "mission")
        return false
    end
    if not ident or type(ident.capture) ~= "function" or type(ident.status) ~= "function" then
        self:noteIdentityState("warning", "identity-module-missing", "module")
        return false
    end
    -- A joining client never adopts or allocates; the host/server owns the career identity.
    if not self:isAuthority() then
        self:noteIdentityState("info", "not-authority", "client")
        return false
    end
    local status = ident.status()
    if FarmDashboard._armedMission ~= mission or not missionIdentityReady(status) then
        local controller = _G.SavegameController
        if type(controller) == "table" and ident.installSaveComplete then
            pcall(function() ident.installSaveComplete(controller) end)
        end
        local captureDeps = {
            getXMLString = engineFn("getXMLString"),
            loadXMLFile = engineFn("loadXMLFile"),
            delete = engineFn("delete"),
        }
        -- Dedicated: no desktop app shares this profile. The server owns the career identity
        -- (persisted in careerSavegame.xml by the save hook) and the export mirror carries it to
        -- joined clients. SP and MP host keep the desktop proposal flow.
        if self:isDedicatedServer() and type(ident.serverReserve) == "function" then
            if FarmDashboard._serverReserve == nil then
                local okReserve, reserve = pcall(ident.serverReserve, mission.missionInfo.savegameDirectory)
                if okReserve and type(reserve) == "function" then
                    FarmDashboard._serverReserve = reserve
                    Logging.info("[FarmDash] dedicated server: career identity is owned by this server and saved with the savegame")
                end
            end
            captureDeps.reserve = FarmDashboard._serverReserve
        end
        local ok, captureErr = pcall(function()
            ident.capture(mission.missionInfo, captureDeps)
        end)
        status = ident.status()
        if not ok then
            FarmDashboard._armedMission = nil
            local okText, errText = pcall(tostring, captureErr)
            self:noteIdentityState("warning", "capture-error", "capture", nil, okText and errText or IDENTITY_ERROR_CATEGORY)
            return false
        end
        if status.waitingForIdentity then
            FarmDashboard._armedMission = nil
            self:noteIdentityState("info", status.reason or "waiting-proposal", status.stage, status.capability)
            return false
        end
        if not missionIdentityReady(status) then
            FarmDashboard._armedMission = nil
            self:noteIdentityState("warning", status.reason or "not-ready", status.stage, status.capability)
            return false
        end
        FarmDashboard._armedMission = mission
    end
    if FarmDashboardDataCollector and FarmDashboardDataCollector.resetStaggerState then
        local okReset, errReset = pcall(function()
            FarmDashboardDataCollector:resetStaggerState({ preserveSession = true })
        end)
        if not okReset then
            Logging.warning("[FarmDash] collector reset failed: %s", tostring(errReset))
            return false
        end
    end
    if _G.g_currentMission ~= mission or not missionIdentityReady(ident.status()) then
        FarmDashboard._armedMission = nil
        return false
    end
    if FarmDashboardDataCollector and FarmDashboardDataCollector.onMissionLoaded then
        local okMission, errMission = pcall(function()
            FarmDashboardDataCollector:onMissionLoaded()
        end)
        if not okMission then
            Logging.warning("[FarmDash] onMissionLoaded failed: %s", tostring(errMission))
            return false
        end
    end
    if _G.g_currentMission ~= mission or not missionIdentityReady(ident.status()) then
        FarmDashboard._armedMission = nil
        return false
    end
    FarmDashboard._missionLoadNotified = true
    self:noteIdentityState("ready", "ready", ident.status().stage)
    return true
end

function FarmDashboard:onStartMission()
    if FarmDashboard._missionLoadNotified then
        return
    end
    if self:isAuthority() then
        self.isRegistered = true
        -- Always re-arm. Previously readyAt was only set when not yet registered, so a
        -- loadMap-captured clock left collectors dead for the whole session.
        local currentTime = _G.g_time or 0
        FarmDashboard.readyAt = (type(currentTime) == "number") and currentTime or 0
        Logging.info(
            "[FarmDash] onStartMission — collectors armed (readyAt=%.0f g_time=%.0f)",
            FarmDashboard.readyAt,
            type(_G.g_time) == "number" and _G.g_time or -1
        )
    end
    self:armMission()
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
    hasLoaded = false
    FarmDashboard._missionLoadNotified = false
    FarmDashboard._armedMission = nil
    if FarmDashboardMissionRegistry and FarmDashboardMissionRegistry.clear then
        FarmDashboardMissionRegistry.clear()
    end
    if FieldDataCollector and FieldDataCollector.clearSoilSampleHold then
        FieldDataCollector.clearSoilSampleHold()
    end
    FarmDashboard._loggedFirstUpdate = false
    FarmDashboard.readyAt = nil
    self.isRegistered = false
    if _G.g_messageCenter and _G.MessageType and _G.MessageType.CURRENT_MISSION_START then
        pcall(function()
            _G.g_messageCenter:unsubscribe(_G.MessageType.CURRENT_MISSION_START, FarmDashboard)
        end)
    end
    local route = rawget(_G, "FarmDashboardExportRoute")
    if route and type(route.cancelCurrent) == "function" then
        pcall(function() route:cancelCurrent() end)
    end
    if FarmDashboardSettingsEvent and type(FarmDashboardSettingsEvent.clearPendingReplication) == "function" then
        pcall(FarmDashboardSettingsEvent.clearPendingReplication)
    end
    if FarmDashboardDataCollector then
        FarmDashboardDataCollector:shutdown()
    end
    FarmDashboard._identityDiagSeen = nil
    FarmDashboard._identityDiagCount = 0
    FarmDashboard._identityDiagCapped = nil
    FarmDashboard._identityLastProblem = nil
    FarmDashboard._identityRetryWaitMs = nil
    FarmDashboard._identityRetryElapsedMs = 0
    FarmDashboard._serverReserve = nil
    if FarmDashboardCareerIdentity and type(FarmDashboardCareerIdentity.release) == "function" then
        pcall(FarmDashboardCareerIdentity.release)
    end
end

function FarmDashboard:update(dt)
    if not _G.g_currentMission then return end
    if FarmDashboardSettingsEvent and type(FarmDashboardSettingsEvent.tickReplication) == "function" then
        pcall(FarmDashboardSettingsEvent.tickReplication, dt)
    end
    if not self:isAuthority() then
        local route = rawget(_G, "FarmDashboardExportRoute")
        if route and type(route.cancelCurrent) == "function" then
            pcall(function() route:cancelCurrent() end)
        end
        -- Joined client: chunks are only buffered by ExportEvent; the bounded finalizer step stores the replica.
        local mirror = rawget(_G, "FarmDashboardExportMirror")
        if mirror and type(mirror.hasReceiveWork) == "function" and mirror:hasReceiveWork() then
            pcall(function() mirror:update(dt) end)
        end
        local pairing = rawget(_G, "FarmDashboardReplicaPairing")
        if pairing and type(pairing.update) == "function" then
            pcall(function() pairing:update(dt) end)
        end
        return
    end

    if not FarmDashboard._loggedFirstUpdate then
        FarmDashboard._loggedFirstUpdate = true
        Logging.info(
            "[FarmDash] first update dt=%.2f g_time=%.0f readyAt=%.0f",
            type(dt) == "number" and dt or -1,
            type(_G.g_time) == "number" and _G.g_time or -1,
            type(FarmDashboard.readyAt) == "number" and FarmDashboard.readyAt or -1
        )
    end

    -- Keep export-mirror streaming alive even while shop spawn pause blocks fleet scans.
    -- Without this, a started job stalls for the whole grace window (and GPortal joins
    -- during that window never receive chunks).
    -- _pendingJob: payloads queued by the stream-interval throttle also need the pump.
    local mirror = rawget(_G, "FarmDashboardExportMirror")
    if mirror and mirror.update and (mirror._job or mirror._pendingJob) then
        pcall(function() mirror:update(dt) end)
    end

    if not FarmDashboard.readyAt or not _G.g_time then return end
    if type(_G.g_time) ~= "number" or type(FarmDashboard.readyAt) ~= "number" then return end
    -- Mission clock rewound after loadMap captured a large readyAt → collectors never ran.
    if _G.g_time < FarmDashboard.readyAt then
        if (FarmDashboard.readyAt - _G.g_time) > 1000 then
            Logging.info(
                "[FarmDash] g_time rewound (%.0f < readyAt %.0f) — re-arming collectors",
                _G.g_time,
                FarmDashboard.readyAt
            )
            FarmDashboard.readyAt = _G.g_time
            if FarmDashboardDataCollector and FarmDashboardDataCollector.onMissionLoaded then
                pcall(function() FarmDashboardDataCollector:onMissionLoaded() end)
            end
        else
            return
        end
    end

    -- Same arm as CURRENT_MISSION_START. Do not mark the mission loaded before identity exists.
    -- The proposal can stay absent for a whole session (dedicated without the desktop app), so the
    -- retry backs off to IDENTITY_RETRY_MAX_MS instead of polling the profile every few seconds.
    if FarmDashboardDataCollector and not FarmDashboard._missionLoadNotified then
        local waitMs = FarmDashboard._identityRetryWaitMs
        local due = waitMs == nil
        if not due then
            local step = (type(dt) == "number" and dt > 0) and dt or 0
            FarmDashboard._identityRetryElapsedMs = (FarmDashboard._identityRetryElapsedMs or 0) + step
            due = FarmDashboard._identityRetryElapsedMs >= waitMs
        end
        if due then
            FarmDashboard._identityRetryElapsedMs = 0
            if self:armMission() then
                Logging.info("[FarmDash] Mission-load arm (update fallback) g_time=%.0f", _G.g_time)
            elseif waitMs == nil then
                FarmDashboard._identityRetryWaitMs = IDENTITY_RETRY_MIN_MS
            else
                FarmDashboard._identityRetryWaitMs = math.min(waitMs * 2, IDENTITY_RETRY_MAX_MS)
            end
        end
    end

    local dc = FarmDashboardDataCollector
    if dc and dc._pollShopPendingLoads then
        pcall(function() dc:_pollShopPendingLoads() end)
    end

    -- Keep export-mirror streaming alive even while shop spawn pause blocks fleet scans.
    -- Without this, a started job stalls for the whole grace window (and GPortal joins
    -- during that window never receive chunks).
    -- _pendingJob: payloads queued by the stream-interval throttle also need the pump.
    local mirror = rawget(_G, "FarmDashboardExportMirror")
    if mirror and mirror.update and (mirror._job or mirror._pendingJob) then
        pcall(function() mirror:update(dt) end)
    end

    -- Do not freeze fields / soil / weather because Courseplay is spawning a vehicle.
    -- DataCollector already skips vehicle/finance slices during spawn grace.

    if FarmDashboardVehicleShopGuard and FarmDashboardVehicleShopGuard.tryInstall then
        FarmDashboardVehicleShopGuard.tryInstall()
    end

    local exportBudget = { bytes = 4096, timeMs = 4, timingUnavailable = true, charged = 0 }
    if FarmDashboardDataCollector then
        FarmDashboardDataCollector._frameBudget = exportBudget
        FarmDashboardDataCollector._frameExportBytes = 0
    end

    local success, err = pcall(function()
        if FarmDashboardDataCollector and type(dt) == "number" then
            FarmDashboardDataCollector:update(dt)
        end
    end)

    local exportRoute = rawget(_G, "FarmDashboardExportRoute")
    if exportRoute and type(exportRoute.step) == "function" then
        local routeOk, routeErr = pcall(function() exportRoute:step(exportBudget) end)
        if not routeOk and Logging and Logging.warning then
            FarmDashboard._routeWarnSkips = (FarmDashboard._routeWarnSkips or 0) + 1
            if FarmDashboard._routeWarnSkips == 1 or FarmDashboard._routeWarnSkips % 300 == 0 then
                Logging.warning("[FarmDash] export route step failed: %s", tostring(routeErr))
            end
        end
    end

    if not success and err then
        if FarmDashLog and FarmDashLog.error then
            FarmDashLog.error("Update error: %s", tostring(err))
        else
            Logging.warning("[FarmDash] Update error: %s", tostring(err))
        end
    end
end

function FarmDashboard:buildExportDiagnostics()
    local gameVersion = nil
    pcall(function()
        if type(_G.getAppVersion) == "function" then
            gameVersion = tostring(_G.getAppVersion())
        elseif type(getAppVersion) == "function" then
            gameVersion = tostring(getAppVersion())
        end
    end)
    local missing = {}
    if not FarmDashboardDataCollector then
        missing[#missing + 1] = "FarmDashboardDataCollector"
    end
    return {
        modVersion = self.VERSION,
        gameVersion = gameVersion,
        isAuthority = self:isAuthority() == true,
        lastExportGameTime = (type(_G.g_time) == "number") and _G.g_time or 0,
        lastXmlSampleTime = nil,
        missingDependencies = missing,
        compatible = #missing == 0,
    }
end

function FarmDashboard:buildExportDiagnostics()
    local gameVersion = nil
    pcall(function()
        if type(_G.getAppVersion) == "function" then
            gameVersion = tostring(_G.getAppVersion())
        elseif type(getAppVersion) == "function" then
            gameVersion = tostring(getAppVersion())
        end
    end)
    local missing = {}
    if not FarmDashboardDataCollector then
        missing[#missing + 1] = "FarmDashboardDataCollector"
    end
    return {
        modVersion = self.VERSION,
        gameVersion = gameVersion,
        isAuthority = self:isAuthority() == true,
        lastExportGameTime = (type(_G.g_time) == "number") and _G.g_time or 0,
        lastXmlSampleTime = nil,
        missingDependencies = missing,
        compatible = #missing == 0,
    }
end

function FarmDashboard:startDashboard()
end

addModEventListener(FarmDashboard)
