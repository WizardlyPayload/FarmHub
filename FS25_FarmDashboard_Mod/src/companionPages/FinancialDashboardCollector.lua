-- Financial Dashboard 2.0.0.0 is a single-player, local-farm history.
-- Its inflow/outflow figures are observed balance differences, not classified
-- transactions or a complete accounting ledger. Never call its record/save hooks.

local MAX_HISTORY = 501 -- 500 saved samples plus a reload baseline
local MAX_DAILY_SCAN = 400
local MAX_DAILY_ROWS = 60
local MAX_MONEY = 1000000000000

local function finite(value, limit, allowNegative)
    local n = tonumber(value)
    if n ~= nil and n == n and n ~= math.huge and n ~= -math.huge
        and math.abs(n) <= limit and (allowNegative or n >= 0) then return n end
    return nil
end

local function integer(value, limit)
    local n = finite(value, limit, false)
    return n and n == math.floor(n) and n or nil
end

CompanionPages.register({
    key = "financialDashboardHistory",
    modNames = { "KM_83516_Financial_Dashboard" },
    substrings = {},
    collect = function(ctx)
        if ctx.version ~= "2.0.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local mission = ctx.mission
        local farmId = integer(ctx.farmId, 8)
        if not farmId or farmId == 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if type(mission) ~= "table" or type(mission.missionDynamicInfo) ~= "table"
            or mission.missionDynamicInfo.isMultiplayer ~= false
            or ctx.isMultiplayer ~= false then
            return { readState = "settings-only", reason = "single-player-only" }
        end
        if ctx.call(mission, "getIsServer") ~= true or mission.isMissionStarted == false then
            return { readState = "settings-only", reason = "server-world-not-ready" }
        end
        local playerFarmId = type(mission.player) == "table" and integer(mission.player.farmId, 8) or nil
        if playerFarmId ~= farmId then
            return { readState = "settings-only", reason = "local-farm-mismatch" }
        end
        local mod = ctx.symbol("FinancialDashboard")
        if type(mod) ~= "table" or mod.loadedSave ~= true or mod.baselineInitialized ~= true
            or type(mod.history) ~= "table" or type(mod.daily) ~= "table" then
            return { readState = "settings-only", reason = "history-not-loaded" }
        end
        local currentDay = type(mission.environment) == "table"
            and integer(mission.environment.currentDay, 1000000000) or nil
        if not currentDay then
            return { readState = "settings-only", reason = "game-day-not-ready" }
        end

        local sampleCount = #mod.history
        if sampleCount == 0 or sampleCount > MAX_HISTORY then
            return { readState = "partial", reason = "invalid-sample-count" }
        end
        local lastSample = nil
        for i = 1, sampleCount do
            local sample = mod.history[i]
            if type(sample) ~= "table" or not integer(sample.day, currentDay)
                or not finite(sample.balance, MAX_MONEY, true)
                or not finite(sample.delta, MAX_MONEY, true) then
                return { readState = "partial", reason = "invalid-sample" }
            end
            lastSample = sample
        end

        local days, observedDays, changedDays, observedChanges = {}, 0, 0, 0
        for key, day in pairs(mod.daily) do
            observedDays = observedDays + 1
            if observedDays > MAX_DAILY_SCAN then
                return { readState = "partial", reason = "daily-scan-limit" }
            end
            local dayNumber = integer(key, currentDay)
            local income = type(day) == "table" and finite(day.income, MAX_MONEY, false) or nil
            local outflow = type(day) == "table" and finite(day.outflow, MAX_MONEY, false) or nil
            local changes = type(day) == "table" and integer(day.changes, 1000000) or nil
            local opening = type(day) == "table" and finite(day.opening, MAX_MONEY, true) or nil
            local closing = type(day) == "table" and finite(day.closing, MAX_MONEY, true) or nil
            if not dayNumber or not income or not outflow or not changes
                or not opening or not closing then
                return { readState = "partial", reason = "invalid-daily-record" }
            end
            if changes > 0 then changedDays = changedDays + 1 end
            observedChanges = observedChanges + changes
            days[#days + 1] = {
                farmId = farmId, day = dayNumber,
                observedInflow = income, observedOutflow = outflow,
                observedChanges = changes, openingBalance = opening, closingBalance = closing,
            }
        end
        if observedDays == 0 then
            return { readState = "partial", reason = "no-daily-records" }
        end
        table.sort(days, function(a, b) return a.day > b.day end)
        local recentDays = {}
        for i = 1, math.min(#days, MAX_DAILY_ROWS) do recentDays[i] = days[i] end
        return {
            readState = changedDays > 0 and "ok" or "settings-only",
            reason = changedDays == 0 and "no-observed-change" or nil,
            coverage = "complete",
            displayScope = "most-recent-60-recorded-days",
            byFarm = { [tostring(farmId)] = {
                sampleCount = sampleCount, observedDays = observedDays,
                changedDays = changedDays, observedChanges = observedChanges,
                lastSampleDay = lastSample.day,
                lastRecordedBalance = lastSample.balance,
            } },
            recentDays = recentDays,
        }
    end,
})
