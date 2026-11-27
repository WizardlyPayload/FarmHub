-- Supply and Transport Contracts 1.0.3.0: accepted delivery progress for one farm.
-- Read fields only. In particular, getDetails can resolve and mutate a pending station.

local MAX_SCAN, MAX_ROWS = 200, 30

CompanionPages.register({
    key = "supplyTransportContracts",
    modNames = { "FS25_311954_Supply_Transport_Contracts" },
    collect = function(ctx)
        if ctx.version ~= "1.0.3.0" then
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
            or type(statuses) ~= "table" or statuses.RUNNING ~= 3 then
            return { readState = "settings-only", reason = "no-mission-register" }
        end

        local candidates, ids, duplicateIds = {}, {}, {}
        local scanned, invalid, truncated = 0, false, false
        for _, mission in pairs(manager.missions) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then truncated = true; break end
            if type(mission) == "table" and type(mission.type) == "table"
                and mission.type.name == "supplyTransportMission"
                and mission.status == statuses.RUNNING
                and ctx.num(mission.farmId) == farmId then
                local id = ctx.clip(mission.uniqueId, 64)
                local expected = ctx.num(mission.expectedLiters)
                local deposited = ctx.num(mission.depositedLiters)
                local fillIndex = ctx.num(mission.fillTypeIndex)
                local fillManager = ctx.global("g_fillTypeManager")
                local fill = fillIndex ~= nil and ctx.call(fillManager, "getFillTypeByIndex", fillIndex) or nil
                local fillName = type(fill) == "table" and ctx.clip(fill.title or fill.name, 64) or nil
                local station = mission.sellingStation
                local destination = type(station) == "table"
                    and ctx.clip(ctx.call(station, "getName"), 80) or nil
                local reward = ctx.num(mission.reward)
                if id ~= nil and id ~= "" then
                    if ids[id] then duplicateIds[id] = true end
                    ids[id] = true
                end
                if id == nil or id == "" or expected == nil or expected <= 0
                    or deposited == nil or deposited < 0 or deposited > expected
                    or fillIndex == nil or fillIndex < 1 or fillIndex ~= math.floor(fillIndex)
                    or fillName == nil or fillName == "" or destination == nil or destination == ""
                    or reward == nil or reward < 0 then
                    invalid = true
                else
                    candidates[#candidates + 1] = {
                            farmId = farmId,
                            missionId = id,
                            destination = destination,
                            fillType = fillName,
                            expectedLitres = ctx.round2(expected),
                            deliveredLitres = ctx.round2(deposited),
                            remainingLitres = ctx.round2(expected - deposited),
                            listedReward = ctx.round2(reward),
                    }
                end
            end
        end
        local rows, count = {}, 0
        for _, row in ipairs(candidates) do
            if duplicateIds[row.missionId] then
                invalid = true
            else
                count = count + 1
                if #rows < MAX_ROWS then rows[#rows + 1] = row
                else truncated = true end
            end
        end
        table.sort(rows, function(a, b) return a.missionId < b.missionId end)
        local incomplete = invalid or truncated
        return {
            readState = incomplete and "partial" or count > 0 and "ok" or "settings-only",
            reason = invalid and "invalid-running-mission" or count == 0 and not incomplete and "no-accepted-missions" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = { [tostring(farmId)] = { runningCount = not incomplete and count or nil } },
            rows = rows,
        }
    end,
})
