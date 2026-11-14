-- Ritter Fresh 1.1.0.0-dev.1 records expired goods in a save-local loss log.
-- Value is the mod's estimated market value at expiry, never a cash debit.

local MAX_SCAN = 2000
local MAX_ROWS = 40
local MAX_CONTAINERS = 3000
local MAX_STORED_OBJECTS = 10000
local MAX_INVENTORY_ROWS = 50

local function boundedNumber(value, minimum, maximum, integer)
    local n = tonumber(value)
    if n == nil or n ~= n or n == math.huge or n == -math.huge
        or n < minimum or n > maximum or (integer and n ~= math.floor(n)) then
        return nil
    end
    return n
end

-- The mod's own inventory summary filters its saved container.farmId, which is not
-- refreshed when a saved container reconciles with a newly owned runtime entity.
-- Resolve current ownership before reporting any present stock for a farm.
local function currentOwner(ctx, container, placeables)
    local entity = container.runtimeEntity
    if type(entity) ~= "table" then return nil end
    if container.entityType ~= "stored" then
        return boundedNumber(ctx.call(entity, "getOwnerFarmId"), 1, 1000000, true)
    end

    local identity = type(container.identityMatch) == "table" and container.identityMatch or nil
    local world = identity and identity.worldObject
    local uniqueId = type(world) == "table" and world.uniqueId or nil
    if type(uniqueId) ~= "string" or uniqueId == "" then return nil end
    local placeable = placeables[uniqueId]
    if placeable == nil or placeable == false then return nil end
    local spec = placeable.spec_objectStorage
    local objects = type(spec) == "table" and spec.storedObjects or nil
    if type(objects) ~= "table" or #objects > MAX_STORED_OBJECTS then return nil end
    for _, object in ipairs(objects) do
        if object == entity then
            return boundedNumber(ctx.call(placeable, "getOwnerFarmId"), 1, 1000000, true)
        end
    end
    return nil
end

local function collectCurrentInventory(ctx, manager, farmId)
    local settings = ctx.symbol("RmFreshSettings")
    local containers = manager.containers
    if type(settings) ~= "table" or type(containers) ~= "table"
        or type(settings.isPerishableByIndex) ~= "function"
        or type(settings.getExpiration) ~= "function"
        or type(manager.getAgingMultiplier) ~= "function" then
        return { readState = "settings-only", reason = "inventory-not-ready" }
    end

    local placeables = {}
    local system = type(ctx.mission.placeableSystem) == "table" and ctx.mission.placeableSystem or nil
    local list = system and system.placeables
    if type(list) == "table" and #list <= MAX_CONTAINERS then
        for _, placeable in ipairs(list) do
            if type(placeable) == "table" and type(placeable.uniqueId) == "string" then
                local id = placeable.uniqueId
                placeables[id] = placeables[id] == nil and placeable or false
            end
        end
    end

    local days = ctx.mission.environment and boundedNumber(ctx.mission.environment.daysPerPeriod, 1, 100, true) or nil
    local warningHours = boundedNumber(ctx.call(settings, "getWarningHours"), 0, 100000, false)
    if days == nil or warningHours == nil then
        return { readState = "settings-only", reason = "time-settings-not-ready" }
    end
    local entries, seen, partial = {}, 0, false
    local expirationEnabled = ctx.call(settings, "isExpirationEnabled")
    if expirationEnabled == nil then
        return { readState = "settings-only", reason = "expiration-settings-not-ready" }
    end
    for _, container in pairs(containers) do
        seen = seen + 1
        if seen > MAX_CONTAINERS then partial = true; break end
        if type(container) == "table" then
            local owner = currentOwner(ctx, container, placeables)
            if owner == nil then
                partial = true
            elseif owner == farmId then
                local identity = type(container.identityMatch) == "table" and container.identityMatch or nil
                local storage = identity and identity.storage
                local name = type(storage) == "table" and storage.fillTypeName or nil
                local index = boundedNumber(container.fillTypeIndex, 1, 1000000, true)
                local batches = container.batches
                local threshold = type(name) == "string" and ctx.call(settings, "getExpiration", name) or nil
                if type(name) ~= "string" or name == "" or index == nil or type(batches) ~= "table"
                    or #batches > MAX_STORED_OBJECTS then
                    partial = true
                elseif ctx.call(settings, "isPerishableByIndex", index) == true and threshold ~= nil then
                    threshold = boundedNumber(threshold, 0.001, 100000, false)
                    local multiplier = boundedNumber(ctx.call(manager, "getAgingMultiplier", container), 0, 1000, false)
                    if threshold == nil or multiplier == nil then
                        partial = true
                    else
                        local amount, expiring, soonest = 0, 0, nil
                        local valid = true
                        for _, batch in ipairs(batches) do
                            local litres = type(batch) == "table" and boundedNumber(batch.amount, 0, 1000000000, false) or nil
                            local age = type(batch) == "table" and boundedNumber(batch.ageInPeriods, 0, 100000, false) or nil
                            if litres == nil or age == nil then valid = false; break end
                            amount = amount + litres
                            if litres >= 0.001 and expirationEnabled == true and multiplier > 0 then
                                local hours = (threshold - age) * days * 24 / multiplier
                                if hours <= warningHours then expiring = expiring + litres end
                                if soonest == nil or hours < soonest then soonest = hours end
                            end
                        end
                        if not valid then
                            partial = true
                        elseif amount >= 1 then
                            local entry = entries[name] or { farmId = farmId, fillTypeName = ctx.clip(name, 64), totalLitres = 0,
                                expiringLitres = 0, containerCount = 0 }
                            entry.totalLitres = entry.totalLitres + amount
                            entry.expiringLitres = entry.expiringLitres + expiring
                            entry.containerCount = entry.containerCount + 1
                            if soonest ~= nil and (entry.soonestHours == nil or soonest < entry.soonestHours) then
                                entry.soonestHours = soonest
                            end
                            entries[name] = entry
                        end
                    end
                end
            end
        else
            partial = true
        end
    end

    local rows = {}
    for _, entry in pairs(entries) do rows[#rows + 1] = entry end
    table.sort(rows, function(a, b) return a.fillTypeName < b.fillTypeName end)
    local rowCount = #rows
    while #rows > MAX_INVENTORY_ROWS do table.remove(rows) end
    return {
        readState = partial and "partial" or "ok",
        coverage = (partial or rowCount > MAX_INVENTORY_ROWS) and "partial" or "complete",
        warningHours = warningHours,
        expirationEnabled = expirationEnabled,
        rows = rows,
    }
end

CompanionPages.register({
    key = "ritterFreshLoss",
    modNames = { "FS25_Fresh", "GH_rittermod__FS25_Fresh_FS25_Fresh" },
    collect = function(ctx)
        local farmId = boundedNumber(ctx.farmId, 1, 1000000, true)
        if farmId == nil then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-log-only" }
        end
        if ctx.version ~= "1.1.0.0-dev.1" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local manager = ctx.symbol("RmFreshManager")
        local tracker = ctx.symbol("RmLossTracker")
        local log = type(tracker) == "table" and tracker.lossLog or nil
        if type(manager) ~= "table" or manager.initialized ~= true or type(log) ~= "table" then
            return { readState = "settings-only", reason = "log-not-ready" }
        end

        local rows, count, litres = {}, 0, 0
        local partial = false
        local total = #log
        local first = math.max(1, total - MAX_SCAN + 1)
        local truncated = first > 1
        for i = total, first, -1 do
            local entry = log[i]
            if type(entry) == "table" and boundedNumber(entry.farmId, 1, 1000000, true) == farmId then
                local amount = boundedNumber(entry.amount, 0.001, 1000000000, false)
                local year = boundedNumber(entry.year, 1, 10000, true)
                local period = boundedNumber(entry.period, 1, 12, true)
                local day = boundedNumber(entry.dayInPeriod, 1, 100, true)
                local hour = boundedNumber(entry.hour, 0, 23, true)
                local fillTypeName = type(entry.fillTypeName) == "string" and entry.fillTypeName or nil
                if amount ~= nil and year ~= nil and period ~= nil and day ~= nil and hour ~= nil
                    and fillTypeName ~= nil and fillTypeName ~= "" then
                    count = count + 1
                    litres = litres + amount
                    if #rows < MAX_ROWS then
                        local value = boundedNumber(entry.value, 0.001, 1000000000000, false)
                        rows[#rows + 1] = {
                            farmId = farmId,
                            year = year, period = period, dayInPeriod = day, hour = hour,
                            fillTypeName = ctx.clip(fillTypeName, 64),
                            amountLitres = amount,
                            estimatedValue = value,
                            location = ctx.clip(entry.location, 90),
                            entityType = ctx.clip(entry.entityType, 40),
                        }
                    else
                        truncated = true
                    end
                else
                    partial = true
                end
            end
        end
        return {
            readState = partial and "partial" or "ok",
            coverage = truncated and "truncated" or partial and "partial" or "complete",
            byFarm = { [tostring(farmId)] = {
                loggedLossCountScanned = count,
                lostLitresScanned = litres,
            } },
            rows = rows,
            currentInventory = collectCurrentInventory(ctx, manager, farmId),
        }
    end,
})
