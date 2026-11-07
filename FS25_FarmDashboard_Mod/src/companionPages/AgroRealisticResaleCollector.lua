-- Agro Realistic v1.0.0.0: saved land resale history for the exact export farm.
-- The mod's history has farmland IDs but no farm IDs; resolve current ownership first.

local MAX_SCAN = 500
local MAX_ROWS = 80

CompanionPages.register({
    key = "agroRealisticResale",
    modNames = { "FS25_AgroRealistic", "FS25_371987_Agro_Realistic" },
    substrings = { "agrorealistic", "agro_realistic" },
    collect = function(ctx)
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-history-only" }
        end
        if ctx.version ~= nil and ctx.version ~= "1.0.0.0" then
            return { readState = "settings-only", reason = "version-unreviewed" }
        end
        local mod = ctx.symbol("LeandroFarmRules") or ctx.global("LeandroFarmRules")
        local history = type(mod) == "table" and mod.farmlandPurchasePeriods or nil
        if type(history) ~= "table" then
            return { readState = "unavailable", reason = "land-history-unavailable" }
        end
        local ownerManager = ctx.global("g_farmlandManager")
        if type(ownerManager) ~= "table" or type(ownerManager.getFarmlandOwner) ~= "function" then
            return { readState = "unavailable", reason = "owner-unresolved" }
        end
        local environment = type(ctx.mission) == "table" and ctx.mission.environment or nil
        local year = type(environment) == "table" and ctx.num(environment.currentYear) or nil
        local period = type(environment) == "table" and ctx.num(environment.currentPeriod) or nil
        if year == nil or year < 1 or period == nil or period < 1 or period > 12 then
            return { readState = "unavailable", reason = "period-unavailable" }
        end
        local now = (math.floor(year) - 1) * 12 + math.floor(period) - 1
        local rows, scanned, owned = {}, 0, 0
        local truncated, invalid = false, false
        for rawId, rawStart in pairs(history) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then truncated = true; break end
            local landId = ctx.num(rawId)
            if landId == nil or landId <= 0 or landId ~= math.floor(landId) then
                invalid = true
            else
                local owner = ctx.num(ctx.call(ownerManager, "getFarmlandOwner", landId))
                if owner == nil then
                    return { readState = "unavailable", reason = "owner-unresolved" }
                end
                if owner == farmId then
                    owned = owned + 1
                    local start = ctx.num(rawStart)
                    if start == nil or start < 0 or start > now or start ~= math.floor(start) then
                        invalid = true
                    elseif #rows < MAX_ROWS then
                        local elapsed = now - start
                        local completedYears = math.floor(elapsed / 12)
                        local factor = 1 - math.max(0, 0.5 - completedYears * 0.1)
                        rows[#rows + 1] = {
                            farmlandId = landId,
                            recordedStartPeriod = start,
                            elapsedPeriods = elapsed,
                            resaleFactor = ctx.round2(factor),
                        }
                    else
                        truncated = true
                    end
                end
            end
        end
        table.sort(rows, function(a, b) return a.farmlandId < b.farmlandId end)
        return {
            readState = invalid and "partial" or owned > 0 and "ok" or "settings-only",
            reason = invalid and "invalid-history" or owned == 0 and "no-owned-history" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            currentPeriodIndex = now,
            byFarm = { [tostring(farmId)] = { recordedLandCount = owned } },
            lands = rows,
        }
    end,
})
