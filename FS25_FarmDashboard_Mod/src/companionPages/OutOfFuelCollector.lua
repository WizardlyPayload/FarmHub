-- FS25 FarmDashboard | companionPages/OutOfFuelCollector.lua | v1.0.0
-- Out Of Fuel (Sablerock 1.0.0.0). The mod replaces Motorized:onPostLoad so the vanilla "top every
-- propellant up to 10 % and bill the farm" step on savegame load no longer runs. Mod-env table read here:
--   OutOfFuel { patched, keepVanillaRefill, verbose }
-- The mod keeps no runtime state per vehicle, so the fleet part is the game's own fuel reading
-- (spec_motorized.consumersByFillTypeName + getFillUnitFillLevel/Capacity) measured against the same
-- 10 % floor and cost formula (delta * economyManager:getCostPerLiter * 2) the vanilla step used.

local SCAN_VEHICLES = 400
local MAX_ROWS = 40
local MAX_CONSUMERS = 6
local VANILLA_FLOOR = 0.10
local VANILLA_COST_FACTOR = 2.0

local function vehicleLabel(ctx, vehicle)
    local name = ctx.call(vehicle, "getFullName")
    if type(name) ~= "string" or name == "" then
        name = ctx.call(vehicle, "getName")
    end
    if type(name) ~= "string" or name == "" then
        name = type(vehicle.typeName) == "string" and vehicle.typeName or nil
    end
    return ctx.clip(name, 60)
end

local function vehicleId(ctx, vehicle, index)
    local id = vehicle.uniqueId or vehicle.id or index
    return ctx.clip(tostring(id), 64)
end

--- Farm vehicles, bounded. Uses ctx.ownedVehicles() when the registry provides a per-cycle list.
local function ownedVehicles(ctx)
    local farmId = ctx.farmId
    local shared = type(ctx.ownedVehicles) == "function" and ctx.try(ctx.ownedVehicles) or nil
    local source = type(shared) == "table" and shared or nil
    if source == nil then
        local mission = ctx.mission
        local system = type(mission) == "table" and mission.vehicleSystem or nil
        source = type(system) == "table" and type(system.vehicles) == "table" and system.vehicles or nil
    end
    if source == nil then
        return nil, false
    end
    local out, scanned, truncated = {}, 0, false
    local function consider(vehicle)
        scanned = scanned + 1
        if scanned > SCAN_VEHICLES then
            truncated = true
            return false
        end
        if type(vehicle) == "table" then
            local owner = ctx.num(vehicle.ownerFarmId) or ctx.num(ctx.call(vehicle, "getOwnerFarmId"))
            if owner == farmId then
                out[#out + 1] = vehicle
            end
        end
        return true
    end
    if #source > 0 then
        for i = 1, #source do
            if not consider(source[i]) then
                break
            end
        end
    else
        for _, vehicle in pairs(source) do
            if not consider(vehicle) then
                break
            end
        end
    end
    return out, truncated
end

local function readSettings(ctx, mod)
    if type(mod) ~= "table" then
        return nil
    end
    return {
        patched = mod.patched == true,
        keepVanillaRefill = mod.keepVanillaRefill == true,
        verbose = mod.verbose == true,
    }
end

local function readConsumers(ctx, vehicle, spec, economy)
    local fuels, n = {}, 0
    local lowestPct, topUpLitres, topUpCost = nil, 0, 0
    local costKnown = false
    for name, consumer in pairs(spec.consumersByFillTypeName) do
        n = n + 1
        if n > MAX_CONSUMERS then
            break
        end
        if type(consumer) == "table" then
            local unit = consumer.fillUnitIndex
            local level = ctx.num(ctx.call(vehicle, "getFillUnitFillLevel", unit))
            local capacity = ctx.num(ctx.call(vehicle, "getFillUnitCapacity", unit))
            local row = { fillType = ctx.clip(tostring(name), 40), level = ctx.round2(level), capacity = ctx.round2(capacity) }
            if level ~= nil and capacity ~= nil and capacity > 0 then
                local pct = math.max(0, math.min(100, level / capacity * 100))
                row.pct = ctx.round2(pct)
                lowestPct = lowestPct == nil and pct or math.min(lowestPct, pct)
                local floor = capacity * VANILLA_FLOOR
                if level < floor then
                    local delta = floor - level
                    row.topUpLitres = ctx.round2(delta)
                    topUpLitres = topUpLitres + delta
                    local perLiter = economy and ctx.num(ctx.call(economy, "getCostPerLiter", consumer.fillType)) or nil
                    if perLiter ~= nil then
                        local cost = delta * perLiter * VANILLA_COST_FACTOR
                        row.topUpCost = ctx.round2(cost)
                        topUpCost = topUpCost + cost
                        costKnown = true
                    end
                end
            end
            fuels[#fuels + 1] = row
        end
    end
    return fuels, lowestPct, topUpLitres, costKnown and topUpCost or nil
end

CompanionPages.register({
    key = "outOfFuel",
    modNames = { "FS25_OutOfFuel", "FS25_342105_Out_Of_Fuel" },
    substrings = { "outoffuel", "out_of_fuel" },
    collect = function(ctx)
        local mod = ctx.symbol("OutOfFuel")
        local out = { settings = readSettings(ctx, mod), floorPct = VANILLA_FLOOR * 100 }
        if ctx.farmId == nil or ctx.farmId <= 0 then
            out.readState = type(mod) == "table" and "settings-only" or "detection-only"
            out.reason = "no-farm"
            return out
        end
        local vehicles, truncated = ownedVehicles(ctx)
        if vehicles == nil then
            out.readState = type(mod) == "table" and "settings-only" or "detection-only"
            out.reason = "no-vehicle-list"
            return out
        end
        local economy = type(ctx.mission) == "table" and ctx.mission.economyManager or nil
        local farm = {
            motorizedCount = 0,
            emptyCount = 0,
            belowFloorCount = 0,
            topUpLitres = 0,
            vehicles = {},
        }
        local rows, costSum, costSeen = {}, 0, false
        for i, vehicle in ipairs(vehicles) do
            local spec = vehicle.spec_motorized
            if type(spec) == "table" and type(spec.consumersByFillTypeName) == "table" then
                farm.motorizedCount = farm.motorizedCount + 1
                local fuels, lowestPct, litres, cost = readConsumers(ctx, vehicle, spec, economy)
                local row = {
                    id = vehicleId(ctx, vehicle, i),
                    name = vehicleLabel(ctx, vehicle),
                    fuels = fuels,
                    lowestPct = ctx.round2(lowestPct),
                    belowFloor = litres > 0,
                    empty = lowestPct ~= nil and lowestPct <= 0,
                    topUpLitres = litres > 0 and ctx.round2(litres) or nil,
                    topUpCost = cost ~= nil and ctx.round2(cost) or nil,
                }
                if row.empty then
                    farm.emptyCount = farm.emptyCount + 1
                end
                if row.belowFloor then
                    farm.belowFloorCount = farm.belowFloorCount + 1
                    farm.topUpLitres = farm.topUpLitres + litres
                end
                if cost ~= nil then
                    costSum = costSum + cost
                    costSeen = true
                end
                rows[#rows + 1] = row
            end
        end
        table.sort(rows, function(a, b)
            local pa, pb = a.lowestPct or 101, b.lowestPct or 101
            if pa ~= pb then
                return pa < pb
            end
            return tostring(a.id) < tostring(b.id)
        end)
        for i = 1, math.min(#rows, MAX_ROWS) do
            farm.vehicles[i] = rows[i]
        end
        farm.topUpLitres = ctx.round2(farm.topUpLitres)
        farm.topUpCost = costSeen and ctx.round2(costSum) or nil
        out.readState = type(mod) == "table" and "ok" or "partial"
        out.coverage = (truncated or #rows > MAX_ROWS) and "truncated" or "complete"
        out.byFarm = { [tostring(ctx.farmId)] = farm }
        return out
    end,
})
