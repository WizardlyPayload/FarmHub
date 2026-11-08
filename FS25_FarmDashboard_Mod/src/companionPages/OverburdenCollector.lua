-- Overburden 1.1.0.1: read only the selected farm's loaded surveyed mine records.
-- TerraFarm digging and actual material output are not recorded here.

local MAX_SCAN, MAX_ROWS = 60, 30

local function nonnegative(ctx, value)
    local n = ctx.num(value)
    return n ~= nil and n >= 0 and n or nil
end

CompanionPages.register({
    key = "overburden",
    modNames = { "KM_83309_Overburden", "FS25_Overburden" },
    substrings = { "overburden" },
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
        if ctx.version ~= "1.1.0.1" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local mod = ctx.symbol("Overburden")
        if type(mod) ~= "table" or mod.disabled == true or mod.loaded ~= true
            or mod.initialized ~= true or mod.saveBlocked == true or type(mod.mines) ~= "table" then
            return { readState = "settings-only", reason = "mine-register-unavailable" }
        end

        local rows, count, ready, scanned = {}, 0, 0, 0
        local partial, truncated = false, false
        for _, mine in pairs(mod.mines) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then truncated = true; break end
            if type(mine) == "table" and ctx.num(mine.farmId) == farmId then
                local area = nonnegative(ctx, mine.area)
                local depth = nonnegative(ctx, mine.coverDepth)
                local remaining = nonnegative(ctx, mine.remainingMs)
                local cost = nonnegative(ctx, mine.cost)
                local id = type(mine.id) == "string" and mine.id:match("^mine_%d+$") and mine.id or nil
                local name = type(mine.name) == "string" and mine.name ~= "" and ctx.clip(mine.name, 60) or nil
                local validStatus = mine.status == "ready" or mine.status == "surveying"
                if id == nil or name == nil or area == nil or area == 0 or depth == nil or depth == 0
                    or remaining == nil or cost == nil or not validStatus
                    or (mine.status == "ready" and remaining ~= 0)
                    or type(mine.overburdenName) ~= "string" or type(mine.payName) ~= "string" then
                    partial = true
                else
                    count = count + 1
                    if mine.status == "ready" then ready = ready + 1 end
                    if #rows < MAX_ROWS then
                        rows[#rows + 1] = {
                            farmId = farmId,
                            id = id,
                            name = name,
                            areaSquareMeters = ctx.round2(area),
                            coverDepthMeters = ctx.round2(depth),
                            overburden = ctx.clip(mine.overburdenName, 40),
                            payMaterial = ctx.clip(mine.payName, 40),
                            status = mine.status,
                            remainingMinutes = ctx.round2(remaining / 60000),
                            recordedSurveyCost = ctx.round2(cost),
                        }
                    else truncated = true end
                end
            end
        end
        table.sort(rows, function(a, b) return a.id < b.id end)
        return {
            readState = (partial or truncated) and "partial" or count > 0 and "ok" or "settings-only",
            reason = count == 0 and not (partial or truncated) and "no-owned-surveys" or nil,
            coverage = truncated and "truncated" or partial and "partial" or "complete",
            byFarm = { [tostring(farmId)] = {
                mineCount = not (partial or truncated) and count or nil,
                readyCount = not (partial or truncated) and ready or nil,
            } },
            mines = rows,
        }
    end,
})
