--[[
  ChatHooks.lua — intercept player chat and broadcast bot replies.

  Giants API drift:
  - Historically, `Mission00.addChatMessage` is invoked when chat is added (see GDN forum "Server Mod Chat Message").
  - If FS25 renamed or moved this hook, search scripts for `addChatMessage` and mirror the same pattern with `Utils.appendedFunction`.

  Outbound chat uses `g_server:broadcastEvent(ChatEvent.new(...))` in many MP mods; verify ChatEvent constructor argument order in your build.
--]]

AIFarmChatHooks = {}
AIFarmChatHooks._installed = false
AIFarmChatHooks._installMissingLogged = false
AIFarmChatHooks._prefixHintShown = false

--- In-game chat bot is multiplayer-only — same gate as AIFarmBridge:isChatBridgeActive().
function AIFarmChatHooks.shouldHandleChat()
    return AIFarmBridge:isChatBridgeActive()
end

--- Broadcast a bot line to all players (server only).
function AIFarmChatHooks.broadcastBot(text, displayName)
    displayName = displayName or AIFarmBridge.BOT_SENDER
    if g_server == nil or g_server.broadcastEvent == nil then return end
    if ChatEvent == nil or ChatEvent.new == nil then return end
    if g_currentMission == nil or g_currentMission.missionDynamicInfo == nil then return end

    local farmId = FarmManager and FarmManager.SPECTATOR_FARM_ID or 0
    local msg = filterText and filterText(text, false, false) or text

    local ok, err = pcall(function()
        local ev = ChatEvent.new(msg, displayName, farmId, 0)
        g_server:broadcastEvent(ev)
    end)
    if ok then
        -- G-Portal / dedicated server.log mirroring (FS25 chat handover §6.1)
        print(string.format(
            "CHAT_LOG: [AIFarmManager] broadcast sender=%s msg_len=%d",
            tostring(displayName),
            msg and #tostring(msg) or 0
        ))
    end
    if not ok then
        -- One-time diagnostic only; avoid spamming dedicated logs.
        if not AIFarmChatHooks._broadcastFail then
            AIFarmChatHooks._broadcastFail = true
            Logging.warning("[AIFarmManager] broadcastChat failed: %s", tostring(err))
        end
    end
end

function AIFarmChatHooks.install()
    if AIFarmChatHooks._installed then
        return true
    end
    if Mission00 == nil or Mission00.addChatMessage == nil then
        if not AIFarmChatHooks._installMissingLogged then
            AIFarmChatHooks._installMissingLogged = true
            Logging.warning("[AIFarmManager] Mission00.addChatMessage missing — will retry when mission is ready.")
        end
        return false
    end
    Mission00.addChatMessage = Utils.appendedFunction(Mission00.addChatMessage, AIFarmChatHooks._onAddChatMessage)
    AIFarmChatHooks._installed = true
    Logging.info("[AIFarmManager] Chat hook installed on Mission00.addChatMessage")
    return true
end

function AIFarmChatHooks._onAddChatMessage(mission, senderName, message, ...)
    if not AIFarmChatHooks.shouldHandleChat() then return end
    if senderName == nil or message == nil then return end
    -- Ignore our own bot lines to prevent loops.
    if senderName == AIFarmBridge.BOT_SENDER then return end

    local cfg = AIFarmBridge.config
    if cfg == nil then
        return
    end
    if cfg.backendUrl == nil or cfg.backendUrl == "" then
        return
    end

    if cfg.debugChat then
        Logging.info(
            "[AIFarmManager] Chat line from %s: %s",
            tostring(senderName),
            tostring(message)
        )
    end

    local prefix = cfg.triggerPrefix or "!hank"
    local ml = string.lower(message)
    local pl = string.lower(prefix)
    if string.sub(ml, 1, #pl) ~= pl then
        if cfg.debugChat and not AIFarmChatHooks._prefixHintShown then
            AIFarmChatHooks._prefixHintShown = true
            Logging.info(
                "[AIFarmManager] This line had no prefix %q — bot only sees lines that start with it (e.g. %s how many fields?)",
                prefix,
                prefix
            )
        end
        return
    end

    local preview = message
    if #preview > 100 then
        preview = string.sub(preview, 1, 100) .. "…"
    end
    Logging.info("[AIFarmManager] Trigger matched, forwarding: %s", preview)
    print(string.format(
        "CHAT_LOG: [AIFarmManager] trigger player=%s msg_len=%d",
        tostring(senderName),
        message and #tostring(message) or 0
    ))

    AIFarmBridge.onPlayerChat(senderName, message)
end
