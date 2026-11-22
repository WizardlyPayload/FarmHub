-- Auto Sell Silo 1.6.0.0: farm-keyed deferred payments, not sale income already received.
-- The register contains no crop, station, litres, sale date or paid history.

local MAX_SCAN = 300
local MAX_ROWS = 40

CompanionPages.register({
    key = "autoSellSilo",
    modNames = { "KM_83453_Auto_Sell_Silo", "FS25_AutoSellSilo" },
    substrings = { "autosellsilo", "auto_sell_silo" },
    collect = function(ctx)
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-register-only" }
        end
        local mod = ctx.symbol("AutoSellSilo")
        if type(mod) ~= "table" or type(mod.pending) ~= "table" then
            return { readState = "settings-only", reason = "pending-register-unavailable" }
        end

        local rows, count, total = {}, 0, 0
        local scanned, invalid, scanIncomplete, rowsTruncated = 0, false, false, false
        for _, entry in ipairs(mod.pending) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then scanIncomplete = true; break end
            if type(entry) == "table" and ctx.num(entry.farmId) == farmId then
                local amount = ctx.num(entry.amount)
                local months = ctx.num(entry.months)
                if amount == nil or amount <= 0 or months == nil or months < 1 or months ~= math.floor(months) then
                    invalid = true
                else
                    count = count + 1
                    total = total + amount
                    if #rows < MAX_ROWS then
                        rows[#rows + 1] = { farmId = farmId, amount = ctx.round2(amount), monthsRemaining = months }
                    else
                        rowsTruncated = true
                    end
                end
            end
        end
        table.sort(rows, function(a, b) return a.monthsRemaining < b.monthsRemaining end)
        local complete = not invalid and not scanIncomplete
        return {
            readState = not complete and "partial" or count > 0 and "ok" or "settings-only",
            reason = complete and count == 0 and "no-farm-receivables" or nil,
            coverage = (scanIncomplete or rowsTruncated) and "truncated"
                or invalid and "partial" or "complete",
            byFarm = complete and { [tostring(farmId)] = {
                pendingCount = count, pendingAmount = ctx.round2(total),
            } } or nil,
            pending = rows,
        }
    end,
})
