-- Economic History 1.0.0.1 keeps completed, farm-keyed finance months.
-- A finance total is the mod's sum of finance fields, not profit.

local MAX_SCAN = 240
local MAX_ROWS = 12

CompanionPages.register({
    key = "economicHistory",
    modNames = { "FS25_EconomicHistory", "FS25_367175_Economic_History" },
    substrings = { "economichistory", "economic_history" },
    collect = function(ctx)
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-history-only" }
        end
        local logger = ctx.symbol("FinancialLogger")
        local history = type(logger) == "table" and logger.history or nil
        if type(history) ~= "table" then
            return { readState = "settings-only", reason = "no-history" }
        end

        local rows, count, truncated = {}, 0, false
        local scanned = 0
        for i = #history, 1, -1 do
            scanned = scanned + 1
            if scanned > MAX_SCAN then
                truncated = true
                break
            end
            local entry = history[i]
            local data = type(entry) == "table" and type(entry.data) == "table" and entry.data or nil
            local farmData = data and (data[farmId] or data[tostring(farmId)]) or nil
            local year = type(entry) == "table" and ctx.num(entry.year) or nil
            local period = type(entry) == "table" and ctx.num(entry.period) or nil
            if type(farmData) == "table" and year and period and period >= 1 and period <= 12
                and period == math.floor(period) then
                count = count + 1
                if #rows < MAX_ROWS then
                    rows[#rows + 1] = {
                        farmId = farmId,
                        year = year,
                        period = period,
                        financeTotal = ctx.num(farmData.total),
                        balance = ctx.num(farmData.balance),
                        loanBalance = ctx.num(farmData.loanBalance),
                    }
                else
                    truncated = true
                end
            end
        end
        return {
            readState = "ok",
            coverage = truncated and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = { recordedMonths = count } },
            rows = rows,
        }
    end,
})
