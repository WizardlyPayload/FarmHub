-- Kiselevka 4x v1.0.1.3: one live map auction, never a saved-XML bid ledger.
-- The map's AuctionManager owns the current auction and may replace it when
-- game time passes the deadline. Do not call its update, save or bid methods.

local function finite(value, maximum)
    local n = tonumber(value)
    if n and n == n and n ~= math.huge and n ~= -math.huge
        and n >= 0 and n <= maximum then return n end
    return nil
end

local function positiveInteger(value, maximum)
    local n = finite(value, maximum)
    return n and n > 0 and n == math.floor(n) and n or nil
end

CompanionPages.register({
    key = "kiselevkaAuction",
    modNames = { "KM_77461_kiselevka-4x" },
    substrings = {},
    collect = function(ctx)
        if ctx.version ~= "1.0.1.3" then
            return { readState = "settings-only", reason = "unreviewed-map-version" }
        end
        local farmId = positiveInteger(ctx.farmId, 8)
        if not farmId then
            return { readState = "settings-only", reason = "no-selected-farm" }
        end
        local mission = ctx.mission
        if ctx.call(mission, "getIsServer") ~= true
            or type(mission) ~= "table" or mission.isMissionStarted ~= true then
            return { readState = "settings-only", reason = "server-world-not-ready" }
        end
        local manager = ctx.symbol("AuctionManager")
        if type(manager) ~= "table" or type(manager.getCurrentAuction) ~= "function" then
            return { readState = "settings-only", reason = "live-auction-manager-unavailable" }
        end
        local env = mission.environment
        local day = type(env) == "table" and finite(env.currentDay, 1000000) or nil
        local dayTime = type(env) == "table" and finite(env.dayTime, 86400000) or nil
        if dayTime == nil and type(env) == "table" then
            dayTime = finite(ctx.call(env, "getEnvironmentTime"), 86400000)
        end
        if not day or not dayTime then
            return { readState = "settings-only", reason = "game-clock-unavailable" }
        end
        local now = day * 24 + dayTime / 3600000
        local auction = ctx.call(manager, "getCurrentAuction")
        if type(auction) ~= "table" then
            return { readState = "settings-only", reason = "no-current-auction" }
        end
        local farmlandId = positiveInteger(auction.farmlandId, 1000000)
        local startTime = finite(auction.startTime, 24000000)
        local endTime = finite(auction.endTime, 24000000)
        if not farmlandId or not startTime or not endTime or endTime <= startTime then
            return { readState = "partial", reason = "invalid-auction-clock" }
        end
        if auction.hasStarted ~= true or now < startTime or now >= endTime then
            return { readState = "settings-only", reason = "no-active-auction" }
        end
        local price = finite(auction.currentPrice, 1000000000000)
        local original = finite(auction.originalPrice, 1000000000000)
        local highest = finite(auction.currentHighestFarmId, 1000000)
        if not price or not original or not highest then
            return { readState = "partial", reason = "invalid-auction-values" }
        end
        return {
            readState = "ok", coverage = "complete",
            byFarm = { [tostring(farmId)] = {
                farmlandId = farmlandId,
                currentPrice = price,
                originalPrice = original,
                remainingGameHours = ctx.round2(endTime - now),
                leading = highest == farmId,
            } },
        }
    end,
})
