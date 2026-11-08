-- Universal Two-Rotor Rake Control 1.0.0.15: target positions only for
-- owned rakes while independent mode is active. Targets are not proof the
-- rotors reached those positions or that any crop was worked.

local MAX_ROWS = 80

CompanionPages.register({
    key = "twoRotorRakeControl",
    modNames = { "KM_80712_Universal_Two-Rotor_Rake_Control", "FS25_UniversalTwoRotorRakeControl" },
    collect = function(ctx)
        if ctx.version ~= "1.0.0.15" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = ctx.num(ctx.farmId)
        if farmId == nil or farmId < 1 or farmId ~= math.floor(farmId) then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-vehicle-state-only" }
        end
        local vehicles = ctx.ownedVehicles()
        if type(vehicles) ~= "table" then
            return { readState = "settings-only", reason = "no-owned-vehicle-list" }
        end

        local specName = "spec_" .. ctx.modName .. ".universalTwoRotorControl"
        local candidates, ids = {}, {}
        local invalid, truncated = false, ctx.ownedScanTruncated == true
        for _, vehicle in ipairs(vehicles) do
            if type(vehicle) == "table" then
                local owner = ctx.num(ctx.call(vehicle, "getOwnerFarmId"))
                local spec = vehicle[specName]
                if owner == farmId and type(spec) == "table" and spec.supported == true and spec.active == true then
                    local id = type(vehicle.uniqueId) == "string" and vehicle.uniqueId or nil
                    local targets = spec.targets
                    local left, right
                    if type(targets) == "table" then
                        left, right = targets[1], targets[2]
                    end
                    if id == nil or id == "" or #id > 80
                        or type(left) ~= "boolean" or type(right) ~= "boolean" then
                        invalid = true
                    else
                        ids[id] = (ids[id] or 0) + 1
                        candidates[#candidates + 1] = {
                            farmId = farmId, vehicleId = id,
                            vehicle = ctx.clip(ctx.call(vehicle, "getFullName")
                                or ctx.call(vehicle, "getName"), 80),
                            leftTarget = left and "lifted" or "lowered",
                            rightTarget = right and "lifted" or "lowered",
                        }
                    end
                end
            end
        end
        local rows, count, split = {}, 0, 0
        for _, row in ipairs(candidates) do
            if ids[row.vehicleId] ~= 1 then invalid = true
            else
                count = count + 1
                if row.leftTarget ~= row.rightTarget then split = split + 1 end
                if #rows < MAX_ROWS then rows[#rows + 1] = row
                else truncated = true end
            end
        end
        table.sort(rows, function(a, b) return a.vehicleId < b.vehicleId end)
        local incomplete = invalid or truncated
        return {
            readState = incomplete and "partial" or count > 0 and "ok" or "settings-only",
            reason = invalid and "invalid-vehicle-state" or count == 0 and not incomplete and "no-active-owned-rakes" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = { [tostring(farmId)] = {
                independentCount = not incomplete and count or nil,
                splitTargetCount = not incomplete and split or nil,
            } },
            rows = rows,
        }
    end,
})
