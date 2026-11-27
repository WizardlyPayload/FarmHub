-- Cobra Modding Employees 2.6.0.0: read its explicit farm-owned roster only.
-- Never call getSortedStaff/ensureDevelopment or updateStatistics: those mutate mod state.

local MAX_SCANNED = 200
local MAX_ROWS = 20

local function nonnegative(ctx, value)
    local n = ctx.num(value)
    if n ~= nil and n >= 0 and n < 1000000000000 then return n end
    return nil
end

CompanionPages.register({
    key = "employees",
    modNames = { "FS25_Employees", "KM_82420_Employees" },
    substrings = { "fs25_employees" },
    collect = function(ctx)
        if ctx.version ~= "2.6.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local mission = ctx.mission
        if type(mission) ~= "table" or ctx.call(mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-roster-only" }
        end
        local farmId = ctx.num(ctx.farmId)
        if farmId == nil or farmId <= 0 or farmId ~= math.floor(farmId) then
            return { readState = "settings-only", reason = "selected-farm-unavailable" }
        end
        local manager = ctx.symbol("Employees")
        if type(manager) ~= "table" or manager.enabled ~= true
            or manager.isServer ~= true or type(manager.staff) ~= "table" then
            return { readState = "settings-only", reason = "staff-manager-unavailable" }
        end

        local rows, scanned, owned, truncated = {}, 0, 0, false
        for _, employee in ipairs(manager.staff) do
            scanned = scanned + 1
            if scanned > MAX_SCANNED then truncated = true; break end
            if type(employee) == "table" and ctx.num(employee.farmId) == farmId then
                owned = owned + 1
                if #rows < MAX_ROWS then
                    local contract = type(manager.contracts) == "table"
                        and manager.contracts[ctx.num(employee.contract)] or nil
                    local temporary = type(contract) == "table" and contract.temporary == true
                    rows[#rows + 1] = {
                        farmId = farmId,
                        id = nonnegative(ctx, employee.id),
                        name = ctx.clip(employee.name, 60),
                        role = ctx.clip(employee.role, 28),
                        contract = type(contract) == "table" and ctx.clip(contract.name, 50) or nil,
                        temporary = temporary,
                        salary = nonnegative(ctx, employee.salary),
                        periodHours = nonnegative(ctx, employee.limit),
                        workedHours = nonnegative(ctx, employee.hours),
                        totalWorkedHours = nonnegative(ctx, employee.totalWorkedHours),
                        training = ctx.clip(employee.activeTraining, 28),
                        trainingHoursRemaining = nonnegative(ctx, employee.trainingRemaining),
                        illness = ctx.clip(employee.illnessKey, 28),
                        illnessHoursRemaining = nonnegative(ctx, employee.illnessRemaining),
                    }
                else
                    truncated = true
                end
            end
        end
        return {
            readState = "ok",
            coverage = truncated and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = { employeeCount = owned } },
            rows = rows,
        }
    end,
})
