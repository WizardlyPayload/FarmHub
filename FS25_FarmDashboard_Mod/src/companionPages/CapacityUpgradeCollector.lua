-- Capacity Upgrade 1.0.0.0: a selected shop level can enlarge physical fill
-- units or slow consumption instead. Read only the exact farm's current assets.
-- Neither path is evidence of stock added, material consumed or money paid.

local FACTORS = { 1, 1.25, 1.5, 2, 2.5, 3, 6 }
local MAX_UNITS, MAX_ROWS = 32, 80

local function positive(ctx, value)
    local n = ctx.num(value)
    if n ~= nil and n > 0 and n < 1000000000 then return n end
    return nil
end

CompanionPages.register({
    key = "capacityUpgrade",
    modNames = { "FS25_CapacityUpgrade", "FS25_373637_Capacity_Upgrade", "KM_83362_Capacity_Upgrade" },
    substrings = { "capacityupgrade", "capacity_upgrade" },
    collect = function(ctx)
        local farmId = ctx.num(ctx.farmId)
        if farmId == nil or farmId <= 0 or farmId ~= math.floor(farmId) then
            return { readState = "settings-only", reason = "selected-farm-unavailable" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-vehicles-only" }
        end
        if ctx.version ~= "1.0.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local vehicles = ctx.ownedVehicles()
        if type(vehicles) ~= "table" then
            return { readState = "settings-only", reason = "owned-vehicles-unavailable" }
        end

        local rows, selected, capacityCount, slowedCount = {}, 0, 0, 0
        local incomplete, truncated = false, ctx.ownedScanTruncated == true
        local seen = {}
        for _, vehicle in ipairs(vehicles) do
            local config = type(vehicle) == "table" and type(vehicle.configurations) == "table"
                and vehicle.configurations.cuCapacity or nil
            if config ~= nil then
                if type(config) ~= "number" or config ~= math.floor(config)
                    or FACTORS[config] == nil then
                    incomplete = true
                elseif config > 1 then
                    selected = selected + 1
                    local id = ctx.clip(vehicle.uniqueId or vehicle.id, 64)
                    local spec = vehicle.spec_cuUpgrade
                    local fillUnits = type(vehicle.spec_fillUnit) == "table"
                        and vehicle.spec_fillUnit.fillUnits or nil
                    if id == nil or id == "" or seen[id] or type(spec) ~= "table"
                        or spec.level ~= config or type(fillUnits) ~= "table" then
                        incomplete = true
                    else
                        seen[id] = true
                        local found, unitKeys = false, {}
                        local name = ctx.clip(ctx.call(vehicle, "getFullName")
                            or ctx.call(vehicle, "getName"), 70)
                        for effect, register in pairs({ physical = spec.stockCapacity,
                                slowerUse = spec.slowed }) do
                            if register ~= nil and type(register) ~= "table" then
                                incomplete = true
                            elseif type(register) == "table" then
                                local scanned = 0
                                for index, value in pairs(register) do
                                    scanned = scanned + 1
                                    if scanned > MAX_UNITS then truncated = true; break end
                                    local unit = type(index) == "number" and index == math.floor(index)
                                        and index >= 1 and index <= MAX_UNITS and fillUnits[index] or nil
                                    local original
                                    if effect == "physical" then
                                        original = positive(ctx, value)
                                    elseif unit ~= nil then
                                        original = positive(ctx, unit.defaultCapacity)
                                    end
                                    local observed = unit ~= nil and (positive(ctx,
                                        ctx.call(vehicle, "getFillUnitCapacity", index))
                                        or positive(ctx, unit.capacity)) or nil
                                    local divisor = effect == "slowerUse" and positive(ctx, value) or nil
                                    local expected = original ~= nil and original * FACTORS[config] or nil
                                    local valid = unit ~= nil and not unitKeys[index]
                                        and (effect ~= "physical" or (expected ~= nil
                                            and observed ~= nil and math.abs(observed - expected)
                                                <= math.max(0.5, expected * 0.000001)))
                                        and (effect ~= "slowerUse" or (divisor ~= nil
                                            and math.abs(divisor - FACTORS[config]) < 0.001))
                                    if not valid then
                                        incomplete = true
                                    else
                                        unitKeys[index], found = true, true
                                        if effect == "physical" then capacityCount = capacityCount + 1
                                        else slowedCount = slowedCount + 1 end
                                        if #rows < MAX_ROWS then
                                            rows[#rows + 1] = {
                                                farmId = farmId, vehicleId = id, vehicle = name,
                                                fillUnitIndex = index, factor = FACTORS[config],
                                                effect = effect == "physical" and "capacity" or "usage-slowed",
                                                stockCapacity = effect == "physical" and original or nil,
                                                currentCapacity = effect == "physical" and observed or nil,
                                            }
                                        else truncated = true end
                                    end
                                end
                            end
                        end
                        if not found then incomplete = true end
                    end
                end
            end
        end
        table.sort(rows, function(a, b)
            if a.vehicleId == b.vehicleId then return a.fillUnitIndex < b.fillUnitIndex end
            return a.vehicleId < b.vehicleId
        end)
        local coverage = truncated and "truncated" or incomplete and "partial" or "complete"
        return {
            readState = (truncated or incomplete) and "partial"
                or selected > 0 and "ok" or "settings-only",
            reason = selected == 0 and coverage == "complete" and "no-upgraded-owned-vehicle" or nil,
            coverage = coverage,
            byFarm = { [tostring(farmId)] = {
                vehicleCount = coverage == "complete" and selected or nil,
                capacityUnitCount = coverage == "complete" and capacityCount or nil,
                slowedUnitCount = coverage == "complete" and slowedCount or nil,
            } },
            rows = rows,
        }
    end,
})
