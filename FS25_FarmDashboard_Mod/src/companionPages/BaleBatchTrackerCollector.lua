-- Bale Batch Tracker v1.0.0.0 publishes a client-farm snapshot. Its totals
-- include all farms when no active farm exists, so never infer ownership.

local MAX_GROUPS = 40
local MAX_STORAGE = 40

CompanionPages.register({
    key = "baleBatchTracker",
    modNames = { "FS25_Bale_Batch_Tracker", "FS25_374533_Bale_Batch_Tracker" },
    substrings = { "balebatchtracker", "bale_batch_tracker" },
    collect = function(ctx)
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        local tracker = ctx.symbol("BaleBatchTracker")
        local snapshot = type(tracker) == "table" and tracker.snapshot or nil
        if type(snapshot) ~= "table" then
            return { readState = "settings-only", reason = "no-snapshot" }
        end
        if ctx.num(snapshot.farmId) ~= farmId then
            return { readState = "settings-only", reason = "farm-scope-mismatch" }
        end

        local groups, storageRows = {}, {}
        local truncated = false
        for _, group in ipairs(type(snapshot.groups) == "table" and snapshot.groups or {}) do
            if type(group) == "table" then
                if #groups >= MAX_GROUPS then
                    truncated = true
                    break
                end
                groups[#groups + 1] = {
                    fillType = ctx.clip(group.technicalName, 48),
                    title = ctx.clip(group.title, 70),
                    state = ctx.clip(group.state, 20),
                    count = ctx.num(group.count),
                    liters = ctx.num(group.liters),
                    batchCount = ctx.num(group.batchCount),
                    averageProgress = ctx.num(group.averageProgress),
                    nextRemainingMs = ctx.num(group.nextRemainingMs),
                }
            end
        end
        for _, row in ipairs(type(snapshot.storageRows) == "table" and snapshot.storageRows or {}) do
            if type(row) == "table" then
                if #storageRows >= MAX_STORAGE then
                    truncated = true
                    break
                end
                storageRows[#storageRows + 1] = {
                    fillType = ctx.clip(row.technicalName, 48),
                    title = ctx.clip(row.title, 70),
                    state = ctx.clip(row.state, 20),
                    count = ctx.num(row.count),
                    liters = row.litersKnown == true and ctx.num(row.liters) or nil,
                    litersKnown = row.litersKnown == true,
                }
            end
        end
        local function count(value)
            local n = ctx.num(value)
            return n ~= nil and n >= 0 and math.floor(n) or nil
        end
        return {
            readState = "ok",
            coverage = truncated and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = {
                totalCount = count(snapshot.totalCount),
                fermentingCount = count(snapshot.fermentingCount),
                readyCount = count(snapshot.readyCount),
                physicalCount = count(snapshot.physicalCount),
                storedCount = count(snapshot.storedCount),
                hasUnknownStoredLiters = snapshot.hasUnknownStoredLiters == true,
            } },
            groups = groups,
            storageRows = storageRows,
        }
    end,
})
