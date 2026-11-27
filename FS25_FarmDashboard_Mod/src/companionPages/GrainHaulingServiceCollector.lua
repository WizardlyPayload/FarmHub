-- Grain Hauling Service v0.4.8.9: pending, farm-keyed dispatches only.
-- A quote is not a dispatch, and pending net is not money received.

local MAX_SCAN, MAX_ROWS = 40, 20

local function validAmount(ctx, value)
    local n = ctx.num(value)
    return n ~= nil and n >= 0 and n or nil
end

CompanionPages.register({
    key = "grainHaulingService",
    modNames = { "KM_81831_Getreidetransport-Service", "FS25_GrainHaulingService" },
    substrings = { "getreidetransport-service", "grainhaulingservice" },
    collect = function(ctx)
        local farmId, mission = ctx.num(ctx.farmId), ctx.mission
        if farmId == nil or farmId <= 0 or farmId ~= math.floor(farmId) then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if type(mission) ~= "table" or type(mission.missionDynamicInfo) ~= "table"
            or mission.missionDynamicInfo.isMultiplayer ~= false then
            return { readState = "settings-only", reason = "single-player-only" }
        end
        if ctx.call(mission, "getIsServer") ~= true or mission.isMissionStarted == false then
            return { readState = "settings-only", reason = "server-world-not-ready" }
        end
        if ctx.version ~= "0.4.8.9" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local mod = ctx.symbol("GrainHaulingService")
        if type(mod) ~= "table" or mod.persistenceLoaded ~= true
            or type(mod.pendingHauls) ~= "table" then
            return { readState = "settings-only", reason = "pending-hauls-not-loaded" }
        end

        local rows, count, netDue, scanned = {}, 0, 0, 0
        local partial, truncated = false, false
        for _, job in pairs(mod.pendingHauls) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then truncated = true; break end
            if type(job) == "table" and ctx.num(job.farmId) == farmId then
                local id = validAmount(ctx, job.id)
                local liters = validAmount(ctx, job.liters)
                local gross = validAmount(ctx, job.gross)
                local fee = validAmount(ctx, job.fee)
                local net = validAmount(ctx, job.net)
                local eta = validAmount(ctx, job.timeRemainingMs)
                if id == nil or id ~= math.floor(id) or liters == nil or liters == 0
                    or gross == nil or fee == nil or net == nil or eta == nil then
                    partial = true
                else
                    count = count + 1
                    netDue = netDue + net
                    if #rows < MAX_ROWS then
                        rows[#rows + 1] = {
                            farmId = farmId,
                            id = id,
                            crop = ctx.clip(job.cropName or "Product", 60),
                            liters = ctx.round2(liters),
                            destination = ctx.clip(job.destinationName or "Destination", 60),
                            service = ctx.clip(job.serviceName or "Service", 40),
                            carrier = ctx.clip(job.carrierName or "Carrier", 50),
                            gross = ctx.round2(gross),
                            fee = ctx.round2(fee),
                            net = ctx.round2(net),
                            etaMinutes = ctx.round2(eta / 60000),
                        }
                    else truncated = true end
                end
            end
        end
        table.sort(rows, function(a, b) return a.id < b.id end)
        return {
            readState = (partial or truncated) and "partial" or count > 0 and "ok" or "settings-only",
            reason = count == 0 and not (partial or truncated) and "no-pending-hauls" or nil,
            coverage = truncated and "truncated" or partial and "partial" or "complete",
            byFarm = { [tostring(farmId)] = {
                pendingCount = not (partial or truncated) and count or nil,
                pendingNet = not (partial or truncated) and ctx.round2(netDue) or nil,
            } },
            pending = rows,
        }
    end,
})
