-- Round Baler Extension 1.2.1.1: current saved wrapper operating choice.
-- The tractor's wrappedBaleCount resets after a drop, so it is not a lifetime total.

local MAX_ROWS = 60
local MOD_NAMES = {
    "FS25_roundBalerExtension", "FS25_303389_FS25_roundBalerExtension",
    "KM_57692_Round_Baler_Extension",
}

CompanionPages.register({
    key = "roundBalerExtension",
    modNames = MOD_NAMES,
    substrings = { "roundbalerextension", "round_baler_extension" },
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

        local rows, count, inactive, collectMode = {}, 0, 0, 0
        local truncated = ctx.ownedScanTruncated == true
        for _, vehicle in ipairs(vehicles) do
            local spec = type(vehicle) == "table" and vehicle.spec_toggleableBaleWrapper or nil
            if type(spec) == "table" and type(vehicle.spec_baleWrapper) == "table"
                and type(spec.baleWrapperIsActive) == "boolean" then
                local mode = ctx.num(spec.currentDropModeState)
                if mode == 1 or mode == 2 or mode == 3 then
                    count = count + 1
                    if spec.baleWrapperIsActive == false then inactive = inactive + 1 end
                    if mode == 3 then collectMode = collectMode + 1 end
                    if #rows < MAX_ROWS then
                        rows[#rows + 1] = {
                            farmId = farmId,
                            vehicleId = ctx.clip(vehicle.uniqueId or vehicle.id, 64),
                            vehicle = ctx.clip(ctx.call(vehicle, "getFullName") or ctx.call(vehicle, "getName"), 70),
                            dropMode = mode,
                            wrapperActive = spec.baleWrapperIsActive == true,
                        }
                    else
                        truncated = true
                    end
                end
            end
        end
        table.sort(rows, function(a, b) return tostring(a.vehicle or "") < tostring(b.vehicle or "") end)
        return {
            readState = count > 0 and "ok" or "settings-only",
            reason = count == 0 and "no-applicable-owned-baler" or nil,
            coverage = truncated and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = {
                wrapperCount = count, inactiveCount = inactive, collectModeCount = collectMode,
            } },
            rows = rows,
        }
    end,
})
