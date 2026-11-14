-- Workplace Triggers 1.1.2.4 stores farm-owned named sites and live shifts.
-- Sites are definitions, not evidence of work or earnings. Shift history lacks farm IDs.

local MAX_SCAN, MAX_ROWS = 300, 60

local function positiveId(ctx, value)
    local n = ctx.num(value)
    return n ~= nil and n > 0 and n == math.floor(n) and n or nil
end

CompanionPages.register({
    key = "workplaceTriggersSites",
    modNames = { "FS25_WorkplaceTriggers" },
    substrings = { "workplacetriggers" },
    collect = function(ctx)
        local farmId = positiveId(ctx, ctx.farmId)
        if farmId == nil then return { readState = "settings-only", reason = "no-farm" } end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-sites-only" }
        end
        if ctx.version ~= "1.1.2.4" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local system = type(ctx.mission) == "table" and ctx.mission.workplaceTriggers or nil
        local service = type(system) == "table" and system.siteService or nil
        local store = type(service) == "table" and service.store or nil
        if type(system) ~= "table" or system.mission ~= ctx.mission
            or system.isInitialized ~= true or type(store) ~= "table"
            or store.finalized ~= true or type(store.records) ~= "table" then
            return { readState = "settings-only", reason = "site-store-not-ready" }
        end

        local mismatch = store.containerState == "MAP_MISMATCH"
        local rows, count, unavailable = {}, 0, 0
        local scanned, invalid, truncated = 0, false, false
        for _, site in ipairs(store.records) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then truncated = true; break end
            if type(site) == "table" and positiveId(ctx, site.ownerFarmId) == farmId then
                local id = ctx.clip(site.siteId, 48)
                local name = ctx.clip(site.name, 128)
                local x, z = ctx.num(site.centreX), ctx.num(site.centreZ)
                local radius = ctx.num(site.radiusMetres)
                if id == nil or id == "" or name == nil or name == ""
                    or x == nil or z == nil or radius == nil or radius <= 0 then
                    invalid = true
                else
                    count = count + 1
                    local state = mismatch and "UNAVAILABLE"
                        or site.state == "ACTIVE" and "ACTIVE" or "UNAVAILABLE"
                    if state == "UNAVAILABLE" then unavailable = unavailable + 1 end
                    if #rows >= MAX_ROWS then truncated = true
                    else
                        rows[#rows + 1] = {
                            farmId = farmId, siteId = id, name = name,
                            purpose = ctx.clip(site.purpose, 64),
                            centreX = not mismatch and x or nil,
                            centreZ = not mismatch and z or nil,
                            radiusMetres = not mismatch and radius or nil,
                            state = state,
                            reason = state == "UNAVAILABLE" and
                                (mismatch and "MAP_MISMATCH" or ctx.clip(site.reason, 64)) or nil,
                        }
                    end
                end
            end
        end
        table.sort(rows, function(a, b) return a.name < b.name end)

        local tracker = type(system.shiftTracker) == "table" and system.shiftTracker or nil
        local live = tracker and type(tracker._farmShifts) == "table"
            and tracker._farmShifts[farmId] or nil
        local shift = nil
        if type(live) == "table" then
            local pay = ctx.num(live.hourlyWage)
            local schedule = live.paySchedule
            if pay ~= nil and pay >= 0
                and (schedule == "hourly" or schedule == "flat" or schedule == "daily") then
                shift = {
                    farmId = farmId,
                    workplace = ctx.clip(live.workplaceName, 128),
                    payAmount = pay,
                    paySchedule = schedule,
                    timeMultiplier = ctx.num(live.timeMultiplier),
                }
            else invalid = true end
        end
        return {
            readState = invalid and "partial" or
                (count > 0 or shift ~= nil) and "ok" or "settings-only",
            reason = count == 0 and shift == nil and "no-farm-sites-or-live-shift" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = { [tostring(farmId)] = {
                siteCount = count, unavailableCount = unavailable,
                hasLiveShift = shift ~= nil,
            } },
            rows = rows,
            liveShift = shift,
        }
    end,
})
