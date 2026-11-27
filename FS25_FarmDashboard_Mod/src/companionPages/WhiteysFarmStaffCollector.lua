-- Whitey's Farm Staff Manager 5.2.3 is single-player only. Its save-local
-- roster has no farm ID; FS25 single-player binds the active farm to ID 1.
-- The live manager is exposed by the mod's Esc page when that page registers.

local MAX_STAFF = 40

local function nonnegative(ctx, value)
    local n = ctx.num(value)
    if n ~= nil and n >= 0 then return n end
    return nil
end

CompanionPages.register({
    key = "whiteysFarmStaff",
    modNames = { "FS25_WhiteysFarmStaff_5_2_3", "FS25_WhiteysFarmStaff" },
    substrings = { "whiteysfarmstaff" },
    collect = function(ctx)
        if ctx.version ~= "5.2.3.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = ctx.farmId
        local mission = ctx.mission
        if farmId ~= 1 or type(mission) ~= "table"
            or type(mission.missionDynamicInfo) ~= "table"
            or mission.missionDynamicInfo.isMultiplayer ~= false
            or ctx.num(ctx.call(mission, "getFarmId")) ~= 1
            or ctx.isMultiplayer == true then
            return { readState = "settings-only", reason = "singleplayer-farm-one-only" }
        end
        if ctx.call(mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-staff-state-only" }
        end
        local menu = ctx.global("g_inGameMenu")
        local page = type(menu) == "table" and menu.pageWhiteysFarmStaff or nil
        local manager = type(page) == "table" and page.manager or nil
        local employees = type(manager) == "table" and manager.employees or nil
        if type(employees) ~= "table" or type(manager.isEmployeeAvailable) ~= "function"
            or type(manager.countLicences) ~= "function" then
            return { readState = "settings-only", reason = "staff-menu-manager-unavailable" }
        end

        local rows, count, available, scanned = {}, 0, 0, 0
        local truncated = false
        for _, employee in ipairs(employees) do
            scanned = scanned + 1
            if scanned > MAX_STAFF then truncated = true; break end
            if type(employee) == "table" and employee.isAgencyCover ~= true then
                count = count + 1
                local availableNow = ctx.call(manager, "isEmployeeAvailable", employee) == true
                local busy = employee.busy == true
                local absence = ctx.clip(employee.absenceType, 36)
                if availableNow then available = available + 1 end
                rows[#rows + 1] = {
                    farmId = 1,
                    name = ctx.clip(employee.name, 60),
                    skill = nonnegative(ctx, employee.skill),
                    experience = nonnegative(ctx, employee.experience),
                    morale = nonnegative(ctx, employee.morale),
                    assignedJob = ctx.clip(employee.assignedJob, 40),
                    pendingCourse = ctx.clip(employee.pendingCourse, 40),
                    absence = absence,
                    absenceDaysRemaining = nonnegative(ctx, employee.absenceDaysRemaining),
                    busy = busy,
                    available = availableNow,
                    licenceCount = nonnegative(ctx, ctx.call(manager, "countLicences", employee)),
                }
            end
        end
        return {
            readState = "ok",
            coverage = truncated and "truncated" or "complete",
            scope = "singleplayer-farm-one",
            byFarm = { ["1"] = {
                employeeCount = count,
                availableCount = available,
                reputationPoints = nonnegative(ctx, manager.reputationPoints),
                unpaidWages = nonnegative(ctx, manager.unpaidWages),
                lateWageDays = nonnegative(ctx, manager.lateWageDays),
            } },
            rows = rows,
        }
    end,
})
