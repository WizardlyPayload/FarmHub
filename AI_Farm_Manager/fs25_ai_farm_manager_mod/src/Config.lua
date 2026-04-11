--[[
  Config.lua — load backend URL + token from modSettings XML (no hardcoded VPS IP in Lua).

  Profile path: getUserProfileAppPath() … FarmingSimulator2025/modSettings/ai_farm_manager_config.xml

  If Giants changes profile paths, search for getUserProfileAppPath in GDN / base scripts.
--]]

AIFarmManagerConfig = {}
AIFarmManagerConfig.FILE_NAME = "ai_farm_manager_config.xml"

function AIFarmManagerConfig.tryPaths()
    local base = getUserProfileAppPath()
    return {
        base .. "modSettings/" .. AIFarmManagerConfig.FILE_NAME,
    }
end

function AIFarmManagerConfig.load()
    local backendUrl = ""
    local serverToken = ""
    local triggerPrefix = "!hank"
    local debugChat = false

    local pathUsed = nil
    for _, p in ipairs(AIFarmManagerConfig.tryPaths()) do
        if fileExists(p) then
            pathUsed = p
            local key = "AIFarmManager"
            local xmlFile = loadXMLFile(key, p)
            -- Paths are relative to the root tag in the XML file (see config/ai_farm_manager_config.xml).
            backendUrl = Utils.getNoNil(getXMLString(xmlFile, "aiFarmManager.backendUrl"), "")
            serverToken = Utils.getNoNil(getXMLString(xmlFile, "aiFarmManager.serverToken"), "")
            triggerPrefix = Utils.getNoNil(getXMLString(xmlFile, "aiFarmManager.triggerPrefix"), triggerPrefix)
            local dbg = string.lower(Utils.getNoNil(getXMLString(xmlFile, "aiFarmManager.debugChat"), "false"))
            debugChat = dbg == "true"
            delete(xmlFile)
            break
        end
    end

    return {
        backendUrl = backendUrl,
        serverToken = serverToken,
        triggerPrefix = triggerPrefix,
        debugChat = debugChat,
        pathUsed = pathUsed,
    }
end
