-- Mobile Butcher (Realistic Livestock edition) 1.1.0.6: meat reserved for a
-- visit or waiting to become pallets. Finished pallets belong to native stock.

local MAX_ROWS = 40

CompanionPages.register({
    key = "mobileButcherMeatPickup",
    modNames = { "FS25_MobileButcher", "KM_81657_Mobile_Butcher_for_quot_Realistic_Livestock_quot_mod_" },
    substrings = { "mobilebutcher", "mobile_butcher_for_quot_realistic_livestock" },
    collect = function(ctx)
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-pickup-state-only" }
        end
        local handler = ctx.symbol("PlaceableMeatPickup")
        if type(handler) ~= "table" or type(handler.byFarm) ~= "table"
            or type(handler.getSpec) ~= "function" then
            return { readState = "settings-only", reason = "no-meat-pickup-register" }
        end
        local pickup = handler.byFarm[farmId]
        if type(pickup) ~= "table" or ctx.num(ctx.call(pickup, "getOwnerFarmId")) ~= farmId then
            return { readState = "settings-only", reason = "no-owned-meat-pickup" }
        end
        local ok, spec = pcall(handler.getSpec, pickup)
        if not ok or type(spec) ~= "table" or type(spec.pending) ~= "table"
            or type(spec.reserved) ~= "table" then
            return { readState = "settings-only", reason = "no-pickup-state" }
        end
        local fillTypes = {}
        for index in pairs(spec.pending) do fillTypes[index] = true end
        for index in pairs(spec.reserved) do fillTypes[index] = true end

        local rows, pendingTotal, reservedTotal, count = {}, 0, 0, 0
        local truncated = false
        local manager = ctx.global("g_fillTypeManager")
        for index in pairs(fillTypes) do
            local fillTypeIndex = ctx.num(index)
            local pending = ctx.num(spec.pending[index]) or 0
            local reserved = ctx.num(spec.reserved[index]) or 0
            if fillTypeIndex and fillTypeIndex > 0 and fillTypeIndex == math.floor(fillTypeIndex)
                and pending >= 0 and reserved >= 0 and (pending > 0 or reserved > 0) then
                count = count + 1
                pendingTotal = pendingTotal + pending
                reservedTotal = reservedTotal + reserved
                if #rows < MAX_ROWS then
                    local fillType = ctx.call(manager, "getFillTypeByIndex", fillTypeIndex)
                    rows[#rows + 1] = {
                        farmId = farmId,
                        pickup = ctx.clip(ctx.call(pickup, "getName"), 70),
                        fillTypeIndex = fillTypeIndex,
                        fillType = type(fillType) == "table" and ctx.clip(fillType.name, 60) or nil,
                        pendingKg = pending,
                        reservedKg = reserved,
                        pendingBonus = ctx.num(type(spec.pendingPremium) == "table" and spec.pendingPremium[index]) or 0,
                        reservedBonus = ctx.num(type(spec.reservedPremium) == "table" and spec.reservedPremium[index]) or 0,
                    }
                else
                    truncated = true
                end
            end
        end
        table.sort(rows, function(a, b) return tostring(a.fillType or a.fillTypeIndex) < tostring(b.fillType or b.fillTypeIndex) end)
        return {
            readState = count > 0 and "ok" or "settings-only",
            reason = count == 0 and "no-meat-awaiting-pickup" or nil,
            coverage = truncated and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = { fillTypeCount = count, pendingKg = pendingTotal, reservedKg = reservedTotal } },
            rows = rows,
        }
    end,
})
