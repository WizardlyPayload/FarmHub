-- Sowing Machine Roller Ready v1.2.1.0: current roller switch on owned eligible seeders.
-- This is a machine setting, not a measured rolled area or crop benefit.

local MAX_ROWS = 60

CompanionPages.register({
    key = "sowingMachineRollerReady",
    modNames = { "FS25_327528_FS25_sowingMachineRollerReady", "FS25_sowingMachineRollerReady" },
    substrings = { "sowingmachinerollerready" },
    collect = function(ctx)
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-vehicles-only" }
        end
        local vehicles = ctx.ownedVehicles()
        if type(vehicles) ~= "table" then
            return { readState = "settings-only", reason = "no-owned-vehicle-list" }
        end
        local rows, eligible, enabled = {}, 0, 0
        local truncated, partial = ctx.ownedScanTruncated == true, false
        for _, vehicle in ipairs(vehicles) do
            local spec = type(vehicle) == "table" and vehicle.spec_sowingMachine or nil
            if type(spec) == "table" and spec.isRollerAllowed == true then
                local state = spec.allowRollerSowingMachine
                if type(state) ~= "boolean" then
                    partial = true
                else
                    eligible = eligible + 1
                    if state then enabled = enabled + 1 end
                    if #rows < MAX_ROWS then
                        rows[#rows + 1] = {
                            farmId = farmId,
                            vehicleId = ctx.clip(vehicle.uniqueId or vehicle.id, 64),
                            vehicle = ctx.clip(ctx.call(vehicle, "getFullName")
                                or ctx.call(vehicle, "getName") or "", 70),
                            rollerOn = state,
                        }
                    else truncated = true end
                end
            end
        end
        table.sort(rows, function(a, b) return (a.vehicle or "") < (b.vehicle or "") end)
        return {
            readState = partial and "partial" or eligible > 0 and "ok" or "settings-only",
            reason = eligible == 0 and "no-eligible-owned-seeder" or nil,
            coverage = truncated and "truncated" or partial and "partial" or "complete",
            byFarm = { [tostring(farmId)] = { eligibleCount = eligible, enabledCount = enabled } },
            rows = rows,
        }
    end,
})
