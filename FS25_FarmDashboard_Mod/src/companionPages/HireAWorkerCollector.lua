-- Hire A Worker v1.0.0.0: read the server's farm-keyed field jobs and history.
-- Do not call job, save or sync methods: they may charge or change the game.

local MAX_ACTIVE = 30
local MAX_HISTORY = 30

CompanionPages.register({
    key = "hireAWorker",
    modNames = { "KM_82196_Hire_A_Worker", "FS25_Hire_A_Worker", "FS25_HireAWorker" },
    substrings = { "hire_a_worker", "hireaworker" },
    collect = function(ctx)
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if g_server == nil then
            return { readState = "settings-only", reason = "server-only" }
        end
        local manager = ctx.symbol("g_hireAWorker")
        if type(manager) ~= "table" or type(manager.activeJobsByFarmlandId) ~= "table"
            or type(manager.jobHistoryEntries) ~= "table" then
            return { readState = "settings-only", reason = "no-job-register" }
        end

        local active, history = {}, {}
        local activeCount, historyCount = 0, 0
        local truncated = false
        for farmlandId, job in pairs(manager.activeJobsByFarmlandId) do
            if type(job) == "table" and ctx.num(job.farmId) == farmId then
                activeCount = activeCount + 1
                if #active < MAX_ACTIVE then
                    local index = ctx.num(job.currentPhaseIndex)
                    local phase = type(job.phases) == "table" and index ~= nil and job.phases[index] or nil
                    active[#active + 1] = {
                        farmId = farmId,
                        farmlandId = ctx.num(job.farmlandId) or ctx.num(farmlandId),
                        phase = type(phase) == "table" and ctx.clip(phase.operation, 40) or nil,
                        phaseIndex = index,
                        phaseCount = type(job.phases) == "table" and #job.phases or nil,
                        startCharge = ctx.num(job.totalCost),
                    }
                else
                    truncated = true
                end
            end
        end
        table.sort(active, function(a, b)
            return (a.farmlandId or 0) < (b.farmlandId or 0)
        end)

        -- The mod inserts new history entries at index 1 and caps the list.
        for _, entry in ipairs(manager.jobHistoryEntries) do
            if type(entry) == "table" and ctx.num(entry.farmId) == farmId then
                historyCount = historyCount + 1
                if #history < MAX_HISTORY then
                    history[#history + 1] = {
                        farmId = farmId,
                        farmlandId = ctx.num(entry.farmlandId),
                        farmlandNumber = ctx.clip(entry.farmlandNumber, 32),
                        work = ctx.clip(entry.workText, 110),
                        sourceLanguage = ctx.clip(entry.sourceLanguage, 12),
                        cost = ctx.num(entry.cost),
                        revenue = ctx.num(entry.revenue),
                    }
                else
                    truncated = true
                end
            end
        end

        return {
            readState = "ok",
            coverage = truncated and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = {
                activeFieldJobCount = activeCount,
                historyCount = historyCount,
            } },
            activeFieldJobs = active,
            history = history,
        }
    end,
})
