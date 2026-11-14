-- Manual Attach v1.1.0.0: current hose/PTO readiness on this farm's attached
-- implements. No connection history, travel or field work is inferred.

local MAX_ROWS = 80

local function readBool(helper, method, implement, parent)
    if type(helper) ~= "table" or type(helper[method]) ~= "function" then return nil end
    local ok, value = pcall(helper[method], implement, parent)
    if ok and type(value) == "boolean" then return value end
    return nil
end

local function ownerFarmId(ctx, vehicle)
    local stored = ctx.num(vehicle.ownerFarmId)
    local current = ctx.num(ctx.call(vehicle, "getOwnerFarmId"))
    if stored ~= nil and current ~= nil and stored ~= current then return nil end
    return current or stored
end

CompanionPages.register({
    key = "manualAttach",
    modNames = { "FS25_340627_FS25_manualAttach", "FS25_manualAttach" },
    substrings = { "manualattach" },
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
        local ptoHelper = ctx.global("PowerTakeOffExtension")
        local hoseHelper = ctx.global("ConnectionHosesExtension")
        if type(ptoHelper) ~= "table" or type(hoseHelper) ~= "table" then
            return { readState = "settings-only", reason = "manual-attach-state-unavailable" }
        end

        local rows, connected, needsConnection = {}, 0, 0
        local eligible, incomplete = 0, false
        local truncated = ctx.ownedScanTruncated == true
        for _, vehicle in ipairs(vehicles) do
            if type(vehicle) == "table" and ownerFarmId(ctx, vehicle) == farmId then
                local parent = ctx.call(vehicle, "getAttacherVehicle")
                local parentOwner = type(parent) == "table" and ownerFarmId(ctx, parent) or nil
                if type(parent) == "table" and parentOwner == nil
                    and (type(vehicle.spec_manualAttachPowerTakeOff) == "table"
                        or type(vehicle.spec_manualAttachConnectionHoses) == "table") then
                    incomplete = true
                end
                if parentOwner == farmId then
                    local hasPto = nil
                    local hasHoses = nil
                    if type(vehicle.spec_manualAttachPowerTakeOff) == "table" then
                        hasPto = readBool(ptoHelper, "hasPowerTakeOffs", vehicle, parent)
                    end
                    if type(vehicle.spec_manualAttachConnectionHoses) == "table" then
                        hasHoses = readBool(hoseHelper, "hasConnectionHoses", vehicle, parent)
                    end
                    if hasPto == nil and type(vehicle.spec_manualAttachPowerTakeOff) == "table" then incomplete = true end
                    if hasHoses == nil and type(vehicle.spec_manualAttachConnectionHoses) == "table" then incomplete = true end
                    if hasPto == true or hasHoses == true then
                        eligible = eligible + 1
                        local pto, hoses = nil, nil
                        if hasPto == true then pto = readBool(ptoHelper, "hasAttachedPowerTakeOffs", vehicle, parent) end
                        if hasHoses == true then hoses = readBool(hoseHelper, "hasAttachedConnectionHoses", vehicle, nil) end
                        if (hasPto == true and pto == nil) or (hasHoses == true and hoses == nil) then incomplete = true end
                        if (pto == false or hoses == false) then
                            needsConnection = needsConnection + 1
                        elseif (hasPto ~= true or pto == true) and (hasHoses ~= true or hoses == true) then
                            connected = connected + 1
                        end
                        if #rows < MAX_ROWS then
                            rows[#rows + 1] = {
                                farmId = farmId,
                                vehicleId = ctx.clip(vehicle.uniqueId or vehicle.id, 64),
                                vehicle = ctx.clip(ctx.call(vehicle, "getFullName") or ctx.call(vehicle, "getName"), 70),
                                attachedTo = ctx.clip(ctx.call(parent, "getFullName") or ctx.call(parent, "getName"), 70),
                                pto = pto,
                                hoses = hoses,
                            }
                        else
                            truncated = true
                        end
                    end
                end
            end
        end
        table.sort(rows, function(a, b)
            local an, bn = tostring(a.vehicle or a.vehicleId or ""), tostring(b.vehicle or b.vehicleId or "")
            if an == bn then return tostring(a.vehicleId or "") < tostring(b.vehicleId or "") end
            return an < bn
        end)
        return {
            readState = eligible == 0 and (incomplete and "partial" or "settings-only") or (incomplete and "partial" or "ok"),
            reason = eligible == 0 and (incomplete and "connection-check-unavailable" or "no-owned-attached-implement-with-connection") or nil,
            coverage = truncated and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = {
                implementCount = eligible, connectedCount = connected, needsConnectionCount = needsConnection,
            } },
            rows = rows,
        }
    end,
})
