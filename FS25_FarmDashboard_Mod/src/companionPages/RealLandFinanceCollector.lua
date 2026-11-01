-- Real Land Finance 1.0.0.0 keeps contracts by farmland, with farmId as the
-- purchaser/lessee/landlord. LET also records a tenantFarmId. Listings are not
-- obligations and are intentionally excluded from this read-only page.

local MAX_SCAN = 300
local MAX_ROWS = 40
local PURCHASE = { MORTGAGE = true, SELLER = true, GRAIN = true, JUDICIAL = true, DEED = true }

CompanionPages.register({
    key = "realLandFinance",
    modNames = { "KM_83258_Real_Land_Finances" },
    substrings = { "real_land_finances" },
    collect = function(ctx)
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        local manager = ctx.symbol("g_ftrManager")
        local contracts = type(manager) == "table" and manager.contracts or nil
        if type(contracts) ~= "table" then
            return { readState = "settings-only", reason = "no-contract-register" }
        end

        local rows, count, scanned, invalid, truncated = {}, 0, 0, false, false
        local purchaseCount, rentOwedCount, rentInCount = 0, 0, 0
        for _, contract in pairs(contracts) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then
                truncated = true
                break
            end
            if type(contract) == "table" then
                local kind = contract.type
                local owner = ctx.num(contract.farmId)
                local tenant = ctx.num(contract.tenantFarmId)
                local isLet = kind == "LET"
                local touches = owner == farmId or (isLet and tenant == farmId)
                if touches then
                    local id, landId = ctx.num(contract.id), ctx.num(contract.farmlandId)
                    local unit = contract.unit
                    local validType = PURCHASE[kind] or kind == "LEASE" or isLet
                    if id == nil or id <= 0 or landId == nil or landId <= 0
                        or not validType or (unit ~= "MONEY" and unit ~= "KG") then
                        invalid = true
                    else
                        count = count + 1
                        local role = isLet and (owner == farmId and "landlord" or "tenant")
                            or (kind == "LEASE" and "tenant" or "buyer")
                        if PURCHASE[kind] then purchaseCount = purchaseCount + 1
                        elseif role == "landlord" then rentInCount = rentInCount + 1
                        else rentOwedCount = rentOwedCount + 1 end
                        if #rows < MAX_ROWS then
                            rows[#rows + 1] = {
                                farmId = farmId,
                                id = id,
                                farmlandId = landId,
                                kind = kind,
                                role = role,
                                unit = unit,
                                fillTypeName = unit == "KG" and ctx.clip(contract.fillTypeName, 40) or nil,
                                balance = PURCHASE[kind] and ctx.num(contract.balance) or nil,
                                installment = PURCHASE[kind] and ctx.num(contract.installment) or nil,
                                rentPerYear = not PURCHASE[kind] and ctx.num(contract.rentPerYear) or nil,
                                arrearsCount = ctx.num(contract.arrearsCount),
                                monthsToNext = ctx.num(contract.monthsToNext),
                            }
                        else
                            truncated = true
                        end
                    end
                end
            end
        end
        table.sort(rows, function(a, b) return a.id < b.id end)
        return {
            readState = invalid and "partial" or (count > 0 and "ok" or "settings-only"),
            reason = count == 0 and "no-farm-contracts" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = { [tostring(farmId)] = {
                contractCount = count,
                purchaseCount = purchaseCount,
                rentOwedCount = rentOwedCount,
                rentInCount = rentInCount,
            } },
            rows = rows,
        }
    end,
})
