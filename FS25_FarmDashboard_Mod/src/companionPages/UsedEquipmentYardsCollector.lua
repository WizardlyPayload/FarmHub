-- Used Equipment Yards 1.0.1.3 stores credit per farm and yard.
-- Yard inventory belongs to the market, not to the selected farm's fleet.

local MAX_YARDS = 80
local MAX_ROWS = 40

CompanionPages.register({
    key = "usedEquipmentYards",
    modNames = { "FS25_UsedEquipmentYards", "FS25_359834_Used_Equipment_Yards" },
    substrings = { "usedequipmentyards", "used_equipment_yards" },
    collect = function(ctx)
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-credit-only" }
        end
        local mod = ctx.symbol("UsedEquipmentYards")
        local credit = ctx.symbol("YardCredit")
        local manager = type(mod) == "table" and mod.yardManager or nil
        local yards = type(manager) == "table" and manager.yards or nil
        local creditData = type(credit) == "table" and credit.data or nil
        if type(yards) ~= "table" or type(creditData) ~= "table" then
            return { readState = "settings-only", reason = "no-yard-credit-state" }
        end

        local rows, count, total, scanned, truncated = {}, 0, 0, 0, false
        for _, yard in pairs(yards) do
            scanned = scanned + 1
            if scanned > MAX_YARDS then
                truncated = true
                break
            end
            local yardId = type(yard) == "table" and ctx.num(yard.id) or nil
            if yardId and yardId > 0 and yardId == math.floor(yardId) then
                local key = tostring(farmId) .. "_" .. tostring(yardId)
                local entry = creditData[key]
                local amount = type(entry) == "table" and ctx.num(entry.balance) or nil
                if amount and amount > 0 then
                    count = count + 1
                    total = total + amount
                    if #rows < MAX_ROWS then
                        rows[#rows + 1] = {
                            farmId = farmId,
                            yardId = yardId,
                            yard = ctx.clip(yard.name, 80),
                            credit = amount,
                        }
                    else
                        truncated = true
                    end
                end
            end
        end
        table.sort(rows, function(a, b) return tostring(a.yard or "") < tostring(b.yard or "") end)
        return {
            readState = "ok",
            coverage = truncated and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = { creditedYards = count,
                totalCredit = not truncated and total or nil } },
            rows = rows,
        }
    end,
})
