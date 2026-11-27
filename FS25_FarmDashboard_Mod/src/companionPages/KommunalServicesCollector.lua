-- Kommunal Services v1.1.0.0: mod-specific trimmed-area progress on
-- accepted, running native missions for the export farm. No payout ledger.
local MAX_SCAN = 200
local MAX_ROWS = 30

CompanionPages.register({
    key = "kommunalServices",
    modNames = { "FS25_316057_Kommunal_Services", "FS25_KommunalServices" },
    substrings = { "kommunal_services", "kommunalservices" },
    collect = function(ctx)
        if ctx.version ~= "1.1.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = ctx.num(ctx.farmId)
        if farmId == nil or farmId < 1 or farmId ~= math.floor(farmId) then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-mission-state-only" }
        end
        local manager = ctx.global("g_missionManager")
        local statuses = ctx.global("MissionStatus")
        if type(manager) ~= "table" or type(manager.missions) ~= "table"
            or type(statuses) ~= "table" or statuses.RUNNING == nil then
            return { readState = "settings-only", reason = "no-mission-register" }
        end
        local rows, ids = {}, {}
        local count, invalid = 0, false
        local truncated = #manager.missions > MAX_SCAN
        for index = 1, math.min(#manager.missions, MAX_SCAN) do
            local mission = manager.missions[index]
            if type(mission) == "table"
                and ctx.call(mission, "getMissionTypeName") == "kommunalMission"
                and mission.status == statuses.RUNNING
                and ctx.num(mission.farmId) == farmId then
                local rawId = mission.uniqueId or mission.missionId
                local id = rawId
                if type(rawId) == "number" and rawId > 0
                    and rawId == math.floor(rawId) and rawId < 1000000000 then
                    id = tostring(rawId)
                end
                local target = ctx.num(mission.area_tot)
                local trimmed = ctx.num(mission.area_trimmed)
                if type(id) ~= "string" or id == "" or #id > 80
                    or target == nil or target <= 0 or target > 100000000
                    or trimmed == nil or trimmed < 0 or trimmed > 100000000 then
                    invalid = true
                else
                    ids[id] = (ids[id] or 0) + 1
                    if ids[id] > 1 then invalid = true end
                    count = count + 1
                    if #rows < MAX_ROWS then
                        rows[#rows + 1] = {
                            farmId = farmId, missionId = id,
                            targetSquareMeters = ctx.round2(target),
                            trimmedSquareMeters = ctx.round2(trimmed),
                            remainingSquareMeters = ctx.round2(math.max(target - trimmed, 0)),
                            progressPercent = ctx.round2(math.min(trimmed / target * 100, 100)),
                        }
                    else truncated = true end
                end
            end
        end
        if invalid then
            local unique = {}
            for _, row in ipairs(rows) do
                if ids[row.missionId] == 1 then unique[#unique + 1] = row end
            end
            rows = unique
        end
        table.sort(rows, function(a, b) return a.missionId < b.missionId end)
        local incomplete = invalid or truncated
        return {
            readState = incomplete and "partial" or "ok",
            reason = invalid and "invalid-running-mission-progress" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = { [tostring(farmId)] = {
                runningCount = not incomplete and count or nil,
            } },
            rows = rows,
        }
    end,
})
