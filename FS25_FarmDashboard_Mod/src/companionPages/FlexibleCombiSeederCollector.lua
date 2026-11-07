-- Flexible Combi Seeder v1.1.0.0: the current tank mode on owned, eligible drills.
-- A selected mode does not measure seed applied or fertilizer saved.

local MAX_ROWS = 60

CompanionPages.register({
    key = "flexibleCombiSeeder",
    modNames = { "FS25_369800_FS25_FlexibleCombiSeeder", "KM_80682_Flexible_Combi_Seeder", "FS25_FlexibleCombiSeeder" },
    substrings = { "flexiblecombiseeder" },
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
        local rows, eligible, seedMode = {}, 0, 0
        local truncated, partial = ctx.ownedScanTruncated == true, false
        for _, vehicle in ipairs(vehicles) do
            local spec = type(vehicle) == "table" and vehicle.spec_flexibleCombiSeeder or nil
            if type(spec) == "table" and spec.isActive == true then
                if spec.mode ~= "seeds" and spec.mode ~= "fertilizer" then
                    partial = true
                else
                    eligible = eligible + 1
                    if spec.mode == "seeds" then seedMode = seedMode + 1 end
                    if #rows < MAX_ROWS then
                        rows[#rows + 1] = {
                            farmId = farmId,
                            vehicleId = ctx.clip(vehicle.uniqueId or vehicle.id, 64),
                            vehicle = ctx.clip(ctx.call(vehicle, "getFullName")
                                or ctx.call(vehicle, "getName") or "", 70),
                            mode = spec.mode,
                        }
                    else truncated = true end
                end
            end
        end
        table.sort(rows, function(a, b) return (a.vehicle or "") < (b.vehicle or "") end)
        return {
            readState = partial and "partial" or eligible > 0 and "ok" or "settings-only",
            reason = eligible == 0 and "no-eligible-owned-combi-seeder" or nil,
            coverage = truncated and "truncated" or partial and "partial" or "complete",
            byFarm = { [tostring(farmId)] = { eligibleCount = eligible, seedModeCount = seedMode } },
            rows = rows,
        }
    end,
})
