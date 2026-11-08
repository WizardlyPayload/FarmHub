-- Vehicle Weight Modifier 1.0.0.1 saves configured factors by vehicle key.
-- Join only a stable uniqueId to a vehicle still owned by the export farm.

local MAX_ROWS = 80

local function factor(ctx, value, maximum)
    local n = ctx.num(value)
    if n == nil or n < 0.5 or n > maximum then return nil end
    return math.abs(math.floor(n * 10 + 0.5) - n * 10) < 0.00001 and n or nil
end

CompanionPages.register({
    key = "vehicleWeightModifier",
    modNames = { "FS25_357616_Vehicle_Weight_Modifier" },
    substrings = {},
    collect = function(ctx)
        if ctx.version ~= "1.0.0.1" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = ctx.num(ctx.farmId)
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-settings-only" }
        end
        local settings = ctx.symbol("VehicleWeightModifierVehicleSettings")
        if type(settings) ~= "table" or type(settings.data) ~= "table" then
            return { readState = "settings-only", reason = "no-settings-register" }
        end
        local vehicles = ctx.ownedVehicles()
        if type(vehicles) ~= "table" then
            return { readState = "settings-only", reason = "no-owned-vehicle-list" }
        end
        local rows, count = {}, 0
        local truncated = ctx.ownedScanTruncated == true
        for _, vehicle in ipairs(vehicles) do
            if type(vehicle) == "table" then
                local owner = ctx.num(ctx.call(vehicle, "getOwnerFarmId") or vehicle.ownerFarmId)
                local id = vehicle.uniqueId
                if owner == farmId and type(id) == "string" and id ~= "" then
                    local saved = settings.data[id]
                    if type(saved) == "table" and saved.id == id then
                        local weight = factor(ctx, saved.weightFactor, 10)
                        local brake = factor(ctx, saved.brakeFactor, 3)
                        local engine = factor(ctx, saved.engineFactor, 3)
                        if weight == nil or brake == nil or engine == nil then
                            return { readState = "partial", reason = "invalid-factor" }
                        end
                        count = count + 1
                        if #rows < MAX_ROWS then
                            rows[#rows + 1] = {
                                farmId = farmId, vehicleId = ctx.clip(id, 64),
                                vehicle = ctx.clip(ctx.call(vehicle, "getFullName") or vehicle.configFileName, 80),
                                weightFactor = weight, brakeFactor = brake, engineFactor = engine,
                            }
                        else
                            truncated = true
                        end
                    end
                end
            end
        end
        if count == 0 then
            return { readState = "settings-only", reason = "no-owned-configurations" }
        end
        table.sort(rows, function(a, b)
            return tostring(a.vehicle or a.vehicleId) < tostring(b.vehicle or b.vehicleId)
        end)
        return {
            readState = "ok", coverage = truncated and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = { vehicleCount = count } },
            rows = rows,
        }
    end,
})
