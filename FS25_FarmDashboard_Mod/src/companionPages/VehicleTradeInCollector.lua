-- Vehicle Trade In 1.0.0.1 keeps completed dealer trades in a save-local ledger.
-- The mod's used-market offers are shared; only explicit export-farm trades belong here.

local MAX_SCAN = 200
local MAX_ROWS = 40

CompanionPages.register({
    key = "vehicleTradeIn",
    modNames = { "FS25_TradeInMenu", "FS25_362333_FS25_TradeInMenu" },
    substrings = { "tradeinmenu", "trade_in_menu" },
    collect = function(ctx)
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-ledger-only" }
        end
        -- The mod maps a legacy XML row without farmId to farm 1 before this
        -- reader can inspect it. Withhold farm 1 in multiplayer, where that
        -- fallback could misattribute an old trade to another farm.
        if ctx.isMultiplayer and farmId == 1 then
            return { readState = "settings-only", reason = "legacy-owner-ambiguous" }
        end
        local mod = ctx.symbol("TradeInMod")
        if type(mod) ~= "table" or type(ctx.mission) ~= "table"
            or ctx.mission.tradeInMod ~= mod or type(mod.statistics) ~= "table"
            or type(mod.statistics.transactions) ~= "table" then
            return { readState = "settings-only", reason = "no-trade-ledger" }
        end

        local source = mod.statistics.transactions
        local rows, count, totalCredit, truncated, invalid = {}, 0, 0, false, false
        local first = math.max(1, #source - MAX_SCAN + 1)
        if first > 1 then truncated = true end
        for i = #source, first, -1 do
            local trade = source[i]
            -- The live row still needs a numeric owner matching this export farm.
            if type(trade) == "table" and ctx.num(trade.farmId) == farmId then
                local credit = ctx.num(trade.finalValue)
                local name = ctx.clip(trade.vehicleName, 70)
                if credit == nil or name == nil or name == "" then
                    invalid = true
                else
                    count = count + 1
                    totalCredit = totalCredit + credit
                    if #rows < MAX_ROWS then
                        rows[#rows + 1] = {
                            farmId = farmId,
                            vehicle = name,
                            baseAppraisal = ctx.num(trade.baseValue),
                            tradeCredit = credit,
                            brand = ctx.clip(trade.brand, 40),
                            category = ctx.clip(trade.category, 40),
                            date = ctx.clip(trade.date, 32),
                            timestamp = ctx.clip(trade.timestamp, 40),
                        }
                    else
                        truncated = true
                    end
                end
            end
        end
        return {
            readState = invalid and "partial" or (count > 0 and "ok" or "settings-only"),
            reason = count > 0 and nil or "no-farm-trades",
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = { [tostring(farmId)] = { tradeCount = count, totalCredit = totalCredit } },
            rows = rows,
        }
    end,
})
