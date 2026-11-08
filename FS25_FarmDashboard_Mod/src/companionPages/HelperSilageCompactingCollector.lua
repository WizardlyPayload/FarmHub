-- Helper Silage Compacting 1.0.0.0 exposes a live bunker worker state on tractors.
-- This reports assignment and current AI state, not compaction work or completion.

local MAX_ROWS = 120
local STATES = { [0] = "Idle", [1] = "Running", [2] = "Waiting" }

CompanionPages.register({
    key = "helperSilageCompacting",
    modNames = { "KM_81547_Helper_Silage_Compacting" },
    collect = function(ctx)
        if ctx.version ~= "1.0.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = ctx.num(ctx.farmId)
        if farmId == nil or farmId < 1 or farmId ~= math.floor(farmId) then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-worker-state-only" }
        end
        local vehicles = ctx.ownedVehicles()
        if type(vehicles) ~= "table" then
            return { readState = "settings-only", reason = "no-owned-vehicle-list" }
        end

        local rows, seen = {}, {}
        local invalid, truncated = false, ctx.ownedScanTruncated == true
        local assigned, running, waiting = 0, 0, 0
        local specKey = "spec_" .. ctx.modName .. ".bunkerSiloWorker"
        for _, vehicle in ipairs(vehicles) do
            if type(vehicle) == "table" then
                local owner = ctx.num(ctx.call(vehicle, "getOwnerFarmId") or vehicle.ownerFarmId)
                local spec = vehicle[specKey]
                if owner == farmId and type(vehicle.typeName) == "string"
                    and vehicle.typeName:lower() == "tractor" and spec ~= nil then
                    local id = vehicle.uniqueId
                    local state = type(spec) == "table" and ctx.num(spec.runState) or nil
                    local bunker = type(spec) == "table" and spec.bunkerSilo or nil
                    if type(id) ~= "string" or id == "" or #id > 80
                        or state == nil or STATES[state] == nil or seen[id]
                        or (state ~= 0 and bunker == nil) then
                        invalid = true
                    else
                        seen[id] = true
                        if bunker ~= nil then
                            assigned = assigned + 1
                            if state == 1 then running = running + 1 end
                            if state == 2 then waiting = waiting + 1 end
                            if #rows < MAX_ROWS then
                                rows[#rows + 1] = {
                                    farmId = farmId,
                                    vehicleId = id,
                                    vehicle = ctx.clip(ctx.call(vehicle, "getFullName")
                                        or ctx.call(vehicle, "getName"), 80),
                                    workerState = STATES[state],
                                }
                            else truncated = true end
                        end
                    end
                end
            end
        end
        table.sort(rows, function(a, b) return a.vehicleId < b.vehicleId end)
        local incomplete = invalid or truncated
        return {
            readState = incomplete and "partial" or assigned > 0 and "ok" or "settings-only",
            reason = invalid and "invalid-worker-state" or assigned == 0 and not incomplete
                and "no-owned-assigned-helper" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = not incomplete and { [tostring(farmId)] = {
                assignedVehicleCount = assigned, runningVehicleCount = running,
                waitingVehicleCount = waiting,
            } } or nil,
            rows = rows,
        }
    end,
})
