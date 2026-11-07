-- Shop Refund v1.0.0.0: read tracked purchase records for current farm vehicles.
-- A recorded candidate is not a guaranteed refund: dealer location, condition,
-- configuration and sale context still determine the actual price.

local MAX_SCAN, MAX_ROWS = 300, 50
local WINDOW_MS = 30 * 60 * 1000

local function currentMonthKey(ctx, mission)
    local environment = type(mission) == "table" and mission.environment or nil
    if type(environment) ~= "table" then return nil end
    local year = ctx.num(ctx.call(environment, "getCurrentYear"))
        or ctx.num(environment.currentYear) or ctx.num(environment.year) or 0
    local period = ctx.num(ctx.call(environment, "getCurrentPeriod"))
        or ctx.num(environment.currentPeriod) or ctx.num(environment.period)
        or ctx.num(environment.currentMonth) or ctx.num(environment.month)
        or ctx.num(ctx.call(environment, "getCurrentMonth"))
    if period == nil then return nil end
    return tostring(math.floor(year)) .. ":" .. tostring(math.floor(period))
end

CompanionPages.register({
    key = "shopRefund",
    modNames = { "FS25_364635_Shop_Refund", "FS25_ShopRefund" },
    substrings = { "shop_refund", "shoprefund" },
    collect = function(ctx)
        local farmId, mission = ctx.farmId, ctx.mission
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-state-only" }
        end
        if type(mission) ~= "table" or mission.isMissionStarted ~= true then
            return { readState = "settings-only", reason = "world-not-started" }
        end
        local mod = ctx.symbol("ShopRefund") or ctx.global("ShopRefund")
        if type(mod) ~= "table" or mod.xmlLoadPending == true
            or type(mod.refundsByUniqueId) ~= "table" then
            return { readState = "settings-only", reason = "refund-register-unavailable" }
        end
        local vehicles = ctx.ownedVehicles()
        if type(vehicles) ~= "table" then
            return { readState = "settings-only", reason = "owned-vehicles-unavailable" }
        end
        local owned = {}
        for _, vehicle in ipairs(vehicles) do
            local id = type(vehicle) == "table" and
                (ctx.call(vehicle, "getUniqueId") or vehicle.uniqueId) or nil
            if type(id) == "string" and id ~= "" then owned[id] = vehicle end
        end

        local month = currentMonthKey(ctx, mission)
        local rows, count, withheld, scanned = {}, 0, 0, 0
        local invalid, truncated = false, ctx.ownedScanTruncated == true
        for uniqueId, entry in pairs(mod.refundsByUniqueId) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then truncated = true; break end
            if type(entry) == "table" and ctx.num(entry.farmId) == farmId then
                local vehicle = owned[uniqueId]
                local owner = vehicle and (ctx.num(ctx.call(vehicle, "getOwnerFarmId"))
                    or ctx.num(vehicle.ownerFarmId)) or nil
                local base = ctx.num(entry.baseOperatingTime)
                local current = vehicle and ctx.num(vehicle.operatingTime) or nil
                local price = ctx.num(entry.purchasePrice)
                local savedMonth = entry.purchaseMonthKey
                local inMonth = savedMonth == nil or savedMonth == "" or (type(savedMonth) == "string"
                    and month ~= nil and savedMonth == month)
                local elapsed = base and current and math.max(0, current - base) or nil
                if vehicle == nil or owner ~= farmId or elapsed == nil or elapsed > WINDOW_MS
                    or not inMonth then
                    withheld = withheld + 1
                    invalid = true
                elseif base < 0 or current < 0 or price == nil or price < 0
                    or type(uniqueId) ~= "string" or uniqueId == "" then
                    invalid = true
                else
                    count = count + 1
                    if #rows >= MAX_ROWS then truncated = true
                    else
                        rows[#rows + 1] = {
                            farmId = farmId,
                            vehicleId = ctx.clip(uniqueId, 80),
                            vehicle = ctx.clip(ctx.call(vehicle, "getName")
                                or entry.name or uniqueId, 80),
                            recordedPriceBasis = ctx.round2(price),
                            operatingMinutesUsed = ctx.round2(elapsed / 60000),
                            operatingMinutesLeft = math.max(0, math.ceil((WINDOW_MS - elapsed) / 60000)),
                        }
                    end
                end
            end
        end
        table.sort(rows, function(a, b)
            return tostring(a.vehicle or "") < tostring(b.vehicle or "")
        end)
        return {
            readState = invalid and "partial" or (count > 0 and "ok" or "settings-only"),
            reason = count == 0 and "no-current-farm-candidates" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = { [tostring(farmId)] = {
                candidateCount = count,
                withheldCount = withheld,
            } },
            rows = rows,
        }
    end,
})
