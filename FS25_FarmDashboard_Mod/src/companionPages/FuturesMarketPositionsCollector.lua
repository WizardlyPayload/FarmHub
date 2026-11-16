-- Futures Market v1.2.0.0 stores open, farm-keyed positions in its server register.
-- Closing, repricing and projected P&L are intentionally outside this reading.

local MAX_SCAN = 300
local MAX_ROWS = 40

CompanionPages.register({
    key = "futuresMarketPositions",
    modNames = { "KM_82100_FUTURES_MARKET", "FS25_FuturesMarket" },
    substrings = { "futures_market", "futuresmarket" },
    collect = function(ctx)
        if ctx.version ~= "1.2.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = ctx.farmId
        local mission = ctx.mission
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-register-only" }
        end
        local manager = type(mission) == "table" and mission.FuturesMarket or nil
        if type(manager) ~= "table" or type(manager.contracts) ~= "table" then
            return { readState = "settings-only", reason = "position-register-unavailable" }
        end

        local rows, count, totalMargin = {}, 0, 0
        local scanned, invalid, truncated = 0, false, false
        for _, position in pairs(manager.contracts) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then truncated = true; break end
            if type(position) == "table" and ctx.num(position.farmId) == farmId then
                local amount = ctx.num(position.amount)
                local leverage = ctx.num(position.leverage)
                local entry = ctx.num(position.entry)
                local margin = ctx.num(position.margin)
                local expiry = ctx.num(position.expiration)
                local direction = position.direction
                if (direction ~= "LONG" and direction ~= "SHORT") or amount == nil or amount <= 0
                    or leverage == nil or leverage < 1 or entry == nil or entry < 0
                    or margin == nil or margin < 0 or expiry == nil or expiry < 0
                    or type(position.crop) ~= "string" or position.crop == "" then
                    invalid = true
                else
                    count = count + 1
                    totalMargin = totalMargin + margin
                    if #rows < MAX_ROWS then
                        rows[#rows + 1] = {
                            farmId = farmId,
                            crop = ctx.clip(position.crop, 60),
                            direction = direction,
                            amount = ctx.round2(amount),
                            leverage = ctx.round2(leverage),
                            entryPrice = ctx.round2(entry),
                            postedMargin = ctx.round2(margin),
                            expiryPeriod = math.floor(expiry),
                        }
                    else
                        truncated = true
                    end
                end
            end
        end
        table.sort(rows, function(a, b)
            if a.expiryPeriod ~= b.expiryPeriod then return a.expiryPeriod < b.expiryPeriod end
            return tostring(a.crop) < tostring(b.crop)
        end)
        return {
            readState = invalid and "partial" or count > 0 and "ok" or "settings-only",
            reason = count == 0 and "no-farm-positions" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = { [tostring(farmId)] = { positionCount = count, postedMargin = ctx.round2(totalMargin) } },
            positions = rows,
        }
    end,
})
