-- VIP Order Manager 1.2.2.0 has save-local orders without per-row farm IDs.
-- Its descriptor is single-player only. Read only the current local-farm order;
-- UpdateOutputLines, RestockVIPOrders and payout methods all mutate state.

local MAX_SCAN = 100
local MAX_ROWS = 30
local MAX_QUANTITY = 1000000000
local MAX_MONEY = 1000000000000

local function finite(value, maximum)
    local n = tonumber(value)
    if n ~= nil and n == n and n ~= math.huge and n ~= -math.huge
        and n >= 0 and n <= maximum then return n end
    return nil
end

local function integer(value, maximum)
    local n = finite(value, maximum)
    return n and n == math.floor(n) and n or nil
end

local function label(ctx, value, maximum)
    if type(value) == "string" and value ~= "" then
        return ctx.clip(value, maximum)
    end
    return nil
end

CompanionPages.register({
    key = "vipOrderManager",
    modNames = { "KM_65282_VIP_Order_Manager" },
    substrings = {},
    collect = function(ctx)
        if ctx.version ~= "1.2.2.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        if ctx.isMultiplayer then
            return { readState = "settings-only", reason = "single-player-only" }
        end
        local farmId = integer(ctx.farmId, 8)
        local mission = ctx.mission
        if not farmId or farmId == 0 or ctx.call(mission, "getFarmId") ~= farmId then
            return { readState = "settings-only", reason = "local-farm-mismatch" }
        end
        if ctx.call(mission, "getIsServer") ~= true
            or ctx.call(mission, "getIsClient") ~= true
            or (type(mission) == "table" and mission.isMissionStarted == false) then
            return { readState = "settings-only", reason = "single-player-world-not-ready" }
        end
        local manager = ctx.symbol("VIPOrderManager")
        if type(manager) ~= "table" or manager.InitDone ~= true
            or type(manager.VIPOrders) ~= "table" then
            return { readState = "settings-only", reason = "orders-not-loaded" }
        end
        local current = manager.VIPOrders[1]
        if current == nil then
            return { readState = "settings-only", reason = "no-current-order" }
        end
        if type(current) ~= "table" or type(current.entries) ~= "table" then
            return { readState = "partial", reason = "invalid-current-order" }
        end
        local level = integer(current.level, 1000000)
        if not level then
            return { readState = "partial", reason = "invalid-current-order" }
        end

        local rows, seen = {}, {}
        local scanned, invalid, truncated = 0, false, false
        for key, entry in pairs(current.entries) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then truncated = true; break end
            local fillType = type(entry) == "table"
                and label(ctx, entry.fillTypeName, 80) or nil
            local quantity = type(entry) == "table"
                and finite(entry.quantity, MAX_QUANTITY) or nil
            local delivered = type(entry) == "table"
                and finite(entry.fillLevel, MAX_QUANTITY) or nil
            local potentialPayout = type(entry) == "table"
                and finite(entry.payout, MAX_MONEY) or nil
            if not fillType or type(key) ~= "string" or key ~= fillType
                or seen[fillType] or not quantity or quantity == 0
                or not delivered or delivered > quantity + 0.01
                or not potentialPayout then
                invalid = true
            else
                seen[fillType] = true
                if #rows < MAX_ROWS then
                    rows[#rows + 1] = {
                        farmId = farmId,
                        fillType = fillType,
                        title = label(ctx, entry.title, 80),
                        quantity = quantity,
                        delivered = delivered,
                        remaining = math.max(0, quantity - delivered),
                        potentialPayout = potentialPayout,
                        isAnimal = entry.isAnimal == true,
                        neededAgeInMonths = integer(entry.neededAgeInMonths, 1000),
                    }
                else truncated = true end
            end
        end
        table.sort(rows, function(a, b) return a.fillType < b.fillType end)
        if #rows == 0 and not invalid and not truncated then invalid = true end
        local complete = not invalid and not truncated
        return {
            readState = complete and "ok" or "partial",
            reason = invalid and "invalid-current-order"
                or truncated and "order-items-truncated" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = complete and { [tostring(farmId)] = {
                currentLevel = level, itemCount = #rows,
            } } or nil,
            rows = rows,
        }
    end,
})
