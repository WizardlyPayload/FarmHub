-- Crypto Farm 0.1.0.0: farm-keyed coin balance, separate from native money.
-- Exact source has no multiplayer balance sync; show server single-player state only.

CompanionPages.register({
    key = "cryptoFarm",
    modNames = { "FS25_CryptoFarm", "GH_AnJo888__FS25_CryptoFarm_FS25_CryptoFarm", "KM_82419_Crypto_Farm_ATM" },
    substrings = { "fs25_cryptofarm", "crypto_farm_atm" },
    collect = function(ctx)
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.isMultiplayer then
            return { readState = "settings-only", reason = "multiplayer-sync-unproved" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-register-only" }
        end
        local mod = ctx.symbol("g_cryptoFarm")
        if type(mod) ~= "table" or type(mod.balances) ~= "table" then
            return { readState = "settings-only", reason = "balance-register-unavailable" }
        end

        local rate = ctx.num(mod.rate)
        if rate == nil or rate <= 0 then
            return { readState = "partial", reason = "invalid-rate" }
        end
        local rawBalance = mod.balances[farmId]
        if rawBalance == nil then
            return { readState = "settings-only", reason = "no-farm-balance",
                byFarm = { [tostring(farmId)] = { rate = ctx.round2(rate) } } }
        end
        local balance = ctx.num(rawBalance)
        if balance == nil or balance < 0 then
            return { readState = "partial", reason = "invalid-balance" }
        end
        return {
            readState = balance > 0 and "ok" or "settings-only",
            reason = balance == 0 and "zero-balance" or nil,
            coverage = "complete",
            byFarm = { [tostring(farmId)] = {
                balanceCfc = ctx.round2(balance),
                ratePerCfc = ctx.round2(rate),
            } },
        }
    end,
})
