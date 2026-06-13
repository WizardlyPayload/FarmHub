-- FS25 FarmDashboard | FarmDashboardSettingsMenu.lua | v1.0.0
-- Injects Farm Dashboard options into ESC → Settings (same pattern as Moisture System / RL).

FarmDashboardSettingsMenu = {}
FarmDashboardSettingsMenu.CONTROLS = {}
FarmDashboardSettingsMenu.registered = false

FarmDashboardSettingsControls = {}

local function rangeValues(min, max, step)
    local out = {}
    for v = min, max, step do
        table.insert(out, v)
    end
    return out
end

local function intStrings(values)
    local out = {}
    for i, v in ipairs(values) do
        out[i] = tostring(v)
    end
    return out
end

local function offOnStrings()
    return {
        g_i18n:getText("ui_farmdash_off"),
        g_i18n:getText("ui_farmdash_on"),
    }
end

FarmDashboardSettingsMenu.ITEMS = {
    { id = "enableAnimals", key = "enableAnimals", values = { false, true }, strings = offOnStrings },
    { id = "enableVehicles", key = "enableVehicles", values = { false, true }, strings = offOnStrings },
    { id = "enableFields", key = "enableFields", values = { false, true }, strings = offOnStrings },
    { id = "enableFinance", key = "enableFinance", values = { false, true }, strings = offOnStrings },
    { id = "enableWeather", key = "enableWeather", values = { false, true }, strings = offOnStrings },
    { id = "enableEconomy", key = "enableEconomy", values = { false, true }, strings = offOnStrings },
    { id = "enableProduction", key = "enableProduction", values = { false, true }, strings = offOnStrings },
    { id = "enableStock", key = "enableStock", values = { false, true }, strings = offOnStrings },
    { id = "enableBaleInventory", key = "enableBaleInventory", values = { false, true }, strings = offOnStrings },
    { id = "enableRedTape", key = "enableRedTape", values = { false, true }, strings = offOnStrings },
    { id = "collectionCycleSec", key = "collectionCycleMs", values = rangeValues(60, 1800, 60), toDisplay = function(v) return math.floor((v or 60000) / 1000) end, toStore = function(v) return v * 1000 end },
    { id = "sliceBudgetMs", key = "sliceBudgetMs", values = rangeValues(1, 16, 1) },
    { id = "postLoadGraceSec", key = "postLoadCollectionGraceSec", values = rangeValues(0, 120, 15) },
    { id = "fieldsPerFrame", key = "fieldsPerFrame", values = rangeValues(1, 12, 1) },
    { id = "vehiclesPerFrame", key = "vehiclesPerFrame", values = rangeValues(1, 16, 1) },
    { id = "baleEntitiesBudget", key = "baleEntitiesBudget", values = rangeValues(4, 128, 4) },
    { id = "stockPlaceablesPerFrame", key = "stockPlaceablesPerFrame", values = rangeValues(1, 16, 1) },
    { id = "baleWorldPerFrame", key = "baleWorldEntitiesPerFrame", values = rangeValues(4, 64, 4) },
    { id = "financeVehiclesPerFrame", key = "financeVehiclesPerFrame", values = rangeValues(1, 16, 1) },
    { id = "jsonKeysPerFrame", key = "jsonTopLevelKeysPerFrame", values = rangeValues(1, 20, 1) },
    { id = "animalRowsPerSlice", key = "animalRowsPerSlice", values = rangeValues(32, 1024, 32) },
    { id = "economyYieldStride", key = "economyYieldStride", values = rangeValues(8, 120, 4) },
    { id = "diagnostics", key = "diagnostics", values = { false, true }, strings = offOnStrings },
    { id = "debugBaleScan", key = "debugBaleScan", values = { false, true }, strings = offOnStrings },
}

local function updateFocusIds(element)
    if not element then return end
    element.focusId = FocusManager:serveAutoFocusId()
    if element.elements then
        for _, child in pairs(element.elements) do
            updateFocusIds(child)
        end
    end
end

function FarmDashboardSettingsMenu.getConfigValue(itemDef)
    local api = rawget(_G, "FarmDashboardSettingsApi")
    if not api then return nil end
    if itemDef.values[1] == false or itemDef.values[1] == true then
        return api:getBool(itemDef.key, itemDef.values[2])
    end
    return api:getInt(itemDef.key, itemDef.values[1])
end

function FarmDashboardSettingsMenu.getStateIndex(itemDef)
    local cfgVal = FarmDashboardSettingsMenu.getConfigValue(itemDef)
    if cfgVal == nil then return 1 end

    local compareVal = cfgVal
    if itemDef.toDisplay then
        compareVal = itemDef.toDisplay(cfgVal)
    end

    if type(compareVal) == "boolean" then
        for i, v in ipairs(itemDef.values) do
            if v == compareVal then return i end
        end
        return compareVal and 2 or 1
    end

    local bestIdx, bestDiff = 1, math.huge
    for i, v in ipairs(itemDef.values) do
        local diff = math.abs(v - compareVal)
        if diff < bestDiff then
            bestDiff = diff
            bestIdx = i
        end
    end
    return bestIdx
end

function FarmDashboardSettingsMenu.syncControl(itemDef)
    local control = FarmDashboardSettingsMenu.CONTROLS[itemDef.id]
    if control and control.setState then
        control:setState(FarmDashboardSettingsMenu.getStateIndex(itemDef))
    end
end

function FarmDashboardSettingsMenu.syncAllControls()
    for _, itemDef in ipairs(FarmDashboardSettingsMenu.ITEMS) do
        FarmDashboardSettingsMenu.syncControl(itemDef)
    end
end

function FarmDashboardSettingsMenu.syncControlPermissions()
    local api = rawget(_G, "FarmDashboardSettingsApi")
    local canChange = api and api:canChangeSettings()
    for _, itemDef in ipairs(FarmDashboardSettingsMenu.ITEMS) do
        local control = FarmDashboardSettingsMenu.CONTROLS[itemDef.id]
        if control and control.setDisabled then
            control:setDisabled(not canChange)
        end
    end
end

function FarmDashboardSettingsControls.onMenuOptionChanged(self, state, menuOption)
    local id = menuOption.id
    local itemDef = nil
    for _, def in ipairs(FarmDashboardSettingsMenu.ITEMS) do
        if def.id == id then itemDef = def break end
    end
    if not itemDef then return end

    local api = rawget(_G, "FarmDashboardSettingsApi")
    if not api or not api:canChangeSettings() then
        FarmDashboardSettingsMenu.syncControl(itemDef)
        return
    end

    local value = itemDef.values[state]
    if value == nil then return end
    if itemDef.toStore then value = itemDef.toStore(value) end

    if type(value) == "boolean" then
        api:setBool(itemDef.key, value)
    else
        api:setInt(itemDef.key, value)
    end
end

function FarmDashboardSettingsMenu.addSettingsToMenu()
    if FarmDashboardSettingsMenu.registered then return true end
    if not g_gui or not g_gui.screenControllers or not g_gui.screenControllers[InGameMenu] then
        return false
    end

    local inGameMenu = g_gui.screenControllers[InGameMenu]
    local settingsPage = inGameMenu.pageSettings
    if not settingsPage or not settingsPage.gameSettingsLayout or not settingsPage.multiVolumeVoiceBox then
        return false
    end

    FarmDashboardSettingsControls.name = settingsPage.name

    local function addMultiMenuOption(itemDef)
        local originalBox = settingsPage.multiVolumeVoiceBox
        local menuOptionBox = originalBox:clone(settingsPage.gameSettingsLayout)
        menuOptionBox.id = itemDef.id .. "box"

        local menuMultiOption = menuOptionBox.elements[1]
        menuMultiOption.id = itemDef.id
        menuMultiOption.target = FarmDashboardSettingsControls
        menuMultiOption:setCallback("onClickCallback", "onMenuOptionChanged")
        menuMultiOption:setDisabled(false)

        local l10nKey = "ui_settings_gameplay_fd_" .. itemDef.id
        local toolTip = menuMultiOption.elements[1]
        toolTip:setText(g_i18n:getText(l10nKey .. "_desc"))

        local settingLabel = menuOptionBox.elements[2]
        settingLabel:setText(g_i18n:getText(l10nKey))

        local optionStrings = itemDef.strings and itemDef.strings() or intStrings(itemDef.values)
        menuMultiOption:setTexts({ table.unpack(optionStrings) })
        menuMultiOption:setState(FarmDashboardSettingsMenu.getStateIndex(itemDef))

        updateFocusIds(menuOptionBox)
        table.insert(settingsPage.controlsList, menuOptionBox)
        FarmDashboardSettingsMenu.CONTROLS[itemDef.id] = menuMultiOption
        return menuOptionBox
    end

    local sectionTitle = nil
    for _, elem in ipairs(settingsPage.gameSettingsLayout.elements) do
        if elem.name == "sectionHeader" then
            sectionTitle = elem:clone(settingsPage.gameSettingsLayout)
            break
        end
    end

    if sectionTitle then
        sectionTitle:setText(g_i18n:getText("ui_settings_gameplay_category_farmDashboard"))
    else
        sectionTitle = TextElement.new()
        sectionTitle:applyProfile("fs25_settingsSectionHeader", true)
        sectionTitle:setText(g_i18n:getText("ui_settings_gameplay_category_farmDashboard"))
        sectionTitle.name = "sectionHeader"
        settingsPage.gameSettingsLayout:addElement(sectionTitle)
    end

    sectionTitle.focusId = FocusManager:serveAutoFocusId()
    table.insert(settingsPage.controlsList, sectionTitle)
    FarmDashboardSettingsMenu.CONTROLS.farmDashboardSection = sectionTitle

    for _, itemDef in ipairs(FarmDashboardSettingsMenu.ITEMS) do
        addMultiMenuOption(itemDef)
    end

    settingsPage.gameSettingsLayout:invalidateLayout()

    InGameMenuSettingsFrame.onFrameOpen = Utils.appendedFunction(InGameMenuSettingsFrame.onFrameOpen, function()
        FarmDashboardSettingsMenu.syncAllControls()
        FarmDashboardSettingsMenu.syncControlPermissions()
    end)

    FocusManager.setGui = Utils.appendedFunction(FocusManager.setGui, function(_, gui)
        if gui == "ingameMenuSettings" then
            for _, control in pairs(FarmDashboardSettingsMenu.CONTROLS) do
                if control.focusId and not FocusManager.currentFocusData.idToElementMapping[control.focusId] then
                    pcall(function()
                        FocusManager:loadElementFromCustomValues(control, nil, nil, false, false)
                    end)
                end
            end
            settingsPage.gameSettingsLayout:invalidateLayout()
        end
    end)

    FarmDashboardSettingsMenu.registered = true
    if FarmDashLog and FarmDashLog.dev then
        FarmDashLog.dev("Farm Dashboard settings injected into gameplay settings page")
    end
    return true
end

function FarmDashboardSettingsMenu.tryRegister()
    if FarmDashboardSettingsMenu.addSettingsToMenu() then return end
    if FarmDashboardSettingsMenu._deferredHook then return end
    FarmDashboardSettingsMenu._deferredHook = true

    if InGameMenu and InGameMenu.open then
        InGameMenu.open = Utils.appendedFunction(InGameMenu.open, function()
            FarmDashboardSettingsMenu.addSettingsToMenu()
        end)
    end
end
