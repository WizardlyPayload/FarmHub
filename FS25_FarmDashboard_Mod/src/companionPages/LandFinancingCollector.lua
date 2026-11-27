-- Land Financing 30.0.0.0: current single-player loans by saved farm ID.
-- Scheduled installments are obligations, not evidence of a payment.
local MAX_SCAN = 300
local MAX_ROWS = 40
local MAX_MONEY = 1000000000000

local function integer(ctx, value, maxValue)
    local n = ctx.num(value)
    if n ~= nil and n >= 0 and n <= maxValue and n == math.floor(n) then return n end
    return nil
end

local function amount(ctx, value)
    local n = ctx.num(value)
    if n ~= nil and n >= 0 and n <= MAX_MONEY then return n end
    return nil
end

CompanionPages.register({
    key = "landFinancing",
    modNames = { "KM_82121_land-financing" },
    substrings = { "land-financing" },
    collect = function(ctx)
        if ctx.version ~= "30.0.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local mission = ctx.mission
        local farmId = integer(ctx, ctx.farmId, 8)
        if farmId == nil or farmId == 0 then
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
        local localFarm = type(mission.player) == "table" and integer(ctx, mission.player.farmId, 8) or nil
        if localFarm ~= farmId then
            return { readState = "settings-only", reason = "local-farm-mismatch" }
        end
        local manager = ctx.symbol("g_landFinancingManager")
        if type(manager) ~= "table" or type(manager.loans) ~= "table" then
            return { readState = "settings-only", reason = "no-loan-register" }
        end

        local rows, ids, landIds = {}, {}, {}
        local scanned, count, totalBalance = 0, 0, 0
        local invalid, truncated = false, false
        for _, loan in pairs(manager.loans) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then truncated = true; break end
            if type(loan) ~= "table" then
                invalid = true
            else
                local owner = integer(ctx, loan.farmId, 8)
                if owner == nil or owner == 0 then invalid = true
                elseif owner == farmId then
                    local id = integer(ctx, loan.id, 1000000000)
                    local landId = integer(ctx, loan.farmlandId, 1000000000)
                    local months = integer(ctx, loan.months, 120)
                    local remaining = integer(ctx, loan.remaining, 120)
                    local price = amount(ctx, loan.price)
                    local down = amount(ctx, loan.down)
                    local principal = amount(ctx, loan.principal)
                    local balance = amount(ctx, loan.balance)
                    local payment = amount(ctx, loan.payment)
                    local rate = ctx.num(loan.annualRate)
                    if id == nil or id == 0 or landId == nil or landId == 0
                        or months == nil or months == 0 or remaining == nil or remaining == 0
                        or remaining > months
                        or price == nil or down == nil or principal == nil or balance == nil
                        or payment == nil or rate == nil or rate < 0 or rate > 100
                        or price == 0 or principal == 0 or payment == 0
                        or down > price or principal > price or balance > principal then
                        invalid = true
                    else
                        ids[id] = (ids[id] or 0) + 1
                        landIds[landId] = (landIds[landId] or 0) + 1
                        if ids[id] > 1 or landIds[landId] > 1 then invalid = true end
                        count = count + 1
                        totalBalance = totalBalance + balance
                        if #rows < MAX_ROWS then
                            rows[#rows + 1] = {
                                farmId = farmId, id = id, farmlandId = landId,
                                originalPrice = ctx.round2(price),
                                downPayment = ctx.round2(down),
                                principal = ctx.round2(principal),
                                balance = ctx.round2(balance),
                                scheduledInstallment = ctx.round2(payment),
                                termMonths = months, remainingMonths = remaining,
                                annualRatePercent = ctx.round2(rate),
                            }
                        else truncated = true end
                    end
                end
            end
        end
        if invalid then
            local unambiguous = {}
            for _, row in ipairs(rows) do
                if ids[row.id] == 1 and landIds[row.farmlandId] == 1 then
                    unambiguous[#unambiguous + 1] = row
                end
            end
            rows = unambiguous
        end
        table.sort(rows, function(a, b) return a.id < b.id end)
        local incomplete = invalid or truncated
        return {
            readState = incomplete and "partial" or "ok",
            reason = invalid and "invalid-loan-record" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = { [tostring(farmId)] = {
                loanCount = not incomplete and count or nil,
                outstandingBalance = not incomplete and ctx.round2(totalBalance) or nil,
            } },
            rows = rows,
        }
    end,
})
