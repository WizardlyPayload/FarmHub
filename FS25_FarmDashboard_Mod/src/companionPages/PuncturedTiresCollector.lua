-- FS25 FarmDashboard | companionPages/PuncturedTiresCollector.lua | v1.0.0
-- Punctured Tires (Sablerock 1.0.1.0). Global table Puncture (also on _G):
--   farmTotalCount (punctures this 12-period cycle, limit 2), farmStartPeriod, scheduledPeriod1/2 (the two
--   randomly chosen "danger" periods), puncturedThisPeriod, veh_id (uniqueId of the last punctured vehicle).
-- Per motorized + drivable + wheeled vehicle: spec_puncture { active, pressure 0..1, wheelIndex,
--   punctureType (1 slow leak, 2 fast leak, 3 blow-out), l10n_axle / l10n_lat / tyrePosition (l10n keys),
--   new_speed (km/h cap, default 8 while punctured), distanceToPuncture / metersDrivenSinceNail (armed nail),
--   pendingRepairCost }. The counters are save-wide, not per farm.
-- Read only: repairTire / triggerPuncture / checkEligibility are never called; getRepairCost only reads wheel size.

local SCAN_VEHICLES = 400
local MAX_ROWS = 50
local YEAR_LIMIT = 2
local DEFAULT_SPEED_CAP = 8.0

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

--- "puncture_front" -> "front". Only the known l10n suffixes are exported.
local function l10nSuffix(key, allowed)
    if type(key) ~= "string" then
        return nil
    end
    local suffix = string.match(key, "^puncture_(%a+)$")
    if suffix ~= nil and allowed[suffix] then
        return suffix
    end
    return nil
end

local AXLES = { front = true, rear = true, middle = true }
local SIDES = { left = true, right = true }
local POSITIONS = { inner = true, outer = true }

local function period(ctx, value)
    local n = ctx.num(value)
    if n ~= nil and n >= 1 and n <= 12 then
        return math.floor(n)
    end
    return nil
end

local function readCycle(ctx, global)
    if type(global) ~= "table" then
        return nil
    end
    local count = ctx.num(global.farmTotalCount)
    return {
        count = count,
        limit = YEAR_LIMIT,
        remaining = count ~= nil and math.max(0, YEAR_LIMIT - count) or nil,
        startPeriod = period(ctx, global.farmStartPeriod),
        dangerPeriod1 = period(ctx, global.scheduledPeriod1),
        dangerPeriod2 = period(ctx, global.scheduledPeriod2),
        puncturedThisPeriod = period(ctx, global.puncturedThisPeriod),
    }
end

CompanionPages.register({
    key = "puncturedTires",
    modNames = { "FS25_PuncturedTires", "FS25_358517_Punctured_Tires" },
    substrings = { "puncturedtire", "punctured_tire" },
    collect = function(ctx)
        local global = ctx.symbol("Puncture") or ctx.global("Puncture")
        local specClass = ctx.symbol("FS25_Puncture") or ctx.global("FS25_Puncture")
        local out = { cycle = readCycle(ctx, global), defaultSpeedCapKmh = DEFAULT_SPEED_CAP }
        local month = ctx.envMonth()
        if out.cycle ~= nil and month ~= nil then
            out.cycle.currentPeriod = month
            out.cycle.dangerNow = month == out.cycle.dangerPeriod1 or month == out.cycle.dangerPeriod2
        end
        if ctx.farmId == nil or ctx.farmId <= 0 then
            out.readState = out.cycle ~= nil and "settings-only" or "detection-only"
            out.reason = "no-farm"
            return out
        end
        local vehicles, truncated = ownedVehicles(ctx)
        if vehicles == nil then
            out.readState = out.cycle ~= nil and "settings-only" or "detection-only"
            out.reason = "no-vehicle-list"
            return out
        end
        local lastId = type(global) == "table" and global.veh_id ~= nil and tostring(global.veh_id) or nil
        local farm = { equippedCount = 0, puncturedCount = 0, armedCount = 0, repairCostTotal = 0, vehicles = {} }
        local rows, costSeen = {}, false
        for i, vehicle in ipairs(vehicles) do
            local spec = vehicle.spec_puncture
            if type(spec) == "table" then
                farm.equippedCount = farm.equippedCount + 1
                local active = spec.active == true
                local row = {
                    id = vehicleId(ctx, vehicle, i),
                    name = vehicleLabel(ctx, vehicle),
                    punctured = active,
                    lastPunctured = lastId ~= nil and vehicle.uniqueId ~= nil and tostring(vehicle.uniqueId) == lastId or nil,
                }
                if active then
                    farm.puncturedCount = farm.puncturedCount + 1
                    local pressure = ctx.num(spec.pressure)
                    local kind = ctx.num(spec.punctureType)
                    row.pressurePct = pressure ~= nil and ctx.round2(math.max(0, math.min(1, pressure)) * 100) or nil
                    row.wheelIndex = ctx.num(spec.wheelIndex)
                    row.punctureType = (kind == 1 or kind == 2 or kind == 3) and kind or nil
                    row.axle = l10nSuffix(spec.l10n_axle, AXLES)
                    row.side = l10nSuffix(spec.l10n_lat, SIDES)
                    row.position = l10nSuffix(spec.tyrePosition, POSITIONS)
                    row.speedCapKmh = ctx.round2(ctx.num(spec.new_speed) or DEFAULT_SPEED_CAP)
                    row.declinedRepair = spec.playerSaidNo == true
                    local cost = ctx.num(spec.pendingRepairCost)
                    if cost == nil and type(specClass) == "table" and type(specClass.getRepairCost) == "function" then
                        cost = ctx.num(ctx.try(specClass.getRepairCost, vehicle))
                    end
                    if cost ~= nil then
                        row.repairCost = ctx.round2(cost)
                        farm.repairCostTotal = farm.repairCostTotal + cost
                        costSeen = true
                    end
                else
                    local target = ctx.num(spec.distanceToPuncture)
                    if target ~= nil and target > 0 then
                        local driven = ctx.num(spec.metersDrivenSinceNail) or 0
                        row.armed = true
                        row.metersToPuncture = ctx.round2(math.max(0, target - driven))
                        farm.armedCount = farm.armedCount + 1
                    end
                end
                rows[#rows + 1] = row
            end
        end
        table.sort(rows, function(a, b)
            if a.punctured ~= b.punctured then
                return a.punctured
            end
            if (a.armed == true) ~= (b.armed == true) then
                return a.armed == true
            end
            return tostring(a.name or a.id) < tostring(b.name or b.id)
        end)
        for i = 1, math.min(#rows, MAX_ROWS) do
            farm.vehicles[i] = rows[i]
        end
        farm.repairCostTotal = costSeen and ctx.round2(farm.repairCostTotal) or nil
        out.readState = out.cycle ~= nil and "ok" or "partial"
        out.coverage = (truncated or #rows > MAX_ROWS) and "truncated" or "complete"
        out.byFarm = { [tostring(ctx.farmId)] = farm }
        return out
    end,
})
