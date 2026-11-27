-- Fair Leasing Plus 1.0.0.0 stores per-farm vehicle-return rewards in fairLeasingPlus.xml.
-- The mod's savedMoney is an estimated upfront leasing-fee saving, not realized income.

local RANKS = {
    { points = 150, name = "DIAMOND", bonus = 0.25 },
    { points = 100, name = "PLATINUM", bonus = 0.20 },
    { points = 60, name = "GOLD", bonus = 0.15 },
    { points = 30, name = "SILVER", bonus = 0.10 },
    { points = 10, name = "BRONZE", bonus = 0.05 },
    { points = 0, name = "IRON", bonus = 0 },
}

local function nonnegative(ctx, value)
    local n = ctx.num(value)
    return n ~= nil and n >= 0 and n or nil
end

local function count(ctx, value)
    local n = nonnegative(ctx, value)
    return n ~= nil and n == math.floor(n) and n or nil
end

local function discount(ctx, value)
    local n = nonnegative(ctx, value)
    return n ~= nil and n <= 0.75 and n or nil
end

local function rankFor(points)
    for _, rank in ipairs(RANKS) do
        if points >= rank.points then return rank end
    end
    return RANKS[#RANKS]
end

CompanionPages.register({
    key = "fairLeasingPlus",
    modNames = { "FS25_FairLeasingPlus", "FS25_356407_Fair_Leasing_Plus" },
    substrings = { "fairleasingplus", "fair_leasing_plus" },
    collect = function(ctx)
        if ctx.version ~= "1.0.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = count(ctx, ctx.farmId)
        if farmId == nil or farmId == 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-rewards-only" }
        end
        local mod = ctx.symbol("FairLeasingPlus")
        local rewards = type(mod) == "table" and mod.rewards or nil
        local settings = type(mod) == "table" and mod.settings or nil
        if type(rewards) ~= "table" or type(rewards.farms) ~= "table" or type(settings) ~= "table" then
            return { readState = "settings-only", reason = "rewards-unavailable" }
        end
        local saved = rewards.farms[farmId]
        if type(saved) ~= "table" then
            return { readState = "settings-only", reason = "no-return-history" }
        end
        local points, returns = count(ctx, saved.points), count(ctx, saved.returnsCount)
        local clean, full = count(ctx, saved.cleanReturns), count(ctx, saved.fullTankReturns)
        local estimatedSaved = nonnegative(ctx, saved.savedMoney)
        local base = discount(ctx, settings.baseDiscount)
        local day = discount(ctx, settings.dayDiscount)
        local hour = discount(ctx, settings.hourDiscount)
        if points == nil or returns == nil or clean == nil or full == nil or estimatedSaved == nil
            or base == nil or day == nil or hour == nil or clean > returns or full > returns then
            return { readState = "partial", reason = "invalid-reward-state" }
        end
        if returns == 0 then
            return { readState = "settings-only", reason = "no-return-history" }
        end
        local rank = rankFor(points)
        return {
            readState = "ok",
            byFarm = { [tostring(farmId)] = {
                points = points,
                returnsCount = returns,
                cleanReturns = clean,
                fullTankReturns = full,
                estimatedUpfrontSaving = ctx.round2(estimatedSaved),
                rank = rank.name,
                bonusDiscountPercent = ctx.round2(rank.bonus * 100),
                baseDiscountPercent = ctx.round2(math.min(base + rank.bonus, 0.75) * 100),
                dayDiscountPercent = ctx.round2(math.min(day + rank.bonus, 0.75) * 100),
                hourDiscountPercent = ctx.round2(math.min(hour + rank.bonus, 0.75) * 100),
            } },
        }
    end,
})
