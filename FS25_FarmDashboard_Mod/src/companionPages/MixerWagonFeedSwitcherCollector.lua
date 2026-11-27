-- Mixer Wagon Feed Switcher 1.0.0.0: current custom recipe on owned wagons.
-- Read the live specialization only. Its XML restore and recipe helpers mutate
-- vehicle state and must not be called from the dashboard exporter.

local MAX_WAGONS = 60
local MAX_GROUPS = 8

local function whole(value, low, high)
    local n = tonumber(value)
    if n and n == n and n >= low and n <= high and n == math.floor(n) then return n end
    return nil
end

CompanionPages.register({
    key = "mixerWagonFeedSwitcher",
    modNames = { "KM_80956_Mixer_Wagon_Feed_Switcher" },
    substrings = {},
    collect = function(ctx)
        if ctx.version ~= "1.0.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = whole(ctx.farmId, 1, 8)
        if farmId == nil then return { readState = "settings-only", reason = "no-farm" } end
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
            if type(vehicle) == "table" and ctx.num(ctx.call(vehicle, "getOwnerFarmId")) == farmId
                and type(vehicle.spec_mixerWagon) == "table" and type(vehicle.spec_mixerWagonMode) == "table" then
                local mode = whole(vehicle.spec_mixerWagonMode.currentMode, 1, 12)
                if mode == nil then invalid = true
                elseif mode > 1 then
                    local id = type(vehicle.uniqueId) == "string" and vehicle.uniqueId or nil
                    if id == nil or id == "" then invalid = true
                    else
                        ids[id] = (ids[id] or 0) + 1
                        candidates[#candidates + 1] = { vehicle = vehicle, id = id, mode = mode }
                    end
                end
            end
        end

        local rows = {}
        for _, candidate in ipairs(candidates) do
            local vehicle, id, mode = candidate.vehicle, candidate.id, candidate.mode
            local spec = vehicle.spec_mixerWagonMode
            local profile = type(spec.customRecipeProfilesByMode) == "table"
                and spec.customRecipeProfilesByMode[mode] or nil
            local groups = vehicle.spec_mixerWagon.mixerWagonFillTypes
            if ids[id] ~= 1 or type(profile) ~= "table" or type(groups) ~= "table" then invalid = true
            else
                local groupRows, total, groupCount, good = {}, 0, 0, true
                for _, group in ipairs(groups) do
                    groupCount = groupCount + 1
                    if groupCount > MAX_GROUPS then good = false; truncated = true; break end
                    local level = type(group) == "table" and ctx.num(group.fillLevel) or nil
                    if level == nil or level < 0 or level > 1000000000 then good = false; break end
                    total = total + level
                    groupRows[#groupRows + 1] = {
                        name = ctx.clip(group.name or groupCount, 70), litres = level,
                    }
                end
                if not good or groupCount == 0 then invalid = true
                elseif #rows < MAX_WAGONS then
                    rows[#rows + 1] = {
                        farmId = farmId, vehicleId = ctx.clip(id, 80),
                        vehicle = ctx.clip(ctx.call(vehicle, "getFullName") or ctx.call(vehicle, "getName"), 80),
                        mode = mode, recipe = ctx.clip(profile.title or profile.name, 80),
                        outputFillType = ctx.clip(profile.outputFillTypeName, 80),
                        groupTotalLitres = total, groups = groupRows,
                    }
                else truncated = true end
            end
        end
        if #rows == 0 and not invalid and not truncated then
            return { readState = "settings-only", reason = "no-owned-custom-recipe" }
        end
        table.sort(rows, function(a, b) return tostring(a.vehicleId) < tostring(b.vehicleId) end)
        return {
            readState = invalid and "partial" or "ok",
            reason = invalid and "unreadable-or-ambiguous-wagon" or nil,
            coverage = truncated and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = { customRecipeCount = #rows } },
            rows = rows,
        }
    end,
})
