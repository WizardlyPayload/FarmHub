-- Bale Direct 1.0.0.0: farm-keyed standard-delivery payments awaiting the next game year.
-- Express sales go straight to native money; the saved rows have no fill-type breakdown.

local MAX_SCAN = 300
local MAX_ROWS = 40

CompanionPages.register({
    key = "baleDirect",
    modNames = { "FS25_354119_Bale_Direct", "FS25_BaleDirect" },
    substrings = { "bale_direct", "baledirect" },
    collect = function(ctx)
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-register-only" }
        end
        if ctx.mission.isMissionStarted == false then
            return { readState = "settings-only", reason = "world-not-started" }
        end
        if ctx.version ~= nil and ctx.version ~= "1.0.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local mod = type(ctx.mission) == "table" and ctx.mission.baleDirect or nil
        local system = type(mod) == "table" and mod.paymentSystem or nil
        if type(system) ~= "table" or system.isInitialized ~= true
            or system.mission ~= ctx.mission or type(system.pendingSales) ~= "table" then
            return { readState = "settings-only", reason = "pending-register-unavailable" }
        end

        local rows, count, total = {}, 0, 0
        local scanned, invalid, truncated = 0, false, false
        for _, sale in pairs(system.pendingSales) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then truncated = true; break end
            if type(sale) == "table" and ctx.num(sale.farmId) == farmId then
                local id = ctx.num(sale.id)
                local amount = ctx.num(sale.netProfit)
                local year = ctx.num(sale.saleYear)
                local bales = ctx.num(sale.baleCount)
                local delivery = ctx.num(sale.deliveryType)
                if id == nil or id < 1 or id ~= math.floor(id)
                    or amount == nil or year == nil or year < 1 or year ~= math.floor(year)
                    or bales == nil or bales < 0 or bales ~= math.floor(bales)
                    or delivery ~= 2 then
                    invalid = true
                else
                    count = count + 1
                    total = total + amount
                    if #rows < MAX_ROWS then
                        rows[#rows + 1] = {
                            farmId = farmId,
                            saleId = id,
                            netAmount = ctx.round2(amount),
                            baleCount = bales,
                            saleYear = year,
                        }
                    else truncated = true end
                end
            end
        end
        table.sort(rows, function(a, b) return a.saleId < b.saleId end)
        return {
            readState = (invalid or truncated) and "partial"
                or count > 0 and "ok" or "settings-only",
            reason = count == 0 and "no-farm-pending-sales" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = { [tostring(farmId)] = {
                pendingCount = not (truncated or invalid) and count or nil,
                pendingNetAmount = not (truncated or invalid) and ctx.round2(total) or nil,
            } },
            pending = rows,
        }
    end,
})
