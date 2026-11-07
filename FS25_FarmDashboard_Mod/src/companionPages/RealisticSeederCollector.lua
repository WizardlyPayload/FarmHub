-- Realistic Seeder v1.0.1.0: current configuration on vehicles owned by this
-- farm. These settings do not measure sowing, fertilizer use or field work.

local MAX_ROWS = 80

CompanionPages.register({
    key = "realisticSeeder",
    modNames = { "FS25_372197_Realistic_Seeder", "FS25_RealisticSeeder" },
    substrings = { "realistic_seeder", "realisticseeder" },
    collect = function(ctx)
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-vehicle-state-only" }
        end
        local vehicles = ctx.ownedVehicles()
        if type(vehicles) ~= "table" then
            return { readState = "settings-only", reason = "no-owned-vehicle-list" }
        end

        local rows, supported, nondefault = {}, 0, 0
        local incomplete = false
        local truncated = ctx.ownedScanTruncated == true
        for _, vehicle in ipairs(vehicles) do
            local spec = type(vehicle) == "table" and vehicle.spec_realisticSeeder or nil
            if type(spec) == "table" and spec.isValidStoreCategory == true then
                supported = supported + 1
                local mode = ctx.num(spec.currentUnloadMode)
                local unit = ctx.num(spec.currentFillUnitNumber)
                if mode ~= 1 and mode ~= 2 then mode = nil; incomplete = true end
                if not unit or unit < 1 or unit > 32 or unit ~= math.floor(unit) then
                    unit = nil
                    incomplete = true
                end
                local side = nil
                if type(spec.isUnloadingToLeft) == "boolean" then side = spec.isUnloadingToLeft end
                if side == nil then incomplete = true end
                local fertilizer = nil
                if type(vehicle.spec_sowingMachine) == "table" and type(vehicle.spec_sprayer) == "table" then
                    if type(spec.allowFertilizer) == "boolean" then fertilizer = spec.allowFertilizer end
                    if fertilizer == nil then incomplete = true end
                end
                if mode == 2 or (unit ~= nil and unit ~= 1) or side == false or fertilizer == false then
                    nondefault = nondefault + 1
                end
                if #rows < MAX_ROWS then
                    rows[#rows + 1] = {
                        farmId = farmId,
                        vehicleId = ctx.clip(vehicle.uniqueId or vehicle.id, 64),
                        vehicle = ctx.clip(ctx.call(vehicle, "getFullName") or ctx.call(vehicle, "getName"), 70),
                        unloadMode = mode,
                        fillUnitNumber = unit,
                        unloadingLeft = side,
                        fertilizerAllowed = fertilizer,
                    }
                else
                    truncated = true
                end
            end
        end
        table.sort(rows, function(a, b)
            local an, bn = tostring(a.vehicle or a.vehicleId or ""), tostring(b.vehicle or b.vehicleId or "")
            if an == bn then return tostring(a.vehicleId or "") < tostring(b.vehicleId or "") end
            return an < bn
        end)
        return {
            readState = supported == 0 and "settings-only" or (incomplete and "partial" or "ok"),
            reason = supported == 0 and "no-owned-supported-seeder" or nil,
            coverage = truncated and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = { seederCount = supported, nondefaultCount = nondefault } },
            rows = rows,
        }
    end,
})
