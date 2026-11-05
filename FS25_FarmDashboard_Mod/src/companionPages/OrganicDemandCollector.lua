-- Demand-Oriented Organic Application 2.0.0.0: selected crop and N adjustment
-- on currently owned applicators. These are choices, not applied nitrogen.

local MAX_ROWS = 60

CompanionPages.register({
    key = "organicDemand",
    modNames = { "FS25_DemandOrientedOrganicApplication", "FS25_366594_Demand-Oriented_Organic_Application" },
    substrings = { "demandorientedorganic", "demand-oriented_organic_application" },
    collect = function(ctx)
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-device-state-only" }
        end
        local mod = ctx.symbol("PFOrganicCropDemandUnlock")
        if type(mod) ~= "table" or type(mod.deviceSelections) ~= "table"
            or type(mod.persistedSelectionsByUniqueId) ~= "table" then
            return { readState = "settings-only", reason = "no-selection-register" }
        end
        local vehicles = ctx.ownedVehicles()
        if type(vehicles) ~= "table" then
            return { readState = "settings-only", reason = "no-owned-vehicle-list" }
        end

        local rows, count, savedOnly, truncated = {}, 0, 0, ctx.ownedScanTruncated == true
        for _, vehicle in ipairs(vehicles) do
            if type(vehicle) == "table" then
                -- Use the same stable ID as the mod, but do not call its getter:
                -- that getter can initialise the per-device selection cache.
                local uniqueId = vehicle.uniqueId
                if type(uniqueId) == "string" and uniqueId ~= "" then
                    local live = mod.deviceSelections[vehicle]
                    local saved = mod.persistedSelectionsByUniqueId[uniqueId]
                    local selection = type(live) == "table" and live or saved
                    if type(selection) == "table" then
                        local crop = type(selection.name) == "string" and string.upper(selection.name) or nil
                        if crop == "" then crop = nil end
                        -- The mod resolves a persisted crop against this map when
                        -- a device becomes live. Do not present an unavailable
                        -- saved crop as an active target.
                        if live == nil and crop ~= nil then
                            local known = type(mod.fruitByName) == "table" and mod.fruitByName[crop] or nil
                            if type(known) ~= "table" then crop = nil end
                        end
                        local mode = selection.adjustMode
                        local value = ctx.num(selection.adjustValue)
                        if mode ~= "TARGET_MINUS" and mode ~= "MAX_APPLICATION" then
                            mode, value = "NONE", 0
                        elseif value == nil or value < 5 or value > 250
                            or value ~= math.floor(value) or value % 5 ~= 0 then
                            mode, value = nil, nil
                        end
                        -- Invalid adjustment data is withheld; an automatic,
                        -- unadjusted default does not make a useful row.
                        if mode ~= nil and (crop ~= nil or mode ~= "NONE") then
                            count = count + 1
                            if live == nil then savedOnly = savedOnly + 1 end
                            if #rows < MAX_ROWS then
                                rows[#rows + 1] = {
                                    farmId = farmId,
                                    vehicleId = ctx.clip(uniqueId, 64),
                                    vehicle = ctx.clip(ctx.call(vehicle, "getFullName") or ctx.call(vehicle, "getName"), 70),
                                    targetCrop = ctx.clip(crop, 50),
                                    adjustMode = mode,
                                    adjustKgNPerHa = value,
                                    source = live ~= nil and "live" or "saved",
                                }
                            else
                                truncated = true
                            end
                        end
                    end
                end
            end
        end
        table.sort(rows, function(a, b)
            return tostring(a.vehicle or a.vehicleId or "") < tostring(b.vehicle or b.vehicleId or "")
        end)
        return {
            readState = count == 0 and "settings-only" or (savedOnly > 0 and "partial" or "ok"),
            reason = count == 0 and "no-configured-owned-applicator" or nil,
            coverage = truncated and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = { configuredCount = count, savedOnlyCount = savedOnly } },
            rows = rows,
        }
    end,
})
