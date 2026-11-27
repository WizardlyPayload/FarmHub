-- Smart Barrier Pack 1.0.0.0: saved mode/configuration and live arm position.
-- A schedule choice is not an observed opening or a record of traffic.

local MAX_PLACEABLES = 500
local MAX_ROWS = 80

local function integer(value, maximum)
    local n = tonumber(value)
    if n and n == n and n >= 0 and n <= maximum and n == math.floor(n) then return n end
    return nil
end

local function finite(value, minimum, maximum)
    local n = tonumber(value)
    if n and n == n and n ~= math.huge and n ~= -math.huge
        and n >= minimum and n <= maximum then return n end
    return nil
end

local function identity(value)
    return type(value) == "string" and value ~= "" and #value <= 80 and value or nil
end

CompanionPages.register({
    key = "smartBarrier",
    modNames = { "KM_82078_smart-barrier-pack", "FS25_SmartBarrierPack" },
    substrings = {},
    collect = function(ctx)
        if ctx.version ~= "1.0.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = integer(ctx.farmId, 8)
        if not farmId or farmId == 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-barrier-state-only" }
        end
        local system = type(ctx.mission) == "table" and ctx.mission.placeableSystem or nil
        local placeables = type(system) == "table" and system.placeables or nil
        if type(placeables) ~= "table" then
            return { readState = "settings-only", reason = "placeables-not-ready" }
        end

        local candidates, ids = {}, {}
        local invalid, truncated, scanned = false, false, 0
        for _, placeable in pairs(placeables) do
            scanned = scanned + 1
            if scanned > MAX_PLACEABLES then truncated = true; break end
            if type(placeable) == "table"
                and integer(ctx.call(placeable, "getOwnerFarmId"), 8) == farmId
                and type(placeable.spec_smartBarrier) == "table" then
                local id = identity(placeable.uniqueId or ctx.call(placeable, "getUniqueId"))
                if not id then invalid = true
                else
                    ids[id] = (ids[id] or 0) + 1
                    candidates[#candidates + 1] = { id = id, placeable = placeable,
                        spec = placeable.spec_smartBarrier }
                end
            end
        end

        local rows, automaticCount, openCount, warningCount = {}, 0, 0, 0
        for _, candidate in ipairs(candidates) do
            local spec = candidate.spec
            local animation = type(spec.animatedObject) == "table"
                and spec.animatedObject.animation or nil
            local time = type(animation) == "table" and finite(animation.time, 0, 1) or nil
            local direction = type(animation) == "table" and finite(animation.direction, -1, 1) or nil
            local warning = finite(spec.warningTimer, -1, 60000)
            local startHour = integer(spec.scheduleStartHour, 24)
            local endHour = integer(spec.scheduleEndHour, 24)
            if ids[candidate.id] ~= 1 or type(spec.automatic) ~= "boolean"
                or type(spec.scheduleEnabled) ~= "boolean" or time == nil
                or direction == nil or warning == nil or startHour == nil or endHour == nil then
                invalid = true
            elseif #rows < MAX_ROWS then
                local position = "partway"
                if time >= 0.999 and direction ~= -1 then position = "open"
                elseif time <= 0.001 and direction ~= 1 then position = "closed" end
                rows[#rows + 1] = {
                    farmId = farmId, barrierId = candidate.id,
                    barrier = ctx.clip(ctx.call(candidate.placeable, "getName") or candidate.id, 80),
                    automatic = spec.automatic, scheduleEnabled = spec.scheduleEnabled,
                    scheduleStartHour = startHour, scheduleEndHour = endHour,
                    position = position, warning = warning > 0,
                }
                if spec.automatic then automaticCount = automaticCount + 1 end
                if position == "open" then openCount = openCount + 1 end
                if warning > 0 then warningCount = warningCount + 1 end
            else truncated = true end
        end
        if #candidates == 0 and not invalid and not truncated then
            return { readState = "settings-only", reason = "no-owned-barrier" }
        end
        table.sort(rows, function(a, b) return a.barrierId < b.barrierId end)
        return {
            readState = invalid and "partial" or "ok",
            reason = invalid and "ambiguous-or-unreadable-owned-barrier" or nil,
            coverage = truncated and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = {
                barrierCount = #rows, automaticCount = automaticCount,
                openCount = openCount, warningCount = warningCount,
            } },
            rows = rows,
        }
    end,
})
