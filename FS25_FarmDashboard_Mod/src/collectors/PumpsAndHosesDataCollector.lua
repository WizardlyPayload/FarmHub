-- Pumps N' Hoses 1.2.0.0: server-side status of owned umbilical pump vehicles.
-- The DLC sets mission.pumpsAndHoses on load and stores pumpIsActive and
-- pumpIsCirculating in spec_umbilicalPump. This does not cover stationary
-- equipment, hose networks, or cumulative slurry throughput.
PumpsAndHosesDataCollector = {}

local MAX_FARMS = 32
local MAX_VEHICLES = 1024

local function farmId(value)
    local id = tonumber(value)
    if id and id == id and id ~= math.huge and id ~= -math.huge
        and id > 0 and id ~= 100 and id % 1 == 0 then
        return id
    end
    return nil
end

local function safeCall(target, method)
    if type(target) ~= "table" or type(target[method]) ~= "function" then return nil end
    local ok, value = pcall(target[method], target)
    if ok then return value end
    return nil
end

function PumpsAndHosesDataCollector.collect(mission, farmInfo)
    if type(mission) ~= "table" or type(mission.pumpsAndHoses) ~= "table" then
        return { enabled = false }
    end

    local out = { enabled = true, schema = 1, authoritative = false,
        vehicleCoverage = "unknown", byFarm = {} }
    if safeCall(mission, "getIsServer") ~= true or type(farmInfo) ~= "table" then
        return out
    end

    local vehicles = type(mission.vehicleSystem) == "table" and mission.vehicleSystem.vehicles
    if type(vehicles) ~= "table" then return out end
    if #farmInfo > MAX_FARMS or #vehicles > MAX_VEHICLES then
        out.truncated = true
        return out
    end

    local byFarm = {}
    for i = 1, #farmInfo do
        local info = farmInfo[i]
        local id = type(info) == "table" and farmId(info.farmId or info.id) or nil
        if type(info) == "table" and info.isPlayer == true and id then
            byFarm[tostring(id)] = byFarm[tostring(id)] or {
                ownedVehiclePumps = 0, activeVehiclePumps = 0,
                circulatingVehiclePumps = 0,
            }
        end
    end

    -- VehicleSystem.vehicles is a dense array in FS25. Abort the entire
    -- snapshot on malformed entries or unknown ownership/state: a partial
    -- scan would otherwise make a farm's pump count look falsely complete.
    for i = 1, #vehicles do
        local vehicle = vehicles[i]
        if type(vehicle) ~= "table" then return out end
        local spec = vehicle.spec_umbilicalPump
        if type(spec) == "table" then
            local rawOwner = safeCall(vehicle, "getOwnerFarmId")
            -- The game's contractor pool is not a player farm.
            if tonumber(rawOwner) == 100 then rawOwner = 0 end
            local owner = rawOwner == 0 and 0 or farmId(rawOwner)
            if owner == nil then return out end
            local row = byFarm[tostring(owner)]
            if row then
                if type(spec.pumpIsActive) ~= "boolean"
                    or type(spec.pumpIsCirculating) ~= "boolean" then
                    return out
                end
                row.ownedVehiclePumps = row.ownedVehiclePumps + 1
                if spec.pumpIsActive then row.activeVehiclePumps = row.activeVehiclePumps + 1 end
                if spec.pumpIsCirculating then
                    row.circulatingVehiclePumps = row.circulatingVehiclePumps + 1
                end
            end
        end
    end

    out.authoritative = true
    out.vehicleCoverage = "complete"
    out.byFarm = byFarm
    return out
end
