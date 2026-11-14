-- Crop Contracts v1.2.0.0 persists farm-keyed forward-sale contracts.
-- Read the server register only; its query/migration methods can mutate state.

local MAX_SCAN, MAX_ROWS = 300, 40
local STATES = { ACTIVE = true, COMPLETED = true, EXPIRED = true }

CompanionPages.register({
    key = "cropContracts",
    modNames = { "FS25_CropContracts", "ITCH_4385334_FS25_CropContracts", "ITCH_4066559_FS25_CropContracts" },
    substrings = { "cropcontracts" },
    collect = function(ctx)
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        local mod = ctx.symbol("CropContractsMod")
        local manager = type(mod) == "table" and mod.manager or nil
        if type(manager) ~= "table" or type(manager.contracts) ~= "table" then
            return { readState = "settings-only", reason = "no-contract-register" }
        end
        local rows, active, completed, expired = {}, 0, 0, 0
        local truncated, invalid, scanned = false, false, 0
        for _, contract in ipairs(manager.contracts) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then truncated = true; break end
            if type(contract) == "table" and ctx.num(contract.farmId) == farmId then
                local state = tostring(contract.status or "")
                local target = ctx.num(contract.targetLiters)
                local delivered = ctx.num(contract.deliveredLiters)
                if STATES[state] and target and target > 0 and delivered and delivered >= 0 then
                    if state == "ACTIVE" then active = active + 1
                    elseif state == "COMPLETED" then completed = completed + 1
                    else expired = expired + 1 end
                    if #rows < MAX_ROWS then
                        rows[#rows + 1] = {
                            farmId = farmId,
                            id = ctx.num(contract.id),
                            crop = ctx.clip(contract.cropTitle or contract.cropName, 64),
                            fillType = ctx.clip(contract.cropName, 48),
                            station = ctx.clip(contract.stationName, 80),
                            status = state,
                            targetLiters = target,
                            deliveredLiters = delivered,
                            lockedPricePerLiter = ctx.num(contract.lockedPricePerLiter),
                            dueYear = ctx.num(contract.dueYear),
                            duePeriod = ctx.num(contract.duePeriod),
                            forwardDelivery = contract.forwardDelivery == true,
                            settlementAmount = ctx.num(contract.settlementAmount),
                            penaltyAmount = ctx.num(contract.penaltyAmount),
                        }
                    else
                        truncated = true
                    end
                else
                    invalid = true
                end
            end
        end
        table.sort(rows, function(a, b)
            return (a.id or 0) < (b.id or 0)
        end)
        return {
            readState = invalid and "partial" or "ok",
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = { [tostring(farmId)] = {
                activeCount = active, completedCount = completed, expiredCount = expired,
            } },
            rows = rows,
        }
    end,
})
