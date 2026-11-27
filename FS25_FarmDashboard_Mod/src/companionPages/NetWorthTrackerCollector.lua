-- Evan Kirsch's Net Worth Tracker v1.1.0.3 stores dated, farm-keyed samples.
-- Do not calculate a current worth or call the mod's recordFarmValue method.

local MAX_SCAN = 500
local MAX_ROWS = 100

CompanionPages.register({
    key = "netWorthTracker",
    modNames = {
        "FS25_339475_FS25_netWorthTracker", "KM_72515_Net_Worth_Tracker",
        "GH_EvanKirsch__fs25-nwt_FS25_NetWorthTracker_update",
    },
    substrings = { "networthtracker_update", "net_worth_tracker", "fs25_networthtracker" },
    collect = function(ctx)
        if ctx.version ~= "1.1.0.3" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        local manager = ctx.symbol("g_nwt_historyManager")
        local histories = type(manager) == "table" and manager.histories or nil
        if type(histories) ~= "table" then
            return { readState = "settings-only", reason = "no-history-manager" }
        end
        local rows, count, truncated = {}, 0, false
        for index, sample in ipairs(histories) do
            if index > MAX_SCAN then
                truncated = true
                break
            end
            if type(sample) == "table" and ctx.num(sample.farmId) == farmId
                and sample.category == "total" then
                local amount, dayId = ctx.num(sample.amount), ctx.num(sample.dayId)
                if amount and dayId and dayId >= 0 then
                    count = count + 1
                    if #rows < MAX_ROWS then
                        rows[#rows + 1] = {
                            farmId = farmId,
                            dayId = dayId,
                            year = ctx.num(sample.year),
                            period = ctx.num(sample.periodId),
                            dayInPeriod = ctx.num(sample.dayInPeriod),
                            amount = amount,
                        }
                    else
                        truncated = true
                    end
                end
            end
        end
        table.sort(rows, function(a, b) return a.dayId > b.dayId end)
        return {
            readState = "ok",
            coverage = truncated and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = { sampleCount = count } },
            rows = rows,
        }
    end,
})
