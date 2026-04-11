--[[
  main.lua — AI Farm Manager bridge (dedicated server / MP host authority only).

  Flow:
  1) Load XML config (backend URL + token).
  2) Hook Mission00.addChatMessage → POST /api/chat/receive for trigger messages.
  3) Poll GET /api/chat/poll every ~3s; inject replies via ChatEvent.

  Error behaviour: on transport failure, extend poll interval to ~10s and do not spam logs.
--]]

AIFarmBridge = {}
AIFarmBridge.MOD_NAME = "fs25_ai_farm_manager_mod"
AIFarmBridge.BOT_SENDER = "Hank"
AIFarmBridge.POLL_MS = 3000
AIFarmBridge.BACKOFF_MS = 10000
AIFarmBridge.config = nil
AIFarmBridge._pollAccum = 0
AIFarmBridge._nextModeInterval = AIFarmBridge.POLL_MS
AIFarmBridge._hooked = false
AIFarmBridge._updateableRegistered = false
AIFarmBridge._hookDeferAccum = 0
AIFarmBridge._hookAttempts = 0
AIFarmBridge._hookGiveUpLogged = false
AIFarmBridge._configWarned = false
AIFarmBridge._httpWarned = false
AIFarmBridge._postOkLogged = false

--- Match FarmDashboard / dedicated: SP + host + dedicated; not MP clients.
function AIFarmBridge:isAuthority()
    if g_currentMission == nil then return false end
    local md = g_currentMission.missionDynamicInfo
    if md and md.isMultiplayer == true and md.isClient == true then
        return false
    end
    if g_server ~= nil and g_server.getIsServer ~= nil then
        local ok, isSrv = pcall(function() return g_server:getIsServer() end)
        if ok then
            if not isSrv and (not md or md.isMultiplayer ~= true) then
                return true
            end
            return isSrv
        end
    end
    if g_connectionManager ~= nil and g_connectionManager.getIsClient ~= nil then
        local ok, isCl = pcall(function() return g_connectionManager:getIsClient() end)
        if ok and isCl then return false end
    end
    return true
end

--- Register chat hook + poll loop once mission exists (loadMap often runs before g_currentMission).
function AIFarmBridge:registerWhenReady()
    if g_currentMission == nil then
        return
    end
    if not self:isAuthority() then
        return
    end
    if not self._updateableRegistered then
        g_currentMission:addUpdateable(self)
        self._updateableRegistered = true
    end
    if not self._hooked then
        self._hooked = AIFarmChatHooks.install()
    end
end

function AIFarmBridge:loadMap()
    Logging.info("[AIFarmManager] Mod loading — bridge script active.")
    self.config = AIFarmManagerConfig.load()
    if self.config.pathUsed == nil and not self._configWarned then
        self._configWarned = true
        Logging.warning(
            "[AIFarmManager] No config XML found. Place ai_farm_manager_config.xml in modsSettings (see mod /config folder)."
        )
    elseif self.config.pathUsed ~= nil then
        Logging.info("[AIFarmManager] Loaded config: %s", self.config.pathUsed)
    end

    self:registerWhenReady()
end

function AIFarmBridge:deleteMap()
    if g_currentMission ~= nil and self._updateableRegistered then
        g_currentMission:removeUpdateable(self)
    end
    self._updateableRegistered = false
    self._hookAttempts = 0
    self._hookDeferAccum = 0
    self._hookGiveUpLogged = false
end

function AIFarmBridge:onStartMission()
    self:registerWhenReady()
end

function AIFarmBridge:setTransportBackoff()
    self._nextModeInterval = self.BACKOFF_MS
end

function AIFarmBridge:clearTransportBackoff()
    self._nextModeInterval = self.POLL_MS
end

--- Build JSON POST body for /api/chat/receive (Lua 5.1 %q escaping).
--- Must use colon syntax so `self` is the bridge table when called as AIFarmBridge:buildReceivePayload(...).
function AIFarmBridge:buildReceivePayload(playerName, message)
    local token = self.config and self.config.serverToken or ""
    return string.format(
        '{"player":%q,"message":%q,"server_token":%q}',
        tostring(playerName),
        tostring(message),
        tostring(token)
    )
end

function AIFarmBridge.onPlayerChat(playerName, message)
    local cfg = AIFarmBridge.config
    if cfg == nil then
        return
    end
    if cfg.backendUrl == nil or cfg.backendUrl == "" or cfg.serverToken == nil or cfg.serverToken == "" then
        return
    end
    local url = cfg.backendUrl .. "/api/chat/receive"
    local body = AIFarmBridge:buildReceivePayload(playerName, message)
    AIFarmHttp.postJson(url, body, function(status, _, err)
        if status == nil or status < 200 or status >= 300 then
            AIFarmBridge:setTransportBackoff()
            if not AIFarmBridge._httpWarned then
                AIFarmBridge._httpWarned = true
                Logging.warning(
                    "[AIFarmManager] HTTP POST failed (status=%s err=%s) url=%s — set backendUrl to your public API (HTTPS URL of your VPS or reverse proxy, no trailing slash).",
                    tostring(status),
                    tostring(err),
                    tostring(url)
                )
            end
        else
            AIFarmBridge:clearTransportBackoff()
            AIFarmBridge._httpWarned = false
            if not AIFarmBridge._postOkLogged then
                AIFarmBridge._postOkLogged = true
                Logging.info("[AIFarmManager] Backend HTTP OK — replies will appear when the API returns them (poll).")
            end
        end
    end)
end

local function decodeJsonObject(str)
    if str == nil then return nil end
    if json ~= nil and json.decode ~= nil then
        local ok, data = pcall(function() return json.decode(str) end)
        if ok then return data end
    end
    return nil
end

function AIFarmBridge:pollOutgoing()
    local cfg = self.config
    if cfg == nil or cfg.backendUrl == nil or cfg.backendUrl == "" or cfg.serverToken == nil or cfg.serverToken == "" then
        return
    end
    local base = cfg.backendUrl
    local token = cfg.serverToken
    local function encodeQueryParam(s)
        s = tostring(s or "")
        return (string.gsub(s, "([^A-Za-z0-9%-_%.~])", function(c)
            return string.format("%%%02X", string.byte(c, 1))
        end))
    end
    local url = base .. "/api/chat/poll?server_token=" .. encodeQueryParam(token)
    AIFarmHttp.get(url, function(status, body, err)
        if status == nil or status < 200 or status >= 300 or body == nil then
            self:setTransportBackoff()
            return
        end
        self:clearTransportBackoff()
        local data = decodeJsonObject(body)
        if data == nil or data.messages == nil then return end
        for _, m in ipairs(data.messages) do
            local sender = m.sender or AIFarmBridge.BOT_SENDER
            local text = m.text
            if text ~= nil and text ~= "" then
                local line = "[" .. tostring(sender) .. "] " .. tostring(text)
                AIFarmChatHooks.broadcastBot(line, AIFarmBridge.BOT_SENDER)
            end
        end
    end)
end

function AIFarmBridge:update(dt)
    AIFarmHttp.update(dt)

    if not self:isAuthority() then
        return
    end

    -- If hook was not ready in loadMap, retry briefly (Mission00 may appear after mission start).
    if not self._hooked and self._hookAttempts < 15 then
        self._hookDeferAccum = self._hookDeferAccum + dt
        if self._hookDeferAccum >= 1.0 then
            self._hookDeferAccum = 0
            self._hookAttempts = self._hookAttempts + 1
            self:registerWhenReady()
        end
    elseif not self._hooked and not self._hookGiveUpLogged then
        self._hookGiveUpLogged = true
        Logging.warning(
            "[AIFarmManager] Mission00.addChatMessage never became available — chat trigger will not work in this session."
        )
    end

    self._pollAccum = self._pollAccum + dt
    if self._pollAccum < self._nextModeInterval then
        return
    end
    self._pollAccum = 0
    self:pollOutgoing()
end

addModEventListener(AIFarmBridge)
