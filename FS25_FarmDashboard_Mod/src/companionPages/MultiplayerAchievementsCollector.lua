-- Multiplayer Achievements 1.0.0.0 stores a server-owned eligibility ledger on
-- each Farm. The profile progress.xml is personal and is never exported here.
-- Do not call MPAchievementShared:getLedger: it initializes and clamps state.

local function finite(value)
    local n = tonumber(value)
    if n == nil or n ~= n or n == math.huge or n == -math.huge then
        return nil
    end
    return n
end

local function nonnegative(value)
    local n = finite(value)
    return n ~= nil and n >= 0 and n or nil
end

CompanionPages.register({
    key = "multiplayerAchievements",
    modNames = { "FS25_MultiplayerAchievements", "FS25_374265_Multiplayer_Achievements_-_Per_Player" },
    collect = function(ctx)
        local farmId = nonnegative(ctx.farmId)
        if farmId == nil or farmId < 1 or farmId ~= math.floor(farmId) then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.isMultiplayer ~= true or ctx.mission.gameStarted ~= true
            or ctx.global("g_server") == nil
            or ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "active-multiplayer-server-only" }
        end
        if ctx.version ~= "1.0.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmManager = ctx.global("g_farmManager")
        local farm = ctx.call(farmManager, "getFarmById", farmId)
        if type(farm) ~= "table" or nonnegative(farm.farmId) ~= farmId then
            return { readState = "settings-only", reason = "farm-not-ready" }
        end
        local ledger = farm.mpaLedger
        if type(ledger) ~= "table" then
            return { readState = "settings-only", reason = "ledger-not-captured" }
        end
        local bank = finite(farm.money)
        local balance = nonnegative(ledger.balance)
        local peak = nonnegative(ledger.peak)
        local cows = nonnegative(ledger.cows)
        local sheep = nonnegative(ledger.sheep)
        local pigs = nonnegative(ledger.pigs)
        local chickens = nonnegative(ledger.chickens)
        if bank == nil or balance == nil or peak == nil or cows == nil
            or sheep == nil or pigs == nil or chickens == nil then
            return { readState = "settings-only", reason = "malformed-ledger" }
        end
        local function whole(n) return n == math.floor(n) and n <= 1000000000 end
        if not whole(cows) or not whole(sheep) or not whole(pigs)
            or not whole(chickens) then
            return { readState = "settings-only", reason = "malformed-ledger" }
        end
        return {
            readState = "ok",
            coverage = "complete",
            byFarm = { [tostring(farmId)] = {
                eligibleBalance = math.min(math.max(0, bank), balance),
                eligiblePeak = peak,
                eligibleCowsBred = cows,
                eligibleSheepBred = sheep,
                eligiblePigsBred = pigs,
                eligibleChickensBred = chickens,
            } },
        }
    end,
})
