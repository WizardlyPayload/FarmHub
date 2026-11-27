-- AutoSwitch 1.0.3.0: unpaid cooperative sale proceeds, not cash already received.
-- The source keeps one aggregated {money, key} per farm in AutoSwitch_coop.xml.

local MAX_FARMS = 32

CompanionPages.register({
    key = "autoSwitchCoop",
    modNames = { "KM_82844_AutoSwitch", "FS25_AutoSwitch" },
    substrings = { "autoswitch" },
    collect = function(ctx)
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.version ~= "1.0.3.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-register-only" }
        end
        if ctx.mission.isMissionStarted == false then
            return { readState = "settings-only", reason = "world-not-started" }
        end

        local coop = ctx.symbol("AS_CoopPay") or ctx.global("AS_CoopPay")
        if type(coop) ~= "table" or coop.ENABLED ~= true or coop.scanned ~= true
            or type(coop.owed) ~= "table" then
            return { readState = "settings-only", reason = "coop-register-unavailable" }
        end

        local count, selected, invalid = 0, nil, false
        for key, owed in pairs(coop.owed) do
            count = count + 1
            if count > MAX_FARMS then
                return { readState = "partial", coverage = "truncated", reason = "farm-scan-limit" }
            end
            if ctx.num(key) == farmId then
                if selected ~= nil or type(owed) ~= "table" then
                    invalid = true
                else
                    selected = owed
                end
            end
        end
        if invalid then
            return { readState = "partial", coverage = "partial", reason = "invalid-farm-entry" }
        end
        if selected == nil then
            return { readState = "settings-only", coverage = "complete",
                reason = "no-pending-coop-payment" }
        end

        local amount = ctx.num(selected.money)
        local periodKey = ctx.num(selected.key)
        if amount == nil or amount <= 0 or periodKey == nil or periodKey < 0
            or periodKey ~= math.floor(periodKey) then
            return { readState = "partial", coverage = "partial", reason = "invalid-payment" }
        end
        local period = periodKey % 100
        local year = math.floor(periodKey / 100)
        if periodKey ~= 0 and (year < 1 or period < 1 or period > 12) then
            return { readState = "partial", coverage = "partial", reason = "invalid-period" }
        end
        return {
            readState = "ok",
            coverage = "complete",
            byFarm = { [tostring(farmId)] = {
                pendingAmount = ctx.round2(amount),
                saleYear = periodKey > 0 and year or nil,
                salePeriod = periodKey > 0 and period or nil,
            } },
        }
    end,
})
