-- Wood Chips Missions 1.1.0.0: accepted, running deliveries for this farm.
-- The mod's contractorFarmId starts as the farmland owner's ID; native
-- AbstractMission.farmId is assigned to the accepting farm at mission start.

local MAX_SCAN = 200
local MAX_ROWS = 30

CompanionPages.register({
    key = "woodChipsMissions",
    modNames = { "FS25_351625_Wood_Chips_Missions" },
    substrings = {},
    collect = function(ctx)
        if ctx.version ~= "1.1.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = ctx.num(ctx.farmId)
        if farmId == nil or farmId <= 0 then
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

        local missions = manager.missions
        local rows, count, invalid = {}, 0, false
        local truncated = #missions > MAX_SCAN
        for index = 1, math.min(#missions, MAX_SCAN) do
            local mission = missions[index]
            if type(mission) == "table" and mission.isWoodChipsMission == true
                and mission.status == statuses.RUNNING and ctx.num(mission.farmId) == farmId then
                local expected = ctx.num(mission.expectedLiters)
                local deposited = ctx.num(mission.depositedLiters)
                if expected and expected > 0 and deposited and deposited >= 0 and deposited <= expected then
                    count = count + 1
                    if #rows < MAX_ROWS then
                        local station = ctx.call(mission.sellingStation, "getName")
                            or mission.savedSellingStationName
                        rows[#rows + 1] = {
                            farmId = farmId,
                            missionId = ctx.clip(mission.uniqueId or mission.missionId or index, 64),
                            station = ctx.clip(station, 80),
                            expectedLitres = expected,
                            deliveredLitres = deposited,
                            remainingLitres = expected - deposited,
                            progressPercent = math.min(100, deposited / expected * 100),
                        }
                    else
                        truncated = true
                    end
                else
                    invalid = true
                end
            end
        end
        return {
            readState = invalid and "partial" or "ok",
            reason = invalid and "invalid-running-mission-progress" or nil,
            coverage = truncated and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = { runningCount = count } },
            rows = rows,
        }
    end,
})
