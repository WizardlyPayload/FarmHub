-- BH Produced Water Tank Batteries 2.0.2.0: owned bank safety state and native water.
-- Never call the mod's refresh/reconcile/status helpers: they can change state.

local MAX_SCAN = 500
local MAX_BANKS = 40 -- Four tanks each; keep the exported tank list below the page array cap.

local function integer(value, low, high)
    local n = tonumber(value)
    if n and n == n and n >= low and n <= high and n == math.floor(n) then return n end
    return nil
end

local function finite(value, low, high)
    local n = tonumber(value)
    if n and n == n and n ~= math.huge and n ~= -math.huge
        and n >= low and n <= high then return n end
    return nil
end

local function identity(value)
    return type(value) == "string" and value ~= "" and #value <= 80 and value or nil
end

CompanionPages.register({
    key = "bhWaterBattery",
    modNames = { "FS25_BHProducedWaterTankBatteries", "ITCH_5209033_FS25_BHProducedWaterTankBatteries" },
    substrings = {},
    collect = function(ctx)
        if ctx.version ~= "2.0.2.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = integer(ctx.farmId, 1, 8)
        if not farmId then return { readState = "settings-only", reason = "no-farm" } end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-battery-state-only" }
        end
        local water = type(ctx.global("FillType")) == "table" and ctx.global("FillType").WATER or nil
        if integer(water, 1, 65535) == nil then
            return { readState = "settings-only", reason = "water-filltype-not-ready" }
        end
        local system = type(ctx.mission) == "table" and ctx.mission.placeableSystem or nil
        local placeables = type(system) == "table" and system.placeables or nil
        if type(placeables) ~= "table" then
            return { readState = "settings-only", reason = "placeables-not-ready" }
        end
        local specKey = "spec_" .. ctx.modName .. ".bhWaterBattery"
        local candidates, ids, scanned = {}, {}, 0
        local invalid, truncated = false, false
        for _, placeable in pairs(placeables) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then truncated = true; break end
            if type(placeable) == "table"
                and integer(ctx.call(placeable, "getOwnerFarmId"), 1, 8) == farmId
                and type(placeable[specKey]) == "table" then
                local id = identity(placeable.uniqueId or ctx.call(placeable, "getUniqueId"))
                if id == nil then invalid = true
                else
                    ids[id] = (ids[id] or 0) + 1
                    candidates[#candidates + 1] = { id = id, placeable = placeable,
                        spec = placeable[specKey] }
                end
            end
        end

        local banks, bankCount, tankCount = {}, 0, 0
        local waterTotal, producedTotal, loadedTotal, alarmCount = 0, 0, 0, 0
        for _, candidate in ipairs(candidates) do
            local spec = candidate.spec
            local silo = candidate.placeable.spec_silo
            local storages = type(silo) == "table" and silo.storages or nil
            local valid = ids[candidate.id] == 1 and spec.ready == true
                and spec.configValid == true and spec.deleted ~= true
                and type(spec.bankESD) == "boolean"
                and type(spec.bankAcknowledged) == "boolean"
                and integer(spec.selectedTank, 1, 4) ~= nil
                and type(spec.tanks) == "table" and #spec.tanks == 4
                and type(storages) == "table" and #storages == 4
            local produced = finite(spec.totalProduced, 0, 1e15)
            local loaded = finite(spec.totalLoaded, 0, 1e15)
            if produced == nil or loaded == nil then valid = false end
            local tanks, bankWater, bankAlarms = {}, 0, 0
            if valid then
                for i = 1, 4 do
                    local tank, storage = spec.tanks[i], storages[i]
                    local flags = { "inletOpen", "outletOpen", "lowLocked", "highLatched",
                        "drawdownAuthorized", "acknowledged" }
                    if type(tank) ~= "table" or type(storage) ~= "table" then
                        valid = false; break
                    end
                    for _, field in ipairs(flags) do
                        if type(tank[field]) ~= "boolean" then valid = false; break end
                    end
                    if not valid then break end
                    local capacity = finite(ctx.call(storage, "getCapacity", water), 0.001, 1e12)
                    local level = finite(ctx.call(storage, "getFillLevel", water), 0, 1e12)
                    if capacity == nil or level == nil or level > capacity + 0.001 then
                        valid = false; break
                    end
                    tanks[i] = {
                        number = i, selected = spec.selectedTank == i,
                        waterLiters = level, capacityLiters = capacity,
                        inletOpen = tank.inletOpen, outletOpen = tank.outletOpen,
                        lowLocked = tank.lowLocked, highLatched = tank.highLatched,
                        drawdownAuthorized = tank.drawdownAuthorized,
                        acknowledged = tank.acknowledged,
                    }
                    bankWater = bankWater + level
                    if tank.highLatched and not tank.acknowledged then bankAlarms = bankAlarms + 1 end
                end
            end
            if not valid then
                invalid = true
            elseif #banks < MAX_BANKS then
                banks[#banks + 1] = {
                    farmId = farmId, batteryId = candidate.id,
                    battery = ctx.clip(ctx.call(candidate.placeable, "getName") or candidate.id, 80),
                    bankESD = spec.bankESD, bankAcknowledged = spec.bankAcknowledged,
                    selectedTank = spec.selectedTank, waterLiters = bankWater,
                    totalProducedLiters = produced, totalLoadedLiters = loaded,
                    unacknowledgedHighTanks = bankAlarms, tanks = tanks,
                }
                bankCount, tankCount = bankCount + 1, tankCount + 4
                waterTotal, producedTotal, loadedTotal = waterTotal + bankWater,
                    producedTotal + produced, loadedTotal + loaded
                alarmCount = alarmCount + bankAlarms
            else truncated = true end
        end
        if #candidates == 0 and not invalid and not truncated then
            return { readState = "settings-only", reason = "no-owned-battery" }
        end
        table.sort(banks, function(a, b) return a.batteryId < b.batteryId end)
        return {
            readState = invalid and "partial" or "ok",
            reason = invalid and "ambiguous-or-unreadable-owned-battery" or nil,
            coverage = truncated and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = {
                batteryCount = bankCount, tankCount = tankCount,
                waterLiters = waterTotal, totalProducedLiters = producedTotal,
                totalLoadedLiters = loadedTotal, unacknowledgedHighTanks = alarmCount,
            } },
            banks = banks,
        }
    end,
})
