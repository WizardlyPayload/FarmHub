-- FS25 FarmDashboard | companionPages/AdvancedMaintenanceCollector.lua | v1.0.0
-- Advanced Maintenance (MechMoxer 1.0.2.0). Specialization "AdvancedMaintenance" on every drivable type
-- (not trains). It overrides getCanMotorRun: the engine will not run at 100 % damage, and above 2/7
-- (28.57 %) damage every check rolls two random numbers in 1..ChanceInt and stalls on a match, where
--   Chance = 50000 / (damage * 10 * operatingTimeMs / 900000000), ChanceInt = floor(min(Chance, 2^31-1))
-- and the roll only happens when ChanceInt >= 100. A stall also stops a running AI worker.
-- FarmHub never calls CheckDamage (it rolls math.random). It reads getDamageAmount / getOperatingTime and
-- reports the mod's own odds (1 in ChanceInt per check) next to the zone each machine is in.

local SCAN_VEHICLES = 400
local MAX_ROWS = 50
local RISK_THRESHOLD = 0.28571428571429
local MAX_INT = 2147483647

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

local function hasSpec(vehicle, classRef)
    if vehicle.spec_AdvancedMaintenance ~= nil then
        return true
    end
    if classRef ~= nil and type(vehicle.specializations) == "table" then
        for _, spec in pairs(vehicle.specializations) do
            if spec == classRef then
                return true
            end
        end
    end
    return false
end

--- The mod's own per-check odds. nil when no roll happens (below the zone, no hours, or ChanceInt < 100).
local function oddsPerCheck(damage, operatingMs)
    if damage == nil or damage <= RISK_THRESHOLD or damage >= 1 or operatingMs == nil or operatingMs <= 0 then
        return nil
    end
    local chance = 50000 / (damage * 10 * operatingMs / 900000000)
    local chanceInt = math.floor(math.min(chance, MAX_INT))
    if chanceInt < 100 then
        return nil
    end
    return chanceInt
end

CompanionPages.register({
    key = "advancedMaintenance",
    modNames = { "FS25_AdvancedMaintenance", "FS25_307003_Advanced_Maintenance" },
    substrings = { "advancedmaintenance", "advanced_maintenance" },
    collect = function(ctx)
        local classRef = ctx.symbol("AdvancedMaintenance")
        local out = { riskThresholdPct = ctx.round2(RISK_THRESHOLD * 100) }
        if ctx.farmId == nil or ctx.farmId <= 0 then
            out.readState = "detection-only"
            out.reason = "no-farm"
            return out
        end
        local vehicles, truncated = ownedVehicles(ctx)
        if vehicles == nil then
            out.readState = "detection-only"
            out.reason = "no-vehicle-list"
            return out
        end
        local farm = { machineCount = 0, lockedCount = 0, riskCount = 0, aiAtRiskCount = 0, machines = {} }
        local rows, damageSum, damageN, failedReads = {}, 0, 0, 0
        for i, vehicle in ipairs(vehicles) do
            if hasSpec(vehicle, type(classRef) == "table" and classRef or nil) then
                farm.machineCount = farm.machineCount + 1
                local damage = ctx.num(ctx.call(vehicle, "getDamageAmount"))
                local opMs = ctx.num(ctx.call(vehicle, "getOperatingTime"))
                if damage == nil then
                    failedReads = failedReads + 1
                end
                local zone = "ok"
                if damage ~= nil and damage >= 1 then
                    zone = "locked"
                elseif damage ~= nil and damage > RISK_THRESHOLD then
                    zone = "risk"
                end
                local aiActive = ctx.call(vehicle, "getIsAIActive") == true
                local row = {
                    id = vehicleId(ctx, vehicle, i),
                    name = vehicleLabel(ctx, vehicle),
                    damagePct = damage ~= nil and ctx.round2(math.max(0, math.min(1, damage)) * 100) or nil,
                    operatingHours = opMs ~= nil and ctx.round2(opMs / 3600000) or nil,
                    zone = zone,
                    oddsPerCheck = oddsPerCheck(damage, opMs),
                    aiActive = aiActive,
                }
                if zone == "locked" then
                    farm.lockedCount = farm.lockedCount + 1
                elseif zone == "risk" then
                    farm.riskCount = farm.riskCount + 1
                end
                if aiActive and zone ~= "ok" then
                    farm.aiAtRiskCount = farm.aiAtRiskCount + 1
                end
                if damage ~= nil then
                    damageSum = damageSum + row.damagePct
                    damageN = damageN + 1
                end
                rows[#rows + 1] = row
            end
        end
        table.sort(rows, function(a, b)
            local da, db = a.damagePct or -1, b.damagePct or -1
            if da ~= db then
                return da > db
            end
            return tostring(a.id) < tostring(b.id)
        end)
        for i = 1, math.min(#rows, MAX_ROWS) do
            farm.machines[i] = rows[i]
        end
        if damageN > 0 then
            farm.averageDamagePct = ctx.round2(damageSum / damageN)
        end
        out.readState = failedReads > 0 and "partial" or "ok"
        out.coverage = (truncated or #rows > MAX_ROWS) and "truncated" or "complete"
        out.byFarm = { [tostring(ctx.farmId)] = farm }
        return out
    end,
})
