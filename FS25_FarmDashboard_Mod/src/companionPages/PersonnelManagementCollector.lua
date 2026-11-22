-- Personnel Management 1.1.3.0: inspect the existing server farm book only.
-- refreshFarmContext/getOrCreateFarmData can create applicants and change state.

local MAX_SCAN, MAX_ROWS = 100, 40

local function nonnegative(ctx, value)
    local n = ctx.num(value)
    if n ~= nil and n >= 0 and n < 1000000000000 then return n end
    return nil
end

CompanionPages.register({
    key = "personnelManagement",
    modNames = { "KM_79440_Personnel_Management", "FS25_HelperPersonnel" },
    substrings = { "personnel_management", "helperpersonnel" },
    collect = function(ctx)
        local farmId, mission = ctx.num(ctx.farmId), ctx.mission
        if farmId == nil or farmId <= 0 or farmId ~= math.floor(farmId) then
            return { readState = "settings-only", reason = "selected-farm-unavailable" }
        end
        if ctx.call(mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-roster-only" }
        end
        local app = ctx.symbol("g_helperPersonnelApp")
        local manager = type(app) == "table" and app.manager or nil
        local farms = type(manager) == "table" and manager.farms or nil
        local data = type(farms) == "table" and farms[farmId] or nil
        if type(data) ~= "table" or ctx.num(data.farmId) ~= farmId
            or type(data.workers) ~= "table" or type(data.applicants) ~= "table" then
            return { readState = "settings-only", reason = "farm-roster-unavailable" }
        end

        local rows, owned, scanned, invalid, truncated = {}, 0, 0, false, false
        for _, worker in ipairs(data.workers) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then truncated = true; break end
            if type(worker) == "table" and (worker.farmId == nil
                or ctx.num(worker.farmId) == farmId) then
                owned = owned + 1
                if #rows < MAX_ROWS then
                    local first = ctx.clip(worker.firstName, 50) or ""
                    local last = ctx.clip(worker.lastName, 50) or ""
                    rows[#rows + 1] = {
                        farmId = farmId,
                        id = nonnegative(ctx, worker.id),
                        name = ctx.clip((first .. " " .. last):match("^%s*(.-)%s*$"), 80),
                        experience = nonnegative(ctx, worker.experience),
                        reliability = nonnegative(ctx, worker.reliability),
                        loyalty = nonnegative(ctx, worker.loyalty),
                        specialization = ctx.clip(worker.specializationPrimary, 40),
                        wage = nonnegative(ctx, worker.wage),
                        jobsCompleted = nonnegative(ctx, worker.jobsCompleted),
                        totalWorkMinutes = nonnegative(ctx, worker.totalWorkMinutes),
                        busy = worker.busy == true,
                        resignationPending = worker.resignationPending == true,
                        dismissalPending = worker.dismissalPending == true,
                    }
                else
                    truncated = true
                end
            else
                invalid = true
            end
        end
        local applicants = 0
        for _, applicant in ipairs(data.applicants) do
            if applicants >= MAX_SCAN then truncated = true; break end
            if type(applicant) == "table" and (applicant.farmId == nil
                or ctx.num(applicant.farmId) == farmId) then
                applicants = applicants + 1
            else
                invalid = true
            end
        end
        return {
            readState = invalid and "partial" or
                ((owned > 0 or applicants > 0) and "ok" or "settings-only"),
            reason = owned == 0 and applicants == 0 and "no-personnel-records" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = { [tostring(farmId)] = {
                employeeCount = owned,
                applicantCount = applicants,
                employerReputation = nonnegative(ctx, data.employerReputation),
            } },
            rows = rows,
        }
    end,
})
