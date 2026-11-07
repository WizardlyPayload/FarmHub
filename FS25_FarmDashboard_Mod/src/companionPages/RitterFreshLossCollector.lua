-- Ritter Fresh 1.1.0.0-dev.1 records expired goods in a save-local loss log.
-- Value is the mod's estimated market value at expiry, never a cash debit.

local MAX_SCAN = 2000
local MAX_ROWS = 40

local function boundedNumber(value, minimum, maximum, integer)
    local n = tonumber(value)
    if n == nil or n ~= n or n == math.huge or n == -math.huge
        or n < minimum or n > maximum or (integer and n ~= math.floor(n)) then
        return nil
    end
    return n
end

CompanionPages.register({
    key = "ritterFreshLoss",
    modNames = { "FS25_Fresh", "GH_rittermod__FS25_Fresh_FS25_Fresh" },
    collect = function(ctx)
        local farmId = boundedNumber(ctx.farmId, 1, 1000000, true)
        if farmId == nil then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-log-only" }
        end
        if ctx.version ~= nil and ctx.version ~= "1.1.0.0-dev.1" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local manager = ctx.symbol("RmFreshManager")
        local tracker = ctx.symbol("RmLossTracker")
        local log = type(tracker) == "table" and tracker.lossLog or nil
        if type(manager) ~= "table" or manager.initialized ~= true or type(log) ~= "table" then
            return { readState = "settings-only", reason = "log-not-ready" }
        end

        local rows, count, litres = {}, 0, 0
        local partial = false
        local total = #log
        local first = math.max(1, total - MAX_SCAN + 1)
        local truncated = first > 1
        for i = total, first, -1 do
            local entry = log[i]
            if type(entry) == "table" and boundedNumber(entry.farmId, 1, 1000000, true) == farmId then
                local amount = boundedNumber(entry.amount, 0.001, 1000000000, false)
                local year = boundedNumber(entry.year, 1, 10000, true)
                local period = boundedNumber(entry.period, 1, 12, true)
                local day = boundedNumber(entry.dayInPeriod, 1, 100, true)
                local hour = boundedNumber(entry.hour, 0, 23, true)
                local fillTypeName = type(entry.fillTypeName) == "string" and entry.fillTypeName or nil
                if amount ~= nil and year ~= nil and period ~= nil and day ~= nil and hour ~= nil
                    and fillTypeName ~= nil and fillTypeName ~= "" then
                    count = count + 1
                    litres = litres + amount
                    if #rows < MAX_ROWS then
                        local value = boundedNumber(entry.value, 0.001, 1000000000000, false)
                        rows[#rows + 1] = {
                            farmId = farmId,
                            year = year, period = period, dayInPeriod = day, hour = hour,
                            fillTypeName = ctx.clip(fillTypeName, 64),
                            amountLitres = amount,
                            estimatedValue = value,
                            location = ctx.clip(entry.location, 90),
                            entityType = ctx.clip(entry.entityType, 40),
                        }
                    else
                        truncated = true
                    end
                else
                    partial = true
                end
            end
        end
        return {
            readState = partial and "partial" or "ok",
            coverage = truncated and "truncated" or partial and "partial" or "complete",
            byFarm = { [tostring(farmId)] = {
                loggedLossCountScanned = count,
                lostLitresScanned = litres,
            } },
            rows = rows,
        }
    end,
})
