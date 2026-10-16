-- FS25 FarmDashboard | companionPages/FieldLeasingCollector.lua | v1.0.0
-- Field Leasing (Chissel, 1.0.0.1). Mod-env global g_fieldLeasingManager:
--   priceMultiplier       yearly lease as % of the land price (settings 0.5 .. 5.0)
--   minDuration           periods a lease must run before it can be ended (0 .. 24)
--   fieldLeaseAgreements  [farmlandId] = FieldLeaseAgreement { farmlandId, farmId, price, duration }
-- On every PERIOD_CHANGED the server charges price * (priceMultiplier / 100) / 12 per agreement and
-- adds 1 to duration. `price` is the farmland price stored when the lease was signed.
-- Leased land is owned in the farmland manager while the lease runs (setLandOwnership), so farmland
-- ownership here means "who holds the lease". Charges are booked as finance stat statisticFieldLease.

local MAX_LEASES = 50
local SCAN_LEASES = 400
local HISTORY_DAYS = 6

local function farmlandInfo(ctx, farmlandId)
    local mgr = ctx.global("g_farmlandManager")
    local farmland = type(mgr) == "table" and ctx.call(mgr, "getFarmlandById", farmlandId) or nil
    if type(farmland) ~= "table" then
        return nil
    end
    return {
        name = ctx.clip(farmland.name, 40),
        areaHa = ctx.round2(farmland.areaInHa),
        landPrice = ctx.round2(farmland.price),
    }
end

local function leaseStats(ctx, farmId)
    local fm = ctx.global("g_farmManager")
    local farm = type(fm) == "table" and ctx.call(fm, "getFarmById", farmId) or nil
    local stats = type(farm) == "table" and farm.stats or nil
    if type(stats) ~= "table" then
        return nil
    end
    local out = {}
    if type(stats.finances) == "table" then
        out.today = ctx.round2(stats.finances.statisticFieldLease)
    end
    local history = stats.financesHistory
    if type(history) == "table" then
        local n = #history
        local days = {}
        for i = math.max(1, n - HISTORY_DAYS + 1), n do
            local day = history[i]
            if type(day) == "table" then
                days[#days + 1] = ctx.round2(day.statisticFieldLease) or 0
            end
        end
        out.recentDays = days
    end
    return out
end

CompanionPages.register({
    key = "fieldLeasing",
    modNames = { "FS25_FieldLeasing", "FS25_338381_Field_Leasing" },
    substrings = { "fieldleasing", "field_leasing" },
    collect = function(ctx)
        local mgr = ctx.symbol("g_fieldLeasingManager")
        if type(mgr) ~= "table" then
            return { readState = "unavailable", reason = "provider-unavailable" }
        end
        local multiplier = ctx.num(mgr.priceMultiplier)
        local minDuration = ctx.num(mgr.minDuration)
        local out = {
            settings = {
                priceMultiplierPercent = multiplier,
                minDurationPeriods = minDuration,
            },
        }
        local agreements = mgr.fieldLeaseAgreements
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            out.readState = "settings-only"
            out.reason = "no-farm"
            return out
        end
        if type(agreements) ~= "table" then
            out.readState = "unavailable"
            out.reason = "no-agreements"
            return out
        end

        local monthlyFactor = multiplier ~= nil and (multiplier / 100) / 12 or nil
        local farm = {
            leaseCount = 0,
            totalAreaHa = 0,
            monthlyCost = monthlyFactor ~= nil and 0 or nil,
            canEndCount = 0,
            finance = leaseStats(ctx, farmId),
        }
        local leases = {}
        local scanned, truncated = 0, false
        for key, agreement in pairs(agreements) do
            scanned = scanned + 1
            if scanned > SCAN_LEASES then
                truncated = true
                break
            end
            if type(agreement) == "table" then
                local owner = ctx.num(agreement.farmId)
                if owner == farmId and #leases >= MAX_LEASES then
                    truncated = true
                elseif owner == farmId then
                    local farmlandId = ctx.num(agreement.farmlandId) or ctx.num(key)
                    local price = ctx.num(agreement.price)
                    local duration = ctx.num(agreement.duration)
                    local info = farmlandId and farmlandInfo(ctx, farmlandId) or nil
                    local monthly = (price ~= nil and monthlyFactor ~= nil) and ctx.round2(price * monthlyFactor) or nil
                    local canEnd = nil
                    if duration ~= nil and minDuration ~= nil then
                        canEnd = duration >= minDuration
                    end
                    local row = {
                        farmId = farmId,
                        farmlandId = farmlandId,
                        name = info and info.name or nil,
                        areaHa = info and info.areaHa or nil,
                        currentLandPrice = info and info.landPrice or nil,
                        signedPrice = ctx.round2(price),
                        periodsPaid = duration,
                        monthlyCost = monthly,
                        canEnd = canEnd,
                        periodsUntilEnd = (canEnd == false) and (minDuration - duration) or 0,
                    }
                    leases[#leases + 1] = row
                    farm.leaseCount = farm.leaseCount + 1
                    farm.totalAreaHa = farm.totalAreaHa + (row.areaHa or 0)
                    if farm.monthlyCost ~= nil and monthly ~= nil then
                        farm.monthlyCost = farm.monthlyCost + monthly
                    end
                    if canEnd == true then
                        farm.canEndCount = farm.canEndCount + 1
                    end
                end
            end
        end
        table.sort(leases, function(a, b)
            return (a.farmlandId or 0) < (b.farmlandId or 0)
        end)
        farm.totalAreaHa = ctx.round2(farm.totalAreaHa)
        farm.monthlyCost = ctx.round2(farm.monthlyCost)
        farm.yearlyCost = farm.monthlyCost ~= nil and ctx.round2(farm.monthlyCost * 12) or nil

        out.readState = (truncated or multiplier == nil) and "partial" or "ok"
        out.coverage = truncated and "truncated" or "complete"
        out.byFarm = { [tostring(farmId)] = farm }
        out.leases = leases
        return out
    end,
})
