-- Kringstad Ironworks Sugar Beet Piler 1.1.0.0 keeps farm-keyed tare balances
-- on its placeable specialization. A public piler can owe several farms.
-- Read the loaded server ledger; never infer a debt from physical TAREDIRT.

local MAX_PLACEABLES, MAX_PILERS, MAX_BATCHES = 3000, 120, 600
local MAX_LITERS = 1000000000000

CompanionPages.register({
    key = "kringstadPiler",
    modNames = { "KM_82896_Kringstad_Ironworks_Sugar_Beet_Piler" },
    collect = function(ctx)
        local farmId, mission = ctx.farmId, ctx.mission
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.version ~= "1.1.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        if ctx.call(mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-state-only" }
        end
        if mission.isMissionStarted == false then
            return { readState = "settings-only", reason = "world-not-started" }
        end
        local system = type(mission.placeableSystem) == "table" and mission.placeableSystem or nil
        local placeables = system and system.placeables or nil
        if type(placeables) ~= "table" then
            return { readState = "settings-only", reason = "placeable-register-unavailable" }
        end

        local rows, pilerCount, scanned, batchScanned = {}, 0, 0, 0
        local outstandingTotal, pendingTotal = 0, 0
        local invalid, truncated = false, false
        for _, placeable in pairs(placeables) do
            scanned = scanned + 1
            if scanned > MAX_PLACEABLES then truncated = true; break end
            if type(placeable) == "table" then
                local spec = rawget(placeable, "spec_tareDirtManagement")
                    or rawget(placeable, "spec_" .. ctx.modName .. ".tareDirtManagement")
                if type(spec) == "table" then
                    pilerCount = pilerCount + 1
                    if pilerCount > MAX_PILERS then truncated = true; break end
                    if spec.initialized ~= true or spec.fillTypeIndex == nil
                        or spec.inputFillTypeIndex == nil
                        or type(spec.outstandingByFarm) ~= "table"
                        or type(spec.pendingBatches) ~= "table" then
                        invalid = true
                    else
                        local rawOutstanding = spec.outstandingByFarm[farmId]
                        local outstanding = ctx.num(rawOutstanding) or 0
                        local pending, fee = 0, ctx.num(spec.feePerLiter)
                        local rowValid = true
                        if (rawOutstanding ~= nil and ctx.num(rawOutstanding) == nil)
                            or outstanding < 0 or outstanding > MAX_LITERS
                            or fee == nil or fee < 0 then
                            invalid, rowValid = true, false
                        end
                        for _, batch in pairs(spec.pendingBatches) do
                            batchScanned = batchScanned + 1
                            if batchScanned > MAX_BATCHES then truncated = true; break end
                            if type(batch) == "table" and ctx.num(batch.farmId) == farmId then
                                local amount = ctx.num(batch.amount)
                                if amount == nil or amount < 0 or amount > MAX_LITERS then
                                    invalid, rowValid = true, false
                                else pending = pending + amount end
                            end
                        end
                        if truncated then break end
                        if pending > MAX_LITERS or outstandingTotal + outstanding > MAX_LITERS
                            or pendingTotal + pending > MAX_LITERS then
                            invalid, rowValid = true, false
                        end
                        if rowValid and (outstanding > 0 or pending > 0) then
                            outstandingTotal = outstandingTotal + outstanding
                            pendingTotal = pendingTotal + pending
                            local id = placeable.uniqueId
                            rows[#rows + 1] = {
                                farmId = farmId,
                                placeableId = ctx.clip(id or (tostring(placeable.configFileName or "piler")
                                    .. ":" .. tostring(scanned)), 80),
                                name = ctx.clip(ctx.call(placeable, "getName") or "Sugar beet piler", 80),
                                outstandingLiters = ctx.round2(outstanding),
                                pendingLiters = ctx.round2(pending),
                                feePerLiter = ctx.round2(fee),
                            }
                        end
                    end
                end
            end
        end
        if pilerCount == 0 and not truncated then
            return { readState = "settings-only", reason = "no-piler" }
        end
        table.sort(rows, function(a, b) return tostring(a.placeableId) < tostring(b.placeableId) end)
        local complete = not invalid and not truncated
        return {
            readState = complete and "ok" or "partial",
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            reason = invalid and "unreadable-ledger" or nil,
            byFarm = complete and { [tostring(farmId)] = {
                pilerCount = pilerCount,
                outstandingLiters = ctx.round2(outstandingTotal),
                pendingLiters = ctx.round2(pendingTotal),
            } } or nil,
            rows = rows,
        }
    end,
})
