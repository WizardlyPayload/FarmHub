-- AutoSwitch 1.0.3.0 keeps current wheel wear plus saved wear for other wheel configurations.
-- Inspect live server tables only; never call getState, which creates and applies tire state.

local MAX_SETS, MAX_WHEELS = 8, 24
local MAX_SCAN, MAX_ROWS = 400, 80

local function decodedWear(ctx, value)
    local n = ctx.num(value)
    if n == nil then return nil end
    local cut = n >= 10
    if cut then n = n - 10 end
    if n < 0 or n > 1 then return nil end
    return ctx.round2(n * 100), cut
end

CompanionPages.register({
    key = "autoSwitchTireLife",
    modNames = { "KM_82844_AutoSwitch", "FS25_AutoSwitch" },
    substrings = { "autoswitch" },
    collect = function(ctx)
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.version ~= "1.0.3.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-state-only" }
        end
        if ctx.mission.isMissionStarted == false then
            return { readState = "settings-only", reason = "world-not-started" }
        end
        local tire = ctx.symbol("AS_TireLife") or ctx.global("AS_TireLife")
        if type(tire) ~= "table" or tire.active ~= true or tire.ENABLED ~= true
            or type(tire.vehicles) ~= "table" or type(tire.pending) ~= "table" then
            return { readState = "settings-only", reason = "tire-module-inactive" }
        end
        local vehicles = ctx.ownedVehicles()
        if type(vehicles) ~= "table" then
            return { readState = "settings-only", reason = "no-owned-vehicle-list" }
        end

        local rows, scanned, invalid = {}, 0, false
        local truncated = ctx.ownedScanTruncated == true
        local function add(vehicleId, vehicleName, cfg, wheelIndex, value, reading)
            scanned = scanned + 1
            if scanned > MAX_SCAN then truncated = true; return false end
            local wear, cut = decodedWear(ctx, value)
            if wear == nil then invalid = true; return true end
            if #rows >= MAX_ROWS then truncated = true; return true end
            rows[#rows + 1] = {
                farmId = farmId, vehicleId = vehicleId, vehicle = vehicleName,
                wheelConfiguration = cfg, wheelIndex = wheelIndex,
                wearPct = wear, cut = cut, reading = reading,
            }
            return true
        end
        local function addSet(vehicleId, vehicleName, cfg, list)
            if type(list) ~= "table" then invalid = true; return true end
            if #list > MAX_WHEELS then truncated = true end
            for i = 1, math.min(#list, MAX_WHEELS) do
                if not add(vehicleId, vehicleName, cfg, i, list[i], "saved") then return false end
            end
            return true
        end
        for _, vehicle in ipairs(vehicles) do
            if type(vehicle) == "table" then
                local owner = ctx.num(ctx.call(vehicle, "getOwnerFarmId")) or ctx.num(vehicle.ownerFarmId)
                local id = type(vehicle.uniqueId) == "string" and vehicle.uniqueId or nil
                if owner == farmId and id ~= nil and id ~= "" then
                    local st = tire.vehicles[vehicle]
                    local pending = st == nil and tire.pending[id] or nil
                    local sets = type(st) == "table" and st.sets or type(pending) == "table" and pending.sets or nil
                    local currentCfg = type(st) == "table" and ctx.num(st.cfg) or nil
                    local name = ctx.clip(ctx.call(vehicle, "getFullName") or ctx.call(vehicle, "getName"), 70)
                    id = ctx.clip(id, 64)
                    if type(pending) == "table" and pending.uyt ~= nil then invalid = true end
                    if type(st) == "table" then
                        local spec = type(vehicle.spec_wheels) == "table" and vehicle.spec_wheels or nil
                        local wheels = spec and spec.wheels or nil
                        if currentCfg == nil or type(wheels) ~= "table" or #wheels == 0 then
                            invalid = true
                        else
                            if #wheels > MAX_WHEELS then truncated = true end
                            for i = 1, math.min(#wheels, MAX_WHEELS) do
                                local wheel = wheels[i]
                                if type(wheel) ~= "table" then invalid = true
                                else
                                    local wear = ctx.num(wheel.__asWear)
                                    if wear == nil then wear = 0 end
                                    local encoded = wear + (wheel.__asCut == true and 10 or 0)
                                    if not add(id, name, currentCfg, i, encoded, "live") then break end
                                end
                            end
                        end
                    end
                    if sets ~= nil then
                        if type(sets) ~= "table" then invalid = true else
                            local n = 0
                            for cfg, list in pairs(sets) do
                                n = n + 1
                                if n > MAX_SETS then truncated = true; break end
                                local configId = ctx.num(cfg)
                                if configId == nil or configId < 1 or configId ~= math.floor(configId) then
                                    invalid = true
                                elseif st == nil or configId ~= currentCfg then
                                    if not addSet(id, name, configId, list) then break end
                                end
                            end
                        end
                    elseif st ~= nil or pending ~= nil then
                        invalid = true
                    end
                end
            end
            if scanned > MAX_SCAN then break end
        end
        table.sort(rows, function(a, b)
            if a.vehicleId ~= b.vehicleId then return a.vehicleId < b.vehicleId end
            if a.wheelConfiguration ~= b.wheelConfiguration then return a.wheelConfiguration < b.wheelConfiguration end
            return a.wheelIndex < b.wheelIndex
        end)
        if #rows == 0 then
            return { readState = invalid and "partial" or "settings-only",
                coverage = truncated and "truncated" or invalid and "partial" or "complete",
                reason = invalid and "invalid-tire-state" or "no-recorded-tires" }
        end
        return {
            readState = "ok",
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = { [tostring(farmId)] = { shownWheelReadings = #rows } },
            rows = rows,
        }
    end,
})
