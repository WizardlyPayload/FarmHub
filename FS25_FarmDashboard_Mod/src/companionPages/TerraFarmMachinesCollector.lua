-- TerraFarm v1.6.5.0 keeps each machine's current landscaping choices on the
-- vehicle. Its manager's accessible list includes every machine for admins;
-- intersect the registered list with this export farm's explicitly owned vehicles.

local MAX_ROWS = 60

CompanionPages.register({
    key = "terraFarmMachines",
    modNames = { "FS25_0_TerraFarm", "KM_66597_TerraFarm" },
    substrings = { "terrafarm" },
    collect = function(ctx)
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        local manager = ctx.symbol("g_machineManager")
        local machineClass = ctx.symbol("Machine")
        if type(manager) ~= "table" or type(manager.vehicles) ~= "table"
            or type(machineClass) ~= "table" or type(machineClass.MODE_NAME) ~= "table" then
            return { readState = "settings-only", reason = "no-terrafarm-manager" }
        end
        local owned = ctx.ownedVehicles()
        if type(owned) ~= "table" then
            return { readState = "settings-only", reason = "no-owned-vehicle-list" }
        end

        local registered = {}
        for _, vehicle in ipairs(manager.vehicles) do
            if type(vehicle) == "table" then registered[vehicle] = true end
        end
        local rows, machineCount, enabledCount, activeCount = {}, 0, 0, 0
        local truncated = ctx.ownedScanTruncated == true
        local fillTypes = ctx.global("g_fillTypeManager")
        for _, vehicle in ipairs(owned) do
            local spec = registered[vehicle] and vehicle.spec_machine or nil
            if type(spec) == "table" and type(spec.machineTypeId) == "string" then
                machineCount = machineCount + 1
                if spec.enabled == true then enabledCount = enabledCount + 1 end
                if spec.active == true then activeCount = activeCount + 1 end
                if #rows < MAX_ROWS then
                    local fill = ctx.call(fillTypes, "getFillTypeByIndex", spec.fillTypeIndex)
                    rows[#rows + 1] = {
                        farmId = farmId,
                        vehicleId = ctx.clip(ctx.call(vehicle, "getUniqueId") or vehicle.uniqueId, 64),
                        vehicle = ctx.clip(ctx.call(vehicle, "getFullName") or vehicle.name, 70),
                        machineType = ctx.clip(spec.machineTypeId, 40),
                        enabled = spec.enabled == true,
                        active = spec.active == true,
                        resourcesEnabled = spec.resourcesEnabled == true,
                        inputMode = ctx.clip(machineClass.MODE_NAME[spec.inputMode], 16),
                        outputMode = ctx.clip(machineClass.MODE_NAME[spec.outputMode], 16),
                        material = type(fill) == "table" and ctx.clip(fill.title or fill.name, 50) or nil,
                        inputAreaEnabled = spec.inputAreaEnabled == true,
                        outputAreaEnabled = spec.outputAreaEnabled == true,
                    }
                else
                    truncated = true
                end
            end
        end
        table.sort(rows, function(a, b)
            return tostring(a.vehicle or a.vehicleId or "") < tostring(b.vehicle or b.vehicleId or "")
        end)
        return {
            readState = "ok",
            coverage = truncated and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = {
                machineCount = machineCount,
                enabledCount = enabledCount,
                activeCount = activeCount,
            } },
            rows = rows,
        }
    end,
})
