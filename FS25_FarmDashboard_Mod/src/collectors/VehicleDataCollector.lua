-- FS25 FarmDashboard | VehicleDataCollector.lua | v2.4.0

VehicleDataCollector = {}

local ADS_SYSTEM_KEYS = {
    "engine", "transmission", "hydraulics", "cooling",
    "electrical", "chassis", "workprocess", "fuel"
}

local ADS_STATE_READY = "ads_spec_state_ready"
local ADS_STATE_BROKEN = "ads_spec_state_broken"

-- Mirrors ADS_InspectionDialog STATUS_PRIORITY (severity for dashboard warnings).
local ADS_INSPECTION_STATUS_PRIORITY = {
    ["ads_inspection_ok"] = 0,
    ["ads_inspection_status_not_required"] = 0,
    ["ads_inspection_status_slightly_low"] = 1,
    ["ads_inspection_status_slightly_darkened"] = 1,
    ["ads_inspection_status_slight_moisture"] = 1,
    ["ads_inspection_status_slightly_dirty"] = 1,
    ["ads_inspection_status_slightly_dry"] = 1,
    ["ads_inspection_status_low"] = 2,
    ["ads_inspection_status_darkened"] = 2,
    ["ads_inspection_status_seepage"] = 2,
    ["ads_inspection_status_dirty"] = 2,
    ["ads_inspection_status_dry"] = 2,
    ["ads_inspection_status_very_low"] = 3,
    ["ads_inspection_status_contaminated"] = 3,
    ["ads_inspection_status_active_leak"] = 3,
    ["ads_inspection_status_heavily_clogged"] = 3,
    ["ads_inspection_status_very_dry"] = 3,
    ["ads_inspection_status_critically_low"] = 4,
    ["ads_inspection_status_critical_condition"] = 4,
    ["ads_inspection_status_severe_leak"] = 4,
    ["ads_inspection_status_critically_clogged"] = 4,
    ["ads_inspection_status_critically_dry"] = 4,
}

local ADS_INSPECTION_TARGET_TITLE = {
    engineOil = "ads_inspection_engine_oil",
    coolant = "ads_inspection_coolant",
    hydraulicFluid = "ads_inspection_hydraulic_fluid",
    transmissionOil = "ads_inspection_transmission_oil",
    radiator = "ads_inspection_radiator",
    airIntake = "ads_inspection_air_duct",
    airFilter = "ads_inspection_air_filter",
    lubrication = "ads_inspection_lubrication_level",
}

local function adsInspectionPriority(statusKey)
    return ADS_INSPECTION_STATUS_PRIORITY[tostring(statusKey or "")] or 0
end

local function adsInspectionRow(titleKey, statusKey)
    return {
        statusKey = statusKey,
        severity = adsInspectionPriority(statusKey),
    }
end

local function adsInspectionSetRow(rows, titleKey, statusKey)
    if rows == nil or titleKey == nil or statusKey == nil then return end
    for fieldKey, rowTitle in pairs(ADS_INSPECTION_TARGET_TITLE) do
        if rowTitle == titleKey then
            local newPriority = adsInspectionPriority(statusKey)
            local currentPriority = adsInspectionPriority(rows[fieldKey] and rows[fieldKey].statusKey)
            if newPriority >= currentPriority then
                rows[fieldKey] = adsInspectionRow(titleKey, statusKey)
            end
            return
        end
    end
end

local function adsInspectionAppendNote(notes, textKey)
    if textKey == nil or textKey == "" then return end
    textKey = tostring(textKey)
    for _, existing in ipairs(notes) do
        if existing == textKey then return end
    end
    table.insert(notes, textKey)
end

function VehicleDataCollector:init()
    VehicleDataCollector._inc = nil
end

function VehicleDataCollector:_clamp01(value)
    local n = tonumber(value)
    if n == nil then return nil end
    if n < 0 then return 0 end
    if n > 1 then return 1 end
    return n
end

function VehicleDataCollector:_round3(value)
    local n = tonumber(value)
    if n == nil then return nil end
    return math.floor(n * 1000 + 0.5) / 1000
end

--- Pre-shift inspection rows (same rules as ADS_InspectionDialog).
function VehicleDataCollector:_buildAdsInspection(vehicle, spec)
    local rows = {
        engineOil = adsInspectionRow("ads_inspection_engine_oil", "ads_inspection_ok"),
        coolant = adsInspectionRow("ads_inspection_coolant", "ads_inspection_ok"),
        hydraulicFluid = adsInspectionRow("ads_inspection_hydraulic_fluid", "ads_inspection_ok"),
        transmissionOil = adsInspectionRow("ads_inspection_transmission_oil", "ads_inspection_ok"),
        radiator = adsInspectionRow("ads_inspection_radiator", "ads_inspection_ok"),
        airIntake = adsInspectionRow("ads_inspection_air_duct", "ads_inspection_ok"),
        airFilter = adsInspectionRow("ads_inspection_air_filter", "ads_inspection_ok"),
        lubrication = adsInspectionRow("ads_inspection_lubrication_level", "ads_inspection_ok"),
    }
    local notes = {}

    if spec.isVehicleNeedBlowOut == false then
        adsInspectionSetRow(rows, "ads_inspection_radiator", "ads_inspection_status_not_required")
        adsInspectionSetRow(rows, "ads_inspection_air_duct", "ads_inspection_status_not_required")
    end
    if spec.isVehicleNeedLubricate == false then
        adsInspectionSetRow(rows, "ads_inspection_lubrication_level", "ads_inspection_status_not_required")
    end

    local registry = _G.ADS_Breakdowns and _G.ADS_Breakdowns.BreakdownRegistry
    local activeBreakdowns = spec.activeBreakdowns
    if vehicle.getActiveBreakdowns then
        local ok, ab = pcall(function() return vehicle:getActiveBreakdowns() end)
        if ok and type(ab) == "table" then activeBreakdowns = ab end
    end
    if registry and activeBreakdowns then
        local targetMap = ADS_INSPECTION_TARGET_TITLE
        for breakdownId, breakdown in pairs(activeBreakdowns) do
            local registryEntry = registry[breakdownId]
            if type(registryEntry) == "table" and type(registryEntry.stages) == "table" then
                local stage = breakdown and tonumber(breakdown.stage) or 1
                local stageData = registryEntry.stages[stage]
                local findings = stageData and stageData.inspection
                if type(findings) == "table" then
                    for _, finding in ipairs(findings) do
                        if finding.target ~= nil and finding.status ~= nil then
                            local titleKey = targetMap[finding.target]
                            if titleKey ~= nil then
                                adsInspectionSetRow(rows, titleKey, finding.status)
                            end
                        end
                        adsInspectionAppendNote(notes, finding.additional)
                    end
                end
            end
        end
    end

    local radiatorClogging = math.min(1, math.max(0, tonumber(spec.radiatorClogging) or 0))
    if spec.isVehicleNeedBlowOut ~= false and radiatorClogging > 0.15 then
        local statusKey
        if radiatorClogging >= 0.85 then
            statusKey = "ads_inspection_status_critically_clogged"
            adsInspectionAppendNote(notes, "ads_inspection_hint_radiator_clogging_stage4")
        elseif radiatorClogging >= 0.60 then
            statusKey = "ads_inspection_status_heavily_clogged"
            adsInspectionAppendNote(notes, "ads_inspection_hint_radiator_clogging_stage3")
        elseif radiatorClogging >= 0.35 then
            statusKey = "ads_inspection_status_dirty"
            adsInspectionAppendNote(notes, "ads_inspection_hint_radiator_clogging_stage2")
        else
            statusKey = "ads_inspection_status_slightly_dirty"
            adsInspectionAppendNote(notes, "ads_inspection_hint_radiator_clogging_stage1")
        end
        adsInspectionSetRow(rows, "ads_inspection_radiator", statusKey)
    end

    local airIntakeClogging = math.min(1, math.max(0, tonumber(spec.airIntakeClogging) or 0))
    if spec.isVehicleNeedBlowOut ~= false and airIntakeClogging > 0.15 then
        local statusKey
        if airIntakeClogging >= 0.85 then
            statusKey = "ads_inspection_status_critically_clogged"
            adsInspectionAppendNote(notes, "ads_inspection_hint_air_intake_clogging_stage4")
        elseif airIntakeClogging >= 0.60 then
            statusKey = "ads_inspection_status_heavily_clogged"
            adsInspectionAppendNote(notes, "ads_inspection_hint_air_intake_clogging_stage3")
        elseif airIntakeClogging >= 0.35 then
            statusKey = "ads_inspection_status_dirty"
            adsInspectionAppendNote(notes, "ads_inspection_hint_air_intake_clogging_stage2")
        else
            statusKey = "ads_inspection_status_slightly_dirty"
            adsInspectionAppendNote(notes, "ads_inspection_hint_air_intake_clogging_stage1")
        end
        adsInspectionSetRow(rows, "ads_inspection_air_duct", statusKey)
    end

    if spec.isVehicleNeedLubricate ~= false then
        local lubricationLevel = math.min(1, math.max(0, tonumber(spec.lubricationLevel) or 0))
        local statusKey = nil
        if lubricationLevel <= 0.15 then
            statusKey = "ads_inspection_status_critically_dry"
            adsInspectionAppendNote(notes, "ads_inspection_hint_lubrication_stage4")
        elseif lubricationLevel <= 0.35 then
            statusKey = "ads_inspection_status_very_dry"
            adsInspectionAppendNote(notes, "ads_inspection_hint_lubrication_stage3")
        elseif lubricationLevel <= 0.60 then
            statusKey = "ads_inspection_status_dry"
            adsInspectionAppendNote(notes, "ads_inspection_hint_lubrication_stage2")
        elseif lubricationLevel <= 0.85 then
            statusKey = "ads_inspection_status_slightly_dry"
            adsInspectionAppendNote(notes, "ads_inspection_hint_lubrication_stage1")
        end
        if statusKey ~= nil then
            adsInspectionSetRow(rows, "ads_inspection_lubrication_level", statusKey)
        end
    end

    return rows, notes
end

function VehicleDataCollector:_serializeAdsBreakdownParts(vehicle, spec)
    local parts = {}
    local registry = _G.ADS_Breakdowns and _G.ADS_Breakdowns.BreakdownRegistry

    local activeBreakdowns = spec.activeBreakdowns
    if vehicle.getActiveBreakdowns then
        local ok, ab = pcall(function() return vehicle:getActiveBreakdowns() end)
        if ok and type(ab) == "table" then activeBreakdowns = ab end
    end
    if not activeBreakdowns then return parts end

    local partTypeOem = "ads_spec_part_types_oem"
    if _G.AdvancedDamageSystem and _G.AdvancedDamageSystem.PART_TYPES then
        partTypeOem = _G.AdvancedDamageSystem.PART_TYPES.OEM or partTypeOem
    end
    local srcQuickFix = 3
    local srcPoorParts = 2
    if _G.AdvancedDamageSystem and _G.AdvancedDamageSystem.BREAKDOWN_SOURCES then
        srcQuickFix = _G.AdvancedDamageSystem.BREAKDOWN_SOURCES.QUICK_FIX or srcQuickFix
        srcPoorParts = _G.AdvancedDamageSystem.BREAKDOWN_SOURCES.POOR_PARTS or srcPoorParts
    end

    -- Match ADS_WorkshopDialog: list every breakdown with isVisible (workshop jobs table).
    for breakdownId, breakdown in pairs(activeBreakdowns) do
        if type(breakdown) == "table" and breakdown.isVisible == true then
            local stage = tonumber(breakdown.stage) or 1
            local registryEntry = registry and registry[breakdownId]
            local stageData = registryEntry and registryEntry.stages and registryEntry.stages[stage]
            local stageSeverityKey = stageData and stageData.severity or nil
            if breakdown.isActive == false and breakdown.source == srcQuickFix then
                stageSeverityKey = "ads_breakdowns_quick_fix_stage"
            elseif breakdown.isActive == false and breakdown.source == srcPoorParts then
                stageSeverityKey = "ads_breakdowns_defected_parts_stage"
            end
            local row = {
                id = tostring(breakdownId),
                stage = stage,
                isActive = breakdown.isActive == true,
                isVisible = true,
                partKey = registryEntry and (registryEntry.part or registryEntry.system) or nil,
                stageSeverityKey = stageSeverityKey,
                repairPrice = nil,
            }
            if vehicle.getBreakdownRepairPrice then
                local okPrice, price = pcall(function()
                    return vehicle:getBreakdownRepairPrice(breakdownId, stage, partTypeOem)
                end)
                if okPrice and price ~= nil then
                    row.repairPrice = math.floor(tonumber(price) or 0)
                end
            end
            table.insert(parts, row)
        end
    end

    table.sort(parts, function(a, b)
        local sa = tonumber(a.stage) or 0
        local sb = tonumber(b.stage) or 0
        if sa ~= sb then return sa > sb end
        return tostring(a.id) < tostring(b.id)
    end)
    return parts
end

function VehicleDataCollector:_serializeAdsDate(dateValue)
    if type(dateValue) ~= "table" then return nil end
    local year = tonumber(dateValue.year)
    local month = tonumber(dateValue.month)
    if year == nil or month == nil then return nil end
    return { year = year, month = month }
end

--- Optional FS25_AdvancedDamageSystem (spec_AdvancedDamageSystem). Aggregate-only; no maintenance log dump.
function VehicleDataCollector:_serializeAdsData(vehicle)
    local ok, ads = pcall(function()
        local spec = vehicle and vehicle.spec_AdvancedDamageSystem
        if not spec or spec.isExcludedVehicle then
            return nil
        end

        local ads = { enabled = true }

    ads.condition = self:_round3(self:_clamp01(spec.conditionLevel))
    ads.serviceLevel = self:_round3(self:_clamp01(spec.serviceLevel))
    ads.reliability = self:_round3(self:_clamp01(spec.reliability))
    ads.maintainability = self:_round3(self:_clamp01(spec.maintainability))
    ads.year = tonumber(spec.year)
    ads.state = spec.currentState
    ads.inService = spec.currentState ~= nil
        and spec.currentState ~= ADS_STATE_READY
        and spec.currentState ~= ADS_STATE_BROKEN

    local okHours, hoursSince = pcall(function() return vehicle:getHoursSinceLastMaintenance() end)
    if okHours and hoursSince ~= nil then
        ads.hoursSinceMaintenance = self:_round3(tonumber(hoursSince))
    end
    local okInterval, interval = pcall(function() return vehicle:getMaintenanceInterval() end)
    if okInterval and interval ~= nil then
        ads.maintenanceInterval = self:_round3(tonumber(interval))
    end
    if ads.hoursSinceMaintenance ~= nil and ads.maintenanceInterval ~= nil and ads.maintenanceInterval > 0 then
        ads.intervalRatio = self:_round3(ads.hoursSinceMaintenance / ads.maintenanceInterval)
    end

    local okInspected, inspectedCondition = pcall(function()
        local value = vehicle:getLastInspectedCondition()
        if type(value) == "table" then return value[1] end
        return value
    end)
    if okInspected and inspectedCondition ~= nil then
        ads.inspectedCondition = self:_round3(self:_clamp01(inspectedCondition))
    end

    local okInspectedSvc, inspectedService = pcall(function()
        local value = vehicle:getLastInspectedService()
        if type(value) == "table" then return value[1] end
        return value
    end)
    if okInspectedSvc and inspectedService ~= nil then
        ads.inspectedService = self:_round3(self:_clamp01(inspectedService))
    end

    ads.realOperatingHours = nil
    if spec.realOperatingTime ~= nil then
        ads.realOperatingHours = self:_round3((tonumber(spec.realOperatingTime) or 0) / (60 * 60 * 1000))
    end

    ads.systems = {}
    if spec.systems then
        for _, key in ipairs(ADS_SYSTEM_KEYS) do
            local sys = spec.systems[key]
            if type(sys) == "table" and sys.enabled ~= false then
                ads.systems[key] = {
                    condition = self:_round3(self:_clamp01(sys.condition)),
                    stress = self:_round3(self:_clamp01(sys.stress))
                }
            end
        end
    end

    ads.breakdownParts = self:_serializeAdsBreakdownParts(vehicle, spec)
    ads.breakdownCount = #ads.breakdownParts
    ads.breakdowns = {}
    for _, part in ipairs(ads.breakdownParts) do
        table.insert(ads.breakdowns, part.id)
    end

    ads.engineTemp = self:_round3(tonumber(spec.engineTemperature))
    ads.transTemp = self:_round3(tonumber(spec.transmissionTemperature or spec.rawTransmissionTemperature))
    ads.batterySoc = self:_round3(self:_clamp01(spec.batterySoc))
    ads.radiatorClogging = self:_round3(self:_clamp01(spec.radiatorClogging))
    ads.airIntakeClogging = self:_round3(self:_clamp01(spec.airIntakeClogging))
    ads.lubricationLevel = self:_round3(self:_clamp01(spec.lubricationLevel))

    ads.inspection, ads.inspectionNotes = self:_buildAdsInspection(vehicle, spec)

    ads.ageMonths = tonumber(vehicle.age)
    local okSell, sellPrice = pcall(function()
        if vehicle.getSellPrice then
            return math.floor(tonumber(vehicle:getSellPrice()) or 0)
        end
        return nil
    end)
    if okSell and sellPrice ~= nil then ads.sellValue = sellPrice end
    local okBuy, buyPrice = pcall(function()
        if vehicle.getPrice then return math.floor(tonumber(vehicle:getPrice()) or 0) end
        return nil
    end)
    if okBuy and buyPrice ~= nil then ads.purchaseValue = buyPrice end

    if vehicle.getLastMaintenanceDate then
        local okLm, lmDate = pcall(function() return vehicle:getLastMaintenanceDate() end)
        if okLm then ads.lastMaintenanceDate = self:_serializeAdsDate(lmDate) end
    end
    if vehicle.getLastInspectionDate then
        local okLi, liDate = pcall(function() return vehicle:getLastInspectionDate() end)
        if okLi then ads.lastInspectionDate = self:_serializeAdsDate(liDate) end
    end

    ads.maintenanceSpend = 0
    if spec.maintenanceLog then
        for _, entry in ipairs(spec.maintenanceLog) do
            if type(entry) == "table" then
                ads.maintenanceSpend = ads.maintenanceSpend + (tonumber(entry.price) or 0)
            end
        end
    end

    return ads
    end)
    return ok and ads or nil
end

function VehicleDataCollector:isVehicleYearsLoaded()
    if _G.VehicleYears and _G.VehicleYears.modActivated then
        return true
    end
    if _G.g_modIsLoaded and _G.g_modIsLoaded["FS25_Vehicle_Years"] then
        return true
    end
    if _G.g_modManager and _G.g_modManager.getActiveModByName then
        local ok, mod = pcall(function()
            return _G.g_modManager:getActiveModByName("FS25_Vehicle_Years")
        end)
        if ok and mod ~= nil then return true end
    end
    return false
end

function VehicleDataCollector:_resolveStoreItem(vehicle)
    if not vehicle then return nil end
    if vehicle.storeItem and vehicle.storeItem.imageFilename then
        return vehicle.storeItem
    end
    if not _G.g_storeManager or not _G.g_storeManager.getItemByXMLFilename then
        return nil
    end
    local configFile = vehicle.configFileName
    if configFile == nil and vehicle.filename then
        configFile = vehicle.filename
    end
    if configFile == nil and vehicle.getConfigFileName then
        local ok, fn = pcall(function() return vehicle:getConfigFileName() end)
        if ok then configFile = fn end
    end
    if not configFile then return nil end

    local function tryLookup(path)
        if not path or path == "" then return nil end
        local ok, item = pcall(function()
            return _G.g_storeManager:getItemByXMLFilename(path)
        end)
        if ok and item then return item end
        local norm = string.gsub(path, "\\", "/")
        if norm ~= path then
            ok, item = pcall(function()
                return _G.g_storeManager:getItemByXMLFilename(norm)
            end)
            if ok and item then return item end
        end
        return nil
    end

    return tryLookup(configFile)
end

function VehicleDataCollector:_decadeFromModelYear(year)
    local y = tonumber(year)
    if y == nil then return nil, nil end
    if y < 1950 then return "pre1950", "< 1950" end
    if y < 1960 then return "1950s", "1950s" end
    if y < 1970 then return "1960s", "1960s" end
    if y < 1980 then return "1970s", "1970s" end
    if y < 1990 then return "1980s", "1980s" end
    if y < 2000 then return "1990s", "1990s" end
    if y < 2010 then return "2000s", "2000s" end
    if y < 2020 then return "2010s", "2010s" end
    if y < 2030 then return "2020s", "2020s" end
    return "2030s", "2030+"
end

--- Optional FS25_Vehicle_Years (storeItem.specs.year). Works with or without Advanced Damage System.
function VehicleDataCollector:_serializeVehicleYearsData(vehicle)
    if not self:isVehicleYearsLoaded() then
        return nil
    end

    local vy = { enabled = true }
    local adsSpec = vehicle and vehicle.spec_AdvancedDamageSystem

    if adsSpec and not adsSpec.isExcludedVehicle then
        local adsYear = tonumber(adsSpec.year)
        if adsYear then vy.modelYear = adsYear end
        vy.reliability = self:_round3(self:_clamp01(adsSpec.reliability))
        vy.maintainability = self:_round3(self:_clamp01(adsSpec.maintainability))
    end

    local storeItem = self:_resolveStoreItem(vehicle)
    if storeItem then
        if vy.modelYear == nil and storeItem.specs and storeItem.specs.year ~= nil then
            vy.modelYear = tonumber(storeItem.specs.year)
        end
        if _G.VehicleYears and _G.VehicleYears.getYear then
            local ok, yearVal = pcall(function() return _G.VehicleYears.getYear(storeItem) end)
            if ok and yearVal ~= nil then
                local parsed = tonumber(yearVal)
                if parsed then vy.modelYear = parsed end
            end
        end
        if storeItem.categoryName then vy.category = storeItem.categoryName end
        if storeItem.brandNameRaw then vy.brandRaw = storeItem.brandNameRaw end
        if storeItem.name then vy.storeName = storeItem.name end
    end

    if vy.reliability == nil and _G.AdvancedDamageSystem and _G.AdvancedDamageSystem.getBrandReliability then
        local ok, rel, maint = pcall(function()
            return _G.AdvancedDamageSystem.getBrandReliability(vehicle, storeItem)
        end)
        if ok and rel ~= nil then
            vy.reliability = self:_round3(self:_clamp01(rel))
            vy.maintainability = self:_round3(self:_clamp01(maint))
        end
    end

    vy.yearKnown = vy.modelYear ~= nil
    if vy.modelYear then
        vy.decadeId, vy.decadeLabel = self:_decadeFromModelYear(vy.modelYear)
    end

    return vy
end

function VehicleDataCollector:cleanupTypeName(typeName)
    if not typeName or typeName == "" then
        return "Unknown"
    end

    local typeCleanupMap = {
        ["implementDynamicMountAttacher"] = "Attachment",
        ["teleHandler"] = "Telehandler",
        ["trailer"] = "Trailer",
        ["waterTrailer"] = "Water Trailer",
        ["manureTrailer"] = "Manure Trailer",
        ["livestockTrailer"] = "Livestock Trailer",
        ["augerWagon"] = "Auger Wagon",
        ["mixerWagon"] = "Mixer Wagon",
        ["forestryExcavator"] = "Forestry Excavator"
    }

    if typeCleanupMap[typeName] then
        return typeCleanupMap[typeName]
    end

    local cleaned = typeName:gsub("(%l)(%u)", "%1 %2")
    cleaned = cleaned:gsub("(%a)([%w_']*)", function(first, rest)
        return first:upper() .. rest:lower()
    end)

    return cleaned
end

--- Read-only: never assign into g_currentMission.vehicles (can disturb buy/spawn on DS).
function VehicleDataCollector:ensureVehicleTable()
    if not _G.g_currentMission then return nil end
    if _G.g_currentMission.vehicles then
        return _G.g_currentMission.vehicles
    end
    if _G.g_currentMission.vehicleSystem and _G.g_currentMission.vehicleSystem.vehicles then
        return _G.g_currentMission.vehicleSystem.vehicles
    end
    if _G.g_currentMission.ownedVehicles then
        return _G.g_currentMission.ownedVehicles
    end
    return nil
end

--- Best-effort liveness check before touching specs on a multi-frame snapshot entry.
--- FS25_UsedEquipmentYards: yard listing stock is a real Vehicle in the world but not player fleet.
function VehicleDataCollector:_isUsedEquipmentYardStock(vehicle)
    if vehicle == nil then return false end
    local uey = rawget(_G, "UsedEquipmentYards")
    if uey == nil or type(uey.vehicleToItem) ~= "table" then
        return false
    end
    return uey.vehicleToItem[vehicle] ~= nil
end

function VehicleDataCollector:_isVehicleAlive(vehicle)
    if vehicle == nil then return false end
    -- Skip half-spawned entries (AccessHandler / Courseplay expect full vehicle methods).
    if type(vehicle.getOwnerFarmId) ~= "function" or type(vehicle.getName) ~= "function" then
        return false
    end
    local ok, alive = pcall(function()
        if type(vehicle.getIsDeleted) == "function" then
            return vehicle:getIsDeleted() ~= true
        end
        if vehicle.rootNode and type(entityExists) == "function" then
            return entityExists(vehicle.rootNode)
        end
        if vehicle.rootNode then return true end
        return vehicle.id ~= nil
    end)
    return ok and alive == true
end

function VehicleDataCollector:_serializeVehicle(vehicle, vehicleCount)
    local vData = {}

    vData.id = vehicle.id or vehicleCount
    vData.typeName = self:cleanupTypeName(vehicle.typeName or "Unknown")
    vData.brand = vehicle.brand or "Unknown"
    vData.price = vehicle.price or 0
    vData.age = vehicle.age or 0
    vData.operatingTime = vehicle.operatingTime or 0

    vData.name = "Unknown"
    if vehicle.getName then
        local success, name = pcall(function() return vehicle:getName() end)
        if success and name then
            vData.name = name
        end
    end

    vData.ownerFarmId = 0
    if vehicle.getOwnerFarmId then
        local success, farmId = pcall(function() return vehicle:getOwnerFarmId() end)
        if success and farmId then
            vData.ownerFarmId = farmId
        end
    end

    vData.position = { x = 0, y = 0, z = 0 }
    if vehicle.rootNode then
        local success, x, y, z = pcall(getWorldTranslation, vehicle.rootNode)
        if success and x and y and z then
            vData.position = { x = x, y = y, z = z }
        end
    end

    if vehicle.spec_motorized then
        local okMotor, motorData = pcall(function()
            local motor = vehicle.spec_motorized
            local out = { isMotorized = true, engineOn = motor.isMotorStarted or false, fuelLevel = 0, fuelCapacity = 0, speed = 0 }
            if motor.consumersByFillTypeName then
                local diesel = motor.consumersByFillTypeName["DIESEL"]
                if diesel then
                    out.fuelLevel = diesel.fillLevel or 0
                    out.fuelCapacity = diesel.capacity or 0
                end
            end
            if vehicle.getLastSpeed then
                local okSpd, speed = pcall(function() return vehicle:getLastSpeed() end)
                if okSpd and speed then out.speed = speed end
            end
            return out
        end)
        if okMotor and motorData then
            vData.isMotorized = motorData.isMotorized
            vData.engineOn = motorData.engineOn
            vData.fuelLevel = motorData.fuelLevel
            vData.fuelCapacity = motorData.fuelCapacity
            vData.speed = motorData.speed
        else
            vData.isMotorized = true
            vData.engineOn = false
            vData.fuelLevel = 0
            vData.fuelCapacity = 0
            vData.speed = 0
        end
    else
        vData.isMotorized = false
        vData.engineOn = false
        vData.fuelLevel = 0
        vData.fuelCapacity = 0
        vData.speed = 0
    end

    vData.fillLevels = {}
    local okFill, fillLevels = pcall(function()
        local levels = {}
        if vehicle.spec_fillUnit and vehicle.spec_fillUnit.fillUnits then
            for _, fillUnit in pairs(vehicle.spec_fillUnit.fillUnits) do
                if fillUnit.fillType and fillUnit.fillLevel and fillUnit.capacity then
                    local fillTypeName = "unknown"
                    if _G.g_fillTypeManager and _G.g_fillTypeManager.getFillTypeNameByIndex then
                        local success, name = pcall(function()
                            return _G.g_fillTypeManager:getFillTypeNameByIndex(fillUnit.fillType)
                        end)
                        if success and name then
                            fillTypeName = name
                        end
                    end
                    levels[fillTypeName] = {
                        level = fillUnit.fillLevel,
                        capacity = fillUnit.capacity
                    }
                end
            end
        end
        return levels
    end)
    if okFill and type(fillLevels) == "table" then
        vData.fillLevels = fillLevels
    end

    vData.damage = 0
    if vehicle.getDamageAmount then
        local success, damage = pcall(function() return vehicle:getDamageAmount() end)
        if success and damage then
            vData.damage = damage
        end
    end

    vData.attachedImplementsCount = 0
    if vehicle.getAttachedImplements then
        local success, implements = pcall(function() return vehicle:getAttachedImplements() end)
        if success and implements then
            vData.attachedImplementsCount = #implements
        end
    end

    vData.vehicleType = "unknown"
    local okType, vehicleType = pcall(function()
        if vehicle.spec_motorized then
            return "motorized"
        elseif vehicle.spec_trailer then
            return "trailer"
        elseif vehicle.spec_harvester then
            return "harvester"
        elseif vehicle.spec_sprayer then
            return "sprayer"
        elseif vehicle.spec_spreader then
            return "spreader"
        elseif vehicle.spec_cultivator then
            return "cultivator"
        elseif vehicle.spec_plow then
            return "plow"
        elseif vehicle.spec_sowingMachine then
            return "seeder"
        elseif vehicle.spec_attachable then
            return "implement"
        end
        return "unknown"
    end)
    if okType and vehicleType then
        vData.vehicleType = vehicleType
    end

    local okAds, ads = pcall(function() return self:_serializeAdsData(vehicle) end)
    if okAds and ads then
        vData.ads = ads
        if ads.condition ~= nil then
            vData.damage = 1 - ads.condition
        end
    end

    local vy = self:_serializeVehicleYearsData(vehicle)
    if vy then
        vData.vehicleYears = vy
    end

    local storeItem = self:_resolveStoreItem(vehicle)
    if storeItem and storeItem.name then
        vData.storeName = storeItem.name
    end
    -- Authoritative store icon key: the game's own store image basename (e.g. ".../store_t7.dds"
    -- -> "store_t7"). The desktop app keys its shipped image library by exactly this token, so
    -- exporting it lets the dashboard pick the correct picture instead of fuzzy-matching the
    -- localized display name (which mis-picks sibling/variant icons). Basename only — no path.
    if storeItem and storeItem.imageFilename then
        local img = tostring(storeItem.imageFilename)
        local leaf = string.match(img, "([^/\\]+)$") or img
        leaf = string.gsub(leaf, "%.%w+$", "")
        if leaf ~= nil and leaf ~= "" then
            vData.storeImage = string.lower(leaf)
        end
    end
    if vehicle.configFileName then
        vData.configFileName = vehicle.configFileName
    elseif vehicle.getConfigFileName then
        local okCfg, cfgFn = pcall(function() return vehicle:getConfigFileName() end)
        if okCfg and cfgFn then vData.configFileName = cfgFn end
    end

    if self:_isUsedEquipmentYardStock(vehicle) then
        vData.isUsedEquipmentYardStock = true
    end

    return vData
end

function VehicleDataCollector:_cacheRowKey(row)
    if row == nil then return nil end
    if row.id ~= nil then return "id:" .. tostring(row.id) end
    return string.format("n:%s:f:%s", tostring(row.name or ""), tostring(row.ownerFarmId or 0))
end

function VehicleDataCollector:upsertVehicleInCache(vehicle)
    if not self:_isVehicleAlive(vehicle) then return end
    local dc = rawget(_G, "FarmDashboardDataCollector")
    if not dc then return end
    local ok, row = pcall(function() return self:_serializeVehicle(vehicle, 0) end)
    if not ok or type(row) ~= "table" then return end
    local list = dc.moduleCache.vehicles
    if type(list) ~= "table" then
        list = {}
        dc.moduleCache.vehicles = list
    end
    local key = self:_cacheRowKey(row)
    local replaced = false
    for i, existing in ipairs(list) do
        if self:_cacheRowKey(existing) == key then
            list[i] = row
            replaced = true
            break
        end
    end
    if not replaced then
        table.insert(list, row)
    end
end

function VehicleDataCollector:removeVehicleFromCache(vehicle)
    local dc = rawget(_G, "FarmDashboardDataCollector")
    if not dc then return end
    local list = dc.moduleCache.vehicles
    if type(list) ~= "table" then return end
    local id = vehicle and vehicle.id
    for i = #list, 1, -1 do
        local row = list[i]
        if row and id ~= nil and row.id == id then
            table.remove(list, i)
        end
    end
end

function VehicleDataCollector:refreshIncrementalCacheRows()
    local dc = rawget(_G, "FarmDashboardDataCollector")
    if not dc or type(dc.usesCourseplayIncrementalFleet) ~= "function" then return end
    local okInc, incremental = pcall(function() return dc:usesCourseplayIncrementalFleet() end)
    if not okInc or incremental ~= true then return end

    local list = dc.moduleCache and dc.moduleCache.vehicles
    if type(list) ~= "table" or #list == 0 then return end

    local vehicles = self:ensureVehicleTable()
    if not vehicles then return end

    local byId = {}
    for _, vehicle in pairs(vehicles) do
        if vehicle and vehicle.id then byId[vehicle.id] = vehicle end
    end
    for _, row in ipairs(list) do
        local vehicle = row and row.id and byId[row.id]
        if vehicle and self:_isVehicleAlive(vehicle) then
            self:upsertVehicleInCache(vehicle)
        end
    end
end

function VehicleDataCollector:collectBegin()
    local dc = rawget(_G, "FarmDashboardDataCollector")
    if dc and dc.shouldSkipLiveFleetScan and dc:shouldSkipLiveFleetScan() then
        VehicleDataCollector._inc = { skipLive = true }
        return
    end
    if dc and dc.mayScanLiveFleet and not dc:mayScanLiveFleet() then
        VehicleDataCollector._inc = { skipLive = true }
        return
    end
    VehicleDataCollector._inc = { list = {}, idx = 1, out = {} }
    local st = VehicleDataCollector._inc
    local vehicles = self:ensureVehicleTable()
    if not vehicles then
        st.empty = true
        return
    end
    for _, vehicle in pairs(vehicles) do
        if self:_isVehicleAlive(vehicle) then
            table.insert(st.list, vehicle)
        end
    end
end

--- @return boolean done, table vehicleArray
function VehicleDataCollector:collectStep(opts)
    local st = VehicleDataCollector._inc
    if not st then return true, {} end
    if st.skipLive then
        VehicleDataCollector._inc = nil
        local dc = rawget(_G, "FarmDashboardDataCollector")
        self:refreshIncrementalCacheRows()
        local cached = dc and dc.moduleCache and dc.moduleCache.vehicles
        return true, cached or {}
    end
    if st.empty then
        VehicleDataCollector._inc = nil
        return true, {}
    end

    local batch = math.max(1, tonumber(opts and opts.vehicleBatch) or 12)
    local n = #st.list
    local hi = math.min(st.idx + batch - 1, n)
    for i = st.idx, hi do
        local vehicle = st.list[i]
        if self:_isVehicleAlive(vehicle) then
            local ok, row = pcall(function() return self:_serializeVehicle(vehicle, i) end)
            if ok and row then
                table.insert(st.out, row)
            elseif not ok and FarmDashLog and FarmDashLog.devWarn then
                FarmDashLog.devWarn("VehicleDataCollector: skip vehicle %s: %s", tostring(i), tostring(row))
            end
        end
    end
    st.idx = hi + 1

    if st.idx > n then
        VehicleDataCollector._inc = nil
        return true, st.out
    end
    return false, st.out
end

function VehicleDataCollector:collect()
    local dc = rawget(_G, "FarmDashboardDataCollector")
    if dc and ((dc.shouldSkipLiveFleetScan and dc:shouldSkipLiveFleetScan())
        or (dc.mayScanLiveFleet and not dc:mayScanLiveFleet())) then
        local cached = dc.moduleCache and dc.moduleCache.vehicles
        return cached or {}
    end
    local vehicleData = {}
    local vehicles = self:ensureVehicleTable()
    if not vehicles then return vehicleData end

    local vehicleCount = 0
    for _, vehicle in pairs(vehicles) do
        if self:_isVehicleAlive(vehicle) then
            vehicleCount = vehicleCount + 1
            table.insert(vehicleData, self:_serializeVehicle(vehicle, vehicleCount))
        end
    end

    return vehicleData
end
