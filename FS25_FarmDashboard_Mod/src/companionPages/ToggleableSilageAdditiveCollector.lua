-- Toggleable Silage Additive 1.0.0.0: current usage switch on owned equipment.
-- The reviewed ZIP does not register its saveToXMLFile event; no persistence,
-- additive quantity or field-application claim follows from this state.

local MAX_ROWS = 120

CompanionPages.register({
    key = "toggleableSilageAdditive",
    modNames = { "FS25_330718_Toggleable_Silage_Additive", "FS25_toggleableSilageAdditive" },
    collect = function(ctx)
        if ctx.version ~= "1.0.0.0" then
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

        local rows, seen = {}, {}
        local invalid, truncated = false, ctx.ownedScanTruncated == true
        local supported, disabled = 0, 0
        for _, vehicle in ipairs(vehicles) do
            if type(vehicle) == "table" then
                local owner = ctx.num(ctx.call(vehicle, "getOwnerFarmId") or vehicle.ownerFarmId)
                local qualifiedSpec = type(ctx.modName) == "string"
                    and vehicle["spec_" .. ctx.modName .. ".toggleableSilageAdditive"] or nil
                local spec = vehicle.spec_toggleableSilageAdditive or qualifiedSpec
                if owner == farmId and type(spec) == "table" and spec.isAvailable == true then
                    local id = vehicle.uniqueId
                    local active = spec.isActive
                    if type(id) ~= "string" or id == "" or #id > 80
                        or type(active) ~= "boolean" or seen[id] then
                        invalid = true
                    else
                        seen[id] = true
                        supported = supported + 1
                        if not active then disabled = disabled + 1 end
                        if #rows < MAX_ROWS then
                            rows[#rows + 1] = {
                                farmId = farmId,
                                vehicleId = id,
                                vehicle = ctx.clip(ctx.call(vehicle, "getFullName")
                                    or ctx.call(vehicle, "getName"), 80),
                                additiveUsageEnabled = active,
                            }
                        else truncated = true end
                    end
                end
            end
        end
        table.sort(rows, function(a, b) return a.vehicleId < b.vehicleId end)
        local incomplete = invalid or truncated
        return {
            readState = incomplete and "partial" or supported > 0 and "ok" or "settings-only",
            reason = invalid and "invalid-vehicle-state" or supported == 0 and not incomplete
                and "no-owned-supported-vehicle" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = not incomplete and { [tostring(farmId)] = {
                supportedVehicleCount = supported,
                disabledVehicleCount = disabled,
            } } or nil,
            rows = rows,
        }
    end,
})
