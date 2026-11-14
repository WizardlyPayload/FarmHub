-- Implement Usage Counter v1.2.0.0 stores worked area on native implement specs,
-- and wrapped-bale counts on its own mod-qualified spec. Never reset a counter.

local MAX_ROWS = 80
local AREA_SPECS = {
    { key = "cultivator", field = "spec_cultivator" },
    { key = "cutter", field = "spec_cutter" },
    { key = "mower", field = "spec_mower" },
    { key = "plow", field = "spec_plow" },
    { key = "sowingMachine", field = "spec_sowingMachine" },
    { key = "sprayer", field = "spec_sprayer" },
}

CompanionPages.register({
    key = "implementUsageCounter",
    modNames = { "FS25_ImplementUsageCounter", "FS25_310419_Implement_Usage_Counter" },
    substrings = { "implementusagecounter", "implement_usage_counter" },
    collect = function(ctx)
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        local vehicles = ctx.ownedVehicles()
        if type(vehicles) ~= "table" then
            return { readState = "settings-only", reason = "no-owned-vehicle-list" }
        end

        local rows, vehicleCount, areaCount, baleCount, nonzeroCount = {}, 0, 0, 0, 0
        local truncated = ctx.ownedScanTruncated == true
        local function add(vehicle, vehicleId, activity, unit, lifetime, session)
            lifetime, session = ctx.num(lifetime), ctx.num(session)
            if lifetime == nil or session == nil or lifetime < 0 or session < 0 then return false end
            if unit == "ha" then areaCount = areaCount + 1 else baleCount = baleCount + 1 end
            if lifetime > 0 or session > 0 then nonzeroCount = nonzeroCount + 1 end
            if #rows >= MAX_ROWS then
                truncated = true
            else
                rows[#rows + 1] = {
                    farmId = farmId,
                    vehicleId = ctx.clip(vehicleId, 64),
                    vehicle = ctx.clip(ctx.call(vehicle, "getFullName") or ctx.call(vehicle, "getName"), 70),
                    activity = activity,
                    unit = unit,
                    -- Preserve a real sub-0.005 ha reading so the UI can show
                    -- "<0.01 ha" instead of an apparent zero beside Used=1.
                    lifetime = unit == "ha" and lifetime > 0 and lifetime < 0.005 and lifetime or ctx.round2(lifetime),
                    session = unit == "ha" and session > 0 and session < 0.005 and session or ctx.round2(session),
                }
            end
            return true
        end

        for _, vehicle in ipairs(vehicles) do
            if type(vehicle) == "table" then
                local matched = false
                local vehicleId = ctx.call(vehicle, "getUniqueId") or vehicle.uniqueId or vehicle.id
                for _, def in ipairs(AREA_SPECS) do
                    local spec = vehicle[def.field]
                    if type(spec) == "table" and add(vehicle, vehicleId, def.key, "ha", spec.usageCounter, spec.sessionCounter) then
                        matched = true
                    end
                end
                local bale = vehicle["spec_" .. tostring(ctx.modName) .. ".baleWrapCounter"]
                if type(bale) == "table" and add(vehicle, vehicleId, "baleWrap", "bales", bale.lifetimeCounter, bale.sessionCounter) then
                    matched = true
                end
                if matched then vehicleCount = vehicleCount + 1 end
            end
        end
        table.sort(rows, function(a, b)
            local va, vb = tostring(a.vehicle or ""), tostring(b.vehicle or "")
            if va ~= vb then return va < vb end
            return tostring(a.activity or "") < tostring(b.activity or "")
        end)
        return {
            readState = "ok",
            coverage = truncated and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = {
                vehicleCount = vehicleCount, areaCounterCount = areaCount,
                baleCounterCount = baleCount, nonzeroCount = nonzeroCount,
            } },
            rows = rows,
        }
    end,
})
