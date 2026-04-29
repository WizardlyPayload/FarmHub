-- FS25 FarmDashboard | VehicleDataCollector.lua | v2.1.0

VehicleDataCollector = {}

function VehicleDataCollector:init()
    VehicleDataCollector._inc = nil
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

function VehicleDataCollector:ensureVehicleTable()
    if not _G.g_currentMission then return nil end
    if not _G.g_currentMission.vehicles then
        if _G.g_currentMission.vehicleSystem and _G.g_currentMission.vehicleSystem.vehicles then
            _G.g_currentMission.vehicles = _G.g_currentMission.vehicleSystem.vehicles
        elseif _G.g_currentMission.ownedVehicles then
            _G.g_currentMission.vehicles = _G.g_currentMission.ownedVehicles
        else
            return nil
        end
    end
    return _G.g_currentMission.vehicles
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
        vData.isMotorized = true
        vData.engineOn = vehicle.spec_motorized.isMotorStarted or false

        if vehicle.spec_motorized.consumersByFillTypeName then
            local diesel = vehicle.spec_motorized.consumersByFillTypeName["DIESEL"]
            if diesel then
                vData.fuelLevel = diesel.fillLevel or 0
                vData.fuelCapacity = diesel.capacity or 0
            else
                vData.fuelLevel = 0
                vData.fuelCapacity = 0
            end
        end

        vData.speed = 0
        if vehicle.getLastSpeed then
            local success, speed = pcall(function() return vehicle:getLastSpeed() end)
            if success and speed then
                vData.speed = speed
            end
        end
    else
        vData.isMotorized = false
        vData.engineOn = false
        vData.fuelLevel = 0
        vData.fuelCapacity = 0
        vData.speed = 0
    end

    vData.fillLevels = {}
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

                vData.fillLevels[fillTypeName] = {
                    level = fillUnit.fillLevel,
                    capacity = fillUnit.capacity
                }
            end
        end
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
    if vehicle.spec_motorized then
        vData.vehicleType = "motorized"
    elseif vehicle.spec_trailer then
        vData.vehicleType = "trailer"
    elseif vehicle.spec_harvester then
        vData.vehicleType = "harvester"
    elseif vehicle.spec_sprayer then
        vData.vehicleType = "sprayer"
    elseif vehicle.spec_spreader then
        vData.vehicleType = "spreader"
    elseif vehicle.spec_cultivator then
        vData.vehicleType = "cultivator"
    elseif vehicle.spec_plow then
        vData.vehicleType = "plow"
    elseif vehicle.spec_sowingMachine then
        vData.vehicleType = "seeder"
    elseif vehicle.spec_attachable then
        vData.vehicleType = "implement"
    end

    return vData
end

function VehicleDataCollector:collectBegin()
    VehicleDataCollector._inc = { list = {}, idx = 1, out = {} }
    local st = VehicleDataCollector._inc
    local vehicles = self:ensureVehicleTable()
    if not vehicles then
        st.empty = true
        return
    end
    for _, vehicle in pairs(vehicles) do
        table.insert(st.list, vehicle)
    end
end

--- @return boolean done, table vehicleArray
function VehicleDataCollector:collectStep(opts)
    local st = VehicleDataCollector._inc
    if not st then return true, {} end
    if st.empty then
        VehicleDataCollector._inc = nil
        return true, {}
    end

    local batch = math.max(1, tonumber(opts and opts.vehicleBatch) or 12)
    local n = #st.list
    local hi = math.min(st.idx + batch - 1, n)
    for i = st.idx, hi do
        table.insert(st.out, self:_serializeVehicle(st.list[i], i))
    end
    st.idx = hi + 1

    if st.idx > n then
        VehicleDataCollector._inc = nil
        return true, st.out
    end
    return false, st.out
end

function VehicleDataCollector:collect()
    local vehicleData = {}
    local vehicles = self:ensureVehicleTable()
    if not vehicles then return vehicleData end

    local vehicleCount = 0
    for _, vehicle in pairs(vehicles) do
        vehicleCount = vehicleCount + 1
        table.insert(vehicleData, self:_serializeVehicle(vehicle, vehicleCount))
    end

    return vehicleData
end
