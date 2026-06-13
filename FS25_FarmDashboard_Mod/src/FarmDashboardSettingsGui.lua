-- FS25 FarmDashboard | FarmDashboardSettingsGui.lua | v1.1.0
-- Keybind opens ESC menu → Settings (Farm Dashboard block is on the gameplay settings page).

FarmDashboardSettingsGui = {}

function FarmDashboardSettingsGui.canOpen()
    return _G.g_currentMission ~= nil
end

function FarmDashboardSettingsGui.openGameSettings()
    if not FarmDashboardSettingsGui.canOpen() then return end
    if not g_inGameMenu then return end

    if not g_inGameMenu.isOpen and g_inGameMenu.open then
        pcall(function() g_inGameMenu:open() end)
    end

    local settingsPage = g_inGameMenu.pageSettings
    if settingsPage and g_inGameMenu.pagingElement and g_inGameMenu.pagingElement.pages then
        for i, page in ipairs(g_inGameMenu.pagingElement.pages) do
            if page.element == settingsPage then
                pcall(function() g_inGameMenu.pagingElement:setPage(i) end)
                return
            end
        end
    end

    if g_inGameMenu.setPageId then
        pcall(function() g_inGameMenu:setPageId("pageSettings") end)
    end
end

function FarmDashboardSettingsGui.onInputAction(self, actionName, inputValue, callbackState, isMouse)
    if inputValue == 1 then
        FarmDashboardSettingsGui.openGameSettings()
    end
end

function FarmDashboardSettingsGui:registerInputAction()
    if self._inputRegistered or not g_inputBinding then return end
    local action = InputAction and InputAction.FD_OPEN_SETTINGS
    if not action then return end
    local ok, eventId = pcall(function()
        local _, id = g_inputBinding:registerActionEvent(action, self, FarmDashboardSettingsGui.onInputAction, false, true, false, true)
        return id
    end)
    if ok and eventId then
        pcall(function()
            g_inputBinding:setActionEventTextVisibility(eventId, true)
            g_inputBinding:setActionEventTextPriority(eventId, GS_PRIO_NORMAL)
        end)
        self._inputRegistered = true
    end
end

function FarmDashboardSettingsGui.hookInput()
    if FarmDashboardSettingsGui._hooked then return end
    FarmDashboardSettingsGui._hooked = true

    if PlayerInputComponent and PlayerInputComponent.registerGlobalPlayerActionEvents then
        PlayerInputComponent.registerGlobalPlayerActionEvents = Utils.appendedFunction(
            PlayerInputComponent.registerGlobalPlayerActionEvents,
            function(playerInputComponent)
                FarmDashboardSettingsGui:registerInputAction()
            end
        )
    end
end

function FarmDashboardSettingsGui.init()
    FarmDashboardSettingsGui.hookInput()
    if FarmDashboardSettingsMenu and FarmDashboardSettingsMenu.tryRegister then
        FarmDashboardSettingsMenu.tryRegister()
    end
end

addModEventListener(FarmDashboardSettingsGui)

function FarmDashboardSettingsGui:loadMap()
    FarmDashboardSettingsGui.init()
end
