-- RF Soil & Fertilizer 2.5.0.132 / 2.6.0.3: farm-keyed managed compost batches.
-- These are expected outputs, not compost already deposited into farm storage.

local MAX_SCAN = 1000
local MAX_ROWS = 80

local function whole(value, low, high)
    local n = tonumber(value)
    if n and n == n and n >= low and n <= high and n == math.floor(n) then return n end
    return nil
end

CompanionPages.register({
    key = "soilCompostBatches",
    modNames = { "FS25_SoilFertilizer" },
    substrings = {},
    collect = function(ctx)
        if ctx.version ~= "2.5.0.132" and ctx.version ~= "2.6.0.3" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = whole(ctx.farmId, 1, 255)
        if farmId == nil then return { readState = "settings-only", reason = "no-farm" } end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-batch-state-only" }
        end
        -- Soil & Fertilizer intentionally publishes this cross-mod mission handle.
        local manager = ctx.mission and ctx.mission.compostManager
        if type(manager) ~= "table" or type(manager.batches) ~= "table" then
            return { readState = "settings-only", reason = "no-compost-register" }
        end

        local rows, seen = {}, {}
        local scanned, readyCount, expectedLitres = 0, 0, 0
        local invalid, truncated = false, false
        for key, batch in pairs(manager.batches) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then truncated = true; break end
            if type(batch) == "table" and ctx.num(batch.farmId) == farmId then
                local id = whole(batch.batchId, 1, 1000000000)
                local keyId = whole(key, 1, 1000000000)
                local total = whole(batch.totalDays, 1, 100000)
                local remaining = whole(batch.daysRemaining, 0, 100000)
                local output = whole(batch.outputLitres, 1, 1000000000)
                if id == nil or id ~= keyId or seen[id] or total == nil
                    or remaining == nil or remaining > total or output == nil
                    or type(batch.ready) ~= "boolean" or type(batch.organicSafe) ~= "boolean"
                    or (batch.ready and remaining ~= 0) then
                    invalid = true
                else
                    seen[id] = true
                    if #rows >= MAX_ROWS then truncated = true; break end
                    rows[#rows + 1] = {
                        farmId = farmId, batchId = id, totalDays = total,
                        daysRemaining = remaining, outputLitres = output,
                        ready = batch.ready, organicSafe = batch.organicSafe,
                    }
                    if batch.ready then readyCount = readyCount + 1 end
                    expectedLitres = expectedLitres + output
                end
            end
        end
        table.sort(rows, function(a, b) return a.batchId < b.batchId end)
        local complete = not invalid and not truncated
        return {
            readState = complete and "ok" or "partial",
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            reason = truncated and "batch-scan-limit" or invalid and "invalid-owned-batch" or nil,
            byFarm = complete and { [tostring(farmId)] = {
                batchCount = #rows, readyCount = readyCount,
                expectedOutputLitres = expectedLitres,
            } } or nil,
            rows = rows,
        }
    end,
})
