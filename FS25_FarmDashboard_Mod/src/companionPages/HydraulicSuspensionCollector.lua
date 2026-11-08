-- Hydraulic Suspension System 2.0.0.0: current mod-owned mode and requested
-- manual offset for enabled vehicles owned by this farm. Neither proves
-- measured axle travel, damping activity or physical ride height.

local MAX_ROWS = 80
local KINDS = { [0] = "level", [1] = "pendular", [2] = "loader", [3] = "air" }
local MODES = { [0] = "auto", [1] = "locked", [2] = "manual" }

CompanionPages.register({
    key = "hydraulicSuspension",
    modNames = { "KM_82643_Hydraulic_Suspension_System" },
    collect = function(ctx)
        if ctx.version ~= "2.0.0.0" then
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

        local candidates, ids = {}, {}
        local invalid, truncated = false, ctx.ownedScanTruncated == true
        for _, vehicle in ipairs(vehicles) do
            if type(vehicle) == "table" then
                local owner = ctx.num(ctx.call(vehicle, "getOwnerFarmId"))
                local spec = vehicle.spec_hydraulicSuspension
                if owner == farmId and type(spec) == "table" and spec.enabled == true then
                    local id = type(vehicle.uniqueId) == "string" and vehicle.uniqueId or nil
                    local kind = ctx.num(spec.kind)
                    local mode = ctx.num(spec.mode)
                    local offset = ctx.num(spec.manualOffset)
                    if id == nil or id == "" or #id > 80 or KINDS[kind] == nil
                        or MODES[mode] == nil or (mode == 2 and offset == nil)
                        or (offset ~= nil and (offset < -1 or offset > 1))
                        or (kind == 1 and mode ~= 0) or (kind == 2 and mode == 2)
                        or (kind == 3 and mode == 1) then
                        invalid = true
                    else
                        ids[id] = (ids[id] or 0) + 1
                        candidates[#candidates + 1] = {
                            farmId = farmId, vehicleId = id,
                            vehicle = ctx.clip(ctx.call(vehicle, "getFullName")
                                or ctx.call(vehicle, "getName"), 80),
                            kind = KINDS[kind], mode = MODES[mode],
                            requestedOffsetCm = mode == 2 and ctx.round2(offset * 100) or nil,
                        }
                    end
                end
            end
        end
        local rows, count, manual, locked = {}, 0, 0, 0
        for _, row in ipairs(candidates) do
            if ids[row.vehicleId] ~= 1 then invalid = true
            else
                count = count + 1
                if row.mode == "manual" then manual = manual + 1 end
                if row.mode == "locked" then locked = locked + 1 end
                if #rows < MAX_ROWS then rows[#rows + 1] = row
                else truncated = true end
            end
        end
        table.sort(rows, function(a, b) return a.vehicleId < b.vehicleId end)
        local incomplete = invalid or truncated
        return {
            readState = incomplete and "partial" or count > 0 and "ok" or "settings-only",
            reason = invalid and "invalid-vehicle-state" or count == 0 and not incomplete and "no-enabled-owned-vehicles" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = { [tostring(farmId)] = {
                enabledCount = not incomplete and count or nil,
                manualCount = not incomplete and manual or nil,
                lockedCount = not incomplete and locked or nil,
            } },
            rows = rows,
        }
    end,
})
