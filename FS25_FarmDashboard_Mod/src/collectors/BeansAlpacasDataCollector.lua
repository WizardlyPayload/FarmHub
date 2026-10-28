-- Optional, read-only Beans & Alpacas Expansion snapshot. No DLC dependency.
BeansAlpacasDataCollector = {}

local function safeNumber(value)
    local n = tonumber(value)
    if n == nil or n ~= n or n == math.huge or n == -math.huge then return nil end
    return n
end

local function safeCall(target, method, ...)
    if type(target) ~= "table" or type(target[method]) ~= "function" then return nil end
    local ok, value = pcall(target[method], target, ...)
    if ok then return value end
    return nil
end

function BeansAlpacasDataCollector.collect(mission, farmInfo)
    if type(mission) ~= "table" then return { enabled = false } end
    local rail = mission.bananaRailSystem
    local disease = mission.orchardDiseaseSettings
    local frost = mission.frostDamageSettings
    if type(rail) ~= "table" and type(disease) ~= "table" and type(frost) ~= "table" then
        return { enabled = false }
    end

    local out = { enabled = true, schema = 1 }
    local mapId = mission.missionInfo and mission.missionInfo.mapId
    out.catuaiMap = type(mapId) == "string" and mapId:find("pdlc_beansAndAlpacasPack.", 1, true) == 1
    if type(disease) == "table" then
        local value = safeCall(disease, "getDiseaseEnabled")
        if type(value) == "boolean" then out.orchardDiseaseEnabled = value end
    end
    if type(frost) == "table" then
        local value = safeCall(frost, "getFrostDamageEnabled")
        if type(value) == "boolean" then out.frostDamageEnabled = value end
    end

    -- FrostDamageSystem keeps a server-only fruit-wide pending table. A
    -- pending flag means that fruit type can wither at the next growth period;
    -- it is not evidence of damage to any particular orchard or field. Never
    -- treat a client-local empty table as an authoritative "no warning".
    local frostSystem = mission.frostDamageSystem
    if type(frostSystem) == "table" and frostSystem.isServer == true
        and type(frostSystem.pendingFrostByFruit) == "table" then
        local pending = {}
        for index, flagged in pairs(frostSystem.pendingFrostByFruit) do
            if flagged == true then
                local fruit = safeCall(g_fruitTypeManager, "getFruitTypeByIndex", tonumber(index))
                local name = fruit and fruit.name
                if type(name) == "string" and name ~= "" then
                    if #pending < 64 then
                        pending[#pending + 1] = name
                    else
                        out.frostPendingTruncated = true
                    end
                end
            end
        end
        table.sort(pending)
        out.frostPendingFruitTypes = pending
        out.frostPendingKnown = true
    end

    local manager = type(rail) == "table" and rail.workerManager or nil
    if type(manager) == "table" then
        out.workersByFarm = {}
        local ids, seen = {}, {}
        if type(farmInfo) == "table" then
            for _, row in pairs(farmInfo) do
                local id = type(row) == "table" and safeNumber(row.farmId or row.id) or nil
                if id and id > 0 and not seen[id] and #ids < 32 then
                    ids[#ids + 1], seen[id] = id, true
                end
            end
        else
            local id = safeNumber(farmInfo)
            if id and id > 0 then ids[1] = id end
        end
        for _, fid in ipairs(ids) do
            -- Manager methods report a valid zero even before the farm's
            -- bananaWorkers state is initialized.
            local count = safeNumber(safeCall(manager, "getNumWorkers", fid))
            local state = safeCall(manager, "getFarmState", fid)
            if count ~= nil then
                local used = type(state) == "table" and math.max(0, safeNumber(state.actionsUsedToday) or 0) or 0
                local actionsPerWorker = math.max(0, safeNumber(manager.actionsPerWorkerPerDay) or 0)
                out.workersByFarm[tostring(fid)] = {
                    count = math.max(0, count),
                    maxCount = safeNumber(manager.maxNumWorkers),
                    actionsUsedToday = used,
                    actionsRemainingToday = math.max(0, count * actionsPerWorker - used),
                    dailyWagePerWorker = safeNumber(manager.costPerWorkerPerDay),
                    washingStations = safeNumber(safeCall(manager, "getNumWashingStations", fid)),
                    bananaPlants = safeNumber(safeCall(manager, "getTotalBananaPlantCount", fid)),
                    plantsInWorkerReach = safeNumber(safeCall(manager, "getInReachPlantCount", fid)),
                    estimatedDailyActions = safeNumber(safeCall(manager, "getEstimatedDailyDemand", fid)),
                }
            end
        end
    end

    -- Washing stations are production points, but the rail system reserves
    -- incoming bananas before they arrive. The ordinary production storage
    -- snapshot cannot show that reservation. Keep this farm-scoped and omit
    -- totals if even one owned station cannot be measured.
    local placeables = mission.placeableSystem and mission.placeableSystem.placeables
    if type(placeables) == "table" then
        local capacityByFarm = {}
        for _, placeable in pairs(placeables) do
            if safeCall(placeable, "getIsBananaWashingStation") == true then
                local farmId = safeNumber(safeCall(placeable, "getOwnerFarmId"))
                if farmId and farmId > 0 then
                    local key = tostring(farmId)
                    local row = capacityByFarm[key]
                    if not row then
                        row = { stationCount = 0, measuredStations = 0, freeLitres = 0, availableLitres = 0 }
                        capacityByFarm[key] = row
                    end
                    row.stationCount = row.stationCount + 1
                    local free = safeNumber(safeCall(placeable, "getFreeBananaCapacity"))
                    local available = safeNumber(safeCall(placeable, "getAvailableBananaCapacity"))
                    if free and available and free >= 0 and available >= 0 then
                        row.measuredStations = row.measuredStations + 1
                        row.freeLitres = row.freeLitres + free
                        row.availableLitres = row.availableLitres + available
                    end
                end
            end
        end
        for _, row in pairs(capacityByFarm) do
            if row.measuredStations ~= row.stationCount then
                row.freeLitres, row.availableLitres = nil, nil
            end
        end
        if next(capacityByFarm) then out.washingCapacityByFarm = capacityByFarm end
    end

    -- The Catuaí map has its own collectible hunt. Export counts only, not
    -- undiscovered coordinates or names (which would spoil gameplay).
    local collectibles = mission.collectiblesSystem
    if out.catuaiMap and type(collectibles) == "table" and type(collectibles.collectibles) == "table" then
        local total, found, uncovered = 0, 0, 0
        for _, info in pairs(collectibles.collectibles) do
            if type(info) == "table" and info.index ~= nil then
                total = total + 1
                if type(collectibles.collected) == "table" and collectibles.collected[info.index] == true then
                    found = found + 1
                elseif info.uncovered == true then
                    uncovered = uncovered + 1
                end
            end
        end
        out.collectibles = { total = total, found = found, uncovered = uncovered }
    end
    return out
end
